import { Inline } from '@/components/ui/layout';
import { Absence } from '@/components/ui/absence';
import { SectionBleed } from '@/components/ui/section';
import { StatusMark } from '@/components/ui/status-mark';
import { ClampText } from '@/components/ui/clamp-text';
import { formatCount } from '@/lib/format';
import type { RootError } from '@citeladder/contracts';
import { Text } from '@/components/ui/typography';

export function RootErrorsBlock({ errors }: Readonly<{ errors: RootError[] }>) {
  if (errors.length === 0) return null;
  const keyOccurrences = new Map<string, number>();
  return (
    <>
      <Text as="p" variant="body" tone="ink-2">
        The start URL could not be fetched.
      </Text>
      <SectionBleed as="ul" rows data-testid="root-errors-block">
        {errors.map((error) => {
          const signature = JSON.stringify([
            error.method,
            error.target,
            error.outcome,
            error.error_code,
            error.status_code,
            error.latency_ms,
          ]);
          const occurrence = keyOccurrences.get(signature) ?? 0;
          keyOccurrences.set(signature, occurrence + 1);
          return (
            <Inline
              as="li"
              gap="meta"
              key={`${signature}:${occurrence}`}
              data-testid="root-error-row"
            >
              <Text variant="code">{error.method}</Text>
              <ClampText text="body" tone="ink-2" className="flex-1">
                {error.target}
              </ClampText>
              {error.error_code ? (
                <StatusMark tone="negative">{error.error_code}</StatusMark>
              ) : null}
              <Text variant="body" tone="ink-2" numeric>
                {error.status_code !== null ? (
                  `HTTP ${error.status_code}`
                ) : (
                  <Absence state="not_measured" />
                )}
              </Text>
              <Text variant="body" tone="ink-2" numeric>
                {error.latency_ms !== null && error.latency_ms > 0 ? (
                  `${formatCount(error.latency_ms)} ms`
                ) : (
                  <Absence state="not_measured" />
                )}
              </Text>
            </Inline>
          );
        })}
      </SectionBleed>
    </>
  );
}
