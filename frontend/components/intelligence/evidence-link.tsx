import { ProjectLink } from '@/components/layout/scoped-link';
import { TextLink } from '@/components/ui/text-link';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';
import type { AppRoute } from '@/lib/navigation/app-route';

/**
 * EvidenceLink — the path from a derived number to the artifact it came from.
 *
 * The rule this enforces (frontend-growth-intelligence.md §5): every derived
 * number or claim opens its persisted source, and there is no conclusion
 * without a path to evidence. A caller that cannot supply an href has, by
 * definition, an unresolvable claim — so `href` is required rather than
 * optional, and the "no evidence" case is handled by not rendering the
 * conclusion at all (see `Insight`), not by rendering a dead link.
 */
export type EvidenceRef = {
  /** Route to the persisted artifact — a crawl, import row, or engine answer. */
  href: AppRoute;
  /** What the evidence is: "47 pages · /products/*", "GSC import · 12 Jun". */
  label: string;
  /** Optional observation time, rendered as supporting context. */
  observedAt?: string;
};

export type EvidenceLinkProps = {
  evidence: EvidenceRef;
  className?: string;
};

export function EvidenceLink({ evidence, className }: Readonly<EvidenceLinkProps>) {
  return (
    <TextLink asChild text="label" className={cn('flex min-w-0 items-start gap-1', className)}>
      <ProjectLink href={evidence.href}>
        <span className="min-w-0 [overflow-wrap:anywhere]">{evidence.label}</span>
        {evidence.observedAt ? (
          <span className={textRole('caption', 'shrink-0')}>· {evidence.observedAt}</span>
        ) : null}
      </ProjectLink>
    </TextLink>
  );
}
