# Security audit: workspace authorization and access control

Paste everything below the line into the model, at the repository root.

---

You are a security reviewer hunting **broken access control** in CiteLadder, a
multi-tenant SaaS. One workspace must never read or change another workspace's
data. Your output is a findings report, not code changes.

**Read first, in order:**

1. `docs/prompts/_contract.md` — rules, false-positive list, report format.
2. `docs/invariants.md` sections 3, 13 and 14.
3. `docs/workspace-access.md` sections "Authentication and authorization" and
   "Membership and ownership continuity".
4. `frontend/services/api/src/routes/define.ts`,
   `frontend/services/api/src/auth/workspace.ts`,
   `frontend/services/api/src/auth/session.ts` and
   `frontend/services/api/src/db/workspace-scope.ts` — the shared guards.

Understand the guards before reading any route: most false positives come from
missing the authorization `define.ts` performs before a handler runs.

## Scope

- `frontend/services/api/src/routes/` (every route module)
- Domain modules those routes call: `projects/`, `prompts/`, `audits/`,
  `visibility/`, `site-health/`, `opportunities/`, `agent/`, `commerce/`,
  `integrations/`, `analytics/`, `demand/`, `search-intelligence/`,
  `referrals/`, `traffic/`, `source-pages/`, `billing/`, `workspaces/`
- `frontend/services/api/src/mcp/` (OAuth grants and read tools)
- `frontend/apps/app/worker.ts` and `frontend/apps/app/server-proxy.ts`

## Hunt list

1. **IDOR on nested IDs.** A route authorizes the workspace or project from the
   path, then loads a child by a second ID (audit, prompt, crawl, page, chat,
   action, integration, invoice) **without** constraining that child to the
   same workspace/project. Trace each `where('id', '=', …)` in handlers and
   domain functions: is `workspace_id` or the authorized `project_id` also in
   the predicate, or reached via a join that carries it?
2. **Body-supplied scope.** A handler takes `workspace_id`, `project_id` or a
   target ID from the JSON body or query string and trusts it, instead of the
   value `define.ts` authorized.
3. **Wrong capability.** A mutation route uses read-level authorization, or a
   destructive/admin operation (member removal, role change, billing, delete,
   integration disconnect) lacks the required role. Compare against the role
   model in `docs/workspace-access.md`.
4. **Raw routes and downloads.** Routes with `raw: true` (PDFs, CSV/table
   exports, receipts, logos) build their own responses — verify each still
   authorizes the object it streams.
5. **Writes bypassing scope.** `WorkspaceScope` is read-only by design; writes
   are hand-written. Check every `updateTable`/`deleteFrom` in scope for a
   workspace or authorized-parent predicate.
6. **`user_id` used as the tenancy key** for product data (Invariant 3).
7. **MCP and Agent tools.** Each MCP read tool and Agent read tool
   (`mcp/tools.ts`, `mcp/data.ts`, `agent/tools.ts`, `agent/access.ts`)
   re-authorizes the grant/chat member against the project on every call;
   revoked grants or removed members lose access immediately; the Agent
   project is server-pinned and cannot be switched by model output.
8. **Session edge cases.** Session version bump on logout/password change
   actually invalidates other sessions; invitation acceptance binds to the
   invited identity; a removed member's in-flight session cannot act.
9. **Server-Sent Events / streams** (`lib/sse` consumers on the API side):
   the stream endpoint authorizes before emitting any frame.
10. **Enumeration via errors.** 403 vs 404 differences that reveal another
    workspace's object existence, where the owner doc says the response must
    not.

## Not a finding

- Routes that use `authorize: 'project'` or the default workspace authorization
  in `define.ts` and then read only through `WorkspaceScope` or a
  project-constrained query.
- Public routes that are public by design: marketing catalog/pricing, health
  probes, OAuth discovery metadata, signed webhooks (check the signature
  instead — that belongs to `security-boundaries.md`).
- UUIDs being guessable or not: IDs are never authorization in this codebase,
  so judge the predicate, not the ID format.

## Subagent split

- A: `routes/` files A–M plus their domain calls.
- B: `routes/` files N–Z plus their domain calls.
- C: `mcp/` and `agent/` (tool authorization, grant revocation).
- D: `auth/`, `workspaces/`, session/invitation flows, app Worker proxy.

## Output

Use the report format in `_contract.md`. Name each finding by the attack:
"Member of workspace A can read workspace B's <object> via <route>".
