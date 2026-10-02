/** Native audit execution and read policy; model/operator inputs stay shared. */
import runtime from './audits.json' with { type: 'json' };
import visibilityRuntime from './visibility.json' with { type: 'json' };
import shared from '../generated/python-config.json' with { type: 'json' };
import { compareText } from '../text-order.ts';
import { dataforseo } from './providers.ts';
import { ConfigError } from './config-error.ts';

export const selectableEngines = shared.providers.catalog
  .filter((entry) => entry.adapter_shipped && Object.hasOwn(shared.providers.routes, entry.key))
  .map((entry) => entry.key)
  .sort(compareText);
export const audits = {
  ...runtime,
  ...shared.audits,
  analysis: { ...runtime.analysis, ...shared.audits.analysis },
  constants: { ...runtime.constants, ...shared.audits.constants },
  selectable_engines: selectableEngines,
  route_policies: Object.fromEntries(
    Object.entries(runtime.route_policies).map(([engine, execution]) => {
      const route = shared.providers.routes[engine as keyof typeof shared.providers.routes];
      if (!route) throw new ConfigError(`Audit engine ${engine} has no shared provider route`);
      return [
        engine,
        {
          ...execution,
          reasoning_effort: route.reasoning_effort,
          reasoning_pinnable: route.reasoning_pinnable,
          representative_status: route.representative_status,
        },
      ];
    }),
  ),
};
export const visibility = {
  ...visibilityRuntime,
  ...shared.visibility,
  dashboard_audit_statuses: [
    audits.constants.audit_status_completed,
    audits.constants.audit_status_partially_completed,
  ],
  measurement_policy_key: audits.constants.measurement_policy_key,
  overview_present_outcome: dataforseo.surface.outcome_ai_overview_present,
  successful_outcomes: dataforseo.surface.successful_outcomes,
};
