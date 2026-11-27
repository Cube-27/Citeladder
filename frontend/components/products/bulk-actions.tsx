import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { Text } from '@/components/ui/typography';
import { COMMERCE_TARGETS_MAX } from '@citeladder/contracts/commerce-suite';
import { X } from '@/lib/icons';
import { humanizeApiError } from '@/lib/api/errors';
import { Section } from '@/components/ui/section';

export function BulkActions({
  count,
  pending,
  error,
  onDiscover,
  onClear,
}: Readonly<{
  count: number;
  pending: boolean;
  error: unknown;
  onDiscover: () => void;
  onClear: () => void;
}>) {
  const noun = count === 1 ? 'product' : 'products';
  const tooMany = count > COMMERCE_TARGETS_MAX;
  const hint = tooMany ? `Up to ${COMMERCE_TARGETS_MAX} products at a time` : null;
  return (
    <Section>
      <Inline gap="compact" wrap justify="between">
        <Stack gap="tight">
          <Text variant="body" aria-live="polite">
            {count ? `${count} ${noun} selected` : 'No products selected'}
          </Text>
          {hint ? <Text variant="caption">{hint}</Text> : null}
          {error ? (
            <Text role="alert" variant="caption" tone="negative">
              {humanizeApiError(error, 'Competitor discovery could not start.').message}
            </Text>
          ) : null}
        </Stack>
        <Inline wrap>
          <Button
            variant="secondary"
            disabled={!count || tooMany}
            pending={pending}
            pendingLabel="Finding…"
            onClick={onDiscover}
          >
            Find competitors
          </Button>
          <Button variant="quiet" disabled={pending} onClick={onClear}>
            <Icon icon={X} />
            Clear selection
          </Button>
        </Inline>
      </Inline>
    </Section>
  );
}
