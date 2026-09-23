import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { textRole } from '@/components/ui/typography';
import {
  saveTimeZonePreference,
  useDisplayTimeZone,
  useTimeZonePreference,
} from '@/lib/display-timezone';

type Choice = 'auto' | 'UTC' | 'custom';

const CHOICES: readonly { value: Choice; label: string }[] = [
  { value: 'auto', label: 'Auto (device timezone)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'custom', label: 'Named timezone' },
];

export function TimeZoneSetting() {
  const preference = useTimeZonePreference();
  const displayZone = useDisplayTimeZone();
  const [choice, setChoice] = useState<Choice>(
    preference === 'auto' || preference === 'UTC' ? preference : 'custom',
  );
  const [namedZone, setNamedZone] = useState(
    preference === 'auto' || preference === 'UTC' ? '' : preference,
  );
  const [error, setError] = useState('');

  const choose = (next: Choice) => {
    setChoice(next);
    setError('');
    if (next !== 'custom' && !saveTimeZonePreference(next))
      setError('The timezone preference could not be saved on this device.');
  };

  const saveNamedZone = () => {
    if (saveTimeZonePreference(namedZone.trim())) {
      setError('');
    } else {
      setError('Enter a valid IANA timezone, such as Asia/Kolkata.');
    }
  };

  return (
    <section aria-labelledby="display-timezone-heading" className="grid max-w-lg gap-3">
      <div>
        <h2 id="display-timezone-heading" className={textRole('objectTitle')}>
          Display timezone
        </h2>
        <p className="text-muted text-sm">Timestamps currently display in {displayZone}.</p>
      </div>
      <Select
        value={choice}
        onValueChange={choose}
        options={CHOICES}
        ariaLabel="Display timezone preference"
      />
      {choice === 'custom' ? (
        <div className="grid gap-2">
          <label htmlFor="named-display-timezone" className={textRole('label')}>
            IANA timezone
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="named-display-timezone"
              value={namedZone}
              onChange={(event) => setNamedZone(event.target.value)}
              placeholder="Asia/Kolkata"
              className="min-w-56 flex-1"
              aria-invalid={Boolean(error)}
            />
            <Button onClick={saveNamedZone}>Save timezone</Button>
          </div>
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </section>
  );
}
