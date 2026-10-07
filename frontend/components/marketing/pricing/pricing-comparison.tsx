'use client';

import { Check } from 'lucide-react';

import type { BillingCatalog } from '@/lib/api/billing';
import { formatCount } from '@/lib/format';
import { comparisonRows } from '@/lib/billing/catalog';
import { capabilityLabel } from '@/lib/marketing-content/pricing';

/**
 * Plan comparison table.
 *
 * Rows and values come from the published catalog. Hairline rows, a sticky
 * capability column and semantic check/dash cells keep it scannable.
 */
export function PricingComparison({ catalog }: Readonly<{ catalog: BillingCatalog }>) {
  const rows = comparisonRows(catalog);
  const comparedPlans = catalog.plans.filter((plan) => plan.key !== 'enterprise');
  if (rows.length === 0) return null;

  return (
    // The table is wider than a phone by design, so it scrolls INSIDE this
    // box. `overscroll-x-contain` keeps that gesture from chaining out to the
    // page once the table hits its end.
    <div className="cm-table-scroll">
      <table className="cm-table">
        <thead>
          <tr>
            <th scope="col">Capability</th>
            {comparedPlans.map((plan) => (
              <th key={plan.key} scope="col">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{capabilityLabel(row.key)}</th>
              {comparedPlans.map((plan) => (
                <td key={plan.key}>{renderCell(row.values[plan.key]?.value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotIncluded() {
  return (
    <span className="cm-cell-none">
      <span aria-hidden>—</span>
      <span className="sr-only">Not included</span>
    </span>
  );
}

/**
 * A capability a plan does not publish renders as a dash — the honest "not
 * included", distinct from a published zero. A null value is a capability the
 * catalog marks as coming soon for that plan, so it says so. Booleans use a check so colour
 * is never the only signal.
 */
function renderCell(value: boolean | number | string | null | undefined) {
  if (value === null) return <span className="cm-cell-none">Coming soon</span>;
  if (value === undefined || value === false) return <NotIncluded />;
  if (value === true) {
    return (
      <span className="cm-cell-check">
        <Check aria-hidden className="size-4" />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  return (
    <span className="cm-cell-value">{typeof value === 'number' ? formatCount(value) : value}</span>
  );
}
