import { Info } from 'lucide-react';

import { InfoHint } from '@/components/ui/info-hint';
import { Spinner } from '@/components/ui/spinner';
import { ClampText } from '@/components/ui/clamp-text';
import { ICONS } from '@/lib/icons';
import { cn } from '@/lib/utils';

type StatusTone = 'info' | 'warning' | 'danger' | 'neutral';

/** One thing the screen has to say, most important first in the list. */
export type StatusMessage = Readonly<{
  key: string;
  tone: StatusTone;
  text: string;
  /** Work in flight: a spinner instead of the tone icon. */
  busy?: boolean;
}>;

/** The glyph's ink and the word a screen reader hears first; the sentence stays in ink. */
const TONE_MARK: Record<StatusTone, { ink: string; word: string | null }> = {
  info: { ink: 'text-info', word: 'Note' },
  warning: { ink: 'text-warning', word: 'Warning' },
  danger: { ink: 'text-negative', word: 'Error' },
  neutral: { ink: 'text-ink-2', word: null },
};

const TONE_ICON = {
  info: Info,
  warning: ICONS.warning,
  danger: ICONS.danger,
  neutral: Info,
} as const;

/**
 * A screen's notices in ONE line that is always there.
 *
 * Banners that appear above content (a sync starting, a range still being
 * built, a coverage caveat) push the content down the moment they arrive and
 * pull it back up when they clear. This line keeps one control-height
 * footprint in every state: it shows the most important message, says how
 * many more there are behind a hint, and at rest shows the `resting` fact.
 * Long text is cut on one line, the full sentence in a tooltip reachable by keyboard.
 * Like a StatusMark, the tone is its glyph and word, never the sentence's
 * colour; work in flight is the live rung.
 */
export function StatusLine({
  messages,
  resting,
  testId,
}: Readonly<{
  messages: readonly StatusMessage[];
  /** Null keeps the line's height with nothing in it. */
  resting: string | null;
  testId?: string;
}>) {
  const [first, ...rest] = messages;
  const tone = first?.tone ?? 'neutral';
  const text = first?.text ?? resting;
  const ToneIcon = TONE_ICON[tone];
  const mark = TONE_MARK[tone];
  if (!text) return <output data-testid={testId} className="h-[var(--control-md)]" />;
  return (
    <output
      data-testid={testId}
      data-status-tone={tone}
      className="type-body text-ink flex min-h-[var(--control-md)] min-w-0 items-center gap-2"
    >
      {first?.busy ? (
        <Spinner />
      ) : (
        <ToneIcon className={cn('size-4 shrink-0', mark.ink)} aria-hidden />
      )}
      <ClampText className="min-w-0" tooltip={text}>
        {first && mark.word ? <span className="sr-only">{`${mark.word}: `}</span> : null}
        {text}
      </ClampText>
      {rest.length ? (
        <InfoHint label={`${rest.length} more ${rest.length === 1 ? 'notice' : 'notices'}`}>
          {rest.map((message) => message.text).join(' ')}
        </InfoHint>
      ) : null}
    </output>
  );
}
