'use client';

import { ProjectLink } from '@/components/layout/scoped-link';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { textRole } from '@/components/ui/typography';
import { placementReport, type VerificationResult } from '@/lib/opportunities/verification';

/**
 * What has been observed since a declaration, reported as separate
 * observations rather than as one verdict.
 *
 * Placement sits above the comparable legs and outside them on purpose. "The
 * listing is live" and "the score moved" are two observations about two
 * different things; they are free to disagree, and folding one into the other
 * is how a verification result comes to claim more than it knows.
 */
export function VerificationObservations({
  implementation,
}: Readonly<{
  implementation:
    | {
        state: string;
        limitations: string[];
        verification_events?: Array<{ result: Record<string, unknown> }>;
      }
    | undefined;
}>) {
  if (!implementation) return null;
  const result = implementation.verification_events?.at(-1)?.result;
  return (
    <div className={`${stateTone(implementation.state)} grid gap-1.5 text-xs`}>
      <p>
        {implementation.state === 'declared'
          ? 'Declared for verification.'
          : `Verification: ${implementation.state}.`}
        {implementation.limitations.length ? ` ${implementation.limitations.join(' ')}` : null}
      </p>
      <Placement result={result} />
      <ComparableMovement result={result} />
      <GapChanges result={result} />
      <ProjectLink className="focus-ring w-fit underline underline-offset-2" href="/runs">
        Run a comparable audit
      </ProjectLink>
    </div>
  );
}

function stateTone(state: string): string {
  if (state === 'verified') return 'text-success-text';
  if (state === 'contradicted') return 'text-danger-text';
  return 'text-muted';
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
      <p className={textRole('bodyStrong', 'text-xs')}>{report.headline}</p>
      {report.detail ? <p>{report.detail}</p> : null}
    </div>
  );
}

/** The before/after legs: visibility, AI referral traffic, branded demand. */
function ComparableMovement({ result }: Readonly<{ result: VerificationResult | undefined }>) {
  const legs = result?.legs;
  if (!legs || typeof legs !== 'object') return null;
  const entries = Object.entries(legs);
  if (!entries.length) return null;
  return (
    <div className="grid gap-0.5">
      <p className={eyebrowClasses}>Comparable movement</p>
      {entries.map(([name, leg]) => (
        <p key={name}>
          {name.replaceAll('_', ' ')}: {legState(leg)}
        </p>
      ))}
    </div>
  );
}

function GapChanges({ result }: Readonly<{ result: VerificationResult | undefined }>) {
  const changes = result?.gap_changes;
  if (!changes || typeof changes !== 'object' || !('state' in changes)) return null;
  if (changes.state !== 'available') return <p>Gap comparison: not run</p>;
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
  return String(value.state).replaceAll('_', ' ');
}
