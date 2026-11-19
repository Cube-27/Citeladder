import { useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import type {
  BillingCatalog,
  CatalogAddon,
  CatalogPlan,
  CatalogTopup,
  CredentialMode,
} from '@/lib/api/billing';
import type { HeadlinePrice } from '@/lib/billing/catalog';
import {
  checkoutSelection,
  comparisonRows,
  formatMoney,
  headlinePrice,
  isPurchasable,
  selfServeCheckoutComingSoon,
} from '@/lib/billing/catalog';
import { publicPricingSelectionHref } from '@/lib/billing/public-pricing-selection';
import { CONTACT_SALES_HREF } from '@/lib/config/billing';
import { contactSalesHref } from '@/lib/config/contact';
import type { PublicTrial } from '@/lib/config/public-trial';
import { countWord } from '@/lib/marketing-content/count-words';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { formatCount } from '@/lib/format';
import {
  BYOK_DISCLOSURE,
  BYOK_OFF_ANNOUNCEMENT,
  BYOK_ON_ANNOUNCEMENT,
  BYOK_SWITCH_LABEL,
  PLAN_PRESENTATION,
  capabilityLabel,
  type PlanPresentation,
} from '@/lib/marketing-content/pricing';
import { ownValue } from '@/lib/utils';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHighlight } from '../sections/page-highlight';
import { PageSection } from '../sections/page-section';
import { PagePlans, PricingCard, PricingTable, type PlanCell } from '../sections/pricing';

/**
 * The pricing page's client island. Every amount, limit and availability
 * comes from `GET /billing/catalog`; this module only lays it out.
 */

/**
 * INR prices are published exclusive of GST, which the server quote adds for
 * the buyer's state. Other currencies are charged as shown.
 */
function taxNote(currency: BillingCatalog['currency']): string {
  return currency === 'INR' ? 'excl. GST' : 'taxes confirmed at checkout';
}

function priceLabel(price: HeadlinePrice, minorUnits: number): string {
  if (price.kind === 'price') return formatMoney(price.money, minorUnits);
  return price.kind === 'contact' ? 'Contact sales' : 'Not yet priced';
}

/**
 * The headline limits a plan card lists, in reading order. Values come from
 * the plan's published capabilities; a capability the plan does not publish
 * (or publishes as off) is simply not listed — the comparison table below
 * carries the full grid.
 */
const CARD_CAPABILITIES = [
  'project_slots',
  'prompt_slots',
  'monitored_urls',
  'manual_runs_per_day',
  'agent',
  'ai_credits',
] as const;

function cardFeatures(plan: CatalogPlan): string[] {
  return CARD_CAPABILITIES.flatMap((key): string[] => {
    const value = plan.capabilities.find((capability) => capability.key === key)?.value;
    if (value === undefined || value === null || value === false) return [];
    const label = capabilityLabel(key);
    if (value === true) return [label];
    return [`${label}: ${typeof value === 'number' ? formatCount(value) : value}`];
  });
}

// Checkout handoffs start a purchase on the app host, which crawlers may not
// fetch; this page is the crawlable pricing URL.
const CHECKOUT_REL = 'nofollow';

function PlanAction({
  plan,
  href,
  highlighted,
}: Readonly<{ plan: CatalogPlan; href: string | null; highlighted: boolean }>) {
  if (href) {
    return (
      <ButtonLink
        href={href}
        rel={CHECKOUT_REL}
        variant={highlighted ? 'primary' : 'soft'}
        size="marketing"
        className="w-full"
      >
        Choose {plan.name}
      </ButtonLink>
    );
  }
  if (plan.contact_only) {
    return (
      <ButtonLink
        href={contactSalesHref(plan.contact_url, CONTACT_SALES_HREF)}
        variant="soft"
        size="marketing"
        className="w-full"
      >
        Contact sales
      </ButtonLink>
    );
  }
  return <p className="cl-body">Checkout unavailable</p>;
}

function PlanCard({
  plan,
  catalog,
  mode,
  appOrigin,
}: Readonly<{
  plan: CatalogPlan;
  catalog: BillingCatalog;
  mode: CredentialMode;
  appOrigin: URL;
}>) {
  const price = headlinePrice(plan, mode);
  const choice = checkoutSelection(plan, mode);
  const presentation = ownValue<PlanPresentation>(PLAN_PRESENTATION, plan.key);
  const highlighted = presentation?.highlighted === true;
  const href = choice.ok
    ? publicPricingSelectionHref(
        { kind: 'checkout', catalog_key: choice.catalog_key, quantity: 1, byok: mode === 'byok' },
        appOrigin,
      )
    : null;
  return (
    <PricingCard
      name={plan.name}
      featured={highlighted}
      description={presentation?.blurb ?? plan.description}
      price={priceLabel(price, catalog.currency_minor_units)}
      priceNote={price.kind === 'price' ? `per month · ${taxNote(catalog.currency)}` : undefined}
      cta={<PlanAction plan={plan} href={href} highlighted={highlighted} />}
      features={cardFeatures(plan)}
    />
  );
}

function ExtraCard({
  entry,
  kind,
  catalog,
  appOrigin,
  byok,
}: Readonly<{
  entry: CatalogAddon | CatalogTopup;
  kind: 'addon' | 'topup';
  catalog: BillingCatalog;
  appOrigin: URL;
  byok: boolean;
}>) {
  const href = isPurchasable(entry)
    ? publicPricingSelectionHref(
        { kind, catalog_key: entry.key, quantity: entry.quantity_min, byok },
        appOrigin,
      )
    : null;
  return (
    <PricingCard
      name={entry.name}
      description={entry.description}
      price={
        entry.unit_price
          ? formatMoney(entry.unit_price, catalog.currency_minor_units)
          : 'Not yet priced'
      }
      priceNote={
        entry.unit_price
          ? `one-time · ${taxNote(catalog.currency)} · usable for ${entry.expiry_days} days while your plan is active`
          : undefined
      }
      cta={
        href ? (
          <ButtonLink
            href={href}
            rel={CHECKOUT_REL}
            variant="soft"
            size="marketing"
            className="w-full"
          >
            Choose {entry.name}
          </ButtonLink>
        ) : (
          <p className="cl-body">Unavailable</p>
        )
      }
    />
  );
}

function ByokSwitch({
  byok,
  onChange,
}: Readonly<{ byok: boolean; onChange: (value: boolean) => void }>) {
  const id = useId();
  const hint = useId();
  const [changed, setChanged] = useState(false);
  return (
    <div className="flex max-w-xl items-start gap-3">
      <Switch
        id={id}
        checked={byok}
        onCheckedChange={(value) => {
          setChanged(true);
          onChange(value);
        }}
        label={BYOK_SWITCH_LABEL}
        describedBy={hint}
        className="mt-0.5"
      />
      <span className="grid gap-1">
        {/* The switch's aria-label already names it; this is the visible click target. */}
        <label htmlFor={id} aria-hidden className="text-body text-ink cursor-pointer">
          {BYOK_SWITCH_LABEL}
        </label>
        <span id={hint} className="text-body-sm text-ink-muted">
          {BYOK_DISCLOSURE}
        </span>
      </span>
      <output aria-live="polite" className="sr-only">
        {changed && (byok ? BYOK_ON_ANNOUNCEMENT : BYOK_OFF_ANNOUNCEMENT)}
      </output>
    </div>
  );
}

/** The public trial's published limits. */
function trialLimits(trial: PublicTrial) {
  return [
    { label: 'Length', value: `${trial.days} days` },
    { label: 'Engine', value: 'ChatGPT only' },
    { label: 'Projects', value: `${trial.projects}` },
    { label: 'Prompts', value: `${trial.prompts}` },
    { label: 'Monitored URLs', value: `${trial.monitoredUrls}` },
    { label: 'Successful answers', value: `${trial.answers}, one per prompt` },
  ];
}

const trialExclusions = (trial: PublicTrial) =>
  `Includes ${trial.aiCredits} AI credits. Agent access is not included.`;

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
 * - Checkout open, sign-up open: the trial tile under the plans.
 * - Checkout open, sign-up closed: nothing; the plan cards are the way in.
 * - Checkout closed, sign-up open: the trial is the page's main offer.
 * - Checkout closed, sign-up closed: early access by enquiry.
 *
 * No price is shown in either closed state.
 */
function PricingTrial({
  appOrigin,
  checkoutOpen,
  trial,
}: Readonly<{ appOrigin: string; checkoutOpen: boolean; trial: PublicTrial }>) {
  const signupOpen = selfServeSignupOpen();
  if (checkoutOpen && !signupOpen) return null;
  if (!checkoutOpen && !signupOpen) {
    return (
      <PageSection
        title="Paid plans are not open for self-serve checkout"
        lead="Contact us to discuss early access and the volume your team needs."
        action={
          <DemoButtonLink variant="primary" size="marketing">
            <span>Request early access</span>
            <ArrowRight aria-hidden />
          </DemoButtonLink>
        }
      />
    );
  }
  return (
    <PageSection spacing="compact" label="Free trial">
      {checkoutOpen ? (
        <PageHighlight
          as="h2"
          title="Try it first"
          body={`A ${countWord(trial.days)}-day trial on ChatGPT answers. ${trialExclusions(trial)}`}
          stats={trialLimits(trial)}
          action={<TrialButton appOrigin={appOrigin} primary={false} />}
        />
      ) : (
        <PageHighlight
          as="h2"
          title="What the trial includes"
          body={`See how ChatGPT answers your buyers' questions before you commit. Paid checkout is not open; contact us to continue after the trial. ${trialExclusions(trial)}`}
          stats={trialLimits(trial)}
          action={<TrialButton appOrigin={appOrigin} primary />}
        />
      )}
    </PageSection>
  );
}

/**
 * A capability a plan does not publish is a dash (the honest "not
 * included", distinct from a published zero); a null value is one the
 * catalog has not released for that plan yet.
 */
function comparisonCell(value: boolean | number | string | null | undefined): PlanCell {
  if (value === null) return 'Not yet available';
  if (value === undefined) return false;
  return typeof value === 'number' ? formatCount(value) : value;
}

function PricingComparison({ catalog }: Readonly<{ catalog: BillingCatalog }>) {
  const rows = comparisonRows(catalog);
  const plans = catalog.plans.filter((plan) => plan.key !== 'enterprise');
  if (rows.length === 0) return null;
  return (
    <PageSection
      id="compare"
      title="Compare every published limit"
      lead="Every value comes from the live plan catalog. A dash means the plan does not include it."
    >
      <PricingTable
        plans={plans.map((plan) => ({ name: plan.name }))}
        groups={[
          {
            rows: rows.map((row) => ({
              label: capabilityLabel(row.key),
              values: plans.map((plan) => comparisonCell(row.values[plan.key]?.value)),
            })),
          },
        ]}
      />
    </PageSection>
  );
}

export function PublicPricingCatalog({
  catalog,
  appOrigin,
  initialByok,
  trial,
}: Readonly<{
  catalog: BillingCatalog;
  appOrigin: string;
  initialByok: boolean;
  /** The public trial's numbers, passed in so its config stays out of the browser bundle. */
  trial: PublicTrial;
}>) {
  const [byok, setByok] = useState(initialByok);
  const mode = byok ? 'byok' : 'funded';
  if (selfServeCheckoutComingSoon(catalog)) {
    return <PricingTrial appOrigin={appOrigin} checkoutOpen={false} trial={trial} />;
  }
  const origin = new URL(appOrigin);
  const extras = [
    ...catalog.addons.map((entry) => ({ entry, kind: 'addon' as const })),
    ...catalog.topups.map((entry) => ({ entry, kind: 'topup' as const })),
  ];
  return (
    <>
      <PageSection spacing="compact" label="Plans" labelHeading>
        <div className="grid gap-6">
          <PagePlans
            toolbar={
              <>
                <ByokSwitch
                  byok={byok}
                  onChange={(value) => {
                    setByok(value);
                    const url = new URL(window.location.href);
                    if (value) url.searchParams.delete('byok');
                    else url.searchParams.set('byok', '0');
                    window.history.replaceState(null, '', url);
                  }}
                />
                <p className="cl-note max-w-md">
                  Prices shown in {catalog.currency}
                  {catalog.currency === 'INR' ? ', exclusive of GST' : ''}. Your billing country
                  sets the final currency and tax, confirmed in the app before payment.
                </p>
              </>
            }
          >
            {catalog.plans.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                catalog={catalog}
                mode={mode}
                appOrigin={origin}
              />
            ))}
          </PagePlans>
          <p className="cl-note">
            Provider usage may be billed separately from your CiteLadder plan. Review the selected
            usage option and its costs before starting a run.
          </p>
        </div>
      </PageSection>
      <PricingTrial appOrigin={appOrigin} checkoutOpen trial={trial} />
      <PricingComparison catalog={catalog} />
      {extras.length > 0 && (
        <PageSection
          title="Add capacity when you need it"
          lead="One-time purchases on top of an active plan."
        >
          <PagePlans>
            {extras.map(({ entry, kind }) => (
              <ExtraCard
                key={entry.key}
                entry={entry}
                kind={kind}
                catalog={catalog}
                appOrigin={origin}
                byok={byok}
              />
            ))}
          </PagePlans>
        </PageSection>
      )}
    </>
  );
}
