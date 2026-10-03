import { docsHref as docsUrl } from './docs';
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
export const CRAWL_INGEST_ORIGIN = process.env.PUBLIC_WEBSITE_ORIGIN || 'http://localhost:4321';
export const TRAFFIC_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'crawlers', label: 'Crawlers' },
  { value: 'referrals', label: 'Referrals' },
  { value: 'activity', label: 'Activity' },
] as const;
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
