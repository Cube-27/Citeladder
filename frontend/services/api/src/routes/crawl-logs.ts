import { z } from 'zod';
import {
  crawlSourceListSchema,
  crawlTokenSchema,
  crawlReceiptSchema,
  crawlCatalogSchema,
  crawlUploadSchema,
} from '@citeladder/contracts/ai-traffic';
import { defineGetRoute, definePostRoute } from './define.ts';
import { readBody } from '../http/body.ts';
import { requireProject } from '../projects/access.ts';
import { crawlers } from '../config/crawlers.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { ApiError, notFound } from '../errors.ts';
import { sourceList } from '../crawl-logs/source-reads.ts';
import {
  createSource,
  createSourceSchema,
  mutateSource,
  authorizeToken,
  ingestionEnabled,
} from '../crawl-logs/sources.ts';
import { ingest, boundedBody, batchQuota } from '../crawl-logs/ingest.ts';
import { lockAuthorizedWorkspace } from '../workspaces/service.ts';
import {
  createUpload,
  completeUpload,
  sourceForUpload,
  uploadCreateSchema,
  uploadBatchSchema,
  uploadCompleteSchema,
} from '../crawl-logs/uploads.ts';

const root = '/api/v1/projects/{project_id}/crawl-logs';
const ingestPath = '/api/v1/crawl-logs/ingest/{source_id}';
const uploadBatchPath = root + '/sources/{source_id}/uploads/{upload_id}/batches';
const selfBounded = [ingestPath, uploadBatchPath].map((template) => template.split('/'));
const matchesTemplate = (template: string[], segments: string[]) =>
  template.length === segments.length &&
  template.every((part, i) => (part.startsWith('{') ? segments[i] !== '' : part === segments[i]));
/**
 * POST routes that authenticate and spend attempt quota before streaming their
 * own compressed/decompressed body bound; the app must not pre-read them.
 */
export function streamsOwnBody(method: string, path: string) {
  if (method !== 'POST') return false;
  const segments = path.split('/');
  return selfBounded.some((template) => matchesTemplate(template, segments));
}
const path = { project_id: { scalar: { kind: 'uuid' }, required: true } } as const;
const sourcePath = { ...path, source_id: { scalar: { kind: 'uuid' }, required: true } } as const;
const uploadPath = {
  ...sourcePath,
  upload_id: { scalar: { kind: 'uuid' }, required: true },
} as const;
const base = { family: 'crawl-logs', authorize: 'project' } as const;
const writes = { ...base, capability: 'manage_credentials' } as const;
const scope = (workspaceId: string, projectId: string) => ({ workspaceId, projectId });
export const crawlLogRoutes = [
  defineGetRoute({
    ...base,
    path: root + '/catalog',
    params: { path, query: {} },
    response: crawlCatalogSchema,
    async handle({ c, db }, { path }) {
      await requireProject(db, c.get('workspace'), path.project_id);
      return {
        catalog_version: crawlers.catalog_version,
        bots: crawlers.bots,
        presets: crawlLogs.presets,
        max_batch_bytes: crawlLogs.max_batch_bytes,
        max_lines_per_batch: crawlLogs.max_lines_per_batch,
        upload_sample_lines: crawlLogs.upload_sample_lines,
        max_line_bytes: crawlLogs.max_line_bytes,
        max_backdate_days: crawlLogs.max_backdate_days,
        worker_timeout_ms: crawlLogs.worker_timeout_ms,
      };
    },
  }),
  defineGetRoute({
    ...base,
    path: root + '/sources',
    params: { path, query: {} },
    response: crawlSourceListSchema,
    async handle({ c, db }, { path }) {
      await requireProject(db, c.get('workspace'), path.project_id);
      return sourceList(db, scope(c.get('workspace').workspaceId, path.project_id));
    },
  }),
  definePostRoute({
    ...writes,
    path: root + '/sources',
    params: { path, query: {} },
    body: createSourceSchema,
    response: crawlTokenSchema,
    handle: async ({ c, db }, { path }) =>
      createSource(
        db,
        scope(c.get('workspace').workspaceId, path.project_id),
        c.get('user').id,
        await readBody(c, createSourceSchema),
      ),
  }),
  ...(['rotate', 'revoke'] as const).map((action) =>
    definePostRoute({
      ...writes,
      path: root + '/sources/{source_id}/' + action,
      params: { path: sourcePath, query: {} },
      response: crawlTokenSchema,
      handle: ({ c, db }, { path }) =>
        mutateSource(
          db,
          scope(c.get('workspace').workspaceId, path.project_id),
          c.get('user').id,
          path.source_id,
          action,
        ),
    }),
  ),
  definePostRoute({
    family: 'crawl-log-ingest',
    authorize: 'public',
    raw: true,
    path: ingestPath,
    params: { path: { source_id: sourcePath.source_id }, query: {} },
    response: crawlReceiptSchema,
    status: 202,
    headers: z.object({
      authorization: z.string().optional(),
      'idempotency-key': z.string().optional(),
      'content-encoding': z.string().optional(),
    }),
    async handle({ c, db }, { path }) {
      const source = await authorizeToken(db, path.source_id, c.req.header('authorization'));
      await batchQuota(db, source, new Date(), c.req.header('idempotency-key'));
      const type = c.req.header('content-type')?.split(';')[0];
      if (
        type &&
        ![
          'application/json',
          'application/x-ndjson',
          'text/plain',
          'application/gzip',
          'application/octet-stream',
        ].includes(type)
      )
        throw new ApiError(415, 'Unsupported log media type');
      const receipt = await ingest(db, source, await boundedBody(c.req.raw), {
        key: c.req.header('idempotency-key'),
        encoding: c.req.header('content-encoding'),
        tokenHash: source.token_hash!,
        quotaChecked: true,
      });
      return c.json(crawlReceiptSchema.parse(receipt), 202);
    },
  }),
  definePostRoute({
    ...writes,
    path: root + '/sources/{source_id}/uploads',
    params: { path: sourcePath, query: {} },
    body: uploadCreateSchema,
    response: crawlUploadSchema,
    handle: async ({ c, db }, { path }) =>
      createUpload(
        db,
        scope(c.get('workspace').workspaceId, path.project_id),
        path.source_id,
        await readBody(c, uploadCreateSchema),
        c.get('user').id,
      ).then((row) => crawlUploadSchema.parse(row)),
  }),
  defineGetRoute({
    ...base,
    path: root + '/sources/{source_id}/uploads/{upload_id}',
    params: { path: uploadPath, query: {} },
    response: crawlUploadSchema,
    async handle({ c, db }, { path }) {
      await requireProject(db, c.get('workspace'), path.project_id);
      const upload = await db
        .selectFrom('crawl_log_uploads')
        .selectAll()
        .where('workspace_id', '=', c.get('workspace').workspaceId)
        .where('project_id', '=', path.project_id)
        .where('source_id', '=', path.source_id)
        .where('id', '=', path.upload_id)
        .executeTakeFirst();
      if (!upload) throw notFound('Upload');
      return crawlUploadSchema.parse(upload);
    },
  }),
  definePostRoute({
    ...writes,
    path: uploadBatchPath,
    params: { path: uploadPath, query: {} },
    body: uploadBatchSchema,
    response: crawlReceiptSchema,
    async handle({ c, db }, { path }) {
      ingestionEnabled();
      const target = scope(c.get('workspace').workspaceId, path.project_id);
      // Recheck current credential authority before accepting client evidence.
      await db
        .transaction()
        .execute((trx) =>
          lockAuthorizedWorkspace(trx, target.workspaceId, c.get('user').id, 'manage_credentials'),
        );
      const source = await sourceForUpload(db, target, path.source_id);
      await batchQuota(db, source);
      let value: unknown;
      try {
        value = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(await boundedBody(c.req.raw)),
        );
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(422, 'Invalid upload batch');
      }
      const input = uploadBatchSchema.safeParse(value);
      if (!input.success) throw new ApiError(422, 'Invalid upload batch');
      return ingest(db, source, Buffer.from(input.data.lines.join('\n')), {
        key: path.upload_id + ':' + input.data.seq,
        uploadId: path.upload_id,
        seq: input.data.seq,
        actorId: c.get('user').id,
        quotaChecked: true,
      });
    },
  }),
  definePostRoute({
    ...writes,
    path: root + '/sources/{source_id}/uploads/{upload_id}/complete',
    params: { path: uploadPath, query: {} },
    body: uploadCompleteSchema,
    response: crawlUploadSchema,
    handle: async ({ c, db }, { path }) =>
      completeUpload(
        db,
        scope(c.get('workspace').workspaceId, path.project_id),
        path.source_id,
        path.upload_id,
        await readBody(c, uploadCompleteSchema),
        c.get('user').id,
      ).then((row) => crawlUploadSchema.parse(row)),
  }),
];
