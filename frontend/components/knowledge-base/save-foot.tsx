import { Save } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SectionFoot } from '@/components/ui/section';
import { Tooltip } from '@/components/ui/tooltip';

const NO_CHANGES = 'No changes to save';

/**
 * A Context form card's foot: its Save, right-aligned 24 below the form, the
 * view's one primary. With nothing changed it is `aria-disabled` rather than
 * disabled, so it stays focusable and its reason reaches a tooltip and
 * `aria-describedby`. `label` names what it saves.
 */
export function SaveFoot({
  label,
  changed,
  saving,
  onSave,
}: Readonly<{ label: string; changed: boolean; saving: boolean; onSave: () => void }>) {
  const reasonId = useId();
  const idle = !changed && !saving;
  return (
    <SectionFoot>
      {idle ? (
        <>
          <Tooltip content={NO_CHANGES} describe={false}>
            <Button
              variant="primary"
              aria-disabled="true"
              aria-describedby={reasonId}
              aria-label={label}
            >
              <Icon icon={Save} />
              Save
            </Button>
          </Tooltip>
          <span id={reasonId} hidden>
            {NO_CHANGES}
          </span>
        </>
      ) : (
        <Button
          variant="primary"
          onClick={onSave}
          disabled={saving}
          pending={saving}
          pendingLabel="Saving…"
          aria-label={label}
        >
          <Icon icon={Save} />
          Save
        </Button>
      )}
    </SectionFoot>
  );
}
