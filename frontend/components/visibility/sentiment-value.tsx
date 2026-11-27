import type { NetSentiment } from '@citeladder/contracts';

import { Absence } from '@/components/ui/absence';
import { Text } from '@/components/ui/typography';
import { availabilityLabel } from '@/lib/format';
import { NOT_NAMED, sentimentReading } from '@/lib/visibility/perception';

export function SentimentValue({
  sentiment,
  tooFew = `${availabilityLabel('too_few')} classified`,
  showCount = true,
}: Readonly<{ sentiment: NetSentiment | null | undefined; tooFew?: string; showCount?: boolean }>) {
  const reading = sentimentReading(sentiment);
  switch (reading.kind) {
    case 'not_measured':
      return <Absence />;
    case 'no_mentions':
      return <Absence state="none" label={NOT_NAMED} reason="No answer named this brand." />;
    case 'too_few':
      return (
        <Absence
          state="too_few"
          label={tooFew}
          reason={`Shows from ${reading.minimum} classified mentions; ${reading.classified} so far.`}
        />
      );
    case 'value':
      return (
        <span className="whitespace-nowrap">
          {reading.net}
          {showCount ? <Text variant="caption"> · {reading.classified} classified</Text> : null}
        </span>
      );
    default: {
      const _exhaustive: never = reading;
      return _exhaustive;
    }
  }
}
