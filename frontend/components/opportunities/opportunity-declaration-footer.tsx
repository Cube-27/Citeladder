import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { VerificationObservations } from '@/components/opportunities/verification-observations';
import { Button } from '@/components/ui/button';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { ReadError } from '@/components/ui/read-error';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { opportunitiesMutations, opportunitiesQueries } from '@/lib/api/opportunities';
import type { OpportunityDetail } from '@/lib/api/types';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

/**
 * The member's declaration and its observed verification. Workflow status
 * belongs to the Action that groups this Opportunity, not to the row.
 */
export function OpportunityDeclarationFooter({
  detail,
  projectId,
}: Readonly<{ detail: OpportunityDetail; projectId: string }>) {
  const workspaceId = useActiveWorkspaceId();
  if (!workspaceId) return null;
  return (
    <ScopedDeclarationFooter
      key={`${workspaceId}:${projectId}:${detail.id}`}
      workspaceId={workspaceId}
      projectId={projectId}
      detail={detail}
    />
  );
}

function ScopedDeclarationFooter({
  workspaceId,
  projectId,
  detail,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  detail: OpportunityDetail;
}>) {
  const declaration = useImplementationDeclaration(workspaceId, projectId, detail.id);
  const declarations = useQuery(
    opportunitiesQueries.implementationEvents(workspaceId, projectId, detail.id),
  );
  const [idempotencyKey] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? `${detail.id}-${Date.now()}`,
  );
  const implementation =
    declaration.data ?? declarations.data?.items.find((item) => item.opportunity_id === detail.id);
  const declare = () => declaration.mutate(declarationPayload(detail, projectId, idempotencyKey));

  return (
    <div className="grid gap-2">
      {declaration.isError ? (
        <MutationNotice
          notice={mutationNoticeForError(declaration.error, {
            action: 'declare this implementation',
          })}
          onRetry={() => declaration.variables && declaration.mutate(declaration.variables)}
        />
      ) : null}
      {declarations.isError ? (
        <ReadError
          error={declarations.error}
          fallback="Existing declarations could not be loaded."
          onRetry={() => void declarations.refetch()}
          pending={declarations.isFetching}
        />
      ) : null}
      <VerificationObservations implementation={implementation} />
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          // Until the read succeeds, no declaration is not yet known to be absent.
          disabled={declaration.isPending || Boolean(implementation) || !declarations.isSuccess}
          onClick={declare}
        >
          I implemented this
        </Button>
      </div>
    </div>
  );
}

function useImplementationDeclaration(
  workspaceId: string,
  projectId: string,
  opportunityId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    ...opportunitiesMutations.createImplementationEvent(workspaceId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: opportunitiesQueries.implementationEvents(workspaceId, projectId, opportunityId)
          .queryKey,
      }),
  });
}

function declarationPayload(detail: OpportunityDetail, projectId: string, idempotencyKey: string) {
  const targetId =
    typeof detail.evidence.site_url_id === 'string' ? detail.evidence.site_url_id : undefined;
  return {
    projectId,
    idempotencyKey,
    input: {
      opportunity_id: detail.id,
      target_site_url_ids: targetId ? [targetId] : [],
      declared_implemented_at: new Date().toISOString(),
      expected_checks: [],
    },
  };
}
