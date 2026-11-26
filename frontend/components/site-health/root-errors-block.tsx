import { Inline } from '@/components/ui/layout';
import { Absence } from '@/components/ui/absence';
import { SectionBleed } from '@/components/ui/section';
import { StatusMark } from '@/components/ui/status-mark';
import { ClampText } from '@/components/ui/clamp-text';
import { formatCount } from '@/lib/format';
import type { RootError } from '@citeladder/contracts';
import { textRole } from '@/components/ui/typography';

export function RootErrorsBlock({ errors }: Readonly<{ errors: RootError[] }>) {
  if (errors.length === 0) return null;
  const keyOccurrences = new Map<string, number>();
  return (
    <>
      <p className={textRole('body', 'text-ink-2')}>The start URL could not be fetched.</p>
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
              <span className="text-code text-ink font-mono">{error.method}</span>
              <ClampText className="text-body text-ink-2 flex-1">{error.target}</ClampText>
              {error.error_code ? (
                <StatusMark tone="negative">{error.error_code}</StatusMark>
              ) : null}
              <span className="text-body text-ink-2 tabular-nums">
                {error.status_code !== null ? (
                  `HTTP ${error.status_code}`
                ) : (
                  <Absence state="not_measured" />
                )}
              </span>
              <span className="text-body text-ink-2 tabular-nums">
                {error.latency_ms !== null && error.latency_ms > 0 ? (
                  `${formatCount(error.latency_ms)} ms`
                ) : (
                  <Absence state="not_measured" />
                )}
              </span>
            </Inline>
          );
        })}
      </SectionBleed>
    </>
  );
}
