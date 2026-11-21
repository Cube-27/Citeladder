import { Children, type ReactElement, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Check, Minus } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { CheckList, columnsFor } from './site-parts';
import './pricing.css';

/**
 * PricingCard: one plan. The description, price note and name row reserve
 * their height, so plans in a row line up whatever their copy; the featured
 * plan takes an ink edge and an ink badge.
 */
export function PricingCard({
  name,
  badge,
  featured = false,
  description,
  price,
  period,
  priceNote,
  cta,
  featuresTitle,
  features = [],
}: Readonly<{
  name: string;
  badge?: string;
  featured?: boolean;
  description?: ReactNode;
  price: ReactNode;
  period?: ReactNode;
  priceNote?: ReactNode;
  cta?: ReactNode;
  featuresTitle?: ReactNode;
  features?: readonly string[];
}>) {
  return (
    <article className={cn('cl-plan', featured && 'cl-plan--featured')} aria-label={name}>
      <header className="cl-plan-head">
        <div className="cl-plan-namerow">
          <h3 className="cl-plan-name">{name}</h3>
          {badge && <Badge tone={featured ? 'ink' : 'neutral'}>{badge}</Badge>}
        </div>
        {description && <p className="cl-plan-desc">{description}</p>}
      </header>
      <div className="cl-plan-pricing">
        <p className="cl-plan-price">
          <span className="cl-plan-amount">{price}</span>
          {period && <span className="cl-plan-period">{period}</span>}
        </p>
        <p className="cl-plan-note">{priceNote}</p>
      </div>
      {cta && <div className="cl-plan-cta">{cta}</div>}
      {features.length > 0 && (
        <div className="cl-plan-features">
          {featuresTitle && <p className="cl-plan-ftitle">{featuresTitle}</p>}
          <CheckList items={features} small />
        </div>
      )}
    </article>
  );
}

/** PagePlans: the pricing row, equal columns with a toolbar (billing period) above. */
export function PagePlans({
  toolbar,
  children,
}: Readonly<{ toolbar?: ReactNode; children: ReactNode }>) {
  const columns = Math.max(2, columnsFor(Children.count(children)));
  return (
    <div className="cl-page-plans">
      {toolbar && <div className="cl-page-plans-bar">{toolbar}</div>}
      <div className={cn('cl-page-plans-grid', `cl-cols-${columns}`)}>{children}</div>
    </div>
  );
}

/**
 * A plan's cell: included, not included, or a value such as a limit (text,
 * or a link where the value is a source).
 */
export type PlanCell = boolean | string | ReactElement;

function PlanValue({ value }: Readonly<{ value: PlanCell }>) {
  if (value === true) {
    return (
      <span className="cl-wt-yes">
        <Check aria-hidden className="size-4" />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="cl-wt-no">
        <Minus aria-hidden className="size-4" />
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return value;
}

/**
 * PricingTable: every plan's features in grouped rows. The table scrolls in
 * its frame on phones with the feature column pinned, never squeezing cells.
 */
export function PricingTable({
  caption = 'Plan comparison',
  plans,
  groups,
}: Readonly<{
  caption?: string;
  plans: readonly Readonly<{ name: string; price?: string }>[];
  groups: readonly Readonly<{
    title?: string;
    rows: readonly Readonly<{ label: string; values: readonly PlanCell[] }>[];
  }>[];
}>) {
  return (
    <section
      className="cl-wtable focus-ring"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1: the keyboard scrolls this sideways-scrolling region.
      tabIndex={0} // NOSONAR -- WCAG 2.1.1: a region that scrolls sideways must take focus so the keyboard can scroll it
      aria-label={caption}
    >
      <table>
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="cl-ptable-label" />
          {plans.map((plan) => (
            <col key={plan.name} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((plan) => (
              <th key={plan.name} scope="col">
                <span className="cl-ptable-plan">{plan.name}</span>
                {plan.price && <span className="cl-ptable-price">{plan.price}</span>}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group, groupIndex) => (
          <tbody key={group.title ?? groupIndex}>
            {group.title && (
              <tr className="cl-wt-group">
                <th scope="colgroup" colSpan={plans.length + 1}>
                  {group.title}
                </th>
              </tr>
            )}
            {group.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.values.map((value, index) => (
                  <td key={plans[index]?.name ?? index}>
                    <PlanValue value={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}
