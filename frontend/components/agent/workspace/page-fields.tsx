import { JUMP_LINK } from '@/components/agent/jump-link';
import { Absence } from '@/components/ui/absence';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { StatusMark } from '@/components/ui/status-mark';
import { textRole } from '@/components/ui/typography';
import {
  fieldReview,
  PAGE_FIELDS,
  pageFieldLabel,
  type FieldReview,
  type PageField,
} from '@/lib/agent/page-workspace';
import type { AgentRevision, AgentSuggestion } from '@/lib/api/agent';
import { X } from '@/lib/icons';

import type { HighlightAct } from './editor-highlights';

type Fields = NonNullable<AgentRevision['fields']>;
type FieldActions = Readonly<{
  actionable: boolean;
  onAct: (id: string, act: HighlightAct) => void;
  onShow: (id: string) => void;
}>;

const WRAP = '[overflow-wrap:anywhere]';
const RAW = textRole('caption', `whitespace-pre-wrap ${WRAP}`);

function FieldText({ field, value }: Readonly<{ field: PageField; value: string }>) {
  if (!value.trim()) return <Absence state="none" />;
  if (field !== 'json_ld') return <span className={textRole('body', WRAP)}>{value}</span>;
  return (
    <Disclosure title="Show the JSON-LD">
      <pre className={RAW}>{value}</pre>
    </Disclosure>
  );
}

function Proposal({
  field,
  suggestion,
  actionable,
  onAct,
  onShow,
}: Readonly<FieldActions & { field: PageField; suggestion: AgentSuggestion }>) {
  const { replacement } = suggestion;
  if (suggestion.readiness !== 'ready' || replacement === null)
    return (
      <Pressable className={`${JUMP_LINK} text-start`} onClick={() => onShow(suggestion.id)}>
        <span className={textRole('caption')}>
          {suggestion.needs_input ?? suggestion.rationale}
        </span>
      </Pressable>
    );
  const label = pageFieldLabel(field);
  return (
    <Stack gap="item" className="edge-draft rounded-control p-2" data-field-proposal={field}>
      {field === 'json_ld' ? (
        <pre className={RAW}>{replacement}</pre>
      ) : (
        <span className={textRole('body', WRAP)}>{replacement || 'Remove this text.'}</span>
      )}
      {actionable ? (
        <Inline className="flex-wrap">
          <Button
            variant="primary"
            aria-label={`Accept suggestion: ${label}`}
            onClick={() => onAct(suggestion.id, 'apply')}
          >
            Accept
          </Button>
          <Button
            variant="quiet"
            aria-label={`Dismiss suggestion: ${label}`}
            onClick={() => onAct(suggestion.id, 'dismiss')}
          >
            <Icon icon={X} />
            Dismiss
          </Button>
        </Inline>
      ) : null}
    </Stack>
  );
}

function FieldRow({
  field,
  value,
  review,
  ...actions
}: Readonly<FieldActions & { field: PageField; value: string; review: FieldReview }>) {
  return (
    <Stack as="li" gap="tight" className="min-w-0">
      <Inline className="flex-wrap">
        <span className={textRole('caption')}>{pageFieldLabel(field)}</span>
        {review.edited ? <StatusMark tone="positive">Edited</StatusMark> : null}
        {review.open ? <StatusMark tone="info">Suggestion</StatusMark> : null}
      </Inline>
      <FieldText field={field} value={value} />
      {review.open ? <Proposal field={field} suggestion={review.open} {...actions} /> : null}
    </Stack>
  );
}

export function PageFields({
  fields,
  suggestions,
  ...actions
}: Readonly<FieldActions & { fields: Fields; suggestions: readonly AgentSuggestion[] }>) {
  return (
    <Stack
      as="ul"
      gap="compact"
      aria-label="Search listing"
      className="border-rule border-b p-[var(--card-padding)]"
    >
      {PAGE_FIELDS.map((field) => (
        <FieldRow
          key={field}
          field={field}
          value={fields[field]}
          review={fieldReview(suggestions, field)}
          {...actions}
        />
      ))}
    </Stack>
  );
}
