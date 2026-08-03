'use client';

import { useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { CompetitorComparisonSnapshot } from '@/lib/api/types';
import type { useMarketIntelligence } from '@/lib/products/use-products-screen';

type Market = ReturnType<typeof useMarketIntelligence>;
type RecordValue = Record<string, unknown>;
const dash = (value: unknown) => value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';

function ComparisonDetails({ snapshot }: Readonly<{ snapshot: CompetitorComparisonSnapshot }>) {
  const comparison = record(snapshot.comparison); const coverage = record(comparison.coverage); const items = list(comparison.items).map(record);
  return <div className="grid gap-3">
    <div className="grid gap-2 sm:grid-cols-4 text-sm"><span>Own: {dash(coverage.own_total)}</span><span>Competitor: {dash(coverage.competitor_total)}</span><span>Matched: {dash(coverage.matched)}</span><span>Unmatched: {dash(coverage.unmatched)}</span></div>
    <p className="text-muted text-sm">Matcher {snapshot.matcher_version} · comparison {snapshot.comparison_version} · {snapshot.truncated ? 'results truncated' : 'complete result'}</p>
    {items.map((item, index) => { const competitor = record(item.competitor); const own = record(item.own); const differences = record(item.differences); const evidence = record(item.evidence_kind); const conversation = record(item.ai_conversation); return <section key={String(item.competitor_product_id ?? index)} className="grid gap-2 rounded-sm border border-border p-3 text-sm"><div className="flex items-center justify-between gap-2"><strong>{dash(own.name)} <span className="text-muted">vs</span> {dash(competitor.name)}</strong><Badge>{item.own_product_id ? 'Matched' : 'Unmatched'}</Badge></div><p className="text-muted">Evidence: own {dash(evidence.own)} · competitor {dash(evidence.competitor)}</p><div className="grid gap-1 sm:grid-cols-2"><span>Price: {dash(list(differences.price)[0])} / {dash(list(differences.price)[1])}</span><span>Availability: {dash(list(differences.availability)[0])} / {dash(list(differences.availability)[1])}</span><span>Variants: {dash(list(differences.variants)[0])} / {dash(list(differences.variants)[1])}</span><span>Identifiers: {dash(list(differences.identifiers)[0])} / {dash(list(differences.identifiers)[1])}</span><span>Attributes: {dash(list(differences.attributes)[0])} / {dash(list(differences.attributes)[1])}</span><span>Schema readiness: {dash(differences.schema_readiness)}</span><span>Freshness: {dash(list(differences.freshness)[0])} / {dash(list(differences.freshness)[1])}</span><span>AI conversations: {dash(conversation.own)} / {dash(conversation.competitor)}</span></div></section>; })}
  </div>;
}

export function MarketIntelligencePanel({ queries }: Readonly<{ projectId: string; queries: Market }>) {
  const [competitorId, setCompetitorId] = useState(''); const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => (queries.comparisonsQuery.data ?? []).find((item) => item.id === selectedId) ?? queries.comparisonsQuery.data?.[0], [queries.comparisonsQuery.data, selectedId]);
  return <div className="grid gap-4" data-testid="commerce-market-panel">
    <Card><CardHeader><CardTitle>Market Intelligence</CardTitle><CardDescription>Create an immutable comparison from reviewed catalog evidence. Uploaded, crawled, and AI-conversation evidence remain explicitly labelled.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input aria-label="Competitor ID" value={competitorId} onChange={(event) => setCompetitorId(event.target.value)} placeholder="Optional competitor UUID (all competitors when empty)"/><Button variant="primary" onClick={() => void queries.createMutation.mutateAsync(competitorId.trim() || undefined)} disabled={queries.createMutation.isPending}>{queries.createMutation.isPending ? 'Creating…' : 'Create comparison'}</Button>{queries.createMutation.error ? <Alert tone="danger" className="sm:col-span-2">{message(queries.createMutation.error)}</Alert> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle>Comparison history</CardTitle></CardHeader><CardContent className="grid gap-2">{(queries.comparisonsQuery.data ?? []).map((snapshot) => <button key={snapshot.id} type="button" className="flex items-center justify-between rounded-sm p-2 text-left hover:bg-surface-hover" onClick={() => setSelectedId(snapshot.id)}><span>{new Date(snapshot.created_at).toLocaleString()}</span><Badge>{snapshot.competitor_id ?? 'All competitors'}</Badge></button>)}{queries.comparisonsQuery.isLoading ? <p className="text-muted text-sm">Loading comparison history…</p> : null}{!queries.comparisonsQuery.isLoading && !queries.comparisonsQuery.data?.length ? <p className="text-muted text-sm">No comparison snapshots yet.</p> : null}</CardContent></Card>
    {selected ? <Card><CardHeader><CardTitle>Side-by-side comparison</CardTitle><CardDescription>Catalog IDs: {selected.source_catalog_ids.products?.length ?? 0} own · {selected.source_catalog_ids.competitor_products?.length ?? 0} competitor. Artifact evidence: {selected.source_artifact_ids.length || '—'}.</CardDescription></CardHeader><CardContent><ComparisonDetails snapshot={selected} /></CardContent></Card> : null}
  </div>;
}
