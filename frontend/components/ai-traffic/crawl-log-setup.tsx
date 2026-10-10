'use client';
import { useId } from 'react';
import {
  collectionPointLabel,
  COLLECTION_POINTS,
  LOG_FORMATS,
  logFormatLabel,
} from '@/lib/ai-traffic/vocabulary';
import type { useCrawlConnections } from '@/lib/ai-traffic/use-crawl-connections';
import { CRAWL_LOG_SETUPS, CRAWL_INGEST_ORIGIN } from '@/lib/config/crawl-logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Stack } from '@/components/ui/layout';
import { panelClasses } from '@/components/ui/panel';
import { RadioGroup } from '@/components/ui/radio-group';
import { Alert } from '@/components/ui/alert';
import { CopyButton } from '@/components/ui/copy-button';
import { TextLink } from '@/components/ui/text-link';
const SETUP_STEPS: Partial<Record<(typeof CRAWL_LOG_SETUPS)[number]['value'], string>> = {
  cloudflare_worker:
    'Deploy the downloadable template yourself. Store the token as a Worker secret, use a fail-open route, and expect partial coverage. Every routed request uses your Workers quota.',
  cloudflare_logpush:
    'Select HTTP requests, the documented field list and RFC3339 timestamps. Set the Authorization header in the HTTP destination and bound batches to the documented limits. Logpush can reach complete coverage only with unsampled delivery and heartbeats.',
  custom:
    'Map timestamp, host, path, method, status and user_agent to the documented JSON fields. Batch at least 60 seconds apart; send empty heartbeat batches when no crawler requests occur.',
};
export function CrawlLogSetup({
  model,
}: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const {
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
    mutation,
  } = model;
  const chosen = CRAWL_LOG_SETUPS.find((s) => s.value === setup)!;
  const steps = SETUP_STEPS[chosen.value];
  return (
    <Stack gap="section">
      <RadioGroup
        variant="row"
        ariaLabel="Collection method"
        value={setup}
        onValueChange={(value) => {
          const next = CRAWL_LOG_SETUPS.find((s) => s.value === value)!;
          setSetup(next.value);
          setPoint(next.collectionPoint);
          setSampling(next.value === 'cloudflare_worker' ? 'filtered' : 'none');
          setFilter(
            next.value === 'cloudflare_worker' ? 'Best-effort recognized automated requests' : '',
          );
        }}
        options={CRAWL_LOG_SETUPS.map((s) => ({
          value: s.value,
          label: (
            <span className="grid gap-0.5 py-2">
              <span className="type-control text-foreground">{s.label}</span>
              <span className="type-caption">{s.description}</span>
            </span>
          ),
        }))}
      />
      <div className={panelClasses({ tone: 'well', pad: 'compact' }, 'grid gap-2')}>
        {steps ? <p className="type-body text-secondary">{steps}</p> : null}
        <TextLink variant="external" href={chosen.guide} className="w-fit">
          Setup guide: {chosen.label}
        </TextLink>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site origin" className="sm:col-span-2">
          {(field) => (
            <Input {...field} value={origin} onChange={(e) => setOrigin(e.target.value)} />
          )}
        </Field>
        <Field label="Log format">
          {({ id }) => (
            <Select
              id={id}
              ariaLabel="Log format"
              value={format}
              onValueChange={setFormat}
              options={LOG_FORMATS.map((value) => ({ value, label: logFormatLabel(value) }))}
            />
          )}
        </Field>
        <Field label="Collection point">
          {({ id }) => (
            <Select
              id={id}
              ariaLabel="Collection point"
              value={point}
              onValueChange={setPoint}
              options={COLLECTION_POINTS.map((value) => ({
                value,
                label: collectionPointLabel(value),
              }))}
            />
          )}
        </Field>
        <Field label="Sampling">
          {({ id }) => (
            <Select
              id={id}
              ariaLabel="Sampling"
              value={sampling}
              onValueChange={setSampling}
              options={[
                { value: 'none', label: 'Unsampled' },
                { value: 'sampled', label: 'Sampled' },
                { value: 'filtered', label: 'Filtered' },
              ]}
            />
          )}
        </Field>
        {sampling === 'sampled' ? (
          <Field label="Sampling rate (0–1)">
            {(field) => <Input {...field} value={rate} onChange={(e) => setRate(e.target.value)} />}
          </Field>
        ) : null}
        {sampling === 'filtered' ? (
          <Field label="Filtering limitations" className="sm:col-span-2">
            {(field) => (
              <Input {...field} value={filter} onChange={(e) => setFilter(e.target.value)} />
            )}
          </Field>
        ) : null}
      </div>
      {mutation.isError ? <Alert tone="danger">{mutation.error.message}</Alert> : null}
      {setup === 'upload' ? <UploadForm model={model} /> : null}
    </Stack>
  );
}
export function CrawlLogCredential({
  issued,
}: Readonly<{
  issued: ReturnType<typeof useCrawlConnections>['issued'];
}>) {
  return issued ? (
    <Alert tone="info">
      <div className="grid gap-3">
        {issued.token ? (
          <>
            <p>Copy this token now. It is shown once.</p>
            <CopyButton value={issued.token}>Copy token</CopyButton>
            <p className="type-caption break-all">
              {CRAWL_INGEST_ORIGIN + '/v1/crawl-logs/ingest/' + issued.id}
            </p>
            <CopyButton value={CRAWL_INGEST_ORIGIN + '/v1/crawl-logs/ingest/' + issued.id}>
              Copy endpoint
            </CopyButton>
          </>
        ) : null}
      </div>
    </Alert>
  ) : null;
}
/** The dialog's one committing action, held in its footer. */
export function CrawlLogSetupSubmit({
  model,
}: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const { canManage, sources, mutation, issued } = model;
  return (
    <Button
      disabled={!canManage || sources.data?.availability !== 'available' || issued !== null}
      pending={mutation.isPending}
      onClick={() => mutation.mutate({ kind: 'create' })}
    >
      Create source
    </Button>
  );
}

function UploadForm({ model }: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const formId = useId();
  const {
    sources,
    sourceId,
    setSourceId,
    file,
    setFile,
    resume,
    setResume,
    upload,
    progress,
    processing,
  } = model;
  const uploadSources = (sources.data?.items ?? []).filter(
    (s) => s.kind === 'upload' && s.status === 'active',
  );
  if (!uploadSources.length) {
    return (
      <Alert tone="info">
        First, create an upload source using the settings above and Create source below. Then choose
        your log file here to upload recognized requests.
      </Alert>
    );
  }
  return (
    <div className="grid gap-4">
      <Field label="Upload source">
        {({ id }) => (
          <Select
            id={id}
            ariaLabel="Upload source"
            value={sourceId}
            onValueChange={setSourceId}
            options={uploadSources.map((s) => ({
              value: s.id,
              label: s.host + ' · ' + logFormatLabel(s.format),
            }))}
          />
        )}
      </Field>
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
        variant="secondary"
        className="w-fit"
        disabled={!file || !sourceId || sources.data?.availability !== 'available'}
        pending={upload.isPending}
        onClick={() => upload.mutate(resume || undefined)}
      >
        Upload recognized requests
      </Button>
      {progress ? (
        <output className="type-body">
          {progress.scanned} lines scanned · {progress.matched} recognized crawler requests sent.
        </output>
      ) : null}
      {upload.isSuccess ? (
        <Alert tone={processing ? 'info' : 'success'}>
          {processing
            ? 'Upload complete. Results appear here once processing finishes, usually within a few minutes.'
            : 'Upload processed. Coverage for these days is declared by the file.'}
        </Alert>
      ) : null}
      {upload.isError ? (
        <Alert tone="danger">
          <div className="grid gap-2">
            <p>{upload.error.message}</p>
            {progress ? (
              <Button
                size="sm"
                variant="secondary"
                className="w-fit"
                onClick={() => upload.mutate(progress.uploadId)}
              >
                Resume upload
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}
    </div>
  );
}
