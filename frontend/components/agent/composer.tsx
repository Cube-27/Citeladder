import { ArrowUp, RotateCcw, Square } from 'lucide-react';

import { IconButton } from '@/components/ui/button';
import { ComposerFrame, PastedTextChip, RemovableChip } from '@/components/ui/chat-dock';
import type { ContextChip } from '@/lib/agent/handoff';
import { AGENT_COMPOSER_MAX_ROWS } from '@/lib/config/agent';

import { CommandField } from './command-menu';
import { ComposerMenu } from './composer-menu';
import type { SkillChoice } from './skill-picker';
import type { ComposerState } from './use-composer-commands';

/**
 * The message box every Agent surface shares. Enter sends, Shift+Enter adds a
 * line. Context chips show the typed references the turn will carry; optional
 * ones can be removed before sending. The + menu sets the skill or opens an
 * Action; typing `/` at a word start opens it on the skills and `@` lists
 * Actions to mention (arrows move, Enter or Tab picks, Escape closes).
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
  skill,
  commands,
  onStop,
  stopping = false,
  onRetry,
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
  /** The skill the turn will run, picked or continued: a chip after the Action, and the menu's Skills. */
  skill: SkillChoice;
  commands: ComposerState;
  /** While a turn runs, the send button stops it instead. */
  onStop?: () => void;
  stopping?: boolean;
  /** The last send failed: Retry replaces Send until it succeeds or the person types. */
  onRetry?: () => void;
}>) {
  const canSend = !disabled && !submissionDisabled && !pending && value.trim().length > 0;
  const menuDisabled = disabled || submissionDisabled;
  return (
    <ComposerFrame
      onSubmit={() => {
        if (canSend) onSubmit();
      }}
      chipsLabel="Context for this request"
      chips={composerChips({ lead: [attachment, skill.chip], chips, onRemoveChip, commands })}
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
            // While the menu cannot open, a typed `/` stays text instead of waiting to open it.
            commands={menuDisabled ? { ...commands, openSkillPicker: undefined } : commands}
            disabled={disabled}
            placeholder={placeholder}
            maxRows={AGENT_COMPOSER_MAX_ROWS}
          />
        </>
      }
      tools={
        <ComposerMenu
          menu={commands.menu}
          scope={commands.scope}
          skill={skill}
          disabled={menuDisabled}
        />
      }
      submit={
        <SubmitControl
          status={composerStatus({ pending, onStop, onRetry })}
          canSend={canSend}
          disabled={disabled}
          stopping={stopping}
          onStop={onStop}
          onRetry={onRetry}
        />
      }
    />
  );
}

/**
 * The composer's four statuses (brand direction 3.2 Composer): `ready` sends,
 * `submitted` is sending, `streaming` is a running turn that Stop ends, and
 * `error` is a failed send that Retry sends again.
 */
export type ComposerStatus = 'ready' | 'submitted' | 'streaming' | 'error';

function composerStatus({
  pending,
  onStop,
  onRetry,
}: Readonly<{ pending: boolean; onStop?: () => void; onRetry?: () => void }>): ComposerStatus {
  if (onStop) return 'streaming';
  if (pending) return 'submitted';
  return onRetry ? 'error' : 'ready';
}

/** One control in one box per status, so the control row never reflows. */
function SubmitControl({
  status,
  canSend,
  disabled,
  stopping,
  onStop,
  onRetry,
}: Readonly<{
  status: ComposerStatus;
  canSend: boolean;
  disabled: boolean;
  stopping: boolean;
  onStop?: () => void;
  onRetry?: () => void;
}>) {
  switch (status) {
    case 'streaming':
      return (
        <IconButton
          type="button"
          variant="secondary"
          icon={Square}
          label="Stop"
          pending={stopping}
          pendingLabel="Stopping…"
          onClick={onStop}
        />
      );
    case 'error':
      return (
        <IconButton
          type="button"
          variant="primary"
          icon={RotateCcw}
          label="Retry send"
          disabled={disabled}
          onClick={onRetry}
        />
      );
    case 'submitted':
    case 'ready':
      return (
        <IconButton
          type="submit"
          variant="primary"
          icon={ArrowUp}
          label="Send"
          disabled={!canSend}
          pending={status === 'submitted'}
          pendingLabel="Sending…"
        />
      );
    default: {
      const unknown: never = status;
      return unknown;
    }
  }
}

type LeadChip = Readonly<{ label: string; onRemove: () => void }> | undefined;

/** The chip row: the Action and skill first, then context, mentions and pastes; null when empty. */
function composerChips({
  lead,
  chips,
  onRemoveChip,
  commands,
}: Readonly<{
  lead: readonly LeadChip[];
  chips: ContextChip[];
  onRemoveChip?: (chip: ContextChip) => void;
  commands: ComposerState;
}>) {
  const leading = lead.filter((chip) => chip !== undefined);
  const { mentions, pastes } = commands;
  if (leading.length + chips.length + mentions.length + pastes.items.length === 0) return null;
  return (
    <>
      {leading.map((chip) => (
        <RemovableChip key={chip.label} label={chip.label} onRemove={chip.onRemove} />
      ))}
      {chips.map((chip) => (
        <RemovableChip
          key={chip.key}
          label={chip.label}
          onRemove={onRemoveChip ? () => onRemoveChip(chip) : undefined}
        />
      ))}
      {mentions.map((mention) => (
        <RemovableChip
          key={mention.id}
          label={`@${mention.label}`}
          onRemove={() => commands.onRemoveMention(mention.id)}
        />
      ))}
      {pastes.items.map((paste) => (
        <PastedTextChip
          key={paste.key}
          text={paste.text}
          onRemove={() => pastes.remove(paste.key)}
        />
      ))}
    </>
  );
}
