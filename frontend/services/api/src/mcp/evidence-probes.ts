import { probeMarket } from '../probes/market.ts';
import { probeObjections } from '../probes/objections.ts';
import { probeRuns } from '../probes/status.ts';
import { pageOf, unavailable } from './data.ts';
import { withoutQueryDeep } from './evidence-site.ts';
import type { Evidence, ProjectRead } from './types.ts';

type Page = { cursor?: string | null; limit?: number | null };

export async function probeRead({ db, scope }: ProjectRead): Promise<Evidence> {
  const [runs, market] = await Promise.all([probeRuns(db, scope), probeMarket(db, scope)]);
  if (!runs.latest && !runs.schedule) return unavailable('no_probe');
  return {
    state: 'available',
    view: 'probe',
    latest: runs.latest,
    schedule: runs.schedule,
    market: market.state === 'value' ? withoutQueryDeep(market) : null,
  };
}

export async function objectionGroups({ db, scope }: ProjectRead, args: Page): Promise<Evidence> {
  const objections = await probeObjections(db, scope);
  if (objections.state === 'none') return unavailable('no_labelled_probe');
  const { groups, ...probe } = objections;
  const page = pageOf(groups, args, {
    endpoint: 'mcp_objection_groups',
    filters: { project_id: scope.projectId },
  });
  return {
    state: 'available',
    view: 'objections',
    probe: probe.probe,
    answers: probe.answers,
    average: probe.average,
    groups: withoutQueryDeep(page.items),
    pagination: page.pagination,
  };
}
