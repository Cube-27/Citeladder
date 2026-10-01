export type McpPrincipal = {
  userId: string;
  grantId: string;
  workspaceIds: string[];
  tokenHash: string;
};
/** Internal evidence readers use live membership, pinned to one project. */
export type EvidencePrincipal =
  | McpPrincipal
  | {
      kind: 'member';
      userId: string;
      workspaceId: string;
      projectId: string;
    };
export type Evidence = Record<string, unknown>;
export type ReadScope = { workspaceId: string; projectId: string };
/** A caller-caused argument problem, surfaced to the client as invalid params. */
export class McpInputError extends Error {}
