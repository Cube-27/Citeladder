import { Absence } from '@/components/ui/absence';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { StatusMark } from '@/components/ui/status-mark';
import { DraftInset } from '@/components/ui/draft-sheet';
import { Text } from '@/components/ui/typography';
import { PaneBlock } from '@/components/ui/workspace';
import {
  fieldReview,
  PAGE_FIELDS,
  pageFieldLabel,
  type FieldReview,
  type AgentPageField,
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

function RawText({ children }: Readonly<{ children: string }>) {
  return (
    <Text as="pre" variant="caption-mono" wrap="pre-anywhere">
      {children}
    </Text>
  );
}

function FieldText({ field, value }: Readonly<{ field: AgentPageField; value: string }>) {
  if (!value.trim()) return <Absence state="none" />;
  if (field !== 'json_ld')
    return (
      <Text variant="body" wrap="anywhere">
        {value}
      </Text>
    );
  return (
    <Disclosure title="Show the JSON-LD">
      <RawText>{value}</RawText>
    </Disclosure>
  );
}

function Proposal({
  field,
  suggestion,
  actionable,
  onAct,
  onShow,
}: Readonly<FieldActions & { field: AgentPageField; suggestion: AgentSuggestion }>) {
  const { replacement } = suggestion;
  if (suggestion.readiness !== 'ready' || replacement === null)
    return (
      <Pressable look="jump" className="text-start" onClick={() => onShow(suggestion.id)}>
        <Text variant="caption">{suggestion.needs_input ?? suggestion.rationale}</Text>
      </Pressable>
    );
  const label = pageFieldLabel(field);
  return (
    <DraftInset data-field-proposal={field}>
      {field === 'json_ld' ? (
        <RawText>{replacement}</RawText>
      ) : (
        <Text variant="body" wrap="anywhere">
          {replacement || 'Remove this text.'}
        </Text>
      )}
      {actionable ? (
        <Inline wrap>
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
    </DraftInset>
  );
}

function FieldRow({
  field,
  value,
  review,
  ...actions
}: Readonly<FieldActions & { field: AgentPageField; value: string; review: FieldReview }>) {
  return (
    <Stack as="li" gap="tight" className="min-w-0">
      <Inline wrap>
        <Text variant="caption">{pageFieldLabel(field)}</Text>
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
    <PaneBlock as="ul" aria-label="Search listing">
      {PAGE_FIELDS.map((field) => (
        <FieldRow
          key={field}
          field={field}
          value={fields[field]}
          review={fieldReview(suggestions, field)}
          {...actions}
        />
      ))}
    </PaneBlock>
  );
}
