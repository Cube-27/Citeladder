import { Stack } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { Text } from '@/components/ui/typography';
import { movementLegLabel, movementStateLabel } from '@/lib/agent/vocabulary';

type VerificationResult = Record<string, unknown>;

export function VerificationObservations({
  implementation,
  showAuditLink,
}: Readonly<{
  implementation: { verification_events?: Array<{ result: Record<string, unknown> }> } | undefined;
  showAuditLink: boolean;
}>) {
  const result = implementation?.verification_events?.at(-1)?.result;
  if (!result) return null;
  return (
    <Stack>
      <ComparableMovement result={result} />
      <GapChanges result={result} />
      {showAuditLink ? (
        <TextLink text="caption" box="fit" href="/runs">
          Run a comparable audit
        </TextLink>
      ) : null}
    </Stack>
  );
}

function ComparableMovement({ result }: Readonly<{ result: VerificationResult | undefined }>) {
  const legs = result?.legs;
  if (!legs || typeof legs !== 'object') return null;
  const entries = Object.entries(legs).flatMap(([name, leg]) => {
    const label = movementLegLabel(name);
    return label ? [[label, leg] as const] : [];
  });
  if (!entries.length) return null;
  return (
    <Stack gap="tight">
      <Text as="p" variant="body" tone="ink-2">
        Comparable movement
      </Text>
      {entries.map(([label, leg]) => (
        <Text as="p" variant="caption" key={label}>
          {label}: {movementStateLabel(legState(leg))}
        </Text>
      ))}
    </Stack>
  );
}

function GapChanges({ result }: Readonly<{ result: VerificationResult | undefined }>) {
  const changes = result?.gap_changes;
  if (!changes || typeof changes !== 'object' || !('state' in changes)) return null;
  if (changes.state === 'not_run')
    return (
      <Text as="p" variant="caption">
        Gap comparison: no reading yet
      </Text>
    );
  if (changes.state !== 'available')
    return (
      <Text as="p" variant="caption">
        Gap comparison: not available
      </Text>
    );
  const lists = new Map(Object.entries(changes));
  const count = (key: string) => {
    const value = lists.get(key);
    return Array.isArray(value) ? value.length : 0;
  };
  return (
    <Text as="p" variant="caption">
      Gaps: {count('no_longer_observed')} no longer observed · {count('persistent')} persistent ·{' '}
      {count('new')} new
    </Text>
  );
}

function legState(value: unknown): string {
  if (!value || typeof value !== 'object' || !('state' in value)) return 'unrecognized';
  return String(value.state);
}
