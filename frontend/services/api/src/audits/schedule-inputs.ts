import { z } from 'zod';
import { auditScheduleCadenceSchema } from '@citeladder/contracts/audits';
import { benchmarkModeSchema } from '@citeladder/contracts/project';
import { logicalEngineSchema } from '@citeladder/contracts/providers';
import { policy, resolveSettingSpec } from '../config.ts';

/**
 * The IANA identifier the retained Python scheduler can load (its lookup is
 * case-sensitive), or null. Only casing is corrected: ICU resolves current
 * names such as Asia/Kolkata to legacy aliases, so a valid spelling is kept.
 */
export function canonicalTimezone(value: string): string | null {
  if (!/^[A-Za-z]/u.test(value)) return null;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  if (resolved.toLowerCase() === value.toLowerCase()) return resolved;
  return value.split('/').every((part) => /^[A-Z]/u.test(part)) ? value : null;
}

const timezone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => canonicalTimezone(value) !== null, 'timezone must be a valid IANA timezone');
const engines = z
  .array(logicalEngineSchema)
  .min(1)
  .refine(
    (items) =>
      new Set(items).size === items.length &&
      items.every((item) => policy.audit_schedules.selectable_engines.includes(item)),
    'engines must be unique supported logical engines',
  );
const fields = {
  prompt_set_id: z.uuid(),
  audit_scope: z.enum(['brand', 'commerce']),
  cadence: auditScheduleCadenceSchema,
  interval_minutes: z.int().positive().max(2_147_483_647).nullable(),
  timezone,
  engines,
  repetitions: z
    .int()
    .min(policy.projects.min_repetitions)
    .max(policy.projects.max_repetitions)
    .nullable(),
  benchmark_mode: benchmarkModeSchema.nullable(),
  enabled: z.boolean(),
  next_run_at: z.iso.datetime({ offset: true }).nullable(),
};

/** Validate after merging a patch with the locked current schedule. */
export function scheduleIntervalIssue(
  input: { cadence: string; interval_minutes: number | null },
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (input.cadence !== 'every_n_minutes')
    return input.interval_minutes === null
      ? null
      : 'interval_minutes is only valid for every_n_minutes';
  const minimum = resolveSettingSpec(policy.audit_schedules.min_interval_minutes, env) as number;
  return input.interval_minutes !== null && input.interval_minutes >= minimum
    ? null
    : 'every_n_minutes requires a configured-minimum interval or higher';
}

export const scheduleCreate = z
  .object({
    ...fields,
    audit_scope: fields.audit_scope.default('brand'),
    interval_minutes: fields.interval_minutes.default(null),
    timezone: fields.timezone.default(policy.audit_schedules.default_timezone),
    repetitions: fields.repetitions.default(null),
    benchmark_mode: fields.benchmark_mode.default(null),
    enabled: fields.enabled.default(true),
    next_run_at: fields.next_run_at.default(null),
  })
  .superRefine((input, context) => {
    const message = scheduleIntervalIssue(input);
    if (message) context.addIssue({ code: 'custom', path: ['interval_minutes'], message });
  });
export const scheduleUpdate = z.object(fields).partial();
export type ScheduleCreate = z.output<typeof scheduleCreate>;
export type ScheduleUpdate = z.output<typeof scheduleUpdate>;
