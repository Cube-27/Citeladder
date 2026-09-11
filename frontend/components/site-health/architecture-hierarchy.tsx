'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { PageKindBadge } from '@/components/site-health/page-kind-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ArchitectureNode } from '@/lib/api/types';

const PARENT_SOURCE_LABELS: Record<ArchitectureNode['parent_source'], string> = {
  breadcrumb: 'Breadcrumb',
  explicit_structure: 'Explicit structure',
  url_parent: 'URL parent',
  unknown: 'Root or unresolved',
};

/**
 * Group nodes under the parent the crawl actually resolved.
 *
 * A parent id that is missing from this crawl's node set, or that points at
 * the node itself, is treated as no parent: rendering it would either drop the
 * page from the tree entirely or recurse forever.
 */
function nodesByParent(nodes: ArchitectureNode[]): Map<string | null, ArchitectureNode[]> {
  const nodeIds = new Set(nodes.map((node) => node.site_url_id));
  const grouped = new Map<string | null, ArchitectureNode[]>();
  for (const node of nodes) {
    const parentId =
      node.parent_site_url_id &&
      node.parent_site_url_id !== node.site_url_id &&
      nodeIds.has(node.parent_site_url_id)
        ? node.parent_site_url_id
        : null;
    const siblings = grouped.get(parentId);
    if (siblings) siblings.push(node);
    else grouped.set(parentId, [node]);
  }
  for (const siblings of grouped.values()) {
    siblings.sort((left, right) => left.url.localeCompare(right.url));
  }
  return grouped;
}

export function HierarchyCard({
  nodes,
  crawlId,
}: Readonly<{ nodes: ArchitectureNode[]; crawlId: string | null }>) {
  const grouped = useMemo(() => nodesByParent(nodes), [nodes]);
  const roots = grouped.get(null) ?? [];
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Observed hierarchy</CardTitle>
        <CardDescription>
          Persisted parent relationships from breadcrumbs, explicit structure, or a safe URL parent.
          Unresolved pages remain at the root.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {roots.length === 0 ? (
          <p className="text-secondary text-sm">No hierarchy nodes were measured.</p>
        ) : (
          <section
            className="content-scroll max-h-96 overflow-y-auto overscroll-contain pr-2"
            aria-label="Observed hierarchy pages"
          >
            <HierarchyList nodes={roots} grouped={grouped} crawlId={crawlId} />
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function HierarchyList({
  nodes,
  grouped,
  crawlId,
}: Readonly<{
  nodes: ArchitectureNode[];
  grouped: Map<string | null, ArchitectureNode[]>;
  crawlId: string | null;
}>) {
  return (
    <ul className="border-border-subtle grid gap-2 border-l pl-4">
      {nodes.map((node) => {
        const children = grouped.get(node.site_url_id) ?? [];
        return (
          <li key={node.site_url_id} className="grid min-w-0 gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {crawlId ? (
                <Link
                  href={`/site/crawls/${crawlId}/pages/${node.site_url_id}`}
                  className="text-accent-text min-w-0 text-sm [overflow-wrap:anywhere] hover:underline"
                >
                  {node.url}
                </Link>
              ) : (
                <span className="text-foreground min-w-0 text-sm [overflow-wrap:anywhere]">
                  {node.url}
                </span>
              )}
              <PageKindBadge pageKind={node.page_kind} />
              <span className="text-muted text-xs">{PARENT_SOURCE_LABELS[node.parent_source]}</span>
            </div>
            {children.length > 0 ? (
              <HierarchyList nodes={children} grouped={grouped} crawlId={crawlId} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
