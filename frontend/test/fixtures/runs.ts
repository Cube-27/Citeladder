import type { Audit, AuditStatus } from '@citeladder/contracts';
import { auditPageSchema, auditStatusSchema, type AuditPage } from '@citeladder/contracts/audits';

export function makeAudit(n: number, overrides: Partial<Audit> = {}): Audit {
  const createdAt = overrides.created_at ?? '2026-08-01T00:00:00Z';
  return {
    id: `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`,
    workspace_id: '22222222-2222-4222-8222-222222222222',
    project_id: '33333333-3333-4333-8333-333333333333',
    parent_audit_id: null,
    status: 'completed',
    cancelable: false,
    benchmark_mode: 'consumer_like',
    audit_scope: 'brand',
    model_provenance: [],
    repetitions: 1,
    random_seed: 'seed',
    requested_count: 10,
    completed_count: 10,
    failed_count: 0,
    error_message: '',
    engine_snapshots: [],
    market: { id: null, country_code: 'US', language_code: 'en' },
    launch_id: null,
    not_applicable_engines: [],
    created_at: createdAt,
    updated_at: createdAt,
    started_at: createdAt,
    completed_at: createdAt,
    ...overrides,
  };
}

export function auditPage(audits: readonly Audit[], overrides: Partial<AuditPage> = {}): AuditPage {
  const count = (status: AuditStatus) => audits.filter((audit) => audit.status === status).length;
  return auditPageSchema.parse({
    items: audits,
    total: audits.length,
    page: 1,
    page_size: 10,
    status_counts: Object.fromEntries(
      auditStatusSchema.options.map((status) => [status, count(status)]),
    ),
    ...overrides,
  });
}
