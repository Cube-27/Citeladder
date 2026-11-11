import { z } from 'zod';

import { actionStatusSchema } from './actions.ts';
import { buyerStageSchema } from './project.ts';

const uuid = z.uuid();
/** Targets one discovery or prompt-generation request may name: each is a paid search or model call. */
export const COMMERCE_TARGETS_MAX = 10;
export const commerceTargetSchema = z.strictObject({
  kind: z.enum(['category', 'product']),
  id: uuid,
});
/** The targets one discovery or prompt-generation request names. */
export const commerceTargetsSchema = z.array(commerceTargetSchema).min(1).max(COMMERCE_TARGETS_MAX);
export const commerceCategoryRoleSchema = z.enum(['hub', 'leaf', 'unknown']);
/**
 * The catalog list is navigation: each row carries what the rail and the
 * catalog-choice tool render, never the row's evidence (attributes, variants,
 * field sources), which stays on the stored row and the frozen audit context.
 */
export const commerceCategorySchema = z.strictObject({
  id: uuid,
  name: z.string(),
  product_count: z.number().int(),
});
export const commerceProductSchema = z.strictObject({
  id: uuid,
  canonical_url: z.string(),
  name: z.string(),
  brand: z.string(),
  category_ids: z.array(uuid),
});
/** Projection progress, read alone while projections are in flight. */
export const commerceProjectionSchema = z.strictObject({
  /**
   * Whether crawled pages project into the catalog: only catalog-selling
   * business models. `unknown` when no recognized model is confirmed yet;
   * projection fails closed then, but the state is not "not applicable".
   */
  applicability: z.enum(['applicable', 'not_applicable', 'unknown']),
  in_flight: z.number().int(),
  /** Failed or cancelled projections of the latest projected crawl. */
  failed: z.number().int(),
});
export const commerceCatalogSchema = z.strictObject({
  /** The first configured number of products by name; `product_total` counts them all. */
  products: z.array(commerceProductSchema),
  product_total: z.number().int(),
  categories: z.array(commerceCategorySchema),
  projection: commerceProjectionSchema,
});
export const catalogImportSchema = z.strictObject({
  import_id: uuid,
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  rejected: z.number().int(),
  row_outcomes: z.array(
    z.strictObject({
      row_number: z.number().int(),
      status: z.enum(['created', 'updated', 'unchanged', 'rejected']),
      product_id: uuid.nullable(),
      error_code: z.string(),
      detail: z.string(),
    }),
  ),
});
export const competitorCandidateSchema = z.strictObject({
  id: uuid,
  target_kind: z.enum(['category', 'product']),
  target_id: uuid,
  canonical_url: z.string(),
  product_name: z.string(),
  brand_name: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  source_kind: z.string(),
  state: z.enum(['pending', 'approved', 'rejected', 'excluded']),
  decision_at: z.string().nullable(),
});
export const competitorDiscoverySchema = z.strictObject({ task_ids: z.array(uuid) });
export const competitorDiscoveryTaskSchema = z.strictObject({
  id: uuid,
  target: commerceTargetSchema,
  status: z.string(),
  error_code: z.string(),
  terminal: z.boolean(),
});
export const buyerPromptSchema = z.strictObject({
  id: uuid,
  prompt_set_id: uuid,
  target: commerceTargetSchema,
  text: z.string(),
  /** A comparison that names the owned brand; the only prompts allowed to. */
  branded: z.boolean(),
  /** The intent stage: a matrix cell's stage, `consideration` for a hero product, empty when manual. */
  buyer_stage: buyerStageSchema,
  /** The category matrix's buyer context; empty outside a matrix. */
  context: z.string(),
  enabled: z.boolean(),
  approved_at: z.string().nullable(),
});
/** The latest measured snapshot of one target. */
const shelfSnapshotSchema = z.strictObject({
  /** Null when no execution for the target succeeded: unavailable, not zero. */
  product_visibility: z.number().nullable(),
  share_of_shelf: z.number().nullable(),
  average_shelf_position: z.number().nullable(),
  first_position_win_rate: z.number().nullable(),
  successful_execution_count: z.number().int(),
  recognized_slot_count: z.number().int(),
  ranked_execution_count: z.number().int(),
  measured_at: z.string(),
});
/** Who an answer recommended for the target, folded across the latest audit's executions. */
export const shelfHolderSchema = z.strictObject({
  kind: z.enum(['owned', 'approved_competitor', 'ai_observed_competitor']),
  name: z.string(),
  brand: z.string(),
  merchant_domain: z.string(),
  /** Executions whose answer recommended it. */
  appearances: z.number().int(),
  /** Its best position in an ordered answer, or null when no answer ordered it. */
  best_rank: z.number().int().nullable(),
});
const shelfActionSchema = z.strictObject({
  id: uuid,
  title: z.string(),
  status: actionStatusSchema,
});
export const shelfSchema = z.strictObject({
  target: commerceTargetSchema,
  snapshot: shelfSnapshotSchema.nullable(),
  holders: z.array(shelfHolderSchema),
  /** Recommendations in the latest audit that named nothing the catalog or competitors know. */
  unresolved_count: z.number().int(),
  /** Actions not yet done or dismissed whose evidence targets this product or category. */
  actions: z.array(shelfActionSchema),
});

/** Which holders the Products table lists: the catalog alone, or with competitors (CM6). */
export const commerceProductSourceSchema = z.enum(['catalog', 'all']);
/** The Products table's sort keys; each has one direction (best first, then name). */
export const commerceProductSortSchema = z.enum(['visibility', 'win_rate', 'position', 'name']);
/**
 * One product holder's metrics over the filtered executions (formula version
 * 1). Each holder holds at most one slot per execution, at its best rank.
 * Null is unavailable or unknown, never zero.
 */
export const commerceProductRowSchema = z.strictObject({
  /** The product id for `owned`, the competitor candidate id otherwise. */
  holder_id: uuid,
  kind: z.enum(['owned', 'approved_competitor', 'ai_observed_competitor']),
  name: z.string(),
  brand: z.string(),
  url: z.string(),
  category_ids: z.array(uuid),
  /** Executions with a slot ÷ executions in scope; null with no execution in scope. */
  visibility: z.number().nullable(),
  /** Executions with a slot; 0 is a real zero. */
  appearances: z.number().int(),
  /** Appearances in an ordered answer, the denominator of win rate and position. */
  ordered_appearances: z.number().int(),
  /** Ordered appearances at rank 1 ÷ ordered appearances; null with none. */
  win_rate: z.number().nullable(),
  /** Mean best rank over ordered appearances; null with none. */
  position: z.number().nullable(),
  mentioned_price: z.strictObject({
    /** Median quoted price in `currency`; null when none was quoted in it. */
    median: z.number().nullable(),
    /** The catalog currency, else the most quoted one; empty when unknown. */
    currency: z.string(),
    /** Executions that quoted a price in `currency`. */
    quoted: z.number().int(),
    /** Executions that quoted a price in another currency: counted, not converted. */
    other_currency: z.number().int(),
  }),
  /** The catalog price or min–max across variants; null when the catalog has none. */
  catalog_price: z
    .strictObject({ min: z.number(), max: z.number(), currency: z.string() })
    .nullable(),
  /** Merchant domains the answers send shoppers to, by executions, most first. */
  merchants: z.array(z.strictObject({ domain: z.string(), count: z.number().int() })),
});
export const commerceProductPageSchema = z.strictObject({
  window_days: z.number().int(),
  /** Successful matched executions in scope: the visibility denominator. */
  executions: z.number().int(),
  /** Holders matching the filters, across every page. */
  total: z.number().int(),
  items: z.array(commerceProductRowSchema),
  next_cursor: z.string().nullable(),
});

export type CommerceTarget = z.infer<typeof commerceTargetSchema>;
export type CommerceProductSource = z.infer<typeof commerceProductSourceSchema>;
export type CommerceProductSort = z.infer<typeof commerceProductSortSchema>;
export type CommerceProductRow = z.infer<typeof commerceProductRowSchema>;
export type CommerceProductPage = z.infer<typeof commerceProductPageSchema>;
export type CommerceCatalog = z.infer<typeof commerceCatalogSchema>;
export type CommerceProjection = z.infer<typeof commerceProjectionSchema>;
export type CatalogImport = z.infer<typeof catalogImportSchema>;
export type CompetitorCandidate = z.infer<typeof competitorCandidateSchema>;
export type CompetitorDiscoveryTask = z.infer<typeof competitorDiscoveryTaskSchema>;
export type BuyerPrompt = z.infer<typeof buyerPromptSchema>;
export type Shelf = z.infer<typeof shelfSchema>;
