/**
 * Orphan evidence for the Architecture tab: the count, and the pages behind it.
 *
 * Split from `architecture-panel.tsx` so neither file carries a second
 * concern. The count is the summary the card shows; the drawer is where the
 * URLs live, because a list of twenty inside a three-metric summary pushed
 * Structure depth off the fold to say what the number already said.
 */
'use client';

import { ProjectLink } from '@/components/layout/scoped-link';

import { Drawer } from '@/components/ui/drawer';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { Stack } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { textRole } from '@/components/ui/typography';
import type { SiteArchitecture } from '@/lib/api/types';
import { PLACEHOLDER } from '@/lib/site-health/status';

// Scope, in the metric's own words. The count is a fact about the pages this
// crawl fetched; it is not the stronger claim that nothing anywhere links to
// them, which stays behind the coverage-gated rule.
export const ORPHAN_SCOPE_NOTE = 'not linked from any page this crawl fetched';

export function OrphanMetric({
  pages,
  total,
  onOpen,
}: Readonly<{
  pages: SiteArchitecture['internal_linking']['orphan_pages'];
  total: number | null;
  onOpen: () => void;
}>) {
  if (total === null) {
    return <EvidenceMetric label="Orphaned pages" value={PLACEHOLDER} />;
  }
  // The count opens the evidence rather than listing it in place. A list of
  // twenty URLs inside a three-metric summary card pushed Structure depth off
  // the fold to say something the number already said; the drawer is where
  // every other Site Health surface puts its supporting rows.
  return (
    <div className="grid content-start gap-1">
      <span className={eyebrowClasses}>Orphaned pages</span>
      {pages.length > 0 ? (
        // The visible label is the bare number, which as an accessible name
        // says only "1" — a control a screen-reader user has no reason to
        // press. Name the action instead.
        <Pressable
          onClick={onOpen}
          aria-label={`View ${total} orphaned ${total === 1 ? 'page' : 'pages'}`}
          className="text-accent-text justify-self-start hover:underline"
        >
          <span className={textRole('pageTitle', 'mono tracking-[-0.02em] tabular-nums')}>
            {total}
          </span>
        </Pressable>
      ) : (
        <span className={textRole('pageTitle', 'mono tracking-[-0.02em] tabular-nums')}>
          {total}
        </span>
      )}
      <span className="text-muted text-xs">{ORPHAN_SCOPE_NOTE}</span>
    </div>
  );
}

export function OrphanPageDrawer({
  pages,
  total,
  crawlId,
  open,
  onOpenChange,
}: Readonly<{
  pages: SiteArchitecture['internal_linking']['orphan_pages'];
  total: number | null;
  crawlId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const undisclosed = (total ?? pages.length) - pages.length;
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Orphaned pages"
      description={ORPHAN_SCOPE_NOTE}
      closeLabel="Close orphaned pages"
    >
      <Stack gap="section">
        <ul className="grid gap-3">
          {pages.map((page) => (
            <li key={page.site_url_id} className="grid min-w-0 gap-0.5">
              {/* Openable, like every other page reference in this tab. A count
                nobody can act on is the failure this whole change is undoing. */}
              {crawlId ? (
                <ProjectLink
                  href={`/site/crawls/${crawlId}/pages/${page.site_url_id}`}
                  className="text-accent-text truncate text-sm hover:underline"
                >
                  {page.title || page.url}
                </ProjectLink>
              ) : (
                <span className="text-secondary truncate text-sm">{page.title || page.url}</span>
              )}
              <span className="text-muted truncate text-xs">{page.url}</span>
            </li>
          ))}
        </ul>
        {undisclosed > 0 ? <p className="text-muted text-xs">and {undisclosed} more</p> : null}
      </Stack>
    </Drawer>
  );
}

export function EvidenceMetric({
  label,
  value,
  supporting,
}: Readonly<{ label: string; value: string; supporting?: string }>) {
  return (
    <div className="grid content-start gap-1">
      <span className={eyebrowClasses}>{label}</span>
      {value === PLACEHOLDER ? (
        <UnavailableValue state="not_measured" />
      ) : (
        <span className={textRole('pageTitle', 'mono tracking-[-0.02em] tabular-nums')}>
          {value}
        </span>
      )}
      {supporting ? <span className="text-muted text-xs">{supporting}</span> : null}
    </div>
  );
}
