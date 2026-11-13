import { Plus, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import { QueryState } from '@/components/ui/query-state';
import { Button, IconButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Inline, Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';

import { MentionRuleFields, mentionRuleDraft, type MentionRuleDraft } from './mention-rule-fields';

/**
 * Draft rows carry a stable `key` because the list is editable AND removable.
 * Keyed by array index, removing the first of three rows shifted every row's
 * identity: React reused the same DOM inputs for different competitors, so
 * focus, selection, and any in-flight IME composition landed on the wrong row.
 * The counter is module-scoped and monotonic — it only has to be unique within
 * one mounted list, never persisted or sent to the backend.
 */
let competitorKeySeq = 0;
export const nextCompetitorKey = () => {
  competitorKeySeq += 1;
  return `competitor-${competitorKeySeq}`;
};

// Aliases are not edited here; each row carries its own so a rename keeps them.
// A tracked row carries its `id`, so a rename keeps the competitor and its logo.
export type CompetitorDraft = {
  key: string;
  id?: string;
  name: string;
  aliases: string[];
  domains: string;
  rule: MentionRuleDraft;
};

/** An unnamed competitor row still needs something for a screen reader to say. */
function competitorName(name: string, index: number): string {
  return name || `competitor ${index + 1}`;
}

/** The project edit panel's competitor rows, up to the catalog's maximum. */
export function ProjectCompetitorFields({
  competitors,
  setCompetitors,
  maximumCompetitors,
}: Readonly<{
  competitors: CompetitorDraft[];
  setCompetitors: Dispatch<SetStateAction<CompetitorDraft[]>>;
  maximumCompetitors: number | undefined;
}>) {
  const competitorLimitReached =
    maximumCompetitors === undefined || competitors.length >= maximumCompetitors;

  const updateCompetitor = (index: number, patch: Partial<CompetitorDraft>) =>
    setCompetitors((prev) =>
      prev.map((competitor, i) => (i === index ? { ...competitor, ...patch } : competitor)),
    );

  return (
    <Stack gap="compact">
      <Inline>
        <p className={textRole('label')}>Competitors</p>
        <span className="type-caption">
          {competitors.length} of {maximumCompetitors ?? '…'}
        </span>
        <Button
          variant="ghost"
          className="ms-auto"
          aria-label="Add competitor"
          disabled={competitorLimitReached}
          onClick={() =>
            setCompetitors((prev) => [
              ...prev,
              {
                key: nextCompetitorKey(),
                name: '',
                aliases: [],
                domains: '',
                rule: mentionRuleDraft(undefined),
              },
            ])
          }
        >
          <Icon icon={Plus} />
          Add
        </Button>
      </Inline>
      {competitors.length === 0 ? (
        <QueryState kind="empty" inline message="None tracked." />
      ) : (
        <Stack as="ul" gap="compact" className="list-none">
          {competitors.map((competitor, index) => (
            <Stack as="li" key={competitor.key} gap="compact">
              <Inline>
                <Input
                  value={competitor.name}
                  onChange={(event) =>
                    updateCompetitor(index, {
                      name: event.target.value,
                      rule: { ...competitor.rule, touched: true },
                    })
                  }
                  aria-label={`Competitor ${index + 1} name`}
                  placeholder="Name"
                />
                <Input
                  value={competitor.domains}
                  onChange={(event) => updateCompetitor(index, { domains: event.target.value })}
                  aria-label={`Competitor ${index + 1} domains`}
                  placeholder="Domains"
                />
                <IconButton
                  icon={X}
                  label={`Remove ${competitorName(competitor.name, index)}`}
                  onClick={() => setCompetitors((prev) => prev.filter((_, i) => i !== index))}
                />
              </Inline>
              <MentionRuleFields
                name={competitor.name}
                rule={competitor.rule}
                onChange={(rule) => updateCompetitor(index, { rule })}
              />
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
