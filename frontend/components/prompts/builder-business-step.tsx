import {
  BusinessFacts,
  OfferingsGrid,
  SuggestionsNotice,
} from '@/components/knowledge-base/business-editor';
import type { BusinessDraftState } from '@/components/knowledge-base/use-business-draft';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { SectionStack } from '@/components/ui/section';
import { SettingField, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { StateBlock } from '@/components/ui/state-block';
import type { PromptFormLimits } from '@citeladder/contracts';

export type BusinessStepLimits = Pick<
  PromptFormLimits,
  'context_list_max_entries' | 'run_context_max_chars'
>;

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
    <SectionStack>
      <Notice kind="mutation" error={business.save.error} act={'save your business details'} />
      <SuggestionsNotice {...editor} />
      <OfferingsGrid {...editor} saved={map} />
      <BusinessFacts {...editor} context={profile.business_context} />
      <SettingsGroup title="This run">
        <SettingRows density="roomy">
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
    </SectionStack>
  );
}
