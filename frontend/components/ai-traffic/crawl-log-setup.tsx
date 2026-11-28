import {
  collectionPointLabel,
  COLLECTION_POINTS,
  LOG_FORMATS,
  logFormatLabel,
} from '@/lib/ai-traffic/vocabulary';
import type { UploadProcessing, useCrawlConnections } from '@/lib/ai-traffic/use-crawl-connections';
import {
  CRAWL_LOG_SETUPS,
  CRAWL_INGEST_ORIGIN,
  FIREHOSE_BUFFER_INTERVAL,
} from '@/lib/config/crawl-logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Columns, Stack } from '@/components/ui/layout';
import { Text } from '@/components/ui/typography';
import { RadioGroup } from '@/components/ui/radio-group';
import { CopyButton } from '@/components/ui/copy-button';
import { TextLink } from '@/components/ui/text-link';
import { Checkbox } from '@/components/ui/checkbox';
import { GcpFields, GcpSourceSetup } from './gcp-pull-setup';
import { Notice } from '@/components/ui/notice';
const UPLOAD_PROCESSING_COPY: Record<UploadProcessing, string> = {
  processing: 'Upload complete. Processing…',
  delayed: 'Upload complete. Processing is taking longer than usual.',
  processed: 'Upload processed.',
};
export function CrawlLogSetup({
  model,
}: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const { setup, setSetup, origin, setOrigin, setSampling, setFilter, setPoint, mutation } = model;
  const chosen = CRAWL_LOG_SETUPS.find((s) => s.value === setup) ?? CRAWL_LOG_SETUPS[0];
  const firehose = setup === 'aws_firehose';
  const gcp = setup === 'gcp_pubsub_pull';
  const pullUnavailable = model.sources.data?.gcp_pull.availability !== 'available';
  let fields = <DeclaredFields model={model} />;
  if (firehose) fields = <FirehoseFields model={model} />;
  if (gcp) fields = <GcpFields model={model} />;
  return (
    <>
      <RadioGroup
        ariaLabel="Collection method"
        value={setup}
        onValueChange={(value) => {
          const next = CRAWL_LOG_SETUPS.find((s) => s.value === value);
          if (!next) return;
          setSetup(next.value);
          setPoint(next.collectionPoint);
          setSampling(next.value === 'cloudflare_worker' ? 'filtered' : 'none');
          setFilter(
            next.value === 'cloudflare_worker' ? 'Best-effort recognized automated requests' : '',
          );
        }}
        options={CRAWL_LOG_SETUPS.filter(
          (s) => s.value !== 'gcp_pubsub_pull' || !pullUnavailable,
        ).map((s) => ({ value: s.value, label: s.label }))}
      />
      <TextLink variant="external" href={chosen.guide} box="fit">
        Setup guide: {chosen.label}
      </TextLink>
      <Columns template="halves-desktop" gap="workspace">
        <Field label="Site origin" wide>
          {(field) => (
            <Input {...field} value={origin} onChange={(e) => setOrigin(e.target.value)} />
          )}
        </Field>
        {fields}
      </Columns>
      {mutation.isError && mutation.variables.kind === 'create' ? (
        <Notice kind="mutation" error={mutation.error} act="set up the crawl-log source" />
      ) : null}
      {setup === 'upload' ? <UploadForm model={model} /> : null}
    </>
  );
}
function DeclaredFields({ model }: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const { format, setFormat, point, setPoint, sampling, setSampling, rate, setRate } = model;
  const { filter, setFilter } = model;
  return (
    <>
      <Field label="Log format">
        {({ id }) => (
          <Select
            id={id}
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
        <Field label="Filtering limitations" wide>
          {(field) => (
            <Input {...field} value={filter} onChange={(e) => setFilter(e.target.value)} />
          )}
        </Field>
      ) : null}
    </>
  );
}
function FirehoseFields({ model }: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const { bufferInterval, setBufferInterval, declaredFiltered, setDeclaredFiltered } = model;
  return (
    <>
      <Field
        label="Firehose buffer interval (seconds)"
        hint={`Use the value set on the stream; ${FIREHOSE_BUFFER_INTERVAL.min}–${FIREHOSE_BUFFER_INTERVAL.recommendedMax} is recommended.`}
      >
        {(field) => (
          <Input
            {...field}
            inputMode="numeric"
            value={bufferInterval}
            onChange={(e) => setBufferInterval(e.target.value)}
          />
        )}
      </Field>
      <Checkbox
        box="wide"
        checked={declaredFiltered}
        onCheckedChange={(checked) => setDeclaredFiltered(checked === true)}
        label="The stream runs the CiteLadder filter Lambda (coverage stays partial)"
      />
    </>
  );
}
export function CrawlLogCredential({
  model,
}: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const { issued, sources } = model;
  const pullSource =
    issued?.setup === 'gcp_pubsub_pull'
      ? sources.data?.items.find((source) => source.id === issued.id)
      : undefined;
  if (pullSource && sources.data)
    return (
      <GcpSourceSetup
        source={pullSource}
        gcp={sources.data.gcp_pull}
        projectId={model.projectId}
        workspaceId={model.workspaceId}
      />
    );
  return issued ? <IssuedToken issued={issued} /> : null;
}
export function IssuedToken({
  issued,
}: Readonly<{
  issued: Readonly<{ id: string; token: string | null; setup?: string }>;
}>) {
  const route = issued.setup === 'aws_firehose' ? 'firehose' : 'ingest';
  const endpoint = `${CRAWL_INGEST_ORIGIN}/v1/crawl-logs/${route}/${issued.id}`;
  return (
    <Notice tone="info">
      <Stack>
        {issued.token ? (
          <>
            <p>Copy this token now. It is shown once.</p>
            <CopyButton value={issued.token}>Copy token</CopyButton>
            <Text as="code" variant="code" wrap="all">
              {endpoint}
            </Text>
            <CopyButton value={endpoint}>Copy endpoint</CopyButton>
          </>
        ) : null}
      </Stack>
    </Notice>
  );
}
export function CrawlLogSetupSubmit({
  model,
}: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const { canManage, sources, mutation, issued, issueSource } = model;
  return (
    <Button
      variant="primary"
      disabled={!canManage || sources.data?.availability !== 'available' || issued !== null}
      pending={mutation.isPending}
      onClick={() => issueSource({ kind: 'create' })}
    >
      Connect
    </Button>
  );
}

function UploadForm({ model }: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
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
    return <Notice tone="info">Create an upload source first.</Notice>;
  }
  return (
    <Stack gap="workspace">
      <Field label="Upload source">
        {({ id }) => (
          <Select
            id={id}
            value={sourceId}
            onValueChange={setSourceId}
            options={uploadSources.map((s) => ({
              value: s.id,
              label: s.host + ' · ' + logFormatLabel(s.format),
            }))}
          />
        )}
      </Field>
      <Field label="Log file">
        {(field) => (
          <Input
            {...field}
            type="file"
            accept=".log,.txt,.json,.ndjson,.gz"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
      </Field>
      <Field label="Resume upload ID (optional)">
        {(field) => <Input {...field} value={resume} onChange={(e) => setResume(e.target.value)} />}
      </Field>
      <Button
        variant="secondary"
        box="fit"
        disabled={!file || !sourceId || sources.data?.availability !== 'available'}
        pending={upload.isPending}
        onClick={() => upload.mutate(resume || undefined)}
      >
        Upload recognized requests
      </Button>
      {progress ? (
        <Text as="output" variant="body" tone="ink-2">
          {progress.scanned} lines scanned · {progress.matched} recognized crawler requests sent.
        </Text>
      ) : null}
      {upload.isSuccess ? (
        <Notice tone={processing === 'processed' ? 'positive' : 'info'}>
          {UPLOAD_PROCESSING_COPY[processing ?? 'processed']}
        </Notice>
      ) : null}
      {upload.isError ? (
        <Notice
          kind="mutation"
          error={upload.error}
          act="upload the log file"
          recovery={
            progress ? (
              <Button variant="secondary" onClick={() => upload.mutate(progress.uploadId)}>
                Resume upload
              </Button>
            ) : undefined
          }
        />
      ) : null}
    </Stack>
  );
}
