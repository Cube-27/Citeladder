import { ArrowUp, Square } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconButton } from '@/components/ui/button';
import { ComposerFrame, PastedTextChip, RemovableChip } from '@/components/ui/chat-dock';
import type { ContextChip } from '@/lib/agent/handoff';
import { AGENT_COMPOSER_MAX_ROWS } from '@/lib/config/agent';

import { CommandField, type ComposerCommands } from './command-menu';

/**
 * The message box every Agent surface shares. Enter sends, Shift+Enter adds a
 * line. Context chips show the typed references the turn will carry; optional
 * ones can be removed before sending. With `commands`, typing `/` or `@` at a
 * word start opens a menu (arrows move, Enter or Tab picks, Escape closes).
 */
export function Composer({
  id,
  label,
  value,
  onChange,
  onSubmit,
  pending,
  disabled,
  submissionDisabled = false,
  placeholder,
  chips = [],
  onRemoveChip,
  attachment,
  tools,
  commands,
  onStop,
  stopping = false,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  disabled: boolean;
  /** An accepted run blocks another send while the user may keep drafting. */
  submissionDisabled?: boolean;
  placeholder: string;
  chips?: ContextChip[];
  onRemoveChip?: (chip: ContextChip) => void;
  /** The Action the chat is about, first among the chips: one removable line. */
  attachment?: Readonly<{ label: string; onRemove: () => void }>;
  tools?: ReactNode;
  commands?: ComposerCommands;
  /** While a turn runs, the send button stops it instead. */
  onStop?: () => void;
  stopping?: boolean;
}>) {
  const canSend = !disabled && !submissionDisabled && !pending && value.trim().length > 0;
  const pastes = commands?.pastes;
  const hasChips =
    attachment !== undefined ||
    chips.length > 0 ||
    (commands?.mentions.length ?? 0) > 0 ||
    (pastes?.items.length ?? 0) > 0;
  return (
    <ComposerFrame
      onSubmit={() => {
        if (canSend) onSubmit();
      }}
      chipsLabel="Context for this request"
      chips={
        hasChips ? (
          <>
            {attachment ? (
              <RemovableChip label={attachment.label} onRemove={attachment.onRemove} />
            ) : null}
            {chips.map((chip) => (
              <RemovableChip
                key={chip.key}
                label={chip.label}
                onRemove={onRemoveChip ? () => onRemoveChip(chip) : undefined}
              />
            ))}
            {commands?.mentions.map((mention) => (
              <RemovableChip
                key={mention.id}
                label={`@${mention.label}`}
                onRemove={() => commands.onRemoveMention(mention.id)}
              />
            ))}
            {pastes?.items.map((paste) => (
              <PastedTextChip
                key={paste.key}
                text={paste.text}
                onRemove={() => pastes.remove(paste.key)}
              />
            ))}
          </>
        ) : null
      }
      field={
        <>
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <CommandField
            id={id}
            value={value}
            onChange={onChange}
            onEnter={() => {
              if (canSend) onSubmit();
            }}
            commands={commands}
            disabled={disabled}
            placeholder={placeholder}
            maxRows={AGENT_COMPOSER_MAX_ROWS}
          />
        </>
      }
      tools={tools}
      submit={
        onStop ? (
          // Pending keeps each button's box, so the control row never reflows.
          <IconButton
            type="button"
            variant="secondary"
            icon={Square}
            label="Stop"
            pending={stopping}
            pendingLabel="Stopping…"
            onClick={onStop}
          />
        ) : (
          <IconButton
            type="submit"
            variant="primary"
            icon={ArrowUp}
            label="Send"
            disabled={!canSend}
            pending={pending}
            pendingLabel="Sending…"
          />
        )
      }
    />
  );
}
