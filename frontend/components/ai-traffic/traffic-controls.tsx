'use client';
import { crawlerResourceClassSchema } from '@citeladder/contracts/site-health';
import type { useTrafficData } from '@/lib/ai-traffic/use-traffic-data';
import { TRAFFIC_RANGES, VERIFICATION_OPTIONS } from '@/lib/config/crawl-logs';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export function TrafficControls({ model }: Readonly<{ model: ReturnType<typeof useTrafficData> }>) {
  const { tab } = model;
  const {
    range,
    setRange,
    verification,
    setVerification,
    purpose,
    setPurpose,
    bot,
    setBot,
    status,
    setStatus,
    folder,
    setFolder,
    resource,
    setResource,
  } = model.selection;
  return (
    <>
      <Select
        ariaLabel="Reporting range"
        value={range}
        onValueChange={setRange}
        options={TRAFFIC_RANGES}
      />
      <Select
        ariaLabel="Verification"
        value={verification}
        onValueChange={setVerification}
        options={VERIFICATION_OPTIONS}
      />
      {tab === 'crawlers' ? (
        <Select
          ariaLabel="Crawler purpose"
          value={purpose ?? ''}
          onValueChange={(v) => setPurpose(v || null)}
          options={[
            { value: '', label: 'All purposes' },
            ...[...new Set(model.catalog.data?.bots.map((b) => b.purpose) ?? [])].map((value) => ({
              value,
              label: value.replaceAll('_', ' '),
            })),
          ]}
        />
      ) : null}
      {tab === 'activity' ? (
        <>
          <Select
            ariaLabel="Bot"
            value={bot ?? ''}
            onValueChange={(v) => setBot(v || null)}
            options={[
              { value: '', label: 'All bots' },
              ...(model.catalog.data?.bots.map((b) => ({ value: b.bot_id, label: b.label })) ?? []),
            ]}
          />
          <Input
            aria-label="Response status"
            placeholder="Response status"
            type="number"
            min={100}
            max={599}
            value={status ?? ''}
            onChange={(e) => setStatus(e.target.value || null)}
          />
        </>
      ) : null}
      {tab !== 'overview' ? (
        <>
          <Input
            aria-label="Folder"
            placeholder="Folder"
            value={folder ?? ''}
            onChange={(e) => setFolder(e.target.value || null)}
          />
          <Select
            ariaLabel="Resource class"
            value={resource ?? ''}
            onValueChange={(v) => setResource(v || null)}
            options={[
              { value: '', label: 'All resources' },
              ...crawlerResourceClassSchema.options.map((value) => ({ value, label: value })),
            ]}
          />
          <Button
            variant="secondary"
            pending={model.exporting.isPending}
            onClick={() => model.exporting.mutate()}
          >
            Export CSV
          </Button>
        </>
      ) : null}
    </>
  );
}
