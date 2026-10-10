import { docsHref as docsUrl } from './docs';
import { publicApiOrigin } from './public-origins';
export const CRAWL_LOG_SETUPS = [
  {
    value: 'cloudflare_worker',
    collectionPoint: 'cdn_edge',
    label: 'Cloudflare Worker',
    description: 'Best-effort per-request delivery. Coverage is at most partial.',
    guide: docsUrl('/ai-traffic/#cloudflare-worker'),
  },
  {
    value: 'cloudflare_logpush',
    collectionPoint: 'cdn_edge',
    label: 'Cloudflare Logpush',
    description:
      'Enterprise HTTP request logs. Unsampled, gap-free days can reach complete coverage.',
    guide: docsUrl('/ai-traffic/#cloudflare-logpush'),
  },
  {
    value: 'aws_firehose',
    collectionPoint: 'cdn_edge',
    label: 'Amazon CloudFront',
    description:
      'Standard logs through Amazon Data Firehose. Unfiltered, gap-free days can reach complete coverage.',
    guide: docsUrl('/ai-traffic/#amazon-cloudfront-firehose'),
  },
  {
    value: 'custom',
    collectionPoint: 'application',
    label: 'Custom webhook',
    description: 'Batch NDJSON or JSON from your shipper. Declare collection point and sampling.',
    guide: docsUrl('/ai-traffic/#custom-webhook'),
  },
  {
    value: 'upload',
    collectionPoint: 'uploaded_file',
    label: 'Upload file',
    description:
      'Local pre-filtering and resumable backfill. Full-day scans are labelled client-reported.',
    guide: docsUrl('/ai-traffic/#file-upload'),
  },
] as const;
/** The Firehose buffer interval suggested at setup; the API enforces its own bounds. */
export const FIREHOSE_BUFFER_INTERVAL = {
  default: 60,
  min: 60,
  recommendedMax: 300,
} as const;
/** The generated Firehose transformation Lambda, served by the docs site. */
export const FIREHOSE_FILTER_TEMPLATE = docsUrl('/templates/citeladder-firehose-filter.mjs');
/** CloudFront standard logging (v2) fields the Firehose stream must deliver, in setup order. */
export const CLOUDFRONT_LOG_FIELDS = [
  'timestamp(ms)',
  'c-ip',
  'sc-status',
  'cs-method',
  'cs-uri-stem',
  'x-edge-request-id',
  'x-host-header',
  'cs(User-Agent)',
] as const;
/** Machine senders post to the API host; locally that is the API container itself. */
// An origin carries no path, so a configured trailing slash never doubles into `//v1`.
export const CRAWL_INGEST_ORIGIN =
  publicApiOrigin(undefined, false)?.origin ?? 'http://127.0.0.1:8100';
export const TRAFFIC_TABS = [
  { value: 'overview', label: 'Overview', crawlOnly: false },
  { value: 'crawlers', label: 'Crawlers', crawlOnly: true },
  { value: 'referrals', label: 'Referrals', crawlOnly: false },
  { value: 'pages', label: 'Pages', crawlOnly: false },
  { value: 'activity', label: 'Activity', crawlOnly: true },
] as const;
/** Views that show crawl logs alone; they are dropped when collection is unavailable. */
export const CRAWL_ONLY_TABS: ReadonlySet<string> = new Set(
  TRAFFIC_TABS.filter((t) => t.crawlOnly).map((t) => t.value),
);
/** How often the screen rechecks a source while an upload is being processed. */
export const UPLOAD_PROCESSING_POLL_MS = 15000;
export const TRAFFIC_RANGES = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last 12 months' },
] as const;
export const VERIFICATION_OPTIONS = [
  { value: 'default', label: 'Verified + unverifiable' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverifiable', label: 'Unverifiable' },
  { value: 'failed_verification', label: 'Failed verification' },
] as const;
