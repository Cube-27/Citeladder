'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ReadError } from '@/components/ui/read-error';
import { queryKeys } from '@/lib/api/query-keys';
import { runsApi } from '@/lib/api/runs';
import {
  searchIntelligenceApi,
  type SearchIntelligenceDataset,
} from '@/lib/api/search-intelligence';
import { useProjectContext } from '@/lib/project/project-context';

export function SearchIntelligenceCitationMatcher({
  datasets,
  onDerived,
}: Readonly<{ datasets: SearchIntelligenceDataset[]; onDerived: () => Promise<void> }>) {
  const { activeProject } = useProjectContext();
  const [selectedAudits, setSelectedAudits] = useState<string[]>([]);
  const referring = datasets.find((dataset) => dataset.dataset_kind === 'referring_domains');
  const audits = useQuery({
    queryKey: queryKeys.runs.list({ project_id: activeProject?.id }),
    queryFn: ({ signal }) =>
      runsApi.listAudits(
        { project_id: activeProject!.id },
        { signal, workspaceId: activeProject!.workspace_id },
      ),
    enabled: Boolean(activeProject && referring),
  });
  const derive = useMutation({
    mutationFn: () =>
      searchIntelligenceApi.deriveCitationMatches(
        activeProject!.id,
        referring!.id,
        selectedAudits,
        { workspaceId: activeProject!.workspace_id },
      ),
    onSuccess: onDerived,
  });
  if (!referring) return null;
  if (audits.isError)
    return (
      <ReadError
        error={audits.error}
        fallback="Visibility audits could not be loaded."
        onRetry={() => void audits.refetch()}
      />
    );
  const toggle = (auditId: string) =>
    setSelectedAudits((current) =>
      current.includes(auditId) ? current.filter((id) => id !== auditId) : [...current, auditId],
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Match backlinks to Visibility citations</CardTitle>
        <p className="text-muted text-sm">
          Select the exact persisted audits to intersect with this referring-domain snapshot.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {derive.isError ? <Alert>{derive.error.message}</Alert> : null}
        <div className="grid max-h-44 gap-2 overflow-y-auto">
          {audits.data?.slice(0, 20).map((audit) => (
            <label
              key={audit.id}
              className="border-border-subtle flex items-center justify-between gap-3 border-b py-2 text-sm"
            >
              <Checkbox
                checked={selectedAudits.includes(audit.id)}
                onCheckedChange={() => toggle(audit.id)}
                label={new Date(audit.created_at).toLocaleString()}
              />
              <span className="text-muted">{audit.status}</span>
            </label>
          ))}
        </div>
        <div>
          <Button
            size="sm"
            disabled={!selectedAudits.length || derive.isPending}
            onClick={() => derive.mutate()}
          >
            Create citation match dataset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
