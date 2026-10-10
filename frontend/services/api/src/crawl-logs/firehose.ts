/**
 * Amazon Data Firehose HTTP endpoint delivery: translates a Firehose request
 * into `ingest()` batches and answers in Firehose's response contract. It
 * never writes rows itself.
 *
 * Firehose counts only a 200 as delivered, retries other statuses until its
 * retry window ends, never follows a redirect, and drops a 413 batch without
 * S3 backup. A retried request keeps its request ID, so the idempotency key
 * returns the original receipts and spends no quota.
 */
import { z } from 'zod';
import type { Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import type { CrawlLogSources } from '../generated/db-schema.ts';
import { ApiError } from '../errors.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { getLogger } from '../logging.ts';
import { authorizeToken } from './sources.ts';
import { batchQuota, boundedBody, decodedBody, diagnosticReceipt, ingest } from './ingest.ts';
import { markStalled } from './stall.ts';

const logger = getLogger('api.crawl_logs.firehose');
/** Firehose's own bounds: 10,000 records, each at most 1,000 KiB decoded. */
const MAX_RECORDS = 10_000;
const MAX_RECORD_BYTES = 1_024_000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const envelopeSchema = z.object({
  requestId: z.string().min(1).max(200),
  timestamp: z.number(),
  records: z
    .array(z.object({ data: z.string() }))
    .min(1)
    .max(MAX_RECORDS),
});

export type FirehoseHeaders = {
  requestId: string | undefined;
  accessKey: string | undefined;
  encoding: string | undefined;
};

/** Firehose's response body: the request ID echoed, server time, and a message on failure. */
function reply(status: number, requestId: string, errorMessage?: string): Response {
  const body = JSON.stringify({
    requestId,
    timestamp: Date.now(),
    ...(errorMessage ? { errorMessage } : {}),
  });
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
      'Cache-Control': 'no-store',
    },
  });
}

/** One record's newline-separated log lines, or null when it cannot be decoded. */
function recordLines(data: string): string[] | null {
  if (!BASE64.test(data) || (data.length / 4) * 3 > MAX_RECORD_BYTES + 2) return null;
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > MAX_RECORD_BYTES) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.split(/\r?\n/u).filter((line) => line.trim());
  } catch {
    return null;
  }
}

/** Parse and decode the envelope; a bad record is isolated and counted, never fatal. */
function envelope(text: string, requestId: string) {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'The body is not a Firehose JSON request');
  }
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'The body is not a Firehose JSON request');
  if (parsed.data.requestId !== requestId)
    throw new ApiError(400, 'Body requestId does not match X-Amz-Firehose-Request-Id');
  const lines: string[] = [];
  let rejected = 0;
  for (const record of parsed.data.records) {
    const decoded = recordLines(record.data);
    // One record may hold many lines; append without spreading them as arguments.
    if (decoded) for (const line of decoded) lines.push(line);
    else rejected += 1;
  }
  return { lines, rejected };
}

/** Admit the lines as idempotent chunks, each within the per-batch line bound. */
async function admit(
  db: Database,
  source: Selectable<CrawlLogSources>,
  requestId: string,
  { lines, rejected }: { lines: string[]; rejected: number },
  now: Date,
  receivedBytes: number,
) {
  const size = crawlLogs.max_lines_per_batch;
  const chunks = Math.max(1, Math.ceil(lines.length / size));
  for (let index = 0; index < chunks; index += 1) {
    const key = `firehose:${requestId}:${index}`;
    // Chunks are admitted in order, each under its own key and attempt quota;
    // the first chunk's quota was spent before the body was read.
    if (index > 0) await batchQuota(db, source, now, key); // NOSONAR
    const chunk = Buffer.from(lines.slice(index * size, (index + 1) * size).join('\n'));
    const options = {
      key,
      now,
      tokenHash: source.token_hash!,
      quotaChecked: true,
      accessChecked: true,
      // The first receipt carries the whole request, undecodable records included.
      rejectedRecords: index === 0 ? rejected : 0,
      receivedBytes: index === 0 ? receivedBytes : 0,
    };
    await ingest(db, source, chunk, options); // NOSONAR
  }
}

/** Firehose's status for an admission refusal: 200 means delivered, anything else retries. */
function statusFor(error: ApiError): number {
  if ([401, 409, 413, 429].includes(error.status)) return error.status;
  if ([400, 415, 422].includes(error.status)) return 400;
  return 500;
}

export async function firehoseDelivery(
  db: Database,
  sourceId: string,
  headers: FirehoseHeaders,
  request: Request,
): Promise<Response> {
  const requestId = headers.requestId?.trim() ?? '';
  const now = new Date();
  let source: Selectable<CrawlLogSources> | undefined;
  try {
    if (!requestId || requestId.length > 200)
      throw new ApiError(400, 'X-Amz-Firehose-Request-Id is required');
    // The token is accepted only from Firehose's access-key header, never the URL.
    source = await authorizeToken(db, sourceId, `Bearer ${headers.accessKey ?? ''}`);
    if (source.setup !== 'aws_firehose')
      throw new ApiError(409, 'This source is not an Amazon Firehose source');
    await batchQuota(db, source, now, `firehose:${requestId}:0`);
    const body = decodedBody(await boundedBody(request), headers.encoding);
    await admit(db, source, requestId, envelope(body, requestId), now, Buffer.byteLength(body));
    return reply(200, requestId);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      logger.exception('crawl_logs.firehose_failed', error, {
        source_id: sourceId,
        request_id: requestId,
      });
      return reply(500, requestId, 'Unexpected error; Firehose will retry');
    }
    // Firehose drops a 413 batch for good; the receipt and the source row say so.
    if (error.status === 413 && source) {
      await diagnosticReceipt(db, source, 'oversize', now);
      await markStalled(db, source, 'oversize', now);
    }
    return reply(statusFor(error), requestId, error.message);
  }
}
