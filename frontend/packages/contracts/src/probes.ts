/**
 * Market probes (AV-29 to AV-36): the Run probe quote, the probe's state, and
 * the Market and Objections reads on Perception. Scores are position scores
 * (AV-35): 100 named first, minus 10 per later place, 0 when not raised,
 * averaged over the probe's answers; a read with no labelled probe is `none`.
 */
import { z } from 'zod';

import { auditScheduleCadenceSchema, citationClassificationSchema } from './audits.ts';
import { credentialModeSchema } from './billing.ts';
import { auditMarketSchema } from './markets.ts';
import { logicalEngineSchema } from './providers.ts';
import { pageStandingSchema } from './visibility-evidence.ts';

const uuid = () => z.uuid();
const score = z.int().min(0).max(100);

export const objectionGroupRequestSchema = z.object({ name: z.string() });
export const objectionGroupMergeRequestSchema = z.object({ into_id: uuid() });
/** A renamed or merged-into objection group. */
export const objectionGroupSchema = z.object({ id: uuid(), name: z.string() });

/** `POST /projects/{id}/probes`: the fingerprint of the quote the user confirmed. */
export const probeRunRequestSchema = z.object({ fingerprint: z.string().min(1) });
export type ProbeRunRequest = z.infer<typeof probeRunRequestSchema>;

/**
 * `PUT /projects/{id}/probes/schedule`: a cadence with the fingerprint of the
 * quote the user confirmed per run, or null to turn the schedule off.
 */
export const probeScheduleRequestSchema = z.union([
  z.object({ cadence: z.null() }),
  z.object({ cadence: z.enum(['daily', 'weekly']), fingerprint: z.string().min(1) }),
]);
export type ProbeScheduleRequest = z.infer<typeof probeScheduleRequestSchema>;

/** What Run probe would ask and charge, before anything runs (AV-34). */
const probeQuoteSchema = z.object({
  /** Managed (`funded`) workspaces probe on CiteLadder's keys; others on their own saved keys. */
  credential_mode: credentialModeSchema,
  /** Engines that would run; empty when no key or no market blocks the probe. */
  engines: z.array(logicalEngineSchema),
  /**
   * Why Run probe is refused: a trial workspace, no usable key, no key's
   * engine measures any market, or a market asks past the audit task limit.
   */
  blocked: z.enum(['trial', 'no_key', 'no_market', 'task_limit']).nullable(),
  markets: z.array(auditMarketSchema),
  /** Questions per engine and market: two about the brand plus one per theme. */
  questions: z.int().nonnegative(),
  repetitions: z.int().positive(),
  answers: z.int().nonnegative(),
  credits: z.int().nonnegative(),
  /** AI credits left before the probe; null when the balance cannot be read. */
  balance: z.int().nullable(),
  /** Names this exact plan; Run probe sends it back so a changed plan is refused, not charged. */
  fingerprint: z.string(),
});
export type ProbeQuote = z.infer<typeof probeQuoteSchema>;

const probeStateSchema = z.enum(['running', 'labelling', 'ready', 'failed', 'unavailable']);

/** The newest probe launch: its markets' runs together. */
const probeRunSchema = z.object({
  launch_id: uuid(),
  state: probeStateSchema,
  created_at: z.string(),
  engines: z.array(logicalEngineSchema),
  markets: z.array(auditMarketSchema),
  answers: z.int().nonnegative(),
});
export type ProbeRun = z.infer<typeof probeRunSchema>;

export const probeStatusSchema = z.object({
  quote: probeQuoteSchema,
  latest: probeRunSchema.nullable(),
  schedule: z
    .object({
      id: uuid(),
      cadence: auditScheduleCadenceSchema,
      enabled: z.boolean(),
      next_run_at: z.string().nullable(),
    })
    .nullable(),
});
export type ProbeStatus = z.infer<typeof probeStatusSchema>;

/** The labelled probe a read is built from: only the markets and engines whose answers were read. */
const probeBasisSchema = probeRunSchema.omit({ state: true });

const entitySchema = z.object({
  kind: z.enum(['brand', 'competitor']),
  id: uuid().nullable(),
  name: z.string(),
});

const scoredEntitySchema = entitySchema.extend({ score, named: z.boolean() });

export const probeMarketSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }),
  z.object({
    state: z.literal('value'),
    probe: probeBasisSchema,
    brand: z.string(),
    category: z.string(),
    language_code: z.string(),
    /** Known-for answers the scores average over; 0 means none answered, not nothing raised. */
    known_for_answers: z.int().nonnegative(),
    /** What answers say the brand is known for, highest score first; `theme_id: null` is Other. */
    known_for: z.array(z.object({ theme_id: uuid().nullable(), theme: z.string(), score })),
    /** Every current theme the probe asked about, in the project's theme order. */
    themes: z.array(
      z.object({
        theme_id: uuid(),
        theme: z.string(),
        /**
         * The brand first, then competitors, each with its position score on
         * this theme and whether any answer named it: a late or rare mention
         * can round to 0 and still be named.
         */
        entities: z.array(scoredEntitySchema),
        rank: z.int().positive(),
        of: z.int().positive(),
        leader: scoredEntitySchema,
        gap: z.int().nonnegative(),
      }),
    ),
    engines: z.array(
      z.object({
        engine: logicalEngineSchema,
        /** Whether this engine answered the known-for question at all. */
        answered: z.boolean(),
        top_themes: z.array(z.object({ theme_id: uuid().nullable(), theme: z.string() })),
        /** The brand's rank on this engine's top real theme (never Other), or why there is none. */
        rank_in_top_theme: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('rank'), rank: z.int().positive() }),
          z.object({ kind: z.literal('not_named') }),
          z.object({ kind: z.literal('not_asked') }),
          z.object({ kind: z.literal('no_theme') }),
        ]),
      }),
    ),
  }),
]);
export type ProbeMarket = z.infer<typeof probeMarketSchema>;
export type ProbeMarketValue = Extract<ProbeMarket, { state: 'value' }>;

export const probeObjectionsSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }),
  z.object({
    state: z.literal('value'),
    probe: probeBasisSchema,
    brand: z.string(),
    /** Objection answers the scores average over. */
    answers: z.int().nonnegative(),
    /** Engines that answered the objection question: what a group's engine count is out of. */
    answered_by: z.array(logicalEngineSchema),
    /** The mean score of the groups an engine raised in this probe; null when none was. */
    average: score.nullable(),
    groups: z.array(
      z.object({
        id: uuid(),
        name: z.string(),
        /** Null when this probe got no objection answers, never 0. */
        score: score.nullable(),
        engines: z.array(logicalEngineSchema),
        /** Oldest first, this probe last; null where that probe had no objection answers. */
        history: z.array(score.nullable()),
        /** Distinct pages cited by answers raising it; 0 is a real state (no search), null when this probe did not raise it. */
        sources: z.int().nonnegative().nullable(),
        pages: z.array(
          z.object({
            url: z.string(),
            title: z.string(),
            domain: z.string(),
            classification: citationClassificationSchema,
            /** The source-page owner's page type and the brand's standing on it; null when no page is on record. */
            page_format: z.string().nullable(),
            standing: pageStandingSchema.nullable(),
            citations: z.int().positive(),
          }),
        ),
      }),
    ),
  }),
]);
export type ProbeObjections = z.infer<typeof probeObjectionsSchema>;
export type ProbeObjectionsValue = Extract<ProbeObjections, { state: 'value' }>;
