import type { Metadata } from 'next';

import { FinalCta } from '@/components/marketing/landing/final-cta';
import { Hero } from '@/components/marketing/landing/hero';
import { Packs } from '@/components/marketing/landing/packs';
import { SeeIt } from '@/components/marketing/landing/see-it';
import { Shift } from '@/components/marketing/landing/shift';
import { Trust } from '@/components/marketing/landing/trust';
import { Workflow } from '@/components/marketing/landing/workflow';
import { LandingSessionRedirect } from '@/components/marketing/landing-session-redirect';

const DESCRIPTION =
  'AI visibility software that records how ChatGPT, Gemini, and Claude describe your brand, then opens every score to the persisted answer. Runs on your provider keys.';

// OG images require an absolute URL; they are added with NEXT_PUBLIC_SITE_URL (lib/seo/site.ts).
export const metadata: Metadata = {
  // Absolute title: the root template must not append to the landing title.
  title: { absolute: 'AI visibility software for ChatGPT and Gemini | CiteLadder' },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: 'AI visibility software for ChatGPT and Gemini | CiteLadder',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'CiteLadder',
  },
  twitter: {
    card: 'summary',
    title: 'AI visibility software for ChatGPT and Gemini | CiteLadder',
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
 * Seven beats, in order: the hook (Hero), why growth changed (Shift), the
 * product itself (SeeIt), how the loop runs (Workflow), who it is shaped for
 * (Packs), the data promise (Trust), and the close (FinalCta). Shared chrome
 * (nav + footer) lives in the (marketing) route-group layout.
 *
 * Section tones are owned by the section components, not here. `Section` sets
 * the rule that no two adjacent bands share a tone, so reordering these beats
 * means re-checking the tone run, not just the two sections that moved.
 *
 * Must stay a SYNC component (no async / headers() / cookies()) so the page
 * test can render it directly under Testing Library.
 */
export default function LandingPage() {
  return (
    <LandingSessionRedirect>
      <main id="main">
        <Hero />
        <Shift />
        <SeeIt />
        <Workflow />
        <Packs />
        <Trust />
        <FinalCta />
      </main>
    </LandingSessionRedirect>
  );
}
