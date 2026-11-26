import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { Text } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import { Zap } from '@/lib/icons';
import type { DemandSnapshot } from '@/lib/api/demand';
import { isActionableGap, numericMetric } from '@/lib/demand/signals';
import { formatCount } from '@/lib/format';

export function DemandLatentDemand({ snapshot }: Readonly<{ snapshot: DemandSnapshot }>) {
  const observed = snapshot.signals
    .filter(isActionableGap)
    .map((signal) => numericMetric(signal, 'impressions'));
  const known = observed.filter((value): value is number => value !== null);
  const partial = known.length > 0 && known.length < observed.length;
  return (
    <Inline as="span" gap="tight">
      <Icon icon={Zap} />
      {observed.length > 0 && known.length === 0 ? (
        <>
          <Text variant="caption">
            <Absence state="not_measured" />
          </Text>
          <Text variant="caption">{' latent demand'}</Text>
        </>
      ) : (
        <>
          <Text variant="caption" tone="ink" numeric>
            {formatCount(known.reduce((sum, value) => sum + value, 0))}
          </Text>
          {partial ? (
            <>
              <Text variant="caption">{' impressions on '}</Text>
              <Text variant="caption" numeric>
                {formatCount(known.length)}
              </Text>
              <Text variant="caption">{' of '}</Text>
              <Text variant="caption" numeric>
                {formatCount(observed.length)}
              </Text>
              <Text variant="caption">{' non-branded signals'}</Text>
            </>
          ) : (
            <Text variant="caption">{' impressions on non-branded signals'}</Text>
          )}
        </>
      )}
    </Inline>
  );
}
