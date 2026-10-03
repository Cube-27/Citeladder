'use client';
import { useId } from 'react';
import type { useCrawlConnections } from '@/lib/ai-traffic/use-crawl-connections';
import { CRAWL_LOG_SETUPS, CRAWL_INGEST_ORIGIN } from '@/lib/config/crawl-logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { CopyButton } from '@/components/ui/copy-button';
export function CrawlLogSetup({
  model,
}: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const {
    canManage,
    sources,
    setup,
    setSetup,
    origin,
    setOrigin,
    format,
    setFormat,
    sampling,
    setSampling,
    rate,
    setRate,
    filter,
    setFilter,
    point,
    setPoint,
    issued,
    mutation,
  } = model;
  const chosen = CRAWL_LOG_SETUPS.find((s) => s.value === setup)!;
  const formId = useId();
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {CRAWL_LOG_SETUPS.map((s) => (
          <Card key={s.value}>
            <CardHeader>
              <CardTitle>{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="type-body">{s.description}</p>
              <Button
                variant="secondary"
                aria-pressed={setup === s.value}
                onClick={() => {
                  setSetup(s.value);
                  setPoint(
                    s.value === 'custom'
                      ? 'application'
                      : s.value === 'upload'
                        ? 'uploaded_file'
                        : 'cdn_edge',
                  );
                  setSampling(s.value === 'cloudflare_worker' ? 'filtered' : 'none');
                  setFilter(
                    s.value === 'cloudflare_worker'
                      ? 'Best-effort recognized automated requests'
                      : '',
                  );
                }}
              >
                Choose {s.label}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <a className="type-link" href={chosen.guide} target="_blank" rel="noreferrer">
        Setup guide: {chosen.label}
      </a>
      {setup === 'cloudflare_worker' ? (
        <p className="type-body">
          Deploy the downloadable template yourself. Store the token as a Worker secret, use a
          fail-open route, and expect partial coverage. Every routed request uses your Workers
          quota.
        </p>
      ) : null}
      {setup === 'cloudflare_logpush' ? (
        <p className="type-body">
          Select HTTP requests, the documented field list and RFC3339 timestamps. Set the
          Authorization header in the HTTP destination and bound batches to the documented limits.
          Logpush can reach complete coverage only with unsampled delivery and heartbeats.
        </p>
      ) : null}
      {setup === 'custom' ? (
        <p className="type-body">
          Map timestamp, host, path, method, status and user_agent to the documented JSON fields.
          Batch at least 60 seconds apart; send empty heartbeat batches when no crawler requests
          occur.
        </p>
      ) : null}
      <label htmlFor={`${formId}-origin`} className="type-label grid gap-2">
        Site origin
        <Input id={`${formId}-origin`} value={origin} onChange={(e) => setOrigin(e.target.value)} />
      </label>
      <Select
        ariaLabel="Log format"
        value={format}
        onValueChange={setFormat}
        options={[
          { value: 'ndjson', label: 'NDJSON' },
          { value: 'json_array', label: 'JSON array' },
          { value: 'combined', label: 'Apache/Nginx Combined' },
        ]}
      />
      <Select
        ariaLabel="Collection point"
        value={point}
        onValueChange={setPoint}
        options={['cdn_edge', 'origin', 'application', 'uploaded_file'].map((value) => ({
          value,
          label: value,
        }))}
      />
      <Select
        ariaLabel="Sampling"
        value={sampling}
        onValueChange={setSampling}
        options={[
          { value: 'none', label: 'Unsampled' },
          { value: 'sampled', label: 'Sampled' },
          { value: 'filtered', label: 'Filtered' },
        ]}
      />
      {sampling === 'sampled' ? (
        <label htmlFor={`${formId}-rate`} className="type-label grid gap-2">
          Sampling rate (0–1)
          <Input id={`${formId}-rate`} value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
      ) : null}
      {sampling === 'filtered' ? (
        <label htmlFor={`${formId}-filter`} className="type-label grid gap-2">
          Filtering limitations
          <Input
            id={`${formId}-filter`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
      ) : null}
      <Button
        disabled={!canManage || !sources.data?.ingestion_enabled}
        pending={mutation.isPending}
        onClick={() => mutation.mutate({ kind: 'create' })}
      >
        Create source
      </Button>
      {mutation.isError ? <Alert tone="danger">{mutation.error.message}</Alert> : null}
      {issued ? (
        <Alert tone="info">
          <div className="grid gap-3">
            <p>Source: {issued.id}</p>
            {issued.token ? (
              <>
                <p>Copy this token now. It is shown once.</p>
                <CopyButton value={issued.token}>Copy token</CopyButton>
                <p className="type-caption break-all">
                  {CRAWL_INGEST_ORIGIN + '/api/v1/crawl-logs/ingest/' + issued.id}
                </p>
                <CopyButton value={CRAWL_INGEST_ORIGIN + '/api/v1/crawl-logs/ingest/' + issued.id}>
                  Copy endpoint
                </CopyButton>
              </>
            ) : null}
          </div>
        </Alert>
      ) : null}
      {setup === 'upload' ? <UploadForm model={model} /> : null}
    </div>
  );
}

function UploadForm({ model }: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const formId = useId();
  const { sources, sourceId, setSourceId, file, setFile, resume, setResume, upload, progress } =
    model;
  return (
    <div className="grid gap-3">
      <Select
        ariaLabel="Upload source"
        value={sourceId}
        onValueChange={setSourceId}
        options={(sources.data?.items ?? [])
          .filter((s) => s.kind === 'upload' && s.status === 'active')
          .map((s) => ({ value: s.id, label: s.host + ' · ' + s.id }))}
      />
      <label htmlFor={`${formId}-file`} className="type-label grid gap-2">
        Log file
        <Input
          id={`${formId}-file`}
          type="file"
          accept=".log,.txt,.json,.ndjson,.gz"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <label htmlFor={`${formId}-resume`} className="type-label grid gap-2">
        Resume upload ID (optional)
        <Input id={`${formId}-resume`} value={resume} onChange={(e) => setResume(e.target.value)} />
      </label>
      <Button
        disabled={!file || !sourceId || !sources.data?.ingestion_enabled}
        pending={upload.isPending}
        onClick={() => upload.mutate()}
      >
        Upload recognized requests
      </Button>
      {progress ? (
        <output className="type-body">
          {progress.scanned} scanned · {progress.matched} recognized · batch {progress.ack}{' '}
          acknowledged. Upload ID: {progress.uploadId}
        </output>
      ) : null}
      {upload.isSuccess ? (
        <Alert tone="success">
          Upload completed. Scan coverage is client-reported; rollup processing is queued.
        </Alert>
      ) : null}
      {upload.isError ? <Alert tone="danger">{upload.error.message}</Alert> : null}
    </div>
  );
}
