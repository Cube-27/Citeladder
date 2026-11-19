import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { ProjectEditPanel } from '@/components/projects/project-edit-panel';
import { BrandMark } from '@/components/ui/brand-mark';
import { Button } from '@/components/ui/button';
import { Absence } from '@/components/ui/absence';
import { ChipInput } from '@/components/ui/chip-input';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { SettingField, SettingRow, SettingRows } from '@/components/ui/setting-row';
import { StateBlock } from '@/components/ui/state-block';
import { Textarea } from '@/components/ui/textarea';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import type { Project } from '@citeladder/contracts';
import { BUYER_TYPE_CHOICES, MARKET_SCOPE_CHOICES } from '@/lib/project/identity-facets';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import { SaveFoot } from './save-foot';
import type { BrandProfileForm } from './use-brand-profile-form';
import { Notice } from '@/components/ui/notice';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';

/** The profile save's outcome, above the tab it was saved from. */
export function ProfileSaveNotices({ form }: Readonly<{ form: BrandProfileForm }>) {
  if (form.error)
    return (
      <Notice
        kind="mutation"
        notice={mutationNoticeForError(form.error, { action: 'save the brand profile' })}
      />
    );
  return form.notice ? <Notice tone="positive">{form.notice}</Notice> : null;
}

/** The profile's one save, shared by the Company and Audience cards. */
function ProfileSaveFoot({ form }: Readonly<{ form: BrandProfileForm }>) {
  return (
    <SaveFoot
      label="Save brand knowledge"
      changed={form.dirty}
      saving={form.saving}
      onSave={form.save}
    />
  );
}

/**
 * Category, buyer type and market scope decide which questions prompt
 * generation asks, so a wrong onboarding answer must stay correctable here,
 * beside the description and positioning. Short facts are rows with their
 * control at the right; long text takes the row's width under its label.
 */
export function CompanyFactsCard({ form }: Readonly<{ form: BrandProfileForm }>) {
  const { draft, identity, saving } = form;
  return (
    <Section aria-labelledby="company-facts">
      <SectionHeader>
        <SectionTitle id="company-facts">Company facts</SectionTitle>
        <SectionDescription>
          {form.empty && !form.dirty
            ? 'No company facts yet. The agent and prompt generation read them first. Start with what you sell.'
            : 'The canonical facts used across CiteLadder, including by the agent.'}
        </SectionDescription>
      </SectionHeader>
      <SettingRows>
        <SettingField
          label="What you sell"
          hint="The category buyers would search for. Generated questions are built from it."
        >
          {(field) => (
            <Input
              {...field}
              disabled={saving}
              value={identity.category}
              onChange={(event) => form.setIdentity({ ...identity, category: event.target.value })}
            />
          )}
        </SettingField>
        <FacetChoice
          label="Who buys it"
          value={identity.buyer_type}
          options={BUYER_TYPE_CHOICES}
          disabled={saving}
          onPick={(buyer_type) => form.setIdentity({ ...identity, buyer_type })}
        />
        <FacetChoice
          label="Where they buy it"
          value={identity.market_scope}
          options={MARKET_SCOPE_CHOICES}
          disabled={saving}
          onPick={(market_scope) => form.setIdentity({ ...identity, market_scope })}
        />
        <SettingField
          wide
          label="Description"
          hint="Core mission, value proposition, and brand summary."
        >
          {(field) => (
            <Textarea
              {...field}
              rows={4}
              disabled={saving}
              value={draft.description}
              onChange={(event) => form.setDraft({ ...draft, description: event.target.value })}
            />
          )}
        </SettingField>
        <SettingField
          wide
          label="Positioning"
          hint="Include price tier, differentiation, and competitive segment."
        >
          {(field) => (
            <Textarea
              {...field}
              rows={4}
              disabled={saving}
              value={draft.positioning}
              onChange={(event) => form.setDraft({ ...draft, positioning: event.target.value })}
            />
          )}
        </SettingField>
      </SettingRows>
      <ProfileSaveFoot form={form} />
    </Section>
  );
}

/** A single choice of the identity, as a row with its select at the right. */
function FacetChoice<T extends string>({
  label,
  value,
  options,
  disabled,
  onPick,
}: Readonly<{
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  disabled: boolean;
  onPick: (value: T) => void;
}>) {
  return (
    <SettingField label={label}>
      {(field) => (
        <Select<T | ''>
          id={field.id}
          ariaLabel={label}
          aria-describedby={field['aria-describedby']}
          value={value ?? ''}
          placeholder="Not set"
          options={options}
          disabled={disabled}
          onValueChange={(next) => {
            if (next) onPick(next);
          }}
        />
      )}
    </SettingField>
  );
}

/**
 * Who the business sells to, and its offerings one chip each, so an offering
 * whose name holds a comma ("simulator bays for golf courses, and community
 * centres") stays one offering. A typed but unadded offering is held by the
 * form and saved with the list.
 */
export function AudienceCard({ form }: Readonly<{ form: BrandProfileForm }>) {
  const { draft, saving } = form;
  return (
    <Section aria-labelledby="audience-offerings">
      <SectionHeader>
        <SectionTitle id="audience-offerings">Audience and offerings</SectionTitle>
        <SectionDescription>Who you sell to, and what you sell.</SectionDescription>
      </SectionHeader>
      <SettingRows>
        <SettingField
          wide
          label="Target audience"
          hint="Key demographics, customer personas, and ideal buyers."
        >
          {(field) => (
            <Textarea
              {...field}
              rows={4}
              disabled={saving}
              value={draft.target_audience}
              onChange={(event) => form.setDraft({ ...draft, target_audience: event.target.value })}
            />
          )}
        </SettingField>
        <ChipInput
          label="Products and services"
          hint="One offering per entry, named as a buyer would."
          items={draft.products_services.map((value) => ({ value }))}
          onChange={(items) =>
            form.setDraft({ ...draft, products_services: items.map((item) => item.value) })
          }
          pending={form.pendingOffering}
          onPendingChange={form.setPendingOffering}
          disabled={saving}
        />
      </SettingRows>
      <ProfileSaveFoot form={form} />
    </Section>
  );
}

/**
 * The project's tracked competitors, one row each with its domains. They
 * are edited with the rest of the project's configuration, which this opens.
 */
export function TrackedCompetitorsCard({ project }: Readonly<{ project: Project }>) {
  const mayEdit = useWorkspaceCapability('write');
  const [editing, setEditing] = useState(false);
  return (
    <Section aria-labelledby="tracked-competitors">
      <SectionHeader
        actions={
          mayEdit ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Icon icon={Pencil} />
              Edit competitors
            </Button>
          ) : null
        }
      >
        <SectionTitle id="tracked-competitors">Tracked competitors</SectionTitle>
        <SectionDescription>The brands CiteLadder measures you against.</SectionDescription>
      </SectionHeader>
      {(project.competitors ?? []).length === 0 ? (
        <StateBlock kind="empty" inline message="No competitors tracked yet." />
      ) : (
        <SettingRows label="Tracked competitors">
          {(project.competitors ?? []).map((competitor) => (
            <SettingRow
              key={`${competitor.name}:${competitor.domains[0] ?? ''}`}
              label={
                <Inline as="span">
                  <BrandMark
                    name={competitor.name}
                    logoUrl={competitor.logo_url}
                    websiteUrl={competitor.domains[0]}
                  />
                  <span className="truncate">{competitor.name}</span>
                </Inline>
              }
              value={
                competitor.domains.length ? (
                  competitor.domains.join(', ')
                ) : (
                  <Absence state="not_set" />
                )
              }
            />
          ))}
        </SettingRows>
      )}
      {editing ? <ProjectEditPanel project={project} open onOpenChange={setEditing} /> : null}
    </Section>
  );
}
