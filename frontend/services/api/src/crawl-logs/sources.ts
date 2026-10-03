import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { hash } from '../traffic/normalization.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { ApiError, notFound } from '../errors.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { lockAuthorizedWorkspace } from '../workspaces/service.ts';
import { lockCrawlState, type CrawlScope } from './state.ts';

const samplingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('sampled'), rate: z.number().gt(0).max(1) }),
  z.strictObject({ kind: z.literal('filtered'), description: z.string().trim().min(1).max(512) }),
]);
export const createSourceSchema = z.strictObject({
  setup: z.enum(['cloudflare_worker', 'cloudflare_logpush', 'custom', 'upload']),
  origin: z.url().max(512),
  format: z.enum(['ndjson', 'json_array', 'combined']).default('ndjson'),
  collection_point: z.enum(['cdn_edge', 'origin', 'application', 'uploaded_file']).optional(),
  sampling: samplingSchema.optional(),
});
const token = () => 'clw_' + randomBytes(32).toString('base64url');
export function ingestionEnabled() {
  if (!crawlLogs.ingestion_enabled) throw new ApiError(409, 'Crawl log ingestion is not enabled');
}
export async function createSource(
  db: Database,
  scope: CrawlScope,
  actorId: string,
  input: z.output<typeof createSourceSchema>,
) {
  ingestionEnabled();
  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    throw new ApiError(422, 'Invalid origin');
  }
  if (
    !['https:', 'http:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new ApiError(422, 'Use a site origin without a path or credentials');
  const host = origin.hostname.toLowerCase();
  let preset = 'custom_ndjson';
  if (input.setup === 'cloudflare_worker') preset = 'cloudflare_worker_template';
  if (input.setup === 'cloudflare_logpush') preset = 'cloudflare_logpush_http_requests';
  const defaults = crawlLogs.presets[preset]!;
  return await db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, scope.workspaceId, actorId, 'manage_credentials');
    const project = await trx
      .selectFrom('projects')
      .select('website_url')
      .where('workspace_id', '=', scope.workspaceId)
      .where('id', '=', scope.projectId)
      .executeTakeFirst();
    if (!project) throw notFound('Project');
    const domains = await trx
      .selectFrom('owned_domains')
      .innerJoin('projects', 'projects.id', 'owned_domains.project_id')
      .select('owned_domains.domain')
      .where('projects.workspace_id', '=', scope.workspaceId)
      .where('projects.id', '=', scope.projectId)
      .execute();
    const hosts = [
      new URL(project.website_url).hostname,
      ...domains.map((d) => d.domain.toLowerCase()),
    ];
    if (!hosts.includes(host)) throw new ApiError(422, 'Host is outside the project scope');
    await lockCrawlState(trx, scope);
    const existing = await trx
      .selectFrom('crawl_log_sources')
      .select(['kind', 'host', 'status'])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .execute();
    if (existing.filter((s) => s.status === 'active').length >= crawlLogs.max_sources_per_project)
      throw new ApiError(429, 'Source limit reached');
    if (
      input.setup !== 'upload' &&
      existing.some((s) => s.host === host && s.kind === 'webhook' && s.status === 'active')
    )
      throw new ApiError(409, 'An active webhook already covers this host');
    const member = await trx
      .selectFrom('workspace_members')
      .select('id')
      .where('workspace_id', '=', scope.workspaceId)
      .where('user_id', '=', actorId)
      .executeTakeFirstOrThrow();
    const secret = input.setup === 'upload' ? null : token();
    const id = randomUUID();
    await trx
      .insertInto('crawl_log_sources')
      .values({
        id,
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        kind: input.setup === 'upload' ? 'upload' : 'webhook',
        setup: input.setup,
        preset,
        format: input.format,
        collection_point:
          input.setup === 'upload'
            ? 'uploaded_file'
            : (input.collection_point ?? defaults.collection_point),
        sampling: JSON.stringify(input.sampling ?? defaults.sampling),
        origin: origin.origin,
        host,
        accepted_hosts: JSON.stringify([host]),
        token_hash: secret ? hash(secret) : null,
        token_prefix: secret?.slice(0, 12) ?? null,
        status: 'active',
        created_by_member_id: member.id,
        created_at: new Date(),
        revoked_at: null,
        last_processed_at: null,
      })
      .execute();
    await recordSecurityEvent(trx, 'crawl_log.create', actorId, scope.workspaceId, id);
    return { id, token: secret };
  });
}
export async function mutateSource(
  db: Database,
  scope: CrawlScope,
  actorId: string,
  id: string,
  action: 'rotate' | 'revoke',
) {
  return await db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, scope.workspaceId, actorId, 'manage_credentials');
    await lockCrawlState(trx, scope);
    const source = await trx
      .selectFrom('crawl_log_sources')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!source) throw notFound('Crawl log source');
    if (action === 'rotate' && (source.status !== 'active' || source.kind !== 'webhook'))
      throw new ApiError(409, 'Source cannot rotate');
    // Revocation is idempotent: the first revoked_at is the audit and coverage boundary.
    if (action === 'revoke' && source.status === 'revoked') return { id, token: null };
    const secret = action === 'rotate' ? token() : null;
    await trx
      .updateTable('crawl_log_sources')
      .set(
        action === 'rotate'
          ? { token_hash: hash(secret!), token_prefix: secret!.slice(0, 12) }
          : { status: 'revoked', revoked_at: new Date() },
      )
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('id', '=', id)
      .execute();
    await recordSecurityEvent(
      trx,
      action === 'rotate' ? 'crawl_log.rotate' : 'crawl_log.revoke',
      actorId,
      scope.workspaceId,
      id,
    );
    return { id, token: secret };
  });
}
export async function authorizeToken(db: Database, id: string, authorization: string | undefined) {
  const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const source = await db
    .selectFrom('crawl_log_sources')
    .selectAll()
    .where('id', '=', id)
    .where('kind', '=', 'webhook')
    .executeTakeFirst();
  // Revoked sources retain their hash so a valid revoked token receives 409.
  const expected = Buffer.from(source?.token_hash ?? hash('invalid'), 'hex');
  const actual = Buffer.from(hash(supplied), 'hex');
  if (!source || !supplied || !timingSafeEqual(actual, expected))
    throw new ApiError(401, 'Invalid crawl log token');
  if (source.status !== 'active') throw new ApiError(409, 'Crawl log source revoked');
  ingestionEnabled();
  return source;
}
