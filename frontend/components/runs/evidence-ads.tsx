import type { ExecutionAds } from '@citeladder/contracts/visibility-ads';

import { ClampText } from '@/components/ui/clamp-text';
import { Inline, Stack } from '@/components/ui/layout';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import { Text } from '@/components/ui/typography';
import { landingLabel } from '@/lib/visibility/ads';
import { AdOwnershipChip } from '@/components/visibility/ad-ownership-chip';

function adsMessage(ads: ExecutionAds): string | null {
  if (ads.applicability === 'unavailable') return 'Ads were not read for this answer.';
  if (!ads.items.length) return 'No ads were shown with this answer.';
  return null;
}

export function EvidenceAds({ ads }: Readonly<{ ads: ExecutionAds }>) {
  if (ads.applicability === 'not_applicable') return null;
  const message = adsMessage(ads);
  return (
    <Section>
      <SectionHeader>
        <SectionTitle level={3}>Ads in this answer</SectionTitle>
      </SectionHeader>
      {message ? (
        <Text as="p" variant="caption">
          {message}
        </Text>
      ) : (
        <SectionBleed as="ul" rows>
          {ads.items.map((ad) => (
            <Stack as="li" gap="tight" key={ad.rank_absolute}>
              <Inline as="span" wrap>
                <Text variant="label">{ad.title || 'Untitled ad'}</Text>
                <AdOwnershipChip ownership={ad.ownership} />
              </Inline>
              {ad.snippet ? <Text variant="caption">{ad.snippet}</Text> : null}
              <ClampText text="caption">
                Sponsored by {ad.advertiser_name} · {landingLabel(ad.landing_url)}
              </ClampText>
            </Stack>
          ))}
        </SectionBleed>
      )}
    </Section>
  );
}
