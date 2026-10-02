/** Native audit execution and read policy; model/operator inputs stay shared. */
import runtime from './audits.json' with { type: 'json' };
import visibilityRuntime from './visibility.json' with { type: 'json' };
import shared from '../generated/python-config.json' with { type: 'json' };
import { compareText } from '../text-order.ts';

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
};
export const visibility = {
  ...visibilityRuntime,
  ...shared.visibility,
  dashboard_audit_statuses: [
    audits.constants.audit_status_completed,
    audits.constants.audit_status_partially_completed,
  ],
  measurement_policy_key: audits.constants.measurement_policy_key,
};
