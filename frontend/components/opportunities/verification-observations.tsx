'use client';

import { ProjectLink } from '@/components/layout/scoped-link';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { textRole } from '@/components/ui/typography';
import { movementLegLabel, movementStateLabel } from '@/lib/agent/vocabulary';
import { placementReport, type VerificationResult } from '@/lib/opportunities/verification';

/**
 * What else has been observed since a declaration — the placement and the
 * before/after movement — reported as separate observations, never as one
 * verdict. The per-check states sit above this, in the declaration.
 *
 * Placement sits above the comparable legs and outside them on purpose. "The
 * listing is live" and "the score moved" are two observations about two
 * different things; they are free to disagree, and folding one into the other
 * is how a verification result comes to claim more than it knows.
 */
export function VerificationObservations({
  implementation,
  showAuditLink,
}: Readonly<{
  implementation: { verification_events?: Array<{ result: Record<string, unknown> }> } | undefined;
  /** Only a declaration with a prompt check is measured by a later run. */
  showAuditLink: boolean;
}>) {
  const result = implementation?.verification_events?.at(-1)?.result;
  if (!result) return null;
  // The container stays neutral: a contradicted check elsewhere must not tint
  // a placement that is live, which is what these separate observations say.
  return (
    <div className="type-caption grid gap-2">
      <Placement result={result} />
      <ComparableMovement result={result} />
      <GapChanges result={result} />
      {showAuditLink ? (
        <ProjectLink className="focus-ring w-fit underline underline-offset-2" href="/runs">
          Run a comparable audit
        </ProjectLink>
      ) : null}
    </div>
  );
}

/**
 * Whether the change actually appeared on the publisher's page.
 *
 * A page nobody has re-read since the declaration says so plainly. It is never
 * reported as a placement that failed — that distinction is the same one the
 * whole inspection feature exists to hold.
 */
function Placement({ result }: Readonly<{ result: VerificationResult | undefined }>) {
  const report = placementReport(result);
  if (!report) return null;
  return (
    <div className="grid gap-0.5">
      <p className={eyebrowClasses}>Placement</p>
      <p className={textRole('itemTitle')}>{report.headline}</p>
      {report.detail ? <p>{report.detail}</p> : null}
    </div>
  );
}

/** The before/after legs: visibility, AI referral traffic, branded demand. */
function ComparableMovement({ result }: Readonly<{ result: VerificationResult | undefined }>) {
  const legs = result?.legs;
  if (!legs || typeof legs !== 'object') return null;
  const entries = Object.entries(legs).flatMap(([name, leg]) => {
    const label = movementLegLabel(name);
    return label ? [[label, leg] as const] : [];
  });
  if (!entries.length) return null;
  return (
    <div className="grid gap-0.5">
      <p className={eyebrowClasses}>Comparable movement</p>
      {entries.map(([label, leg]) => (
        <p key={label}>
          {label}: {movementStateLabel(legState(leg))}
        </p>
      ))}
    </div>
  );
}

function GapChanges({ result }: Readonly<{ result: VerificationResult | undefined }>) {
  const changes = result?.gap_changes;
  if (!changes || typeof changes !== 'object' || !('state' in changes)) return null;
  if (changes.state !== 'available') return <p>Gap comparison: not measured yet</p>;
  const count = (key: string) => {
    const value = key in changes ? changes[key as keyof typeof changes] : null;
    return Array.isArray(value) ? value.length : 0;
  };
  return (
    <p>
      Gaps: {count('no_longer_observed')} no longer observed · {count('persistent')} persistent ·{' '}
      {count('new')} new
    </p>
  );
}

function legState(value: unknown): string {
  if (!value || typeof value !== 'object' || !('state' in value)) return 'unavailable';
  return String(value.state);
}
