import {
  BusinessFacts,
  OfferingsGrid,
  SuggestionsNotice,
} from '@/components/knowledge-base/business-editor';
import type { BusinessDraftState } from '@/components/knowledge-base/use-business-draft';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { SettingField, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { StateBlock } from '@/components/ui/state-block';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import type { PromptFormLimits } from '@citeladder/contracts';

/** The bounds the API enforces on this step's saves and the run note, from the prompt-set list. */
export type BusinessStepLimits = Pick<
  PromptFormLimits,
  'context_list_max_entries' | 'run_context_max_chars'
>;

/**
 * Step 1: the offerings grid and the business-wide facts, prefilled from
 * saved brand knowledge (the same editor as Agent › Context › Business map),
 * then a note for this run only. Edits save to the brand profile and
 * business map when the step moves on.
 */
export function BuilderBusinessStep({
  business,
  runContext,
  onRunContextChange,
  limits,
}: Readonly<{
  business: BusinessDraftState;
  runContext: string;
  onRunContextChange: (value: string) => void;
  limits: BusinessStepLimits;
}>) {
  const { draft, profile, map } = business;
  if (business.loading)
    return (
      <StateBlock
        kind="loading"
        label="Loading your business details"
        shape={{ kind: 'facts', rows: 5 }}
      />
    );
  if (business.loadError || !draft || !profile || !map)
    return (
      <StateBlock
        kind="error"
        error={business.loadError}
        title="Couldn't load your business details"
        fallback="The request failed or timed out."
        onRetry={business.retry}
        pending={business.retrying}
      />
    );
  const editor = {
    draft,
    onChange: business.setDraft,
    disabled: business.save.isPending,
    listMax: limits.context_list_max_entries,
  };
  return (
    <Stack gap="section">
      {business.save.error ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(business.save.error, {
            action: 'save your business details',
          })}
        />
      ) : null}
      <SuggestionsNotice {...editor} />
      <OfferingsGrid {...editor} saved={map} />
      <BusinessFacts {...editor} context={profile.business_context} />
      <SettingsGroup title="This run">
        <SettingRows>
          <SettingField label="Anything else for this run">
            {(field) => (
              <Input
                {...field}
                value={runContext}
                maxLength={limits.run_context_max_chars}
                onChange={(event) => onRunContextChange(event.target.value)}
              />
            )}
          </SettingField>
        </SettingRows>
      </SettingsGroup>
    </Stack>
  );
}
