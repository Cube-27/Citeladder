/**
 * Market probes (AV-29 to AV-36): the Run probe quote, the probe's state, and
 * the Market and Objections reads on Perception. Scores are position scores
 * (AV-35): 100 named first, minus 10 per later place, 0 when not raised,
 * averaged over the probe's answers; a read with no labelled probe is `none`.
 */
import { z } from 'zod';

import { auditScheduleCadenceSchema } from './audits.ts';
import { credentialModeSchema } from './billing.ts';
import { auditMarketSchema } from './markets.ts';
import { logicalEngineSchema } from './providers.ts';

const uuid = () => z.uuid();
const score = z.int().min(0).max(100);

export const objectionGroupRequestSchema = z.object({ name: z.string() });
export const objectionGroupMergeRequestSchema = z.object({ into_id: uuid() });
/** A renamed or merged-into objection group. */
export const objectionGroupSchema = z.object({ id: uuid(), name: z.string() });

/** `POST /projects/{id}/probes`: the fingerprint of the quote the user confirmed. */
export const probeRunRequestSchema = z.object({ fingerprint: z.string().min(1) });
export type ProbeRunRequest = z.infer<typeof probeRunRequestSchema>;

/** `PUT /projects/{id}/probes/schedule`: a cadence, or null to turn the schedule off. */
export const probeScheduleRequestSchema = z.object({
  cadence: z.enum(['daily', 'weekly']).nullable(),
});
export type ProbeScheduleRequest = z.infer<typeof probeScheduleRequestSchema>;

/** What Run probe would ask and charge, before anything runs (AV-34). */
const probeQuoteSchema = z.object({
  /** Managed (`funded`) workspaces probe on CiteLadder's keys; others on their own saved keys. */
  credential_mode: credentialModeSchema,
  /** Search-capable engines with a usable key; empty means a key must be added first. */
  engines: z.array(logicalEngineSchema),
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
  audit_ids: z.array(uuid()),
  state: probeStateSchema,
  created_at: z.string(),
  completed_at: z.string().nullable(),
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

/** The labelled probe a read is built from. */
const probeBasisSchema = z.object({
  launch_id: uuid(),
  created_at: z.string(),
  engines: z.array(logicalEngineSchema),
  markets: z.array(auditMarketSchema),
  answers: z.int().nonnegative(),
});

const entitySchema = z.object({
  kind: z.enum(['brand', 'competitor']),
  id: uuid().nullable(),
  name: z.string(),
});

export const probeMarketSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }),
  z.object({
    state: z.literal('value'),
    probe: probeBasisSchema,
    brand: z.string(),
    category: z.string(),
    language_code: z.string(),
    /** What answers say the brand is known for, highest score first; `theme_id: null` is Other. */
    known_for: z.array(
      z.object({ theme_id: uuid().nullable(), theme: z.string(), score, raised_in: z.int() }),
    ),
    /** Every current theme the probe asked about, in the project's theme order. */
    themes: z.array(
      z.object({
        theme_id: uuid(),
        theme: z.string(),
        answers: z.int().nonnegative(),
        /** The brand first, then competitors, each with its position score on this theme. */
        entities: z.array(entitySchema.extend({ score })),
        rank: z.int().positive(),
        of: z.int().positive(),
        leader: entitySchema.extend({ score }),
        gap: z.int().nonnegative(),
      }),
    ),
    engines: z.array(
      z.object({
        engine: logicalEngineSchema,
        top_themes: z.array(z.object({ theme_id: uuid().nullable(), theme: z.string() })),
        /** The brand's rank in this engine's answers on its top theme; null when not named. */
        rank_in_top_theme: z.int().positive().nullable(),
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
    /** The mean score of the groups an engine raised in this probe; null when none was. */
    average: score.nullable(),
    groups: z.array(
      z.object({
        id: uuid(),
        name: z.string(),
        /** Null when this probe got no objection answers, never 0. */
        score: score.nullable(),
        engines: z.array(logicalEngineSchema),
        /** Since the previous labelled probe; null without one. */
        change: z.int().nullable(),
        /** Oldest first, this probe last; null where that probe had no objection answers. */
        history: z.array(score.nullable()),
        /** Distinct pages cited by answers raising it; 0 is a real state (no search). */
        sources: z.int().nonnegative(),
        pages: z.array(
          z.object({
            url: z.string(),
            title: z.string(),
            domain: z.string(),
            classification: z.string(),
            citations: z.int().positive(),
          }),
        ),
      }),
    ),
  }),
]);
export type ProbeObjections = z.infer<typeof probeObjectionsSchema>;
export type ProbeObjectionsValue = Extract<ProbeObjections, { state: 'value' }>;
