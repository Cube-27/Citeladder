import type { Metadata } from 'next';

import { Compositions } from '@/components/marketing/landing/compositions';
import { EngineBand } from '@/components/marketing/landing/engine-band';
import { Evidence } from '@/components/marketing/landing/evidence';
import { FinalCta } from '@/components/marketing/landing/final-cta';
import { Hero } from '@/components/marketing/landing/hero';
import { HowItWorks } from '@/components/marketing/landing/how-it-works';
import { Platform } from '@/components/marketing/landing/platform';
import { Shift } from '@/components/marketing/landing/shift';
import { Stance } from '@/components/marketing/landing/stance';
import { LandingSessionRedirect } from '@/components/marketing/landing-session-redirect';

const DESCRIPTION =
  'Searchify observes how the major answer engines describe your brand, products and ' +
  'competitors, traces every conclusion back to the answer it came from, and turns the ' +
  'pattern into strategy. Runs on your own provider keys, encrypted at rest.';

// OG images require an absolute URL; they are added with NEXT_PUBLIC_SITE_URL (lib/seo/site.ts).
export const metadata: Metadata = {
  // Absolute title: the root template must not append to the landing title.
  title: { absolute: 'Searchify — See your market through AI’s eyes' },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Searchify — See your market through AI’s eyes',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'Searchify',
  },
  twitter: {
    card: 'summary',
    title: 'Searchify — See your market through AI’s eyes',
    description: DESCRIPTION,
  },
};

/**
 * Public marketing landing page (`/`) on the Proof surface. Server-rendered so
 * the full page is in the initial HTML (SEO + first paint); the only client
 * island the page renders is the invisible LandingSessionRedirect, which
 * forwards signed-in visitors to their dashboard (`/projects`) or to
 * first-run `/onboarding` — the contract `/` had before this page existed.
 *
 * Chapter order follows the deck: the observation field, then who we ask,
 * then the north star, the method, the product, its evidence, the stance
 * behind it, the compositions, and the close. Shared chrome (nav + footer)
 * lives in the (marketing) route-group layout.
 *
 * Must stay a SYNC component (no async / headers() / cookies()) so the page
 * test can render it directly under Testing Library.
 */
export default function LandingPage() {
  return (
    <LandingSessionRedirect>
      <main>
        <Hero />
        <Platform />
        <EngineBand />
        <Shift />
        <HowItWorks />
        <Evidence />
        <Stance />
        <Compositions />
        <FinalCta />
      </main>
    </LandingSessionRedirect>
  );
}
