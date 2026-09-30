export type McpPrincipal = {
  userId: string;
  grantId: string;
  workspaceIds: string[];
  tokenHash: string;
};
export type Evidence = Record<string, unknown>;
export type ReadScope = { workspaceId: string; projectId: string };
