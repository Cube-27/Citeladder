# CiteLadder ChatGPT plugin plan

Status: proposed, retained planning; implementation is not assigned.
Prepared: 5 October 2026. Platform documentation checked on the same date.

Build a CiteLadder plugin that lets users inspect their CiteLadder project
evidence and discuss it in ChatGPT. Extend the hosted MCP owner with a compact
analytics UI and public workflow skills. Keep CiteLadder's application as the
place for onboarding, acquisition, configuration and consequential actions.

The recommended first release is a read-only pre-launch prototype: Visibility,
Trends, Sources and Site Health, followed by sidebar/context integration and
public-directory submission. Events are a separately gated expansion. This
plan does not authorize implementation, deployment, publication or live tests.

## Product assumptions and decisions

The user confirmed that CiteLadder has no customers yet. There is no existing
customer cohort to pilot with. The proposed sequence is to prove the experience
using founder-owned projects and sample data, then make it accessible to new
users through public discovery. Alerts follow later. This is a recommendation,
not a claim that a customer pilot or demand validation has already happened.

Proposed defaults:

- Design for growth, content and search teams; validate first with the founder
  and realistic sample workspaces. Support multiple authorized workspaces, with
  one explicit project per analytical view.
- Make the first experience useful without sidebar extensions: ask a question,
  inspect a card, follow evidence, and open the full product when needed.
- Reuse current workspace access and commercial policy. Do not introduce a
  plugin-specific paid tier or promise free data acquisition.
- Let ChatGPT perform the conversation. Do not route ordinary plugin analysis
  through a second CiteLadder Agent run or bill an internal model attempt.
- Keep results in the host conversation. Saving a CiteLadder deliverable or
  Action is outside this release and needs a separate explicit-write design.

The initial test audience is the founder; invited testers can join when
available, but are not a prerequisite. Before public release, decide eligible
product plans, supported ChatGPT surfaces,
support ownership and privacy disclosures. Before events, decide thresholds,
notification volume, retention and entitlement policy. These decisions do not
block retaining this plan.

## Verified platform capabilities

These are current documentation claims, not proof of CiteLadder's access or a
verification of the pasted text's precise DevDay announcement date.

| Capability | Verified scope and planning consequence |
| --- | --- |
| Plugin packaging and discovery | Plugins can bundle skills and MCP capabilities with optional UI; ChatGPT and Codex share a directory, but individual capabilities remain surface-specific. Keep a useful text/structured-data path. [Architecture](https://developers.openai.com/plugins/concepts/plugins) |
| Interactive UI | MCP Apps supports UI resources and tool-result interaction. Use the standard bridge first and optional ChatGPT extensions only where needed. [UI guide](https://developers.openai.com/plugins/build/chatgpt-ui) |
| Sidebar and conversation context | Sidebar fullscreen apps, conversation panels, deep links and bidirectional Model-App Context are documented. Web extensions are still described as coming soon for Free and Go; composer mentions are desktop-only. Feature-detect and verify the actual pilot surface. [Extensions](https://developers.openai.com/plugins/build/extensions) |
| Authentication | OAuth 2.1, S256 PKCE, resource metadata and resource binding apply. DCR remains a supported client-registration path; CIMD is not mandatory for this plan. [Authentication](https://developers.openai.com/plugins/build/auth) |
| Events | Requires MCP `2026-07-28`; documented for Work web, Work desktop with Cloud selected, and dots. ChatGPT supports webhook delivery and callback verification, not polling or streaming delivery. Treat this as a later capability. [MCP Events](https://developers.openai.com/plugins/build/mcp-events) |
| Sign in with ChatGPT | Commercial access remains a selected-partner trial. Identity and optional ChatGPT-plan inference usage are separate permissions; neither is required for MCP OAuth. Defer both. [Sign-in quickstart](https://developers.openai.com/siwc/quickstart) |
| Public release | Packaging, MCP connection/domain verification, automated scans, reviewer access and review materials are separate from approval and publication. Directory placement or acquisition is not guaranteed. [Submission](https://developers.openai.com/plugins/deploy/submission) |

Recheck the official schemas and availability at the start of each platform
slice. Do not freeze SDK versions or copy protocol fields from the pasted
recommendations without that check.

## Repository baseline and gaps

The starting point is stronger than the recommendation to "fix authentication
first" implies. [MCP](../mcp.md) documents an existing OAuth and read-tool owner;
the inspected code supports that foundation. Production client acceptance is
still a separate gate.

| Area | Existing owner | Work needed |
| --- | --- | --- |
| Transport | [server.ts](../../frontend/services/api/src/mcp/server.ts) implements stateless HTTP, legacy initialization and `2026-07-28` discovery; returns text and structured results | Add UI resource delivery and optional extension negotiation without replacing the transport by default |
| OAuth and access | [oauth.ts](../../frontend/services/api/src/mcp/oauth.ts), [oauth-routes.ts](../../frontend/services/api/src/mcp/oauth-routes.ts), [data.ts](../../frontend/services/api/src/mcp/data.ts) | Exercise real client linking, refresh and revocation; fix demonstrated compatibility gaps only |
| Tool contracts | [tools.ts](../../frontend/services/api/src/mcp/tools.ts), [evidence.ts](../../frontend/services/api/src/mcp/evidence.ts), [config](../../frontend/services/api/src/config/mcp.ts) | Retain bounded tools, provenance and strict arguments; add only missing analytical reads |
| Visibility | Existing audit/results/sources tools; [trend reader](../../frontend/services/api/src/visibility/trends.ts) and [browser routes](../../frontend/services/api/src/routes/visibility.ts) | No dedicated trend tool in the inspected catalog. Adapt the existing reader and inspect selection compatibility before enabling period comparisons |
| UI | [Visibility components](../../frontend/components/visibility/), [trend contract](../../frontend/packages/contracts/src/visibility-trends.ts) | Reuse suitable presentation primitives and contracts; add an isolated MCP App entry, not the authenticated SPA shell |
| Skills | [Agent owner](../agents.md) and [private assets](../../frontend/services/api/assets/agent-skills/) | Internal skill bodies are not public MCP content. Author explicitly public workflows over public tools; do not copy the internal catalog wholesale |
| Events | No event methods in the inspected MCP dispatcher | Requires subscription lifecycle, producer integration and durable delivery; protocol-version support alone is insufficient |

The API package currently uses a custom Hono transport, not an MCP SDK server.
An SDK may help implement UI/extensions, but installing one is not permission to
replace OAuth, authorization or the existing wire contract. Any replacement
must meet the [replacement gate](../invariants.md#replacement-and-retirement).

## Customer experience

A user with a configured project connects CiteLadder, explicitly consents to selected
workspaces, selects an authorized project and asks, "What changed in our AI
visibility?" The plugin shows measured changes when comparable evidence exists,
offers source drill-down, and distinguishes observations from possible explanations.

A new user arriving from ChatGPT gets a clear account-connection path. If they
have no project or measurements, explain what is missing and link to existing
CiteLadder signup/onboarding or the relevant acquisition screen. After the user
completes setup and explicitly starts any required measurement in CiteLadder,
they can return and read the persisted results. Installation must not imply an
instant visibility audit. A dedicated in-ChatGPT onboarding flow can be evaluated
after this handoff works; public launch must still test the first-time journey.

| Surface | Initial behavior | Evidence contract |
| --- | --- | --- |
| Visibility overview | Engine and cohort selection, observed mention/citation measures, selected audit and freshness | Use `read_visibility_audit` and `read_visibility_results`; resolve Latest once and carry concrete evidence IDs |
| Trends | Bounded period, metric and competitor comparisons with a chart and accessible table | Add a thin authorized adapter over the existing trend owner; preserve model/retrieval/cohort compatibility and gaps |
| Sources | Domain/URL paging and source-to-answer evidence navigation | Use `read_visibility_sources` and authorized retrieval; retain denominators and distinguish answer co-occurrence from publisher-page presence |
| Site Health | Latest persisted score, coverage, limitations and existing prioritized findings | Use `read_site_health`, `read_site_pages` and, where appropriate, `read_opportunities`; do not imply a historical filter changed a latest-only snapshot |

Shared selection includes workspace/project, concrete audit or period, engine,
cohort and optional competitor. A period selects a trend window; it does not
silently turn an audit-scoped Sources tool into a cross-period aggregate. If a
common selector cannot be honored, display the actual scope or disable it.
Any missing aggregate belongs in the existing domain read owner before exposure.

Always show truthful disconnected, no-project, no-evidence, partial, stale,
non-comparable, revoked-access and retryable-error states. Never fill chart gaps
with zero. Source references remain reachable. No chart recomputes a product
metric or invents causal attribution.

Query Fanout, AI Traffic/referrals, advanced competitor exploration and rich
prompt forms are later additions after the initial workflows prove useful.
Do not promise prompt activation or acquisition from a form in this release.

## Architecture and authority

The new client path is ChatGPT UI/skills → authenticated `/mcp` → the existing
authorized readers → persisted PostgreSQL projections. Product logic, metric
definitions and access policy retain their existing owners.

- Product reads recheck the live grant, selected workspaces and current member
  capabilities. UI selection, model context and deep links are untrusted input,
  never authorization. Resource loads must not contain another user's data.
- Serve a small UI bundle through the MCP resource path. It calls tools through
  the host bridge; it does not receive bearer tokens or depend on CiteLadder
  browser cookies. Existing browser API calls remain same-origin `/api/v1`.
- Treat tool results and third-party evidence as untrusted data. Validate bridge
  messages, restrict resource/network origins through CSP, and bound payloads.
  Keep credentials and unrelated evidence out of UI state, URLs and logs.
- Send minimal selection context, evidence references and limitations to the
  model. On project switch, clear old results and invalidate in-flight responses.
  Model-driven changes pass the same validation and authorization as clicks.
- Plugin skills guide host behavior but cannot enforce the host's global tool
  budget or other plugins. CiteLadder enforces its own per-request bounds and
  exposes no product write tools. Do not claim the internal Agent's run limits,
  stored manifests or output persistence apply to ChatGPT conversations.
- New toggles, sizes and limits belong in the existing MCP/frontend config
  owners. Existing clients keep the current text and structured contracts.

See [invariants](../invariants.md), [workspace access](../workspace-access.md),
[Visibility](../visibility-prompt.md), [architecture](../architecture.md) and
[design](../design.md) for binding constraints and domain semantics.

## Dependency ordered implementation

### Slice 1 Connection and compatibility

Inventory current protocol routes, OAuth metadata, tool schemas and current
client callers. Build a compatibility matrix for ChatGPT Work web, the selected
desktop mode and headless Codex. Keep DCR unless testing proves a concrete need
for another registration method; do not advertise unsupported CIMD.

Use a disposable test workspace to exercise linking, explicit workspace consent,
denial, reconnect, token rotation, grant revocation and membership removal.
Check configured apex protocol origin versus application consent origin and
resource binding through deployment ingress. Implement only demonstrated gaps.

Exit: selected clients can discover and read authorized persisted evidence;
foreign project IDs and revoked access fail. Record deployed-host evidence
separately from repository tests. This plan itself performs no live acceptance.

### Slice 2 Interactive analytics

Add MCP App resource metadata and a minimal UI bundle under the existing pnpm
workspace. Choose its exact package location after inspecting frontend build
owners; avoid a second product shell. Begin with one complete overview-to-source
journey, then add Trends and Site Health.

Add the missing trend adapter over the current visibility service. Preserve
shared DTOs, explicit selection and provenance. Adapt existing source/summary
contracts only when the desired view requires it. Keep existing tools useful
without UI; add a small presentation entry only if attaching metadata to the
existing reads cannot support the journey cleanly.

Exit: the four surfaces render real persisted fixtures, match domain totals,
retain audit/window identity on drill-down and work with keyboard navigation.
Zero, missing, partial and incompatible comparisons remain distinguishable.

### Slice 3 Public workflows and pilot package

Create public skills for AI Visibility Review and Technical SEO Triage. Add a
user-invoked Weekly AI Search Review once compatible period reads exist. Each
selects an authorized project, checks evidence availability, makes bounded
reads, cites returned evidence and separates observations from recommendations.
The weekly workflow is not a scheduling promise.

Use existing methodologies as design input, but review every publicly shipped
instruction and tool reference. No internal Agent-only tools, private templates,
secrets or hidden runtime requirements enter the package. Do not change private
skill exposure. Any later shared-methodology extraction is a separate reviewed
cutover under the Agent owner, with both consumers validated.

Package a stable plugin identity, public skills and the existing MCP connection
using the current [packaging guide](https://developers.openai.com/plugins/build/plugins).
Keep the bundle in repository source control; exclude fixtures containing
customer data and credentials. Start with a private/personal pilot.

Exit: each workflow completes with actual public tool names, handles absent
evidence honestly and gives a useful headless answer. The package can be
installed on the founder's chosen test surface without changing product permissions.

### Slice 4 Sidebar and shared conversation context

Reuse the same UI as a sidebar/fullscreen entry and conversation panel where
supported. Add deep links and the minimal selection context described above.
Support "compare with this competitor" without stale project results, UI-model
feedback loops or hidden persistence. Unsupported hosts fall back to cards,
text and links to the full application.

Exit: UI selections inform a follow-up question, model-requested selections
update the visible view correctly, and project switches cannot display late
results from another context. Lack of extension access does not block the
Slice 3 pilot or the headless experience.

### Slice 5 Public release

After founder testing and any available invited-user feedback, prepare a
dedicated reviewer account with sample data,
five positive cases, three negative cases, an accessible walkthrough and release
notes. Verify publisher identity, support/privacy/terms URLs, endpoint readiness
and the portal's current requirements. Complete domain verification and scans
when publication work is explicitly assigned. These materials and the submission
flow follow the [official review guide](https://developers.openai.com/plugins/deploy/submission).

Proposed positive cases: connect/select project; overview; compatible trend
comparison; Sources drill-down; Site Health triage. Negative cases: foreign
project access; unsupported publish/crawl request; absent or incompatible
evidence. Also test a new user with no account/project through the onboarding
handoff and return to the plugin. Run review cases on the reviewer account
before submission.

Exit: reviewer materials reflect supported behavior, engineering checks pass,
pilot acceptance is recorded, and required commercial/privacy decisions are
resolved. Submission, approval and publication remain distinct milestones.

### Slice 6 Optional event subscriptions

Start with one proposed `visibility.changed` event over compatible persisted
measurements. Do not launch the pasted nine-event catalog at once. An initial
product rule should specify a named metric, eligible denominator, engine/cohort,
two concrete measurements, minimum coverage, relative percent versus percentage
points, and a deduplication/cooldown policy. A zero baseline or incompatible
measurement yields no claimed percentage movement. Thresholds require a product
decision, not a hardcoded interpretation of "10%".

Protocol work includes authenticated event discovery, subscription/refresh and
unsubscribe, verified HTTPS callbacks, signed delivery, expiry and stable retry
IDs. Validate callback addresses at connection time, refuse private destinations
and redirects, and keep signing secrets encrypted. Follow the current
[event contract](https://developers.openai.com/plugins/build/mcp-events).

Proposed CiteLadder design: reuse domain-owned comparison results and produce a
delivery intent when the relevant measurement transaction commits, or through
an idempotent bounded reconciliation owner. Add subscription and delivery state
under the existing MCP and PostgreSQL worker architecture, never on a read path.
Use leases, bounded retries, delivery limits and commit-before-network-I/O.
Do not add a separate alert metric store or a second acquisition scheduler.

Authorize subscriptions against the grant and project; recheck continuing
membership and consent immediately before delivery. Bind lifecycle identity to
the grant rather than a rotating access-token string, with explicit revocation
and expiry semantics. Remove queued eligibility after unsubscribe, workspace
removal or disconnection. Already transmitted data cannot be recalled.

Events should carry minimal evidence IDs and a measured-change summary, not raw
private answers or instructions to execute actions. User-requested monitoring
authorizes that notification flow only. Host analysis must not trigger product
mutations or recursively generate notifications.

This expands MCP ownership beyond OAuth records to subscription/delivery state.
Before implementing it, settle that cross-feature decision and update the
architecture/MCP owners with the accepted boundary. Update schema metadata and
the singular initial migration, generate types and verify on disposable data.

Exit: real PostgreSQL tests cover duplicate producer commits, concurrent
subscription refresh, restart/retry, revocation and unsubscribe races; callback
verification and delivery tests use controlled endpoints. A separately
authorized ChatGPT acceptance run proves the full lifecycle. Disable new
subscriptions and delivery independently during rollout.

## Validation and rollout

Follow [AGENTS.md](../../AGENTS.md#validation); do not reproduce full CI locally.
For implementation, select the smallest affected suites:

- Transport/authentication: `mcp-transport.test.ts`, `mcp-oauth.test.ts` and
  affected `mcp-config.test.ts` cases.
- Data adapters: `mcp-evidence.test.ts`, `mcp-retrieval.test.ts` and the relevant
  `visibility-reads.test.ts` or `visibility-folding.test.ts` cases. Include
  workspace isolation, stale cursors, explicit run binding and provenance.
- UI: behavioral tests for selection/drill-down, late responses, reconnect and
  unavailable evidence; inspect cards and fullscreen on supported hosts.
- Skills: scenario evaluation with persisted fixtures and mocked host/tool
  results. Run `agent-skills.test.ts` only if internal packaged inputs change.
- Events: real PostgreSQL concurrency/lifecycle tests plus mocked outbound
  HTTP, signatures and forbidden destinations. No live provider credentials.

Native API tests run from `frontend/services/api` with
`pnpm exec vitest run <selected-test-paths>`, using `API_TEST_DATABASE_URL` for an
explicitly disposable migrated database. Follow the
[isolation instructions](../DEVELOPMENT.md#api-service-typescript), clear inherited live
credentials, and write native output to one reusable log in the worktree's Git
directory. Confirm the current command at execution.
Regenerate the public catalog with `pnpm --filter @citeladder/api mcp:reference`
from `frontend` when public tools change.

Run `./scripts/check.ps1 -CheckOnly` once after an executable slice changing
contracts, authorization, persistence, shared runtime, dependencies or builds is
complete. Use `-All` only when the repository's shared-config rule applies.
CI owns the full selected suites, production builds and E2E. Review each final
diff with [Review.md](../../Review.md); report local and external evidence separately.

Roll out in order: fixture-backed development → founder testing on owned/sample
projects → optional invited testers → public review/release → separately enabled
events. Add config-owned UI/extension
toggles that preserve base MCP reads; roll back through those toggles without
revoking unaffected OAuth grants. Event rollback pauses dispatch and new
subscriptions while preserving audit evidence and explicit unsubscribe.

Before users arrive, acceptance means successful connection-to-first-evidence,
completion of the five positive journeys and the empty-project handoff, and no
unresolved authorization or metric-parity defects. Founder testing demonstrates
functionality, not market demand. After launch, measure onboarding completion,
repeat weekly use and useful evidence drill-downs. Set adoption targets when a
real user cohort exists; instrument minimal operational metadata, not raw
customer prompts or evidence bodies.

## Deferred scope and remaining risks

- Sign in with ChatGPT, ChatGPT-plan inference funding and any Clerk migration.
- Public anonymous domain audits, free acquisition, an embedded replacement for
  existing onboarding, and new pricing. The existing onboarding handoff is in scope.
- Publishing, prompt activation, new crawls, live provider pulls, billing
  changes and saving Agent outputs through MCP.
- File editors/viewers, rich forms, all nine suggested events and replacing the
  full CiteLadder application.

Open risks are actual client/platform access, new protocol evolution, consent
and data-retention disclosures, compatibility of period/audit selections, and
event volume/cost. The pasted recommendation does not establish that the
deployed server works in ChatGPT, that internal skills are publishable, or that
directory discovery will acquire customers. Resolve those through the named
slice gates rather than treating them as prerequisites already satisfied.
