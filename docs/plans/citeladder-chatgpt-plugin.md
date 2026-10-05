# CiteLadder ChatGPT plugin plan

Status: repository implementation complete on 5 October 2026; installed-client acceptance and public release remain open.
Prepared: 5 October 2026. Platform documentation checked on the same date.

Build a CiteLadder plugin that lets users inspect their CiteLadder project
evidence and discuss it in ChatGPT. Extend the hosted MCP owner with a compact
analytics UI and public workflow skills. Keep CiteLadder's application as the
place for onboarding, acquisition, configuration and consequential actions.

The first milestone is one read-only Visibility experience: Overview,
Trends, Sources and an AI Visibility Review skill. On implementation assignment,
the user waived founder-pilot gating and requested fixture/mock-host verification
without requiring their participation. Repository work may include Site Health
and sidebar/context integration; actual client acceptance remains an external
release check, never a claim inferred from mocks.
[MCP Events](citeladder-mcp-events.md) has its own retained plan and is outside
this implementation roadmap. The user's assignment authorizes repository
implementation and disposable mock-account tests, not deployment or publication.

## Product assumptions and decisions

The user confirmed that CiteLadder has no customers yet. There is no existing
customer cohort to pilot with. The proposed sequence is to prove the experience
using founder-owned projects and private test fixtures, then make it accessible
to new users through public discovery. Alerts follow later. This is a recommendation,
not a claim that a customer pilot or demand validation has already happened.

Proposed defaults:

- Design for growth, content and search teams; validate first with the founder
  and private test workspaces. Support multiple authorized workspaces, with
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
support ownership and privacy disclosures. V1 requires account connection and
uses existing project data. Public sample/demo mode is explicitly out of scope
at the user's direction; do not add public fixture tools or mixed authentication.

## Verified platform capabilities

These are current documentation claims, not proof of CiteLadder's access or a
verification of the pasted text's precise DevDay announcement date.

| Capability | Verified scope and planning consequence |
| --- | --- |
| Plugin packaging and discovery | Plugins can bundle skills and MCP capabilities with optional UI; ChatGPT and Codex share a directory, but individual capabilities remain surface-specific. Keep a useful text/structured-data path. [Architecture](https://developers.openai.com/plugins/concepts/plugins) |
| Interactive UI | MCP Apps supports UI resources and tool-result interaction. Use the standard bridge first and optional ChatGPT extensions only where needed. [UI guide](https://developers.openai.com/plugins/build/chatgpt-ui) |
| Sidebar and conversation context | Sidebar fullscreen apps, conversation panels, deep links and bidirectional Model-App Context are documented. Web extensions are still described as coming soon for Free and Go; composer mentions are desktop-only. Feature-detect and verify the actual pilot surface. [Extensions](https://developers.openai.com/plugins/build/extensions) |
| Authentication | OAuth 2.1, S256 PKCE, resource metadata and resource binding apply. CIMD is preferred when supported and chosen by the builder; DCR remains supported. Keep DCR for the prototype and assess CIMD before public submission. [Authentication](https://developers.openai.com/plugins/build/auth) |
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

A new user chooses **Connect my CiteLadder account** and follows the existing
sign-in/signup flow. There is no sample workspace or anonymous exploration mode.

For a connected user with no project or measurements, explain what is missing
and link to CiteLadder onboarding or the relevant acquisition screen. After the user
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
- Serve static, versioned HTML/JS through a resource such as
  `ui://citeladder/analytics/v1`. UI resources contain no user or project data;
  data arrives only in authenticated tool results. V1 makes no direct CiteLadder API
  calls or other application-initiated network requests from the iframe. Bundle
  assets locally, use the MCP Apps bridge for reads, and keep CSP minimal. No
  bearer tokens or CiteLadder session cookies enter the UI. Existing product
  browser APIs remain same-origin `/api/v1`.
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

### Data and presentation tools

Keep `read_*`, search and fetch tools free of widget metadata. Add dedicated
`render_visibility` and, in the later Site Health slice, `render_site_health`.
Only presentation tools attach the UI resource. The split follows the
[OpenAI UI guidance](https://developers.openai.com/plugins/build/chatgpt-ui#separate-data-processing-from-ui-rendering).

CiteLadder's render tools accept strict selections and stable identifiers,
never model-computed totals or arbitrary datasets. `render_visibility` takes
`project_id`, `view` (overview, trends or sources) and applicable audit/period,
engine, cohort and competitor selections. Validate combinations, reauthorize
every referenced object and obtain canonical projections through existing
readers. Pin Latest to concrete IDs and return the resolved selection. A renderer
must not silently replace evidence already discussed with a newer measurement.
`render_site_health` follows the same rule for its supported snapshot selection.

Handlers compose existing readers; they own no scoring or alternative metric
logic. Local UI interactions call data tools through the bridge and update the
mounted view. Model reasoning can use the same tools without opening a widget.

## Dependency ordered implementation

### Slice 1 Connection and compatibility

Inventory current protocol routes, OAuth metadata, tool schemas and current
client callers. Build a compatibility matrix for ChatGPT Work web, the selected
desktop mode and headless Codex. Keep the existing DCR path for the initial
prototype; do not advertise unsupported CIMD. Before public submission, perform
a bounded CIMD assessment under the existing OAuth owner. Prefer adding it if
URL client IDs, SSRF-bounded cached metadata retrieval, redirect validation,
consent display and supported token authentication can be implemented and tested
without destabilizing current grants. Retain DCR compatibility. Record the
decision and any deferral reason; this is not an identity-provider migration.

Use a disposable test workspace to exercise linking, explicit workspace consent,
denial, reconnect, token rotation, grant revocation and membership removal.
Check configured apex protocol origin versus application consent origin and
resource binding through deployment ingress. Implement only demonstrated gaps.

Exit: selected clients can discover and read authorized persisted evidence;
foreign project IDs and revoked access fail. Record deployed-host evidence
separately from repository tests. This plan itself performs no live acceptance.

### Slice 2 Visibility vertical slice

Add MCP App resource metadata and a minimal UI bundle under the existing pnpm
workspace. Choose its exact package location after inspecting frontend build
owners; avoid a second product shell. Begin with one complete overview-to-source
journey covering Overview, Trends and Sources through `render_visibility`.
Site Health is deliberately a later slice.

Add the missing trend adapter over the current visibility service. Preserve
shared DTOs, explicit selection and provenance. Adapt existing source/summary
contracts only when the desired view requires it. Keep existing tools useful
without UI; implement the separate presentation contract above.

Exit: the Visibility views render real persisted fixtures, match domain totals,
retain audit/window identity on drill-down and work with keyboard navigation.
Zero, missing, partial and incompatible comparisons remain distinguishable.

### Slice 3 Public workflows and pilot package

Create the public AI Visibility Review skill. Add a
user-invoked AI Search Change Review once compatible period reads exist. Each
selects an authorized project, checks evidence availability, makes bounded
reads, cites returned evidence and separates observations from recommendations.
These are user-invoked reviews, not scheduling promises.

Use existing methodologies as design input, but review every publicly shipped
instruction and tool reference. No internal Agent-only tools, private templates,
secrets or hidden runtime requirements enter the package. Do not change private
skill exposure. Any later shared-methodology extraction is a separate reviewed
cutover under the Agent owner, with both consumers validated.

Package a stable plugin identity, public skills and the existing MCP connection
using the current [packaging guide](https://developers.openai.com/plugins/build/plugins).
Keep the bundle in repository source control; exclude fixtures containing
customer data and credentials. Register the MCP connection in developer mode,
map its actual connection ID into the package and install the complete plugin
from a personal/local marketplace in the ChatGPT desktop app. Verify the
installed package in a new chat, not just a directly connected MCP server;
test the web surface separately where supported. Follow the
[local testing instructions](https://developers.openai.com/plugins/build/plugins#create-and-test-a-plugin-locally-with-an-mcp-server).

Exit: each workflow completes with actual public tool names, handles absent
evidence honestly and gives a useful headless answer. The package can be
installed on the founder's chosen test surface without changing product permissions.
Prove OAuth → skill/tool selection → canonical data → UI → follow-up question
end to end, including reconnect and an unavailable-evidence case, before
expanding to Site Health. Record usability failures as well as protocol failures.

### Slice 4 Site Health and SEO triage

Under the assigned mock-host validation path, add `render_site_health`, its
score/coverage/evidence UI and the public Technical SEO Triage skill. Reuse
the persisted Site Health and Opportunity readers. Retain snapshot identity,
partial/unknown states and the latest-only selection limits.

Exit: triage reaches evidence and existing prioritized findings without starting
a crawl or creating actions. Validate the skill and UI in the installed plugin,
including absent snapshots and incomplete coverage.

### Slice 5 Sidebar and shared conversation context

Reuse the same UI as a sidebar/fullscreen entry and conversation panel where
supported. Add deep links and the minimal selection context described above.
Support "compare with this competitor" without stale project results, UI-model
feedback loops or hidden persistence. Unsupported hosts fall back to cards,
text and links to the full application.

Exit: UI selections inform a follow-up question, model-requested selections
update the visible view correctly, and project switches cannot display late
results from another context. Lack of extension access does not block the
Slice 3 pilot or the headless experience.

### Slice 6 Public release

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
before submission. Record the CIMD assessment outcome.

Exit: reviewer materials reflect supported behavior, engineering checks pass,
pilot acceptance is recorded, and required commercial/privacy decisions are
resolved. Submission, approval and publication remain distinct milestones.

### Separate follow-up MCP Events

[The Events plan](citeladder-mcp-events.md) retains subscription, authorization,
delivery, persistence and rollout design. Its proposed first event is
`visibility.measurement_changed`: domain owners determine measured deltas,
subscriptions specify which changes matter, and ChatGPT follows the user's
requested response. Events do not block this plugin's release and must be
assigned separately; implementing this plan does not include that subsystem.

## Validation and rollout

Follow [AGENTS.md](../../AGENTS.md#validation); do not reproduce full CI locally.
For implementation, select the smallest affected suites:

- Transport/authentication: `mcp-transport.test.ts`, `mcp-oauth.test.ts` and
  affected `mcp-config.test.ts` cases.
- Data adapters: `mcp-evidence.test.ts`, `mcp-retrieval.test.ts` and the relevant
  `visibility-reads.test.ts` or `visibility-folding.test.ts` cases. Include
  workspace isolation, stale cursors, explicit run binding and provenance.
- UI: behavioral tests for selection/drill-down, late responses, reconnect and
  unavailable evidence; inspect cards and fullscreen on supported hosts. Verify
  resource delivery is independent of the user's project and does not access
  evidence, iframe interactions make no direct
  network calls, data tools do not launch widgets, and render tools reject
  forged totals or foreign evidence IDs through parsed-contract/behavior tests.
- Skills: scenario evaluation with persisted fixtures and mocked host/tool
  results. Run `agent-skills.test.ts` only if internal packaged inputs change.

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

Roll out in order: fixture-backed development → founder testing on owned/test
projects → optional invited testers → public review/release → separately enabled
events under their separate plan. Add config-owned UI/extension
toggles that preserve base MCP reads; roll back through those toggles without
revoking unaffected OAuth grants. Event rollback belongs to the separate Events plan.

Before users arrive, acceptance means successful connection-to-first-evidence,
completion of the five positive journeys and the empty-project handoff, and no
unresolved authorization or metric-parity defects. Founder testing demonstrates
functionality, not market demand. After launch, measure onboarding completion,
repeat weekly use and useful evidence drill-downs. Set adoption targets when a
real user cohort exists; instrument minimal operational metadata, not raw
customer prompts or evidence bodies.

## Deferred scope and remaining risks

- Sign in with ChatGPT, ChatGPT-plan inference funding and any Clerk migration.
- Public sample/demo mode, anonymous fixture tools and mixed-authentication work.
  Private fixtures and the dedicated reviewer account remain validation inputs.
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
