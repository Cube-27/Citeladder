import type { ExecutionAds } from '@citeladder/contracts/visibility-ads';

import { ClampText } from '@/components/ui/clamp-text';
import { Inline, Stack } from '@/components/ui/layout';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import { textRole } from '@/components/ui/typography';
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
        <p className="text-caption text-ink-2">{message}</p>
      ) : (
        <SectionBleed as="ul" rows>
          {ads.items.map((ad) => (
            <Stack as="li" gap="tight" key={ad.rank_absolute}>
              <Inline as="span" className="flex-wrap">
                <span className={textRole('emphasis')}>{ad.title || 'Untitled ad'}</span>
                <AdOwnershipChip ownership={ad.ownership} />
              </Inline>
              {ad.snippet ? <span className="text-caption text-ink-2">{ad.snippet}</span> : null}
              <ClampText className="text-caption text-ink-2">
                Sponsored by {ad.advertiser_name} · {landingLabel(ad.landing_url)}
              </ClampText>
            </Stack>
          ))}
        </SectionBleed>
      )}
    </Section>
  );
}
