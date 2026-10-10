# F8 — Fact-checking against brand facts (gated pilot)

Competitive tracker row F8, one PR. Owner documents:
[Onboarding and company facts](../onboarding.md) (brand facts),
[Prompts and Visibility](../visibility-prompt.md) ("Answer perception" gains
"Fact-checking"), [Billing and entitlements](../billing-entitlements.md) (pilot
flag), [Agent](../agents.md), [MCP](../mcp.md). Extends
`frontend/services/api/src/perception/`.

Complete for implementation; decisions settled. Follow `CLAUDE.md`, the test
skill and the TypeScript skill. Verified at 2aff425e5.

## Settled decisions (owner, 2026-10-10)

The owner approved every recommendation as written.

| ID | Question | Decision |
|---|---|---|
| D8.1 | The tracker gates F8 on "F3 calibration acceptable"; F3 shipped (#352) without a live calibration run. Build now? | Build now behind the pilot gate. The gate is the safety: nothing reaches a customer until the owner runs `perception:eval --live` and the new `facts:eval --live`, then grants the pilot. The orchestrator runs both live evals. |
| D8.2 | Fact topics | Closed list of eight: `pricing`, `plans`, `integrations`, `availability`, `markets`, `policies`, `specs`, `company`. No `other`: a fact with no topic can never be matched, and an off-list claim is counted `off_topic` and not verified. List versioned in config. Calibration follow-up (owner, 2026-10-11): the claims addendum defines each topic with its boundary cases (plans vs specs, availability vs markets), and verification checks a claim against a frozen `related_topics` scope so a claim filed under a neighbouring topic is not silently `not_covered` (`perception-claims-v2`, `fact-verify-v2`). |
| D8.3 | Optional `fact_contradiction` Action rule in this PR? | No. Defer until the pilot's false-contradiction rate is reviewed; an Action from a false contradiction sends users to "fix" true pages. Backlog it with the target rule (owned page for the topic, else earned source) recorded. |
| D8.4 | How is "pilot on two projects" enforced? | New non-public, issuable entitlement flag `fact_checking` (registry `entitlements-v7`), in no plan bundle and not in the trial, granted per workspace with the existing `billing:admin grant` (append-only, actor, reason, dry-run). Not a config allowlist (needs a deploy, no audit trail) and not a project column (a second gate authority). One owned workspace per person makes per-workspace equal to per-pilot-customer. |
| D8.5 | Verification model and cost bounds | Default Agent gateway model (as D3.3), platform-funded, no credit draw. Claims ride the existing perception call (no extra call). Verification is one call per answer, only when it has ≥1 validated brand claim on a topic with a frozen confirmed fact. Caps in config: `max_claims_per_answer` 6, `max_facts_per_verification` 20, `max_frozen_facts` 100, `max_verifications_per_audit` 300, `max_verifications_per_workspace_per_day` 1000. Over cap → `unavailable / platform_cap`. |
| D8.6 | Draft facts suggested from onboarding research? | Not in this PR. Facts are typed by the user (status `draft` → `confirmed`). Suggestions from the research snapshot are a backlog item once the pilot shows which topics matter. |
| D8.7 | Where it appears | Facts editor: Agent → Context, a "Brand facts" panel under the brand profile. Results: a Visibility tab **Accuracy** (after Perception) and a claim list per answer in the run evidence drawer. All hidden without the entitlement; reads return `not_enabled`. MCP gets read-only `read_fact_checks`; no MCP/public-API fact writes (F4c owns writes). |
| D8.8 | Contradiction strictness | Asymmetric: `contradicted` needs confidence ≥ 0.75 and ≥1 cited fact, else it is stored and reported as `inconclusive (low confidence)`. Other verdicts use 0.6. Biases the pilot against false contradictions, which is the gate metric. |
| D8.9 | Which facts an audit checks against | The confirmed fact revisions frozen at audit admission. Editing a fact later never changes that audit's verdicts; the next audit uses the new revision. |

## Current state (verified)

- **Perception owner** (`src/perception/`, F3 #352): `admission.ts`
  freezes `{extractor_version, template_version, metrics_version}` into brand
  audits only (`audits/freeze.ts:285`); `enqueuePerception` runs in the
  analysis transaction and keys the `answer_perception` analytics task on
  `(analysis_id, extractor_version)`. `executor.ts` loads the subject, checks
  caps over `answer_perceptions` (per audit, per workspace UTC day, counting
  only outcomes that spent a call), builds the package (`passages.ts`: per
  entity, sentences with a counted mention ±1, code-point offsets,
  `input_hash`), calls `gateway.structured` (`model.ts` zod schema, one parse
  retry), validates deterministically (`validate.ts`: `locateQuote` after
  whitespace normalisation, drop counts by reason) and persists
  `answer_perceptions` + `entity_sentiments` in the lease-fenced terminal
  transaction (`ON CONFLICT DO NOTHING`). `compensatePerception` writes
  `unavailable / task_failed` (`workers/terminal-compensation.ts`).
- Templates and policy: `src/config/perception.json` (+ `perception.ts`
  loader); `perception-template-v1`. Reads: `src/visibility/perception.ts`,
  contract `packages/contracts/src/visibility-perception.ts`, UI
  `components/visibility/visibility-perception.tsx`, MCP `read_perception`
  (`src/mcp/tools.ts:186`), eval `scripts/eval-perception.ts`
  (`pnpm perception:eval`), fixtures `test/fixtures/perception/`.
- **F3 live calibration has not been run** (tracker log 2026-10-10).
- **Brand facts do not exist.** Onboarding stores `brand_profiles`
  (description, positioning, `products_services`, audience,
  `business_context`) as unreviewed suggestions, edited in Agent → Context
  (`components/knowledge-base/brand-profile-panel.tsx`, routes
  `routes/brand-identity.ts`, family `brand-identity`,
  `projects/brand-profile.ts`). These are identity facets, not verifiable
  statements; F8 adds a separate user-owned fact list.
- **Gating precedent:** entitlement flags `crawl_logs` (v5) and `api_access`
  (v6) in `src/config/entitlements.json`, checked without the capacity lock;
  `billing:admin grant --key <flag> --value 1` issues an override
  (`docs/operations/billing-operator-guide.md`). Registry is
  `entitlements-v6`.
- **Actions rules:** `src/config/actions.ts` (`RULE_EVIDENCE_FAMILY`, rule
  groups); no perception-derived rule exists. Not touched (D8.3).

## Design

### Config — extend `src/config/perception.json` with a `fact_check` block

`claims_version` (`perception-claims-v1`, the addendum's own version, so it
builds on whatever perception template is in force),
`verify_template_version` (`fact-verify-v1`), `metrics_version`,
`verification_task_kind` (`fact_verification`), `topics` (D8.2),
caps (D8.5), `min_confidence` 0.6, `min_contradiction_confidence` 0.75,
`statement_max_chars` 300, the claims addendum to the perception templates,
the verification system/user templates, `eval_thresholds`
(`max_false_contradiction_rate` 0.05, `min_verdict_agreement` 0.8,
`min_quote_validity` 0.95). Loader typed in `config/perception.ts`.

### Brand facts (projects owner, family `brand-identity`)

```
brand_facts           id, workspace_id, project_id, revision, topic, statement,
                      source_url NULL, status (draft|confirmed|retired),
                      created_at, updated_at   -- the current revision
brand_fact_revisions  id, workspace_id, fact_id, revision, topic, statement
                      (≤300), source_url NULL, status, created_by_user_id,
                      created_at;  UNIQUE (fact_id, revision)  -- append-only
```

Composite workspace FKs. `src/projects/brand-facts.ts`: list, create, revise
(expected revision → 409 on mismatch, same pattern as brand profile), confirm,
retire. Every change appends a revision. Writers: roles that edit the brand
profile; viewers read. Writes require the `fact_checking` entitlement (409
`fact_checking_not_in_plan`); the list returns `{enabled: false, facts: []}`
outside the pilot, which is how the UI hides the panel and tab. Routes
`GET|POST /api/v1/projects/{id}/brand-facts`, `PATCH /brand-facts/{fact_id}`;
contracts in `packages/contracts/src/fact-checking.ts`.

### Admission (`perception/admission.ts`, `audits/freeze.ts`)

For a brand audit whose workspace holds `fact_checking` and whose project has
≥1 confirmed fact, freeze `fact_check: {claims_version,
verify_template_version, metrics_version, fact_set_hash, facts[{revision_id,
topic}]}` (newest confirmed revision per fact, ≤ `max_frozen_facts`,
topic-ordered) and freeze perception's `template_version` as
`<template_version>+<claims_version>`. Otherwise nothing changes: non-pilot
audits keep the configured perception template and schema byte-for-byte.

### Claim extraction (same perception call)

When `fact_check` is frozen, the perception prompt adds the claims addendum
and the output schema gains `claims[]` (brand only): `{topic, claim ≤300,
quote, confidence}` — atomic, factual, one assertion; subjective statements
excluded (they are aspects). `validate.ts` additions: quote must be located in
the **brand's** passages (else `claim_quote_not_found`); topic off-list →
dropped `off_topic`; over `max_claims_per_answer` → `claim_limit`;
low confidence stored and flagged. Persist `answer_claims (id, workspace_id,
perception_id, ordinal, topic, claim, quote, quote_start, quote_end,
confidence, low_confidence)`
in the same terminal transaction. If ≥1 non-low-confidence claim has a topic
present in the frozen facts, enqueue `fact_verification` (key
`[perception_id, verify_template_version]`) in that transaction — no network.

### Verification executor `src/perception/fact-verification.ts`

Registered in `analytics.json` and `EXECUTORS`, compensated in
`terminal-compensation.ts` (`unavailable / task_failed`). Mirrors the
perception executor: load claims + frozen fact revisions of matching topics
(≤ `max_facts_per_verification`), caps over `fact_verifications`, gateway
check, `input_hash`, one call (one parse retry). Output per claim:
`{claim_id, verdict: supported|contradicted|inconclusive|not_covered,
fact_ids, confidence}`. Deterministic validation: unknown claim dropped;
`fact_ids` intersected with the facts sent (unknown counted
`unknown_fact`); `supported`/`contradicted` with no surviving fact →
`inconclusive`; `contradicted` below `min_contradiction_confidence` →
stored `inconclusive`, `low_confidence` true (D8.8); claim missing from output
→ `not_covered` with null confidence, counted `missing_claim`. Claims whose
topic has no frozen fact are `not_covered` without a model call.

```
fact_verifications  id, workspace_id, project_id, audit_id, task_id,
                    perception_id, verify_template_version, model_provider,
                    model, input_hash, outcome (verified|unavailable|
                    invalid_output|model_error), outcome_reason, drop_counts,
                    usage, latency_ms, created_at;
                    UNIQUE (perception_id, verify_template_version)
claim_verdicts      id, workspace_id, verification_id, claim_id, verdict,
                    model_verdict, fact_revision_ids jsonb, confidence,
                    low_confidence
```

### Metrics `src/perception/fact-metrics.ts` (pure, deterministic)

Accuracy = supported ÷ (supported + contradicted), always with coverage:
claims extracted, verified, inconclusive, not covered, pending, unavailable
by reason. No claims ≠ 0% accuracy. Contradicted claims by topic with quote,
the contradicting fact's statement and an answer link
(`/runs/{runId}?execution={taskId}`); URLs cited in answers carrying a
contradicted claim labelled "cited alongside"; splits per engine and run.
Trend points carry the frozen perception template version, the verification
template and metrics versions and the fact set hash; a change marks the point
not comparable.

### Reads (family `visibility`)

`GET /api/v1/projects/{id}/visibility/accuracy` (same selection params as
perception) and `/visibility/accuracy/claims` (keyset-paged, filters `topic`,
`verdict`). States: `not_enabled`, `no_facts`, `no_claims`, `pending`,
`unavailable`, value. Execution evidence gains `claims[]` with verdicts.
Contract `packages/contracts/src/fact-checking.ts`. Browser-only (no public API
exposure). Reads never classify.

### UI

- Agent → Context: **Brand facts** panel — list by topic, add/edit (topic,
  statement, optional source URL), confirm, retire; drafts are marked "not
  used until confirmed".
- Visibility **Accuracy** tab: accuracy tile with coverage strip, contradicted
  claims list, topic table, cited-alongside URLs, engine split; empty states
  for no facts / pending / unavailable.
- Evidence drawer: claim chips with verdict, quote highlighted.
- Tab and panel render only with the entitlement; no upsell copy.

### MCP and Agent

`read_fact_checks` (views `summary` | `claims`) beside `read_perception`;
returns `not_enabled` without the flag. Regenerate
`apps/docs/src/data/mcp-tools.json`. Skill lines (in-app `ai_visibility` +
plugin twin `ai-visibility-review`): state coverage, quote the fact, never
say "AI is lying" for `inconclusive`/`not_covered`.

### Calibration (operator-only, never in CI)

40 hand-labelled fixtures in `test/fixtures/fact-check/` (fact set + answer
passages + expected claims/verdicts; supported, contradicted, outdated price,
partial match, unrelated topic, subjective decoy). `pnpm facts:eval --live`
(`scripts/eval-fact-check.ts`, perception:eval shape): false-contradiction
rate, verdict agreement, quote validity, tokens per answer.

## Commit slices

1. Config, loaders, contracts, entitlement `fact_checking` (v7).
2. Baseline: five tables + indexes; regenerate db-schema.
3. Brand facts owner, routes, tests (isolation, revisions, entitlement).
4. Admission freeze + claims extraction in perception (schema, prompt,
   validate, persist, enqueue).
5. Verification executor, compensation, caps.
6. Metrics + reads + evidence field.
7. UI: facts panel, Accuracy tab, evidence chips.
8. MCP tool, reference regen, skills; eval script + fixtures; docs.

## Affected surfaces checklist

- **Backend:** `perception/{admission,executor,model,validate}.ts`, new
  `perception/{fact-verification,fact-metrics}.ts`, `projects/brand-facts.ts`,
  `routes/brand-identity.ts`, `routes/visibility.ts`,
  `visibility/accuracy.ts`, `audits/freeze.ts`, `workers/analytics-worker.ts`,
  `workers/terminal-compensation.ts`, `config/{perception.json,perception.ts,
  analytics.json,entitlements.json}`.
- **Schema/contracts/OpenAPI:** as above; route ownership check passes.
- **App UI:** knowledge-base panel, visibility tab, runs evidence.
- **MCP/Agent/plugin:** as above. **Public API:** none.
- **Docs site:** `visibility.md` "Accuracy" section, `mcp/tools.md`,
  `changelog.md` (pilot wording). **Marketing:** none.
- **Internal docs:** `visibility-prompt.md` "Fact-checking" subsection;
  `onboarding.md` "Brand facts"; `billing-entitlements.md` v7 line;
  `agents.md`, `mcp.md` catalogue rows; `backlog.md` (fact_contradiction rule,
  draft suggestions); tracker status + log.

## Tests

Facts: revision append on edit, 409 on stale revision, drafts/retired never
frozen, workspace isolation, viewer cannot write, no entitlement → 409.
Admission: non-pilot audit freezes v1 template and no `fact_check`.
Extraction: invented quote dropped; claim quoted from a competitor's passage
dropped; off-topic dropped; claim cap. Enqueue only with a matching-topic
claim, once across re-derive. Verification: unknown fact id stripped →
`inconclusive`; low-confidence contradiction → `inconclusive`; missing claim →
`not_covered`; caps → `platform_cap`; `model_not_configured`; compensation.
Metrics: accuracy denominators, no claims ≠ 0, version change → not
comparable. Real PostgreSQL for persistence, isolation and lease recovery.
Gateway faked; no live credentials reach tests.

## Validation

Focused perception/brand-facts/visibility tests while iterating;
`./scripts/check.ps1` once at the end (contracts, schema, queue,
entitlements). Agent-skills loader test for the skill lines.

## Owner-run steps (after merge)

1. With a gateway key: `pnpm --filter @citeladder/api perception:eval --live`
   and `facts:eval --live`; check thresholds.
2. Grant the pilot: `billing:admin grant --key fact_checking --value 1`
   (dry-run, then `--apply`) for the two pilot workspaces.
3. Pilot users confirm facts; run audits.
4. Review contradicted claims with the owner (false-contradiction rate)
   before any general release, plan bundle change or the Action rule.

## Done when

A pilot workspace with confirmed facts runs an audit and the Accuracy tab,
evidence drawer and `read_fact_checks` show the same numbers; a non-pilot
workspace sees no change and makes no extra model calls; tracker row F8 is
`in review`.
