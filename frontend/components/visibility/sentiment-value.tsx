import type { NetSentiment, WebSearchShare } from '@citeladder/contracts';

import { Absence } from '@/components/ui/absence';
import { textRole } from '@/components/ui/typography';
import { formatRate, measured } from '@/lib/visibility/dashboard';
import { sentimentReading } from '@/lib/visibility/perception';

/**
 * A net sentiment cell: the signed value with a faint classified count, or
 * "Too few" below the minimum, which never reads as a zero.
 */
export function SentimentValue({
  sentiment,
  tooFew = 'Too few classified',
  showCount = true,
}: Readonly<{ sentiment: NetSentiment | null | undefined; tooFew?: string; showCount?: boolean }>) {
  const reading = sentimentReading(sentiment);
  switch (reading.kind) {
    case 'none':
      return <Absence state={sentiment ? 'none' : 'not_measured'} />;
    case 'too_few':
      return (
        <Absence
          state="unavailable"
          label={tooFew}
          reason={`Shows from ${reading.minimum} classified mentions; ${reading.classified} so far.`}
        />
      );
    case 'value':
      return (
        <span className="whitespace-nowrap">
          {reading.net}
          {showCount ? (
            <span className={textRole('caption')}> · {reading.classified} classified</span>
          ) : null}
        </span>
      );
    default: {
      const _exhaustive: never = reading;
      return _exhaustive;
    }
  }
}

/** The share of answers that searched, among engines that report search use. */
export function WebSearchValue({ value }: Readonly<{ value: WebSearchShare | undefined }>) {
  if (!value) return <Absence />;
  const share = measured(formatRate(value.share));
  if (value.share === null || share === null)
    return (
      <Absence
        state="unavailable"
        label="Not available"
        reason="The engines that answered this prompt don't report whether they searched."
      />
    );
  return <>{share}</>;
}
