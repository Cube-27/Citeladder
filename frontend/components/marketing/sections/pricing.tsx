import { Children, type ReactElement, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Check, Minus } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { CheckList, columnsFor } from './site-parts';
import './pricing.css';
import { Icon } from '@/components/ui/icon';

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

export function PagePlans({
  toolbar,
  children,
}: Readonly<{ toolbar?: ReactNode; children: ReactNode }>) {
  const columns = Math.max(2, columnsFor(Children.count(children)));
  return (
    <div>
      {toolbar && <div className="cl-page-plans-bar">{toolbar}</div>}
      <div className="cl-page-plans-grid" data-tile-cols={columns}>
        {children}
      </div>
    </div>
  );
}

export type PlanCell = boolean | string | ReactElement;

function PlanValue({ value }: Readonly<{ value: PlanCell }>) {
  if (value === true) {
    return (
      <span className="cl-wt-yes">
        <Icon icon={Check} size="control" />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="cl-wt-no">
        <Icon icon={Minus} size="control" />
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return value;
}

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
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0} // NOSONAR
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
