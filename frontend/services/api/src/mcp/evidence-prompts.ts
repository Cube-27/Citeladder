/** Per-prompt and fanout reads compose the visibility owners; they own no metrics. */
import { policy } from '../config.ts';
import { getVisibilityFanout } from '../visibility/fanout.ts';
import { getPromptAnswers } from '../visibility/prompt-answers.ts';
import { getPromptHistory } from '../visibility/prompt-history.ts';
import { getPromptMetrics } from '../visibility/prompts.ts';
import { mcpPolicy } from './config.ts';
import { decodeCursor, encodeCursor, pagination, reference, unavailable } from './data.ts';
import { notYetMeasured, oneRun, type Page, type Selection } from './evidence-analytics.ts';
import { McpInputError, type Evidence, type ProjectRead } from './types.ts';

type PromptMetricsArgs = Selection &
  Page & {
    view: 'list' | 'history' | 'answers';
    prompt_id?: string | null;
    baseline_id?: string | null;
  };

const resultUri = (taskId: string) => `citeladder://visibility_result/${taskId}`;

/** One run's prompt scores, paged here: the owner returns the run's whole list. */
async function promptList(read: ProjectRead, args: PromptMetricsArgs): Promise<Evidence> {
  const scope = { ...read.scope, marketId: args.market_id ?? null };
  let items: Awaited<ReturnType<typeof getPromptMetrics>>;
  try {
    items = await getPromptMetrics(read.db, scope, {
      auditId: args.audit_id ?? null,
      auditIds: null,
      baselineAuditIds: null,
      baselineId: args.baseline_id ?? null,
      logicalEngine: args.engine ?? null,
      cohort: args.cohort,
    });
  } catch (error) {
    return notYetMeasured(error, Boolean(args.audit_id || args.baseline_id));
  }
  // The owner reads no run yet as an empty list; here it is not a run without prompts.
  if (!items.length && !args.audit_id) return unavailable('no_completed_run');
  const offset = args.cursor ? Number(decodeCursor(args.cursor, 1)[0]) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new McpInputError('cursor is invalid');
  const end = offset + (args.limit ?? mcpPolicy.default_list_limit);
  const page = items.slice(offset, end).map((item) => ({
    ...item,
    record_uri: item.prompt_id ? `citeladder://prompt/${item.prompt_id}` : null,
  }));
  return {
    state: 'available',
    view: 'list',
    audit_id: items[0]?.audit_id ?? args.audit_id ?? null,
    items: page,
    pagination: pagination(page, end < items.length ? encodeCursor(end) : null, items.length),
    artifact_refs: [...new Set(items.map((item) => item.audit_id))].map((id) =>
      reference('audit', id),
    ),
  };
}

/**
 * Prompt metrics: one run's prompts with their scores (`list`), one prompt's
 * score per run (`history`), or that prompt's answers across runs (`answers`).
 */
export async function promptMetricsRead(
  read: ProjectRead,
  args: PromptMetricsArgs,
): Promise<Evidence> {
  if (args.view === 'list') return promptList(read, args);
  const promptId = args.prompt_id;
  if (!promptId) throw new McpInputError(`view ${args.view} needs prompt_id`);
  const scope = { ...read.scope, marketId: args.market_id ?? null };
  const engine = args.engine ?? null;
  if (args.view === 'history') {
    const history = await getPromptHistory(read.db, scope, {
      promptId,
      logicalEngine: engine,
      cohort: null,
    });
    return {
      state: 'available',
      view: 'history',
      ...history,
      artifact_refs: [reference('prompt', promptId)],
    };
  }
  const page = await getPromptAnswers(read.db, scope, {
    promptId,
    logicalEngine: engine,
    fromAt: null,
    toAt: null,
    brand: null,
    cited: null,
    search: null,
    cursor: args.cursor ?? null,
    limit: Math.min(
      args.limit ?? policy.visibility.prompt_answers_page_size,
      policy.visibility.prompt_answers_max_limit,
    ),
  });
  const items = page.items.map((item) => ({ ...item, record_uri: resultUri(item.execution_id) }));
  return {
    state: 'available',
    view: 'answers',
    market_id: page.market_id,
    items,
    pagination: pagination(items, page.next_cursor),
    artifact_refs: items.map((item) => reference('visibility_result', item.execution_id)),
  };
}

/**
 * The searches engines ran while answering, as the Query fanouts table counts
 * them: each query with its share, change against the previous run and brands.
 */
export async function queryFanoutsRead(
  read: ProjectRead,
  args: Selection &
    Page & {
      prompt_id?: string | null;
      search?: string | null;
      order: 'top' | 'rising' | 'falling';
    },
): Promise<Evidence> {
  const run = await oneRun(read, args);
  if (run.kind === 'none') return run.evidence;
  const auditId = run.selection.auditId;
  try {
    const summary = await getVisibilityFanout(read.db, run.selection, {
      query: null,
      search: args.search ?? null,
      order: args.order,
      cursor: args.cursor ?? null,
      limit: Math.min(
        args.limit ?? mcpPolicy.default_list_limit,
        policy.visibility.evidence_max_limit,
      ),
      filters: {
        outcome: null,
        competitor: null,
        domain: null,
        url: null,
        promptId: args.prompt_id ?? null,
      },
    });
    const { answers: _answers, next_cursor, ...rest } = summary;
    return {
      state: 'available',
      audit_id: auditId,
      ...rest,
      pagination: pagination(summary.items, next_cursor, summary.matched_queries),
      artifact_refs: auditId ? [reference('audit', auditId)] : [],
    };
  } catch (error) {
    return notYetMeasured(error, Boolean(args.audit_id), Boolean(args.topic_id));
  }
}
