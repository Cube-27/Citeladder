import { ArrowRight } from 'lucide-react';

import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Section, SectionHeader } from '../primitives/section';

/**
 * The public trial's published limits. These restate the trial answer in
 * `lib/marketing-content/faq.ts` ("What is included in the current public
 * trial?"); change both together.
 */
const TRIAL_LIMITS = [
  { label: 'Length', value: '7 days' },
  { label: 'Engine', value: 'ChatGPT only' },
  { label: 'Projects', value: '1' },
  { label: 'Prompts', value: '20' },
  { label: 'Monitored URLs', value: '20' },
  { label: 'Successful answers', value: '20, one per prompt' },
] as const;

const TRIAL_EXCLUSIONS = 'Agent access and AI credits are not included.';

function TrialLimits() {
  return (
    <dl className="cm-trial-limits">
      {TRIAL_LIMITS.map((limit) => (
        <div key={limit.label}>
          <dt>{limit.label}</dt>
          <dd>{limit.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TrialButton({ appOrigin, primary }: Readonly<{ appOrigin: string; primary: boolean }>) {
  return (
    <ButtonLink
      href={new URL('/register', appOrigin).toString()}
      variant={primary ? 'primary' : 'soft'}
      size="marketing"
    >
      <span>Start free trial</span>
      <ArrowRight aria-hidden />
    </ButtonLink>
  );
}

/**
 * How to start, given the two independent switches: whether the catalog has
 * open self-serve checkout, and whether the build allows self-serve sign-up.
 *
 * - Checkout open, sign-up open: a compact trial row beneath the plan cards.
 * - Checkout open, sign-up closed: nothing; the plan cards are the way in.
 * - Checkout closed, sign-up open: the trial is the page's main offer.
 * - Checkout closed, sign-up closed: early access by enquiry.
 *
 * No price is shown in either closed state.
 */
export function PricingTrial({
  appOrigin,
  checkoutOpen,
}: Readonly<{ appOrigin: string; checkoutOpen: boolean }>) {
  const signupOpen = selfServeSignupOpen();

  if (checkoutOpen) {
    if (!signupOpen) return null;
    return (
      <div className="cm-trial-row">
        <div className="cm-trial-row-copy">
          <h3 className="website-small-heading text-foreground">Try it first</h3>
          <p className="website-body text-muted">
            A seven-day trial on ChatGPT answers. {TRIAL_EXCLUSIONS}
          </p>
        </div>
        <TrialLimits />
        <TrialButton appOrigin={appOrigin} primary={false} />
      </div>
    );
  }

  if (!signupOpen) {
    return (
      <Section tone="paper" rhythm="tight" className="pt-0" aria-label="Early access">
        <div className="cm-access">
          <SectionHeader
            title="Paid plans are not open for self-serve checkout."
            lead="Contact us to discuss early access and the volume your team needs."
            size="h3"
          />
          <div className="cm-access-action">
            <DemoButtonLink variant="primary" size="marketing">
              <span>Request early access</span>
              <ArrowRight aria-hidden />
            </DemoButtonLink>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section tone="paper" rhythm="tight" className="pt-0" aria-label="Free trial">
      <div className="cm-access">
        <div className="cm-access-copy">
          <SectionHeader
            title="Start with a seven-day trial."
            lead="See how ChatGPT answers your buyers’ questions before you commit. Paid checkout is not open; contact us to continue after the trial."
            size="h3"
          />
          <p className="website-body text-muted">{TRIAL_EXCLUSIONS}</p>
          <TrialButton appOrigin={appOrigin} primary />
        </div>
        <TrialLimits />
      </div>
    </Section>
  );
}
