import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Inline, Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { SettingRow } from '@/components/ui/setting-row';
import {
  saveTimeZonePreference,
  useDisplayTimeZone,
  useTimeZonePreference,
} from '@/lib/display-timezone';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';

type Choice = 'auto' | 'UTC' | 'custom';

const CHOICES: readonly { value: Choice; label: string }[] = [
  { value: 'auto', label: 'Auto (device timezone)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'custom', label: 'Named timezone' },
];

export function TimeZoneSetting() {
  const preference = useTimeZonePreference();
  const displayZone = useDisplayTimeZone();
  const [edit, setEdit] = useState<{ choice: Choice; namedZone: string } | null>(null);
  const savedChoice = preference === 'auto' || preference === 'UTC' ? preference : 'custom';
  const savedNamedZone = savedChoice === 'custom' ? preference : '';
  const choice = edit?.choice ?? savedChoice;
  const namedZone = edit?.namedZone ?? savedNamedZone;
  // Each failure belongs to the control that caused it, so its Field can announce it.
  const [error, setError] = useState<{ at: 'choice' | 'zone'; message: string } | null>(null);

  const choose = (next: Choice) => {
    setError(null);
    if (next === 'custom') {
      setEdit({ choice: next, namedZone });
    } else if (saveTimeZonePreference(next)) {
      setEdit(null);
    } else {
      setEdit({ choice: next, namedZone });
      setError({
        at: 'choice',
        message: 'The timezone preference could not be saved on this device.',
      });
    }
  };

  const saveNamedZone = () => {
    if (saveTimeZonePreference(namedZone.trim())) {
      setEdit(null);
      setError(null);
    } else {
      setError({ at: 'zone', message: 'Enter a valid IANA timezone, such as Asia/Kolkata.' });
    }
  };

  return (
    <Section aria-labelledby="settings-timezone-title">
      <SectionHeader>
        <SectionTitle id="settings-timezone-title">Display timezone</SectionTitle>
      </SectionHeader>
      <Stack gap="item">
        <SettingRow
          label="Timezone"
          description={displayZone}
          action={
            <Select
              value={choice}
              onValueChange={choose}
              options={CHOICES}
              ariaLabel="Display timezone preference"
            />
          }
        >
          {error?.at === 'choice' ? <Notice tone="negative">{error.message}</Notice> : null}
        </SettingRow>
        {choice === 'custom' ? (
          <Field label="IANA timezone" error={error?.at === 'zone' ? error.message : undefined}>
            {(field) => (
              <Inline className="flex-wrap">
                <Input
                  {...field}
                  value={namedZone}
                  onChange={(event) => {
                    setEdit({ choice: 'custom', namedZone: event.target.value });
                  }}
                  placeholder="Asia/Kolkata"
                  className="min-w-56 flex-1"
                />
                <Button variant="secondary" onClick={saveNamedZone}>
                  Save timezone
                </Button>
              </Inline>
            )}
          </Field>
        ) : null}
      </Stack>
    </Section>
  );
}
