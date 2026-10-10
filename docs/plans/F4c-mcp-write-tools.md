# F4c — MCP write tools with confirmation

Competitive tracker row F4, PR 3 of 3. **Requires [F4a](F4a-public-api-and-keys.md)**
(Actor + commands) and **[F4b](F4b-mcp-move-to-api-host.md)** (single MCP origin).
Owner documents: [MCP](../mcp.md), [Invariants](../invariants.md) §10,
[Agent](../agents.md), [Decisions](../decisions.md).

Complete for implementation; decisions settled. Follow `CLAUDE.md`, the test
skill and the TypeScript skill. Verified at 8a0647035.

## Settled decisions

| ID | Decision |
|---|---|
| D4.2 | MCP writes approved. Invariant 10 amended: a write confirmed through `confirm_change` (or MCP elicitation) by a grant holding `citeladder:write`, for a member whose live role allows it, is an explicit user decision. |
| D4.4 | Prompts added via MCP are **active immediately** after confirmation (no candidate staging). |
| Consent | New grants choose read-only or read + write; **Allow changes** is unchecked by default. |
| Workspace | Every write tool takes `project_id`; the workspace is the project's; the member's live role in that workspace decides. |
| In-app Agent | Stays read-only. Unchanged. |
| Greenfield | No re-consent flow for old grants. |

## Current state (verified)

- Scope narrowing hard-coded to `mcpPolicy.read_scope = 'citeladder:read'`:
  `src/mcp/registration.ts` `validateRegistration`;
  `src/mcp/oauth-routes.ts:180,192` (`scopes_supported`), `:236-239`
  (authorize stores `[read]`); `src/mcp/oauth.ts:64-65,329-330` (token/refresh
  require read), `:403-408` (refresh may narrow, never expand);
  `src/mcp/server.ts:139` (WWW-Authenticate). No `citeladder:write` exists.
- Grants table `mcp_oauth_grants` (baseline ~:1531: workspace_ids, scopes
  jsonb, resource, hashed tokens, revoked_at, last_used_at).
- Tools: `src/mcp/tools.ts` with one shared `annotations` const (:497-506,
  read-only hints); `server.ts` INSTRUCTIONS start "Read-only…";
  CAPABILITIES has no elicitation.
- Live authorisation `src/mcp/data.ts` (`authorizedWorkspaceIds`,
  `liveWorkspaceIds`, `rolesWith('read')`).
- Budgets `registration.ts` `admitToolCall` (grant 120/min, user 600/min;
  constants in `src/config/mcp.ts`).
- Consent page `src/mcp/consent-page.ts:169,208` hard-coded "Read-only".
- Settings `components/settings/mcp-connections.tsx`, contract
  `packages/contracts/src/mcp.ts` (`mcpConnectionSchema`).
- Reference generator `scripts/export-mcp-tool-reference.ts` writes
  `apps/docs/src/data/mcp-tools.json` with `access: 'read_only'`.
- Plugin `plugins/citeladder/plugin.json`: three negative review cases
  (publish, acquisition, "activate prompts and save Actions as
  implemented").

## Design

### Scopes and consent

- `src/config/mcp.ts`: `write_scope: 'citeladder:write'`,
  `scopes_supported: [read, write]`, `write_calls_per_minute: 30`.
- Registration accepts both scopes; authorize stores the scopes the user
  consents to (read always; write only if **Allow changes** checked);
  token/refresh carry granted scopes; refresh may narrow, never expand.
- Consent page: section **Allow changes** (unchecked) listing: add and edit
  topics and prompts, add competitors, launch and cancel audits, create
  schedules, update Action status, declare Actions implemented. Copy: "Your
  assistant must show you each change and you confirm it before it
  happens." Shown only if the user's role in at least one selected
  workspace is Member or above.
- Settings MCP connections list shows "Read" or "Read and change".

### Confirmation

- Table `mcp_confirmations (id, workspace_id, grant_id, user_id, kind,
  project_id, payload jsonb, payload_hash, token_hmac, expires_at,
  consumed_at, created_at)`; token = 32 random bytes (base62), HMAC with the
  MCP token secret; TTL 10 min; single use.
- `prepare_*` tools validate through the F4a commands in **dry-run mode**
  (add a `dryRun` option to the relevant commands that runs all validation
  and admission and returns the preview without writing) and return:
  human-readable preview (rows admitted, rows dropped with reason, prompt
  occupancy after, estimated credits for audits), `confirmation_token`,
  `expires_at`.
- `confirm_change(confirmation_token)`: lock row, check unexpired/unconsumed,
  grant not revoked, grant has write, live membership + role, entitlement,
  funding; re-run the command for real with the stored payload; mark
  consumed in the same transaction as the command's writes (commit before
  any network I/O the command triggers). Payload mismatch impossible by
  construction; a changed world (e.g. occupancy now full) returns the
  command's normal error.
- Elicitation: if the client declares the `elicitation` capability, a
  prepare tool may elicit a yes/no and then execute directly; the token path
  remains for every client.

### Tools

Direct (single step): `create_topic`, `rename_topic`, `update_prompt_text`,
`add_competitor`, `update_action_status`.
Prepare/confirm: `prepare_add_prompts` (1–50, activated on confirm),
`prepare_archive_prompts` (status → archived/disabled per the prompts
owner's vocabulary), `prepare_launch_audit` (estimate shown;
`max_estimated_credits` frozen into the payload), `prepare_schedule`,
`prepare_declare_implemented`, `cancel_audit` (direct but
`destructiveHint`), `confirm_change`.

- Per-tool annotations replace the shared const: reads keep
  `readOnlyHint:true`; writes `readOnlyHint:false`; `destructiveHint:true` on
  archive, cancel, delete-like; `idempotentHint` where true;
  `openWorldHint:false`.
- Write tools are listed only when the grant holds write (`tools/list` reflects
  scopes).
- Budget: writes count toward existing budgets plus a write sub-budget
  30/min per grant (`enforceSubjectRequest`, `mcp_grant`).
- Security event `mcp.write` (kind, project) on every executed write.
- Server INSTRUCTIONS: read-only sentence replaced with: "Writes need the
  user's explicit confirmation: call a prepare tool, show the preview to the
  user, call confirm_change only after they agree."
- Tool output follows the user-facing stance: no internal IDs in preview
  prose (IDs only in structured fields the client needs).

## Commit slices

1. Scope plumbing (config, registration, authorize, token, refresh,
   WWW-Authenticate) + consent page + settings display + grant tests.
2. Command dry-run mode + `mcp_confirmations` + `confirm_change`.
3. Write tools, per-tool annotations, scoped `tools/list`, write budget,
   security events, INSTRUCTIONS, optional elicitation.
4. Reference generator (`access: 'read' | 'write'` per tool), docs site,
   plugin, marketing, internal docs, invariant 10, decisions.

## Affected surfaces checklist

- **Backend:** `src/mcp/{registration,oauth-routes,oauth,server,tools,data,connections,consent-page}.ts`,
  new `src/mcp/confirmations.ts`, `src/config/mcp.ts`, `src/commands/*`
  (dryRun), `src/auth/security-events.ts`.
- **Schema:** `mcp_confirmations` in `0001_baseline.sql`; regenerate db-schema.
- **Contracts:** `packages/contracts/src/mcp.ts` (connection scopes).
- **App UI:** `components/settings/mcp-connections.tsx`,
  `components/mcp/connect-strip.tsx` copy ("read and, if you allow it,
  change with confirmation").
- **Plugin:** `plugins/citeladder/plugin.json` — change the third negative
  case to "activate prompts **without confirmation**", add a positive case
  "add three prompts after the user confirms the preview"; long
  description; the three `skills/*/SKILL.md` gain one rule: "never call
  confirm_change without the user's explicit yes in this conversation";
  `README.md`.
- **Marketing:** `lib/marketing-content/ai-reference.ts:68-69,222`,
  `landing/landing-data.ts:9` ("Read your project evidence" → read and act
  with confirmation), `platform-pages-improve.ts` MCP section,
  `components/marketing/scenes/views-act.tsx` tool list,
  `llms.ts:36`. Keep claims exact: changes require the user's confirmation.
- **Docs site:** `mcp.md` (remove "read-only"), `mcp/connect.md:99`,
  `mcp/access.md` (scopes, roles, confirmation), `mcp/examples.md` (one
  confirmed prompt-add example), `mcp/tools.md` + `ToolReference.astro`
  (access column), regenerated `mcp-tools.json`, `changelog.md`.
- **Internal docs:** `docs/mcp.md` (rewrite "read interface" → read and
  confirmed writes), `docs/invariants.md` §10, `docs/decisions.md`,
  `docs/architecture.md:23` MCP row, `docs/agents.md:184-189` (Agent stays
  read-only — restate), `CLAUDE.md` guardrail line about MCP if it says
  read-only (owner-requested change; keep the Agent sentence), tracker
  status + log.

## Tests

Registration/authorize/token carry write only when consented; refresh never
expands; read-only grant does not list or execute write tools; viewer with a
write grant refused at execution; confirmation token single-use, expiry,
revoked grant at confirm, role demoted between prepare and confirm,
cross-workspace project refused; dry-run writes nothing; confirmed prompt
add activates prompts; write sub-budget 429; annotations per tool; reference
drift check; workspace isolation (real PostgreSQL).

## Validation

Focused MCP tests while iterating; `./scripts/check.ps1` once at the end
(auth, schema, contracts). Plugin: run its review-case check if one exists.

## Done when

An MCP client with write consent can prepare and confirm a prompt add and an
audit launch; read-only grants are unchanged; invariant 10 and decisions
record the amendment; tracker row F4 is `done`.
