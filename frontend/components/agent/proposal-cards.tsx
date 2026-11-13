import { useQuery } from '@tanstack/react-query';

import { isDeclarable, MarkImplementedButton } from '@/components/agent/action-declaration';
import { Confirmation } from '@/components/ui/confirmation';
import { DisplayTime } from '@/components/ui/display-time';
import { Stack } from '@/components/ui/layout';
import { ReadError } from '@/components/ui/read-error';
import { textRole } from '@/components/ui/typography';
import type { AgentMessage } from '@/lib/api/agent';
import { actionsQueries } from '@/lib/api/actions';
import { useWorkspaceCapability } from '@/lib/project/project-context';

type Proposal = AgentMessage['proposals'][number];

/** What a reply proposed, each as a card the person confirms; the Agent itself did nothing. */
export function ProposalCards({
  workspaceId,
  proposals,
}: Readonly<{ workspaceId: string; proposals: readonly Proposal[] }>) {
  if (proposals.length === 0) return null;
  return (
    <Stack gap="compact">
      {proposals.map((proposal) => {
        switch (proposal.kind) {
          case 'declaration':
            return (
              <DeclarationProposal
                key={proposal.action_id}
                workspaceId={workspaceId}
                proposal={proposal}
              />
            );
          default: {
            const _exhaustive: never = proposal.kind;
            return _exhaustive;
          }
        }
      })}
    </Stack>
  );
}

/**
 * "Mark … implemented?": the existing declaration dialog, opened with what the
 * person told the Agent. Its state is the Action's as stored, so a declaration
 * made anywhere shows here as done.
 */
function DeclarationProposal({
  workspaceId,
  proposal,
}: Readonly<{ workspaceId: string; proposal: Proposal }>) {
  const mayWrite = useWorkspaceCapability('write');
  const action = useQuery(actionsQueries.detail(workspaceId, proposal.action_id));
  if (action.isError)
    return (
      <ReadError
        error={action.error}
        fallback="The proposed Action could not be loaded."
        onRetry={() => void action.refetch()}
        pending={action.isFetching}
      />
    );
  if (!action.data) return null;
  const label = action.data.target_label;
  const declaration = action.data.declaration;
  if (declaration)
    return (
      <Confirmation title={`${label} is marked implemented`} state="accepted">
        <p className={textRole('caption')}>
          Went live <DisplayTime value={declaration.declared_implemented_at} dateOnly />. CiteLadder
          measures it from there.
        </p>
      </Confirmation>
    );
  const declarable = isDeclarable(action.data) && mayWrite;
  return (
    <Confirmation
      title={`Mark ${label} implemented?`}
      state="requested"
      actions={
        declarable ? (
          <MarkImplementedButton
            workspaceId={workspaceId}
            action={action.data}
            revision={proposal.revision}
            proposed={{ day: proposal.go_live_day, reference: proposal.deployment_reference }}
          />
        ) : null
      }
    >
      <p className={textRole('caption')}>
        {declarable ? proposalDetail(proposal) : unavailable(mayWrite)}
      </p>
    </Confirmation>
  );
}

function proposalDetail(proposal: Proposal) {
  const what = proposal.revision
    ? `Revision ${proposal.revision.number} of the document`
    : 'Work done outside CiteLadder';
  const live = proposal.go_live_day ? `, live since ${proposal.go_live_day}` : '';
  return `${what}${live}. You confirm the details before anything is declared.`;
}

function unavailable(mayWrite: boolean) {
  return mayWrite
    ? 'This Action can no longer be declared.'
    : 'Only members who can edit this workspace can declare it.';
}
