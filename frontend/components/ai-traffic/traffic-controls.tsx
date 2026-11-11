'use client';
import { Download, Folder } from 'lucide-react';
import { crawlerResourceClassSchema } from '@citeladder/contracts/site-health';
import { trafficStatusCode, type useTrafficData } from '@/lib/ai-traffic/use-traffic-data';
import { words } from '@/lib/ai-traffic/vocabulary';
import { TRAFFIC_RANGES, VERIFICATION_OPTIONS } from '@/lib/config/crawl-logs';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AllFilters,
  choiceFilter,
  menuFieldKeys,
  type FilterDefinition,
} from '@/components/ui/all-filters';
import { FilterField } from '@/components/ui/filter-bar';
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

/** One filter of All filters, or none where the tab does not offer it. */
type FilterBuilder = (props: TrafficControlsProps) => FilterDefinition | null;

/** In menu order. */
const FILTER_BUILDERS: readonly FilterBuilder[] = [
  verificationFilter,
  purposeFilter,
  botFilter,
  resourceFilter,
  folderFilter,
  statusFilter,
  insightFilter,
];

function trafficFilters(props: TrafficControlsProps): FilterDefinition[] {
  return FILTER_BUILDERS.flatMap((build) => build(props) ?? []);
}

/** A choice filter whose unset value is `null` in the URL and "All …" in the menu. */
function optionalChoice({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  allLabel: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | null) => void;
}>): FilterDefinition {
  return choiceFilter({
    id,
    label,
    value: value ?? '',
    defaultValue: '',
    groups: [{ options: [{ value: '', label: allLabel }, ...options] }],
    onChange: (picked) => onChange(picked || null),
  });
}

// Verification filters crawler requests only.
function verificationFilter({ model, crawlAvailable }: TrafficControlsProps) {
  if (!crawlAvailable) return null;
  return choiceFilter({
    id: 'verification',
    label: 'Verification',
    value: model.selection.verification,
    defaultValue: 'default',
    groups: [{ options: VERIFICATION_OPTIONS }],
    onChange: model.selection.setVerification,
  });
}

function purposeFilter({ model }: TrafficControlsProps) {
  if (model.tab !== 'crawlers') return null;
  const purposes = new Set(model.catalog.data?.bots.map((bot) => bot.purpose));
  return optionalChoice({
    id: 'purpose',
    label: 'Crawler purpose',
    allLabel: 'All purposes',
    value: model.selection.purpose,
    options: [...purposes].map((value) => ({ value, label: words(value) })),
    onChange: model.selection.setPurpose,
  });
}

function botFilter({ model }: TrafficControlsProps) {
  if (model.tab !== 'activity') return null;
  return optionalChoice({
    id: 'bot',
    label: 'Bot',
    allLabel: 'All bots',
    value: model.selection.bot,
    options: model.catalog.data?.bots.map((bot) => ({ value: bot.bot_id, label: bot.label })) ?? [],
    onChange: model.selection.setBot,
  });
}

function resourceFilter({ model }: TrafficControlsProps) {
  if (model.tab === 'overview') return null;
  return optionalChoice({
    id: 'resource',
    label: 'Resource class',
    allLabel: 'All resources',
    value: model.selection.resource,
    options: crawlerResourceClassSchema.options.map((value) => ({ value, label: words(value) })),
    onChange: model.selection.setResource,
  });
}

function folderFilter({ model }: TrafficControlsProps): FilterDefinition | null {
  if (model.tab === 'overview') return null;
  const { folder } = model.selection;
  return {
    kind: 'custom',
    id: 'folder',
    label: 'Folder',
    valueLabel: folder || 'Any folder',
    isDefault: !folder,
    content: <FolderField model={model} />,
  };
}

function statusFilter({ model }: TrafficControlsProps): FilterDefinition | null {
  if (model.tab !== 'activity') return null;
  // A partly typed code ("40") narrows nothing yet, so it is neither shown nor counted.
  const code = trafficStatusCode(model.selection.status);
  return {
    kind: 'custom',
    id: 'status',
    label: 'Status code',
    valueLabel: code === undefined ? 'Any status' : String(code),
    isDefault: code === undefined,
    content: <StatusField model={model} />,
  };
}

function insightFilter({ model }: TrafficControlsProps): FilterDefinition | null {
  const { pattern, setPattern } = model.selection;
  if (model.tab !== 'pages' || !pattern) return null;
  return {
    kind: 'custom',
    id: 'insight',
    label: 'Insight',
    valueLabel: 'Filtered',
    isDefault: false,
    content: <MenuItem onSelect={() => setPattern(null)}>Clear insight filter</MenuItem>,
  };
}

function FolderField({ model }: ControlProps) {
  const { folder, setFolder } = model.selection;
  return (
    <Input
      aria-label="Folder"
      placeholder="Folder"
      value={folder ?? ''}
      onChange={(e) => setFolder(e.target.value || null)}
      onKeyDown={menuFieldKeys}
      startContent={<Icon icon={Folder} />}
    />
  );
}

/** Pages' sort, in the table's toolbar beside the rows it orders, at the one filter width. */
export function PagesSort({ model }: ControlProps) {
  const { sort, setSort } = model.selection;
  return (
    <FilterField>
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
      />
    </FilterField>
  );
}

function StatusField({ model }: ControlProps) {
  const { status, setStatus } = model.selection;
  return (
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
      onKeyDown={menuFieldKeys}
    />
  );
}
