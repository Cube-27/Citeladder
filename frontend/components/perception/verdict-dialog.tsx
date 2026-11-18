import {
  overrideVerdictSchema,
  type AccuracyClaim,
  type OverrideVerdict,
} from '@citeladder/contracts/fact-checking';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { RadioGroup } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { humanizeApiError } from '@/lib/api/errors';
import type { useFactViews } from '@/lib/visibility/use-accuracy';
import { VERDICT_LABELS } from '@/lib/visibility/accuracy';

type Override = ReturnType<typeof useFactViews>['override'];

const OPTIONS = overrideVerdictSchema.options.map((value) => ({
  value,
  label: VERDICT_LABELS[value],
}));

/** The verdict to preselect: the claim's own when a person may give it, else the first. */
function initialVerdict(claim: AccuracyClaim): OverrideVerdict {
  const current = overrideVerdictSchema.safeParse(claim.verdict);
  return current.success ? current.data : 'supported';
}

/**
 * Change one claim's verdict (AV-12). The change is appended beside the
 * model's verdict, which stays on record; accuracy counts the person's.
 */
export function VerdictDialog({
  claim,
  override,
  onClose,
}: Readonly<{ claim: AccuracyClaim; override: Override; onClose: () => void }>) {
  const { notify } = useToast();
  const [verdict, setVerdict] = useState(() => initialVerdict(claim));
  const [note, setNote] = useState('');
  const unchanged = verdict === claim.verdict;
  const save = () => {
    if (!claim.verdict_id || unchanged) return;
    override.mutate(
      { verdictId: claim.verdict_id, input: { verdict, note: note.trim() || null } },
      {
        onSuccess: () => {
          notify('Verdict changed', `Accuracy now counts it as ${VERDICT_LABELS[verdict]}.`);
          onClose();
        },
      },
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Change verdict"
      description={`“${claim.quote}”. The model's verdict stays on record beside yours.`}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            pending={override.isPending}
            disabled={unchanged}
            onClick={save}
          >
            Save verdict
          </Button>
        </>
      }
    >
      <Stack gap="workspace">
        {override.isError ? (
          <Notice tone="negative">{humanizeApiError(override.error).message}</Notice>
        ) : null}
        <RadioGroup
          ariaLabel="Verdict"
          variant="inline"
          value={verdict}
          onValueChange={setVerdict}
          options={OPTIONS}
        />
        <Field label="Note" hint="Optional. Why the verdict changed.">
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
      </Stack>
    </Dialog>
  );
}
