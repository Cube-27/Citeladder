'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CursorPager } from '@/components/ui/cursor-pager';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { siteHealthQueries } from '@/lib/api/site-health';
import type { LinkGraphEdge, LinkGraphNode } from '@/lib/api/types';
import { useCursorStack } from '@/lib/site-health/use-cursor-stack';

const VISUAL_NODE_LIMIT = 24;
const FLAGGED_VISUAL_LIMIT = 10;
/** Depth columns are laid out inside this box; the axis strip sits below it. */
const CANVAS = { width: 1000, height: 200, padX: 64, padY: 22, axisY: 224 } as const;

function displayPath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function isFlagged(node: LinkGraphNode) {
  return node.near_orphan || node.weak_authority;
}

function byAuthority(left: LinkGraphNode, right: LinkGraphNode) {
  return right.pagerank - left.pagerank || left.site_url_id.localeCompare(right.site_url_id);
}

/**
 * Bounded node sample. Flagged pages are the story this surface exists for, so
 * they hold at least half the slots — but when the authority remainder does not
 * fill the rest, the leftover slots go back to flagged pages instead of going
 * unused.
 */
function visualNodes(nodes: LinkGraphNode[]) {
  const flagged = nodes.filter(isFlagged).sort(byAuthority);
  const rest = nodes.filter((node) => !isFlagged(node)).sort(byAuthority);
  const flaggedSlots = Math.min(
    flagged.length,
    Math.max(FLAGGED_VISUAL_LIMIT, VISUAL_NODE_LIMIT - rest.length),
  );
  return [...flagged.slice(0, flaggedSlots), ...rest].slice(0, VISUAL_NODE_LIMIT);
}

/** Click depth is the x axis; pages with no path from the root sort last. */
function depthColumns(visible: LinkGraphNode[]) {
  const groups = new Map<number, LinkGraphNode[]>();
  for (const node of visible) {
    const depth = node.click_depth ?? -1;
    groups.set(depth, [...(groups.get(depth) ?? []), node]);
  }
  return [...groups.entries()]
    .map(([depth, group]) => [depth, [...group].sort(byAuthority)] as const)
    .sort(([left], [right]) => (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right));
}

function depthLabel(depth: number) {
  return depth < 0 ? 'Unlinked' : `Depth ${depth}`;
}

function LegendKey({ className, children }: Readonly<{ className: string; children: ReactNode }>) {
  return (
    <span className="text-muted flex items-center gap-1.5 text-xs">
      <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
        <circle cx="6" cy="6" r="5" className={className} />
      </svg>
      {children}
    </span>
  );
}

function GraphPreview({
  nodes,
  edges,
}: Readonly<{ nodes: LinkGraphNode[]; edges: LinkGraphEdge[] }>) {
  const visible = visualNodes(nodes);
  const columns = depthColumns(visible);
  const topRank = Math.max(...visible.map((node) => node.pagerank), Number.EPSILON);
  const stepX = columns.length > 1 ? (CANVAS.width - 2 * CANVAS.padX) / (columns.length - 1) : 0;

  const positions = new Map<string, { x: number; y: number; r: number }>();
  columns.forEach(([, group], columnIndex) => {
    const x = columns.length > 1 ? CANVAS.padX + columnIndex * stepX : CANVAS.width / 2;
    const stepY = group.length > 1 ? (CANVAS.height - 2 * CANVAS.padY) / (group.length - 1) : 0;
    group.forEach((node, rowIndex) => {
      positions.set(node.site_url_id, {
        x,
        y: group.length > 1 ? CANVAS.padY + rowIndex * stepY : CANVAS.height / 2,
        r: 4 + 6 * Math.sqrt(Math.min(node.pagerank, topRank) / topRank),
      });
    });
  });

  const visibleEdges = edges.filter(
    (edge) =>
      edge.followed &&
      edge.target_site_url_id &&
      positions.has(edge.source_site_url_id) &&
      positions.has(edge.target_site_url_id),
  );

  if (visible.length < 2) return null;
  return (
    <div
      className="border-border bg-background-alt grid gap-3 rounded-lg border p-4"
      aria-label="Internal link graph preview"
    >
      <svg
        viewBox={`0 0 ${CANVAS.width} ${CANVAS.axisY + 8}`}
        className="h-auto w-full"
        role="img"
        aria-label="Pages placed by click depth from the home page; circle size shows relative PageRank."
      >
        {visibleEdges.map((edge) => {
          const source = positions.get(edge.source_site_url_id)!;
          const target = positions.get(edge.target_site_url_id!)!;
          const midX = (source.x + target.x) / 2;
          return (
            <path
              key={edge.id}
              d={`M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`}
              className="stroke-border-strong"
              strokeWidth="1"
              strokeOpacity="0.55"
              fill="none"
            />
          );
        })}
        {visible.map((node) => {
          const point = positions.get(node.site_url_id)!;
          const flagged = isFlagged(node);
          return (
            <g key={node.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={point.r}
                className={flagged ? 'fill-danger' : node.hub ? 'fill-accent' : 'fill-series-other'}
                stroke={flagged ? 'currentColor' : 'none'}
                strokeWidth={flagged ? 2 : 0}
                strokeOpacity="0.25"
              />
              <title>
                {displayPath(node.normalized_url)} · {depthLabel(node.click_depth ?? -1)}
              </title>
            </g>
          );
        })}
        {columns.map(([depth], columnIndex) => (
          <text
            key={depth}
            x={columns.length > 1 ? CANVAS.padX + columnIndex * stepX : CANVAS.width / 2}
            y={CANVAS.axisY}
            textAnchor="middle"
            fontSize="13"
            className="fill-subtle"
          >
            {depthLabel(depth)}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendKey className="fill-accent">Hub</LegendKey>
        <LegendKey className="fill-danger">Near orphan or weak authority</LegendKey>
        <LegendKey className="fill-series-other">Other page</LegendKey>
        <span className="text-subtle text-xs">
          Left to right is click depth from the home page; circle size is relative PageRank.
        </span>
      </div>
    </div>
  );
}

function Signals({ node }: Readonly<{ node: LinkGraphNode }>) {
  return (
    <div className="flex flex-wrap gap-1">
      {node.near_orphan ? <Badge>Near orphan</Badge> : null}
      {node.weak_authority ? <Badge>Weak authority</Badge> : null}
      {node.hub ? <Badge>Hub</Badge> : null}
      {node.over_linked ? <Badge>Over-linked</Badge> : null}
      {!node.near_orphan && !node.weak_authority && !node.hub && !node.over_linked ? (
        <span className="text-subtle">—</span>
      ) : null}
    </div>
  );
}

export function LinkGraphPanel({
  projectId,
  crawlId,
}: Readonly<{ projectId: string; crawlId: string }>) {
  const nodePager = useCursorStack();
  const edgePager = useCursorStack();
  const summary = useQuery(siteHealthQueries.linkGraph(projectId, crawlId));
  const nodes = useQuery(siteHealthQueries.linkGraphNodes(projectId, crawlId, nodePager.cursor));
  const edges = useQuery(siteHealthQueries.linkGraphEdges(projectId, crawlId, edgePager.cursor));

  if (summary.isLoading || nodes.isLoading || edges.isLoading) {
    return (
      <p role="status" className="text-secondary text-sm">
        Loading persisted link evidence…
      </p>
    );
  }
  if (summary.isError || nodes.isError || edges.isError) {
    return <Alert tone="danger">Could not load the Website Link Graph.</Alert>;
  }
  if (!summary.data || summary.data.state === 'unavailable') {
    return (
      <Alert tone="info">
        A link graph will appear after a crawl has completed its graph analysis.
      </Alert>
    );
  }

  const nodeRows = nodes.data?.items ?? [];
  const edgeRows = edges.data?.items ?? [];
  const byId = new Map(nodeRows.map((node) => [node.site_url_id, node]));
  const coverage = summary.data.coverage;
  const observed = Number(coverage.analyzed_html_node_count ?? nodeRows.length);
  const selected = Number(coverage.selected_url_count ?? observed);

  return (
    <div className="grid min-w-0 gap-6" data-testid="website-link-graph">
      {summary.data.state === 'incomplete' ? (
        <Alert tone="warning">
          This is descriptive observed topology for a partial crawl ({observed} of {selected}{' '}
          selected HTML pages). Near-orphan and weak-authority Opportunities are suppressed.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Internal-link authority</CardTitle>
          <CardDescription>
            Followed links form the topology. Nofollow observations remain in evidence but do not
            transfer authority.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <span className="text-subtle block">Pages</span>
              <span className="font-medium tabular-nums">
                {String(summary.data.summary.node_count ?? nodeRows.length)}
              </span>
            </div>
            <div>
              <span className="text-subtle block">Observed edges</span>
              <span className="font-medium tabular-nums">
                {String(summary.data.summary.edge_count ?? edgeRows.length)}
              </span>
            </div>
            <div>
              <span className="text-subtle block">Near orphans</span>
              <span className="font-medium tabular-nums">
                {String(summary.data.summary.near_orphan_count ?? 0)}
              </span>
            </div>
            <div>
              <span className="text-subtle block">Weak authority</span>
              <span className="font-medium tabular-nums">
                {String(summary.data.summary.weak_authority_count ?? 0)}
              </span>
            </div>
          </div>
          <GraphPreview nodes={nodeRows} edges={edgeRows} />
          {nodeRows.length > VISUAL_NODE_LIMIT ||
          nodes.data?.next_cursor ||
          edges.data?.next_cursor ? (
            <p className="text-subtle text-xs">
              The visual is bounded to {VISUAL_NODE_LIMIT} pages from the current evidence pages.
              The tables paginate through the persisted graph.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Page authority evidence</CardTitle>
          <CardDescription>
            Deterministic PageRank, click depth, followed links, and bounded source suggestions.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div role="region" aria-label="Page authority evidence">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead numeric>In / out</TableHead>
                  <TableHead>Suggested sources</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodeRows.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell>
                      <Link
                        className="text-accent-text font-medium hover:underline"
                        href={`/site/crawls/${crawlId}/pages/${node.site_url_id}`}
                      >
                        {node.title || displayPath(node.normalized_url)}
                      </Link>
                      <span className="text-subtle block max-w-80 truncate text-xs">
                        {displayPath(node.normalized_url)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Signals node={node} />
                    </TableCell>
                    <TableCell numeric>
                      {node.followed_inbound_count} / {node.followed_outbound_count}
                    </TableCell>
                    <TableCell>
                      {node.suggested_source_ids.length ? (
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {node.suggested_source_ids.map((sourceId) => {
                            const source = byId.get(sourceId);
                            return (
                              <Link
                                key={sourceId}
                                className="text-accent-text text-xs hover:underline"
                                href={`/site/crawls/${crawlId}/pages/${sourceId}`}
                              >
                                {source?.title || displayPath(source?.normalized_url ?? sourceId)}
                              </Link>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {nodePager.canPrev || nodes.data?.next_cursor ? (
            <div className="mt-3 flex justify-end gap-2" aria-label="Page authority pagination">
              <CursorPager
                canPrev={nodePager.canPrev}
                canNext={Boolean(nodes.data?.next_cursor)}
                onPrev={nodePager.pop}
                onNext={() => nodePager.push(nodes.data?.next_cursor ?? null)}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observed link evidence</CardTitle>
          <CardDescription>
            Collapsed followed and nofollow observations, with bounded anchor evidence.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div role="region" aria-label="Observed link evidence">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Transfer</TableHead>
                  <TableHead numeric>Occurrences</TableHead>
                  <TableHead>Anchors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {edgeRows.map((edge) => {
                  const source = byId.get(edge.source_site_url_id);
                  const target = edge.target_site_url_id
                    ? byId.get(edge.target_site_url_id)
                    : undefined;
                  return (
                    <TableRow key={edge.id}>
                      <TableCell>
                        {source?.title ||
                          displayPath(source?.normalized_url ?? edge.source_site_url_id)}
                      </TableCell>
                      <TableCell>
                        {target?.title || displayPath(target?.normalized_url ?? edge.target_url)}
                      </TableCell>
                      <TableCell>{edge.followed ? 'Followed' : 'Nofollow-only'}</TableCell>
                      <TableCell numeric>{edge.occurrence_count}</TableCell>
                      <TableCell>{edge.anchor_texts.join(', ') || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {edgePager.canPrev || edges.data?.next_cursor ? (
            <div className="mt-3 flex justify-end gap-2" aria-label="Link evidence pagination">
              <CursorPager
                canPrev={edgePager.canPrev}
                canNext={Boolean(edges.data?.next_cursor)}
                onPrev={edgePager.pop}
                onNext={() => edgePager.push(edges.data?.next_cursor ?? null)}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
