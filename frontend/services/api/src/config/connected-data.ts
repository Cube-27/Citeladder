/** Connected-data runtime policy; persisted defaults remain shared with Python. */
import shared from '../generated/python-config.json' with { type: 'json' };
import integrationRuntime from './integrations.json' with { type: 'json' };
import trafficRuntime from './traffic.json' with { type: 'json' };
import referralRuntime from './referrals.json' with { type: 'json' };
import analyticsRuntime from './analytics.json' with { type: 'json' };
import oauthRuntime from './auth-oauth.json' with { type: 'json' };
import { validateReferralRules } from './referral-rules.ts';
import { compareText } from '../text-order.ts';

validateReferralRules(referralRuntime);

export const integrations = {
  ...integrationRuntime,
  ...shared.integrations,
  settings: { ...integrationRuntime.settings, ...shared.integrations.settings },
  contracts: { ...integrationRuntime.contracts, ...shared.integrations.contracts },
  state_ttl_seconds: oauthRuntime.settings.state_ttl_seconds,
};
const dimensionArity = Object.fromEntries(
  Object.entries(integrations.datasets).map(([id, dataset]) => [id, dataset.dimensions.length]),
);
const datasetConstants = Object.fromEntries(
  Object.keys(integrations.datasets).map((id) => [`DATASET_${id.toUpperCase()}`, id]),
) as { [Id in keyof typeof integrations.datasets as `DATASET_${Uppercase<Id>}`]: Id };
export const traffic = {
  ...trafficRuntime,
  ...shared.traffic,
  ...datasetConstants,
  dimension_key_separator: integrations.dimension_separator,
  dimension_arity: dimensionArity,
  PERFORMANCE_DATASET_DIMENSIONS: Object.fromEntries(
    Object.entries(trafficRuntime.PERFORMANCE_DIMENSION_DATASETS).map(([dimension, id]) => [
      id,
      dimension,
    ]),
  ),
};
const tasks = { ...analyticsRuntime.tasks, ...shared.analytics.tasks };
const taskKinds = Object.values(tasks).sort(compareText);
export const analytics = {
  ...analyticsRuntime,
  ...shared.analytics,
  tasks,
  task_kinds: taskKinds,
  ts_owned_task_kinds: taskKinds,
  worker_settings: { ...analyticsRuntime.worker_settings, ...shared.analytics.worker_settings },
  default_granularity: traffic.TRAFFIC_GRANULARITY_DAY,
  snapshot_granularities: traffic.TRAFFIC_SNAPSHOT_GRANULARITIES,
  snapshot_window_days: Object.values(analyticsRuntime.preset_range_days).sort((a, b) => a - b),
};
export const referrals = {
  ...referralRuntime,
  ...shared.referrals,
  dimension_key_separator: integrations.dimension_separator,
  dimension_arity: Object.fromEntries(
    Object.values(referralRuntime.datasets).map((id) => [id, dimensionArity[id]]),
  ),
};
export const authOAuth = {
  ...oauthRuntime,
  integration_cookie_name: integrations.transport.INTEGRATION_OAUTH_TRANSACTION_COOKIE,
  integration_cookie_path: integrations.transport.INTEGRATION_OAUTH_TRANSACTION_COOKIE_PATH,
};
