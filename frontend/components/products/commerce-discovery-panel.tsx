'use client';

import { useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { inputClasses, Textarea } from '@/components/ui/input';
import type { CommerceCandidate, CommerceCandidateInput } from '@/lib/api/types';
import { formatUtcTimestamp } from '@/lib/format';
import type { useCommerceDiscovery } from '@/lib/products/use-products-screen';

type Discovery = ReturnType<typeof useCommerceDiscovery>;
const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : String(value);
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'The request could not be completed.';
const identityName = (identity: Record<string, unknown>) =>
  typeof identity.name === 'string' ? identity.name : undefined;

function sourcePlaceholder(kind: 'csv' | 'json' | 'url'): string {
  if (kind === 'url') return 'One product or category URL per line';
  if (kind === 'json') return '[{ "name": "Product", "sku": "SKU-1" }]';
  return 'name,sku,price,currency,url\nProduct,SKU-1,99,USD,https://example.com/product';
}

function groupCandidates(candidateData: CommerceCandidate[] | undefined) {
  const groups = { own: [] as CommerceCandidate[], competitor: [] as CommerceCandidate[] };
  for (const candidate of candidateData ?? []) groups[candidate.candidate_kind].push(candidate);
  return groups;
}

function parseJsonRows(value: string): CommerceCandidateInput[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as CommerceCandidateInput[]) : null;
  } catch {
    return null;
  }
}

export function CommerceDiscoveryPanel({
  projectId: _projectId,
  queries,
}: Readonly<{ projectId: string; queries: Discovery }>) {
  const [source, setSource] = useState('');
  const [sourceKind, setSourceKind] = useState<'csv' | 'json' | 'url'>('csv');
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({});
  const preview = queries.previewMutation.data;
  const inputFingerprint = `${sourceKind}\u0000${source}`;
  const currentPreview = previewFingerprint === inputFingerprint ? preview : undefined;
  const parsedJsonRows = sourceKind === 'json' ? parseJsonRows(source) : null;
  const candidateData = queries.candidatesQuery.data;
  const candidates = useMemo(() => groupCandidates(candidateData), [candidateData]);
  const previewSource = async () => {
    if (sourceKind === 'url') return;
    const fingerprint = inputFingerprint;
    const body = sourceKind === 'json' ? { rows: parsedJsonRows ?? [] } : { csv_text: source };
    await queries.previewMutation.mutateAsync(body);
    setPreviewFingerprint(fingerprint);
  };
  const createRun = async () => {
    if (sourceKind === 'url') {
      const source_urls = source
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean);
      await queries.createMutation.mutateAsync({ input_kind: 'url', source_urls });
      return;
    }
    const rows = currentPreview?.accepted ?? parsedJsonRows ?? [];
    await queries.createMutation.mutateAsync({ input_kind: 'upload', rows });
  };
  const canCreateUpload = Boolean(currentPreview?.accepted.length || parsedJsonRows?.length);
  return (
    <div className="grid gap-4" data-testid="commerce-discover-panel">
      <Card>
        <CardHeader>
          <CardTitle>Discover products</CardTitle>
          <CardDescription>
            Preview CSV or JSON candidates, or queue product URLs. Discovery evidence remains
            reviewable before it reaches the catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label className="text-foreground grid gap-1 text-sm">
            <span>Input type</span>
            <select
              className={inputClasses}
              value={sourceKind}
              onChange={(event) => setSourceKind(event.target.value as typeof sourceKind)}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON rows</option>
              <option value="url">Product URLs</option>
            </select>
          </label>
          <Textarea
            aria-label="Discovery input"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder={sourcePlaceholder(sourceKind)}
          />
          {sourceKind !== 'url' ? (
            <Button
              variant="secondary"
              onClick={() => void previewSource()}
              disabled={!source.trim() || queries.previewMutation.isPending}
            >
              Preview candidates
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={() => void createRun()}
            disabled={
              !source.trim() ||
              queries.createMutation.isPending ||
              (sourceKind !== 'url' && !canCreateUpload)
            }
          >
            {queries.createMutation.isPending ? 'Creating…' : 'Create discovery run'}
          </Button>
          {sourceKind === 'json' && source.trim() && !parseJsonRows(source) ? (
            <Alert tone="danger">JSON input must be an array of candidate objects.</Alert>
          ) : null}
          {queries.previewMutation.error ? (
            <Alert tone="danger">{message(queries.previewMutation.error)}</Alert>
          ) : null}
          {queries.createMutation.error ? (
            <Alert tone="danger">{message(queries.createMutation.error)}</Alert>
          ) : null}
          {currentPreview ? (
            <div className="grid gap-1 text-sm">
              <p>
                {currentPreview.accepted.length} accepted · {currentPreview.duplicates.length}{' '}
                duplicate rows · {currentPreview.errors.length} errors
                {currentPreview.truncated ? ' · truncated' : ''}
              </p>
              {currentPreview.errors.map((error) => (
                <p key={`${error.row}-${error.field}`} className="text-danger">
                  Row {error.row}: {error.field} — {error.message}
                </p>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Discovery runs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {(queries.runsQuery.data ?? []).map((run) => (
            <button
              key={run.id}
              type="button"
              className="hover:bg-surface-hover flex items-center justify-between rounded-sm p-2 text-left"
              onClick={() => queries.setSelectedRunId(run.id)}
            >
              <span>
                {run.input_kind} · {formatUtcTimestamp(run.created_at)}
              </span>
              <Badge>{run.status}</Badge>
            </button>
          ))}
          {queries.runsQuery.isLoading ? <p className="text-muted text-sm">Loading runs…</p> : null}
          {!queries.runsQuery.isLoading && !queries.runsQuery.data?.length ? (
            <p className="text-muted text-sm">No discovery runs yet.</p>
          ) : null}
        </CardContent>
      </Card>
      {(['own', 'competitor'] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle>{kind === 'own' ? 'Own candidates' : 'Competitor candidates'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {candidates[kind].map((candidate) => {
              const targetMatches = candidate.matches.filter((match) => match.target_id);
              return (
                <div
                  key={candidate.id}
                  className="border-border grid gap-2 rounded-sm border p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong>{dash(identityName(candidate.identity))}</strong>
                    <Badge>
                      {candidate.matches.some((match) => match.review_required)
                        ? 'Review required'
                        : 'Ready for review'}
                    </Badge>
                  </div>
                  <p className="text-muted">
                    Confidence {candidate.extraction_confidence.toFixed(2)} · artifact{' '}
                    {candidate.artifact_id}
                  </p>
                  {candidate.matches.map((match, index) => (
                    <p key={`${candidate.id}-${index}`} className="text-muted">
                      {match.target_kind}: {match.confidence.toFixed(2)} —{' '}
                      {match.reasons.join(', ') || 'No deterministic match reason'}
                    </p>
                  ))}
                  {targetMatches.length > 0 ? (
                    <label className="text-foreground grid gap-1">
                      <span>Catalog target</span>
                      <select
                        aria-label={`Match target for ${identityName(candidate.identity) ?? 'candidate'}`}
                        className={inputClasses}
                        value={selectedTargets[candidate.id] ?? ''}
                        onChange={(event) =>
                          setSelectedTargets((current) => ({
                            ...current,
                            [candidate.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Create a new catalog product</option>
                        {targetMatches.map((match) => (
                          <option
                            key={match.target_id ?? match.target_kind}
                            value={match.target_id!}
                          >
                            {match.target_kind} · {match.target_id} · {match.confidence.toFixed(2)}
                            {match.review_required ? ' · review required' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        queries.decisionMutation.mutate({
                          candidateId: candidate.id,
                          body: {
                            status: 'accepted',
                            target_id: selectedTargets[candidate.id] || null,
                          },
                        })
                      }
                      disabled={queries.decisionMutation.isPending}
                    >
                      Accept / review
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        queries.decisionMutation.mutate({
                          candidateId: candidate.id,
                          body: { status: 'rejected' },
                        })
                      }
                      disabled={queries.decisionMutation.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                  {queries.decisionMutation.error &&
                  queries.decisionMutation.variables?.candidateId === candidate.id ? (
                    <Alert tone="danger">{message(queries.decisionMutation.error)}</Alert>
                  ) : null}
                </div>
              );
            })}
            {!candidates[kind].length ? (
              <p className="text-muted text-sm">No {kind} candidates in this selection.</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
