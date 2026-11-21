import vocabulary from './entitlements.json' with { type: 'json' };
import { ConfigError } from './config-error.ts';

type CapabilityDefinition = {
  type: string;
  levels: number;
  ordered_values: readonly string[];
  rolling_window_seconds: number | null;
};

function validateCapability(key: string, entry: CapabilityDefinition) {
  if (
    !['flag', 'level', 'counter.occupancy', 'counter.consumable', 'counter.rate'].includes(
      entry.type,
    )
  )
    throw new ConfigError(`Unknown capability type: ${key}`);
  if (entry.type === 'level') {
    if (
      !entry.ordered_values.length ||
      entry.levels !== entry.ordered_values.length ||
      new Set(entry.ordered_values).size !== entry.levels
    )
      throw new ConfigError(`Invalid capability level ordering: ${key}`);
  } else if (entry.ordered_values.length || entry.levels !== 0) {
    throw new ConfigError(`Unexpected capability levels: ${key}`);
  }
  if (entry.type === 'counter.rate') {
    if (
      !Number.isSafeInteger(entry.rolling_window_seconds) ||
      Number(entry.rolling_window_seconds) <= 0
    )
      throw new ConfigError(`Invalid capability rate window: ${key}`);
  } else if (entry.rolling_window_seconds !== null) {
    throw new ConfigError(`Unexpected capability rate window: ${key}`);
  }
}

for (const [key, entry] of Object.entries(vocabulary.capabilities)) validateCapability(key, entry);
const codes = new Set<string>(Object.values(vocabulary.codes));
const flags = new Set(
  Object.entries(vocabulary.capabilities)
    .filter(([, entry]) => entry.type === 'flag')
    .map(([key]) => key),
);
for (const [key, refusal] of Object.entries(vocabulary.flag_refusals)) {
  if (!flags.has(key)) throw new ConfigError(`Flag refusal for a non-flag: ${key}`);
  if (!codes.has(refusal.code)) throw new ConfigError(`Unknown flag refusal code: ${key}`);
  if (refusal.status !== 403 && refusal.status !== 409)
    throw new ConfigError(`Invalid flag refusal status: ${key}`);
}
export const entitlements = vocabulary;
