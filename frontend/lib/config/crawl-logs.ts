import { docsHref as docsUrl } from './docs';
export const CRAWL_LOG_SETUPS = [
  {
    value: 'cloudflare_worker',
    collectionPoint: 'cdn_edge',
    label: 'Cloudflare Worker',
    guide: docsUrl('/ai-traffic/#cloudflare-worker'),
  },
  {
    value: 'cloudflare_logpush',
    collectionPoint: 'cdn_edge',
    label: 'Cloudflare Logpush',
    guide: docsUrl('/ai-traffic/#cloudflare-logpush'),
  },
  {
    value: 'aws_firehose',
    collectionPoint: 'cdn_edge',
    label: 'Amazon CloudFront',
    guide: docsUrl('/ai-traffic/#amazon-cloudfront-firehose'),
  },
  {
    value: 'gcp_pubsub_pull',
    collectionPoint: 'cdn_edge',
    label: 'Google Cloud',
    guide: docsUrl('/ai-traffic/#google-cloud-pubsub'),
  },
  {
    value: 'custom',
    collectionPoint: 'application',
    label: 'Custom webhook',
    guide: docsUrl('/ai-traffic/#custom-webhook'),
  },
  {
    value: 'upload',
    collectionPoint: 'uploaded_file',
    label: 'Upload file',
    guide: docsUrl('/ai-traffic/#file-upload'),
  },
] as const;
export const FIREHOSE_BUFFER_INTERVAL = {
  default: 60,
  min: 60,
  recommendedMax: 300,
} as const;
export const GCP_PULL_SETUP = {
  topic: 'citeladder-ai-crawlers',
  sink: 'citeladder-ai-crawlers',
  ackDeadlineSeconds: 120,
  retention: '7d',
  sourceLabel: 'citeladder-source',
  subscriptionPlaceholder: 'projects/my-project/subscriptions/citeladder-ai-crawlers-sub',
} as const;
export { API_HOST_ORIGIN as CRAWL_INGEST_ORIGIN } from './api-host';
export const UPLOAD_PROCESSING_POLL_MS = 15000;
export const UPLOAD_PROCESSING_MAX_WAIT_MS = 10 * 60 * 1000;
export const TRAFFIC_RANGES = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last 12 months' },
] as const;
export const TRAFFIC_PAGE_SORTS = [
  'requests_desc',
  'sessions_desc',
  'key_events_desc',
  'citations_desc',
  'url_asc',
] as const;
export type TrafficPagesSort = (typeof TRAFFIC_PAGE_SORTS)[number];
export const VERIFICATION_OPTIONS = [
  { value: 'default', label: 'Verified + unverifiable' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverifiable', label: 'Unverifiable' },
  { value: 'failed_verification', label: 'Failed verification' },
] as const;
