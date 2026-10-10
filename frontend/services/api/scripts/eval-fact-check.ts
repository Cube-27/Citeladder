/**
 * Live fact-check calibration: each hand-labelled answer through the
 * perception call with the claims addendum, the claim validator, the
 * verification call and the verdict validator, the way a pilot audit runs
 * them. Scored for false-contradiction rate (the pilot gate), verdict
 * agreement, quote validity and tokens per answer against the configured
 * thresholds. Operator-run only (it calls the provider and spends platform
 * budget); never part of CI. Records append to one log in the worktree's Git
 * directory.
 */
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { claimVerdictSchema, factTopicSchema } from '@citeladder/contracts/fact-checking';
import { z } from 'zod';

import { scoringConfig } from '../src/analysis/scoring.ts';
import { policy } from '../src/config.ts';
import { createModelGateway } from '../src/models/gateway.ts';
import { claimsOutputSchema, perceptionPrompt } from '../src/perception/model.ts';
import { entityPassages, type PerceptionPackage } from '../src/perception/passages.ts';
import { validateClaims, validateOutput } from '../src/perception/validate.ts';
import {
  validateVerdicts,
  verifyOutputSchema,
  verifyPackage,
  verifyPrompt,
} from '../src/perception/verify.ts';
import raw from '../test/fixtures/fact-check/answers.json' with { type: 'json' };
import { gitDirectory } from './git-directory.ts';

const { values } = parseArgs({
  options: { live: { type: 'boolean', default: false }, fixture: { type: 'string' } },
});
if (!values.live)
  throw new Error('Calibration calls the configured model provider; pass --live to run it');
const fixtures = z
  .object({
    brands: z.array(
      z.object({
        brand_name: z.string(),
        competitors: z.array(z.string()),
        prompt: z.string(),
        facts: z.array(z.object({ topic: factTopicSchema, statement: z.string() })),
      }),
    ),
    answers: z.array(
      z.object({
        name: z.string(),
        brand_name: z.string(),
        answer: z.string(),
        expected: z.array(
          z.object({
            quote_contains: z.string(),
            topic: factTopicSchema,
            verdict: claimVerdictSchema,
          }),
        ),
      }),
    ),
  })
  .parse(raw);
const settings = policy.perception;
const facts = settings.fact_check;
const gateway = createModelGateway();
const log = join(gitDirectory(process.cwd()), 'fact-check-eval.log');
const run = new Date().toISOString();
const brands = new Map(fixtures.brands.map((brand) => [brand.brand_name, brand]));

type Answer = (typeof fixtures.answers)[number];

async function evaluate(fixture: Answer) {
  const brand = brands.get(fixture.brand_name);
  if (!brand) throw new Error(`Fixture ${fixture.name} names an unknown brand`);
  const pkg: PerceptionPackage = {
    extractor_version: settings.extractor_version,
    template_version: `${settings.template_version}+${facts.claims_version}`,
    language: 'en',
    prompt: brand.prompt,
    entities: entityPassages({
      answer: fixture.answer,
      languageCode: 'en',
      config: scoringConfig({
        brand_name: brand.brand_name,
        competitors: brand.competitors.map((name) => ({ name, domains: [] })),
      }),
      policy: settings,
    }),
  };
  const extraction = perceptionPrompt(pkg, settings, facts);
  const extracted = await gateway.structured(
    extraction.system,
    extraction.user,
    claimsOutputSchema,
  );
  validateOutput(pkg, extracted.value, settings);
  const claims = validateClaims(pkg, extracted.value.claims, facts);
  const topics = new Set(brand.facts.map((fact) => fact.topic));
  const eligible = claims.claims.filter(
    (claim) => !claim.low_confidence && topics.has(claim.topic),
  );
  let verifyTokens = 0;
  const verdicts = new Map<number, string>();
  if (eligible.length) {
    const built = verifyPackage({
      version: facts.verify_template_version,
      brand: brand.brand_name,
      language: 'en',
      facts: brand.facts.map((fact, index) => ({ revisionId: `fixture-${index}`, ...fact })),
      claims: eligible.map((claim) => ({
        claimId: String(claim.ordinal),
        topic: claim.topic,
        claim: claim.claim,
        quote: claim.quote,
      })),
      maxFacts: facts.max_facts_per_verification,
    });
    const prompt = verifyPrompt(built.pkg, facts);
    const checked = await gateway.structured(prompt.system, prompt.user, verifyOutputSchema);
    verifyTokens = Number(checked.result.usage.total_tokens ?? 0);
    for (const verdict of validateVerdicts(checked.value, built, facts).verdicts)
      verdicts.set(
        Number(verdict.claimId),
        verdict.lowConfidence ? 'low_confidence' : verdict.verdict,
      );
  }
  const actual = claims.claims.map((claim) => ({
    quote: claim.quote,
    topic: claim.topic,
    verdict: claim.low_confidence
      ? 'low_confidence'
      : topics.has(claim.topic)
        ? (verdicts.get(claim.ordinal) ?? 'not_covered')
        : 'not_covered',
  }));
  const matched = fixture.expected.map((expected) => ({
    expected: expected.verdict,
    actual:
      actual.find(
        (claim) => claim.topic === expected.topic && claim.quote.includes(expected.quote_contains),
      )?.verdict ?? 'missed',
  }));
  const expectedQuotes = fixture.expected.map((expected) => expected.quote_contains);
  const contradicted = actual.filter((claim) => claim.verdict === 'contradicted');
  const falseContradictions = contradicted.filter(
    (claim) =>
      !fixture.expected.some(
        (expected) =>
          expected.verdict === 'contradicted' &&
          expected.topic === claim.topic &&
          claim.quote.includes(expected.quote_contains),
      ),
  );
  return {
    run,
    fixture: fixture.name,
    claims_version: facts.claims_version,
    verify_template_version: facts.verify_template_version,
    matched,
    unexpected: actual.filter(
      (claim) => !expectedQuotes.some((quote) => claim.quote.includes(quote)),
    ),
    contradicted: contradicted.length,
    false_contradictions: falseContradictions.length,
    kept: claims.claims.length,
    invented: claims.drops.claim_quote_not_found ?? 0,
    total_tokens: Number(extracted.result.usage.total_tokens ?? 0) + verifyTokens,
    model: extracted.result.returned_model,
  };
}

const selected = fixtures.answers.filter((item) => !values.fixture || item.name === values.fixture);
if (!selected.length) throw new Error(`No calibration fixture is named ${values.fixture}`);
const records = await Promise.all(selected.map(evaluate));
await appendFile(log, records.map((record) => `${JSON.stringify(record)}\n`).join(''));

const sum = (pick: (record: (typeof records)[number]) => number) =>
  records.reduce((total, record) => total + pick(record), 0);
const pairs = records.flatMap((record) => record.matched);
const agreement = pairs.length
  ? pairs.filter((pair) => pair.expected === pair.actual).length / pairs.length
  : 1;
const contradicted = sum((record) => record.contradicted);
const falseRate = contradicted ? sum((record) => record.false_contradictions) / contradicted : 0;
const kept = sum((record) => record.kept);
const invented = sum((record) => record.invented);
const quoteValidity = kept + invented ? kept / (kept + invented) : 1;
const tokens = sum((record) => record.total_tokens) / records.length;
const limits = facts.eval_thresholds;
const failures = [
  falseRate > limits.max_false_contradiction_rate && 'false_contradiction_rate',
  agreement < limits.min_verdict_agreement && 'verdict_agreement',
  quoteValidity < limits.min_quote_validity && 'quote_validity',
  tokens > limits.max_total_tokens_per_answer && 'tokens_per_answer',
].filter(Boolean);
const verdict = failures.length ? 'failed ' + failures.join(', ') : 'within thresholds';
process.stdout.write(
  `${records.length} answers, ${pairs.length} expected claims (${facts.eval_policy_version}): ` +
    `false contradictions ${falseRate.toFixed(2)} of ${contradicted}, ` +
    `verdict agreement ${agreement.toFixed(2)}, quote validity ${quoteValidity.toFixed(2)}, ` +
    `tokens/answer ${Math.round(tokens)}; ${verdict}\nLog: ${log}\n`,
);
