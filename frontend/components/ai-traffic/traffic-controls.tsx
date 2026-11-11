'use client';
import type { KeyboardEvent } from 'react';
import { Download, Folder } from 'lucide-react';
import { crawlerResourceClassSchema } from '@citeladder/contracts/site-health';
import type { useTrafficData } from '@/lib/ai-traffic/use-traffic-data';
import { words } from '@/lib/ai-traffic/vocabulary';
import { TRAFFIC_RANGES, VERIFICATION_OPTIONS } from '@/lib/config/crawl-logs';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AllFilters, choiceFilter, type FilterDefinition } from '@/components/ui/all-filters';
import { MenuItem } from '@/components/ui/menu';
import { Icon } from '@/components/ui/icon';
type ControlProps = Readonly<{ model: ReturnType<typeof useTrafficData> }>;
type TrafficControlsProps = ControlProps & Readonly<{ crawlAvailable: boolean }>;
/** Narrow screens give every field the band's full width instead of a ragged wrap. */
const FIELD = 'w-full desktop:w-auto';
/**
 * The control band: the reporting range, alone. Every other narrowing lives in
 * the All filters menu at the right of the tabs row (`TrafficAllFilters`), so
 * every tab draws the same short row at any width and switching tabs never
 * wraps the band or moves the content below it. Export is a route action in
 * the identity band.
 */
export function TrafficControls({ model }: ControlProps) {
  const { range, setRange } = model.selection;
  return (
    <Select
      ariaLabel="Reporting range"
      value={range}
      onValueChange={setRange}
      options={TRAFFIC_RANGES}
      className={FIELD}
    />
  );
}

/** Export for the tabs that list rows, as a route action. */
export function TrafficExport({ model }: ControlProps) {
  return (
    <Button
      variant="secondary"
      pending={model.exporting.isPending}
      onClick={() => model.exporting.mutate()}
    >
      <Icon icon={Download} />
      Export CSV
    </Button>
  );
}

/**
 * Every narrowing the tab offers behind one button at the tabs row's far
 * right: verification, resource class, crawler purpose, bot, the typed folder
 * and status code, and an insight's filter.
 */
export function TrafficAllFilters(props: TrafficControlsProps) {
  return <AllFilters filters={trafficFilters(props)} align="end" />;
}

const ALL_OPTION = { value: '', label: '' };

function trafficFilters({ model, crawlAvailable }: TrafficControlsProps): FilterDefinition[] {
  const { tab, selection } = model;
  const filters: FilterDefinition[] = [];
  // Verification filters crawler requests only.
  if (crawlAvailable)
    filters.push(
      choiceFilter({
        id: 'verification',
        label: 'Verification',
        value: selection.verification,
        defaultValue: 'default',
        groups: [{ options: VERIFICATION_OPTIONS }],
        onChange: selection.setVerification,
      }),
    );
  if (tab === 'crawlers')
    filters.push(
      choiceFilter({
        id: 'purpose',
        label: 'Crawler purpose',
        value: selection.purpose ?? '',
        defaultValue: '',
        groups: [
          {
            options: [
              { ...ALL_OPTION, label: 'All purposes' },
              ...[...new Set(model.catalog.data?.bots.map((b) => b.purpose) ?? [])].map(
                (value) => ({
                  value,
                  label: words(value),
                }),
              ),
            ],
          },
        ],
        onChange: (value) => selection.setPurpose(value || null),
      }),
    );
  if (tab === 'activity')
    filters.push(
      choiceFilter({
        id: 'bot',
        label: 'Bot',
        value: selection.bot ?? '',
        defaultValue: '',
        groups: [
          {
            options: [
              { ...ALL_OPTION, label: 'All bots' },
              ...(model.catalog.data?.bots.map((b) => ({ value: b.bot_id, label: b.label })) ?? []),
            ],
          },
        ],
        onChange: (value) => selection.setBot(value || null),
      }),
    );
  if (tab !== 'overview')
    filters.push(
      choiceFilter({
        id: 'resource',
        label: 'Resource class',
        value: selection.resource ?? '',
        defaultValue: '',
        groups: [
          {
            options: [
              { ...ALL_OPTION, label: 'All resources' },
              ...crawlerResourceClassSchema.options.map((value) => ({
                value,
                label: words(value),
              })),
            ],
          },
        ],
        onChange: (value) => selection.setResource(value || null),
      }),
    );
  if (tab !== 'overview')
    filters.push({
      kind: 'custom',
      id: 'folder',
      label: 'Folder',
      valueLabel: selection.folder || 'Any folder',
      isDefault: !selection.folder,
      content: <FolderField model={model} />,
    });
  if (tab === 'activity')
    filters.push({
      kind: 'custom',
      id: 'status',
      label: 'Status code',
      valueLabel: selection.status || 'Any status',
      isDefault: !selection.status,
      content: <StatusField model={model} />,
    });
  if (tab === 'pages' && selection.pattern)
    filters.push({
      kind: 'custom',
      id: 'insight',
      label: 'Insight',
      valueLabel: 'Filtered',
      isDefault: false,
      content: (
        <MenuItem onSelect={() => selection.setPattern(null)}>Clear insight filter</MenuItem>
      ),
    });
  return filters;
}

/**
 * A typed field inside a menu: its keys edit the text, so they stop before the
 * menu, which would otherwise jump to an item by letter or close on Left.
 */
const stopMenuKeys = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
};

function FolderField({ model }: ControlProps) {
  const { folder, setFolder } = model.selection;
  return (
    <div>
      <Input
        aria-label="Folder"
        placeholder="Folder"
        value={folder ?? ''}
        onChange={(e) => setFolder(e.target.value || null)}
        onKeyDown={stopMenuKeys}
        startContent={<Icon icon={Folder} />}
      />
    </div>
  );
}

/** Pages' sort, in the table's toolbar beside the rows it orders. */
export function PagesSort({ model }: ControlProps) {
  const { sort, setSort } = model.selection;
  return (
    <Select
      ariaLabel="Sort pages"
      value={sort}
      onValueChange={setSort}
      options={[
        { value: 'requests_desc', label: 'Requests' },
        { value: 'sessions_desc', label: 'AI referral sessions' },
        { value: 'key_events_desc', label: 'Key events' },
        { value: 'citations_desc', label: 'Tracked citations' },
        { value: 'url_asc', label: 'URL' },
      ]}
      className={FIELD}
    />
  );
}

function StatusField({ model }: ControlProps) {
  const { status, setStatus } = model.selection;
  return (
    <div>
      <Input
        aria-label="Response status"
        placeholder="Status code"
        type="number"
        inputMode="numeric"
        min={100}
        max={599}
        step={1}
        value={status ?? ''}
        onChange={(e) => setStatus(e.target.value || null)}
        onKeyDown={stopMenuKeys}
      />
    </div>
  );
}
