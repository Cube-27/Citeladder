import { z } from 'zod';
import {
  analyticsResultSchema,
  analyticsSelectionSchema,
  type AnalyticsResult,
  type AnalyticsSelection,
} from '@citeladder/contracts/mcp-app';
import { appPolicy } from './config';

export type Host = {
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  context: (
    selection: AnalyticsSelection | null,
    evidence?: Record<string, unknown>,
  ) => Promise<unknown>;
};
const projectsSchema = z.object({
  projects: z.array(z.object({ id: z.uuid(), name: z.string(), workspace_name: z.string() })),
  pagination: z.object({ next_cursor: z.string().nullable() }),
});
export type AppState = {
  result: AnalyticsResult | null;
  selection: AnalyticsSelection | null;
  projects: z.infer<typeof projectsSchema>['projects'];
  projectCursor: string | null;
  busy: boolean;
  error: string | null;
  answers: Record<string, unknown>[];
};

function bounded(value: unknown): unknown {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > appPolicy.maxResultBytes)
    throw new Error('Result exceeds the display limit');
  return value;
}
function evidence(value: unknown): Record<string, unknown> {
  return z.record(z.string(), z.json()).parse(bounded(value));
}

/** One generation per selection. Late reads can never repopulate old scope. */
export function createController(host: Host) {
  let generation = 0;
  let state: AppState = {
    result: null,
    selection: null,
    projects: [],
    projectCursor: null,
    busy: false,
    error: null,
    answers: [],
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  let contextQueue: Promise<unknown> = Promise.resolve();
  const context = (selection: AnalyticsSelection | null, epoch: number) => {
    contextQueue = contextQueue
      .catch(() => undefined)
      .then(() => {
        if (epoch === generation)
          return host.context(selection, selection ? state.result?.evidence : undefined);
      })
      .catch(() => undefined);
  };
  const receive = (value: unknown) => {
    const parsed = analyticsResultSchema.safeParse(bounded(value));
    if (!parsed.success) return;
    if (
      state.selection &&
      parsed.data.selection &&
      (parsed.data.selection.project_id !== state.selection.project_id ||
        parsed.data.selection.view !== state.selection.view ||
        (state.selection.audit_id && parsed.data.selection.audit_id !== state.selection.audit_id) ||
        (state.selection.snapshot_id &&
          parsed.data.selection.snapshot_id !== state.selection.snapshot_id))
    )
      return;
    const epoch = ++generation;
    set({
      result: parsed.data,
      selection: parsed.data.selection,
      busy: false,
      error: null,
      answers: [],
    });
    context(parsed.data.selection, epoch);
  };
  const select = async (input: unknown) => {
    const epoch = ++generation;
    const selection = analyticsSelectionSchema.parse(input);
    const links = state.result?.links ?? {
      application: 'https://app.citeladder.com',
      onboarding: 'https://app.citeladder.com/onboarding',
    };
    set({ result: null, selection, answers: [], busy: true, error: null });
    context(null, epoch);
    try {
      let data: Record<string, unknown>;
      const base = {
        project_id: selection.project_id,
        engine: selection.engine,
        cohort: selection.cohort,
      };
      if (selection.view === 'trends') {
        data = evidence(
          await host.call('read_visibility_trends', {
            ...base,
            from_at: selection.from_at,
            to_at: selection.to_at,
            transport_model: selection.transport_model,
            retrieval_enabled: selection.retrieval_enabled,
          }),
        );
      } else if (selection.view === 'site_health') {
        data = evidence(
          await host.call('read_site_health', {
            project_id: selection.project_id,
            snapshot_id: selection.snapshot_id,
          }),
        );
        if (typeof data.snapshot_id === 'string') selection.snapshot_id = data.snapshot_id;
      } else {
        data = evidence(
          await host.call('read_visibility_overview', { ...base, audit_id: selection.audit_id }),
        );
        if (typeof data.audit_id === 'string') selection.audit_id = data.audit_id;
        if (selection.view === 'sources' && selection.audit_id) {
          data = evidence(
            await host.call('read_visibility_sources', {
              ...base,
              audit_id: selection.audit_id,
              level: selection.level,
              domain: selection.domain,
              cursor: selection.cursor,
              limit: selection.limit,
            }),
          );
        }
      }
      if (epoch !== generation) return;
      const application = new URL(
        selection.view === 'site_health' ? '/website' : '/visibility',
        links.application,
      );
      application.searchParams.set('project', selection.project_id);
      if (selection.audit_id) application.searchParams.set('audit', selection.audit_id);
      set({
        result: analyticsResultSchema.parse({
          surface: 'citeladder_analytics',
          selection,
          evidence: data,
          links: { ...links, application: application.href },
        }),
        selection,
        busy: false,
      });
      context(selection, epoch);
    } catch {
      if (epoch === generation)
        set({
          busy: false,
          error: 'Evidence is unavailable. Check the connection and access, then retry.',
        });
    }
  };
  const loadProjects = async (cursor: string | null = null) => {
    const epoch = generation;
    try {
      const page = projectsSchema.parse(
        bounded(await host.call('list_projects', { limit: appPolicy.pageSize, cursor })),
      );
      if (epoch !== generation) return;
      set({
        projects: cursor ? [...state.projects, ...page.projects] : page.projects,
        projectCursor: page.pagination.next_cursor,
        error: null,
      });
    } catch {
      if (epoch !== generation) return;
      ++generation;
      set({
        result: null,
        projects: [],
        projectCursor: null,
        answers: [],
        busy: false,
        error: 'Connect your CiteLadder account or reconnect to restore access.',
      });
      context(null, generation);
    }
  };
  const drill = async (source: string) => {
    const selection = state.selection;
    if (!selection?.audit_id) return;
    const epoch = ++generation;
    set({ answers: [], busy: true, error: null });
    try {
      const data = evidence(
        await host.call('read_visibility_results', {
          project_id: selection.project_id,
          audit_id: selection.audit_id,
          engine: selection.engine,
          cohort: selection.cohort,
          [selection.level === 'url' ? 'url' : 'domain']: source,
          limit: appPolicy.pageSize,
        }),
      );
      if (epoch === generation)
        set({ busy: false, answers: Array.isArray(data.items) ? data.items.map(evidence) : [] });
    } catch {
      if (epoch === generation) {
        set({
          result: null,
          busy: false,
          error: 'Source evidence is unavailable. Retry or reconnect.',
        });
        context(null, epoch);
      }
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    receive,
    select,
    loadProjects,
    drill,
    begin: (input: unknown) => {
      const parsed = analyticsSelectionSchema.safeParse(input);
      ++generation;
      set({
        result: null,
        answers: [],
        selection: parsed.success ? parsed.data : null,
        busy: true,
        error: null,
      });
      context(null, generation);
    },
    fetchAnswer: async (id: string) => {
      if (!/^citeladder:\/\/visibility_result\/[0-9a-f-]{36}$/u.test(id)) return;
      const epoch = generation;
      const data = evidence(await host.call('fetch', { id }));
      if (epoch !== generation) return;
      set({
        answers: state.answers.map((answer) =>
          answer.record_uri === id ? { ...answer, answer_text: data.text } : answer,
        ),
      });
    },
    siteFindings: async () => {
      const epoch = generation;
      const selected = state.selection;
      if (!selected) return [];
      let result: Record<string, unknown>;
      try {
        result = evidence(
          await host.call('read_opportunities', {
            project_id: selected.project_id,
            limit: appPolicy.pageSize,
          }),
        );
      } catch (error) {
        if (epoch === generation) {
          ++generation;
          set({
            result: null,
            answers: [],
            busy: false,
            error: 'Evidence is unavailable. Retry or reconnect.',
          });
          context(null, generation);
        }
        throw error;
      }
      if (epoch !== generation) return [];
      return Array.isArray(result.items) ? result.items.map(evidence) : [];
    },
    sitePages: async () => {
      const epoch = generation;
      const selected = state.selection;
      const crawlId = state.result?.evidence.crawl_id;
      if (!selected || typeof crawlId !== 'string') return [];
      let result: Record<string, unknown>;
      try {
        result = evidence(
          await host.call('read_site_pages', {
            project_id: selected.project_id,
            crawl_id: crawlId,
            limit: appPolicy.pageSize,
          }),
        );
      } catch (error) {
        if (epoch === generation) {
          ++generation;
          set({
            result: null,
            answers: [],
            busy: false,
            error: 'Evidence is unavailable. Retry or reconnect.',
          });
          context(null, generation);
        }
        throw error;
      }
      if (epoch !== generation) return [];
      return Array.isArray(result.items) ? result.items.map(evidence) : [];
    },
    disconnect: () => {
      ++generation;
      set({
        result: null,
        projects: [],
        projectCursor: null,
        answers: [],
        busy: false,
        error: 'Connect your CiteLadder account to read evidence.',
      });
      context(null, generation);
    },
  };
}
export type Controller = ReturnType<typeof createController>;

/** Host deep links carry selections only; every read still reauthorizes them. */
export function deepLinkSelection(value: unknown): AnalyticsSelection | null {
  const link = z.object({ url: z.string().max(4096) }).safeParse(value);
  if (!link.success || !link.data.url.startsWith('/') || link.data.url.startsWith('//'))
    return null;
  const url = new URL(link.data.url, 'https://selection.invalid');
  if (url.hash || url.pathname !== '/analytics') return null;
  const parsed = analyticsSelectionSchema.safeParse(Object.fromEntries(url.searchParams));
  return parsed.success ? parsed.data : null;
}
