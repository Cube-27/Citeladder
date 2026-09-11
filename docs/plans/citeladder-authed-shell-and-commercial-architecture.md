# Account management and billing: reliable project context, workspace ownership, and provider portability

Date: 11 September 2026  
Repository reviewed: `Cube-27/Citeladder`  
Static-review baseline: `98cfb2dfa369b541fbab882ba0b70ca3395b8f29`

**Status: revised implementation handoff. All three phases below are in scope, in order.** Phase 1 fixes the reported customer-facing project-selection failure. Phase 2 implements the owner's workspace and role decisions. Phase 3 implements provider-neutral architecture, not an unfinished Razorpay integration or another vendor's integration.

This replaces the earlier account-management plan and its review addendum for this scope. It specifically supersedes the previous Phase 2 decision hold, the Phase 3 documentation-only restriction, and instructions to finish or wait for pending Razorpay work. Retain the separate Razorpay plan only as a paused historical integration record; do not execute its remaining checklist.

No deployment, live database reset, live checkout, real payment, external provider mutation, or merchant-account configuration is authorized. Greenfield means no legacy data migration or compatibility programme, not permission to destroy a running environment. Update models, the existing pre-launch schema baseline, and fixtures together. Any reset outside the normal isolated test-database lifecycle requires separate, exact-target authorization.

## 0. Problem and decisions

### The problem to solve

The owner reports that creating a project sometimes navigates to a "no project available" state, or selects the previous project; refreshing then reveals the correct project/workspace. The original incident account describes selection being lost across separate onboarding/app providers and a stale project list being interpreted as an empty account.

The inspected code still has a storage-seeded selection pin, a workspace-independent `projects.list()` cache key, and a workspace header derived in an effect from the selected project. The project-detail endpoint also currently resolves through the active-workspace dependency. These are observed code properties, not proof that every reported incident has the same cause.

**Required outcome:** a successful creation response leads directly to that project in its owning workspace, without refresh, selection substitution, another creation submission, or an erroneous onboarding/allowance error.

### Owner-confirmed decisions

| Area | Decision |
| --- | --- |
| Billing | Exactly one billing account per workspace. A billing account is not shared across workspaces. |
| Owner | Full workspace access; can assign Admin, Member, or Viewer. |
| Admin | The same application permissions as Owner, including billing and member management. |
| Member | All normal workspace/product access except billing and member management. |
| Viewer | Read-only access. |
| Data | Greenfield. No existing-customer backfill, account splitting, financial-history conversion, dual-write phase, or migration tooling. |
| Razorpay | Rejected CiteLadder according to the owner; discussions continue. Do not finish its pending integration. Keep it possible to return to Razorpay or add another provider. |
| Portability | Implement the provider-neutral architecture now, without enabling payments or selecting a replacement provider. |

### Bounded scope choices used in this handoff

These are implementation recommendations rather than additional pricing decisions:

* Workspace membership covers all projects in that workspace. Remove the original per-project ACL proposal from this delivery. Do not create a second tenancy entity called Company or Agency.
* Members use the workspace's entitlements and usage budget. Their personal workspaces or subscriptions do not sponsor this workspace. Do not add seat billing, new seat caps, or change existing prices, grants, or limits.
* Interpret Viewer as read-only **non-administrative workspace/product access**. Billing and member-administration surfaces remain unavailable, rather than exposing more administrative data to Viewer than to Member. Ordinary project read responses can expose safe capability/remaining-allowance hints without exposing billing profiles or invoices.
* Keep one designated Owner for continuity. Owner and Admin have equal permissions, including initiating ownership transfer. Transfer replaces the designated Owner atomically; neither role may leave the workspace ownerless. Do not introduce an Owner-only permission exception.
* Do not build project transfers between workspaces, consolidated agency billing, a new workspace-deletion product flow, or a payment-provider marketplace.

## 0.1 Owner decisions resolving this handoff (11 September 2026)

These answers were given by the owner against the code as it stands and take
precedence over any reading of the sections below.

| Question raised in review | Resolution |
| --- | --- |
| Free baseline per workspace vs per user | Non-issue. The shipped product gives each user one auto-provisioned workspace; paid tiers are not public and the free profile allows exactly one project (`FREE_PROJECT_SLOTS = 1`, `FREE_PROMPT_SLOTS = 10`, `FREE_MONITORED_URLS = 20`). One account per workspace is a cleaner spelling of today's one account per user, not a commercial change. Do not add or remove grants. |
| Workspace cardinality | A user OWNS one workspace, and every workspace has exactly one Owner. A user MAY belong to further workspaces through invitation. Workspace selection is an explicit act at sign-in / in the switcher, never inferred from a project. `MAX_WORKSPACES_PER_USER` must therefore count only owned memberships. |
| Multi-workspace sign-in selection | Wanted, and may be deferred if it endangers the rest of the delivery. If deferred, record it here rather than shipping a partial version. |
| Provider/integration credentials vs the role matrix | Credential management stays Owner/Admin only. Treat workspace credentials as administrative alongside billing and member management; the existing `_CREDENTIAL_MANAGER_ROLES` gate is preserved, not widened to Member. |
| Delivery | Two pull requests: Phase 1 (plus the crawl-termination fix below) first, then Phases 2 and 3 together. |

### Additional in-scope defect: a crawl that never terminates

Reported by the owner alongside this plan. Analysis stops at the 20-URL
monitored budget and the screen reflects that, but the crawl stays in a live
(non-terminal) state until it is cancelled by hand. Fix the
discovery-exhaustion-to-terminalization path so a budget-exhausted crawl
finalizes itself. This ships with Phase 1 because it is customer-facing and
touches none of the billing ownership modules.

### Corrections to the review basis

* The completion response for the only production creation path
  (`POST /brand-discoveries/{discovery_id}/complete`) returns
  `{discovery_id, status, project_id, crawl_id, page_limit, warnings}` — no
  project body and no `workspace_id`, and `project_id` is legitimately null
  while the worker finishes. Section 1.5's "returned project ID and workspace
  ID" is therefore satisfied by committing on `project_id` and resolving the
  workspace through the re-authorized project-detail read of section 1.3.
* `frontend/lib/api/projects.ts` already exposes `listWorkspaces()` against
  `GET /workspaces`, and `workspaceKeys.list()` already exists. Both are
  currently unused; section 1.2 wires them rather than introducing them.
* There is no `docs/billing/` directory. The Phase 3 provider-readiness
  checklist lives at `docs/billing-provider-readiness.md`.
* `/onboarding` carries `new`, `discovery` and `step` today. The `workspace`
  parameter of section 1.2 is added, not preserved.

## Phase 1: reliable workspace and project context

**Status: delivered.** Shipped with the crawl-termination fix as the first of
the two pull requests. What landed:

* `app/(authed)/layout.tsx` owns one session + workspace/project + entitlement
  provider lifetime, shared by `(app)` and `(onboarding)`; neither group mounts
  a provider of its own.
* `lib/project/project-scope.tsx` holds the context and its consumers,
  `lib/project/selection.ts` the pure precedence rules, and
  `lib/project/project-context.tsx` the provider that resolves them. The
  storage-seeded pin and its list-generation bookkeeping are gone.
* `GET /projects/{project_id}` authorizes through `require_project_member`, so
  an explicit `?project=` resolves before any workspace is known.
* Workspace-scoped query keys and requests agree: project lists, provider
  connections/states, and workspace usage/entitlements all carry the workspace
  in the key and on the request (`ApiRequestOptions.workspaceId`).
* Onboarding commits the creation, seeds the detail cache, merges the list, and
  navigates to `/projects?project=<id>`; login routes into the app and lets the
  gate decide whether the workspace needs onboarding.
* `lib/navigation/project-destination.ts` is the single selection-navigation
  owner, with the push/replace/no-op history rules of section 1.7.

### 1.1 One authenticated provider lifetime

Keep the original shared route-group direction:

```text
app/(authed)/layout.tsx
  Suspense above the URL-reading client provider
  Shared project/workspace context and session render guard
  Shared entitlement context

app/(authed)/(app)/layout.tsx
  Existing workspace chrome, tour, toasts and project-route gate

app/(authed)/(onboarding)/...
  Existing focused onboarding layout, without another project provider
```

Move the existing providers rather than wrapping duplicated providers in a new manager. Keep one QueryClient. Keep authentication/public routes outside this branch. Preserve existing external paths, safe auth/MCP return destinations, error boundaries, visual design, and public-page behavior.

Preserve parallel session and safe authenticated bootstrap reads where possible. The session guard still prevents protected content from rendering before authentication resolves; do not manufacture an additional request waterfall merely to reorder layouts. Put the Suspense boundary above the component calling `useSearchParams`, not only in the child app layout, and validate with a production build.

### 1.2 Workspace exists independently of an active project

Extend the existing context rather than introducing another global store or a state-machine dependency. The shared context must distinguish the requested project, the authorized active workspace, the resolved project, and the existing loading/error states.

A workspace can be valid while it has zero projects. Its identity must therefore remain available during first-project creation, additional-project creation, and workspace billing/member settings. Do not derive the only workspace identity from `activeProject?.workspace_id`.

For a project URL, the authorized project determines the workspace. For onboarding and workspace-only routes without a project, preserve an explicit `workspace` URL parameter for the selected workspace. On a genuinely unscoped entry, resolve a valid membership from the existing workspace-list/bootstrap contract. Browser last-used storage is a user-scoped convenience fallback, never an authorization source.

An additional-project launch must carry its target workspace, for example `/onboarding?new=1&workspace=<id>`. Refreshing that route must not silently change the workspace in which the project will be created. When a URL names both a workspace and project, reject an incompatible pair rather than combining one project's ID with another workspace's limits.

Do not add workspace parameters to every project URL unnecessarily: a verified project ID already identifies its workspace.

### 1.3 Resolve the requested project directly

Keep `?project=<id>` on project-scoped URLs. Precedence is explicit URL, then a valid stored selection in the resolved context, then a project from the authorized current workspace. Once an explicit ID exists, never substitute the first project because a list omits it.

Use the existing `GET /projects/{project_id}` as the narrow resolution read. Change its authorization dependency to the existing path-based `require_project_member` pattern, so it can return the authorized project's `workspace_id` without needing a previously correct active-workspace header. Keep the ordinary project list workspace-scoped. Preserve the combined missing/not-authorized response and membership enforcement; do not add an admin tenancy bypass.

Use cached project detail or the successful creation response when it is valid for the current authenticated session. Otherwise resolve the explicit ID through the detail read. Only then enable reads and mutations that depend on its workspace. A list omission is not an authorization result. A network failure is a recoverable error, not proof of no access.

Avoid an unnecessary sequence of waiting for the entire project list before using an already-authorized project. The matching list can reconcile in the background; its older omission must not clear a separately resolved explicit project.

### 1.4 Bind cache identity and request identity together

Change workspace-dependent query-key factories and their callers to include the workspace identity. At minimum cover project lists, workspace usage/entitlements, member settings, and workspace integration/provider-state lists. In Phase 2 also apply this to all workspace billing reads.

A project-ID-keyed resource whose UUID already uniquely identifies the resource does not need a ceremonial extra key dimension. A list or projection whose results change with `X-Workspace-Id` does need that dimension. Keep account-transition cache clearing; clear old-user selection state and in-flight work on logout/user changes.

Pass the resolved workspace explicitly through existing request options for scope-dependent requests, including retries and background work. The transport already respects an explicitly supplied `X-Workspace-Id`; reuse that support through the existing API/query owners rather than scattering manual headers across components.

Do not allow a request keyed as workspace A to obtain workspace B's header from a mutable global selection on a later retry. Do not use a global header update in a React effect as the correctness mechanism. Keep that setter only as temporary compatibility during this bounded refactor, and remove it if the completed caller inventory no longer needs it.

Keep previous-workspace data out of the newly selected workspace's view. Abort obsolete requests through the existing cancellation path and ensure their results cannot change the current selection. Cancellation complements scoped keys and explicit request inputs; it does not replace them.

### 1.5 Commit creation before navigation

Use one successful-creation handler for first and additional projects:

1. Submit to the already-authorized target workspace through the existing mutation path. Keep the existing transactional occupancy check and prevent repeated submission while the operation is pending.
2. On confirmed server success, take the returned project ID and workspace ID as the committed result. Do not synthesize a project before server success.
3. Cancel obsolete relevant list/detail reads, then seed the detail cache and update the matching workspace-list cache with the returned project, deduplicated by ID. Do not mark an incomplete list as a complete authoritative inventory merely because one returned project was inserted.
4. Select/navigate to `/projects?project=<created-id>` through the shared navigation owner. Project detail must already be usable when this destination mounts.
5. Reconcile the workspace list and usage in the background. Reconciliation failure cannot undo the successful creation or send the user through creation again.

The creation response, not a later full-list fetch, is the immediate source of truth for what was just created. A pre-create request arriving later must not erase that committed selection. Do not automatically retry a create mutation after an unknown network outcome unless the existing server contract makes the retry idempotent; distinguish this from the confirmed-success handoff bug being fixed here.

Keep a small pending-resolution state only where an ID is genuinely unresolved. Remove the storage-mediated remount pin/generation workaround once the replacement regression tests pass. Do not add sleeps, delayed redirects, forced refreshes, more storage messages, or a second selection authority.

### 1.6 Correct the gate, not just the error message

The gate answers: **does this authorized workspace currently need project onboarding on this project-required route?** It does not answer whether the signed-in user has projects in every workspace.

| State | Behavior |
| --- | --- |
| Workspace/project context unresolved | Loading with no fallback project and no creation redirect. |
| Confirmed created or resolved project, list reconciling | Keep that project usable. Do not block merely on background refetch. |
| Relevant resolution/list request failed, no usable resolved project | Recoverable error and Retry, preserving the requested context. |
| Explicit project is confirmed missing or unauthorized | Combined unavailable state, with deliberate selection of another accessible project. |
| Current workspace has a successful, relevant empty list and no unresolved explicit/created project | On project-required routes, show onboarding/create affordance only when role and allowance permit it. |
| Workspace has zero projects but route is billing, members, workspace settings, or an invitation | Remain on that route. No project is required to manage the workspace. |
| Viewer in an empty workspace | Read-only empty state, not a create-project loop. |

Use the existing visual components. Account/workspace usage can resolve without a project. In Phase 2, add permission gating to these controls so a role that may not create a project is not offered the affordance — while the backend remains authoritative and enforces every denial itself. A real quota denial must remain a quota denial; do not bypass limits to mask selection bugs.

### 1.7 Navigation and completion

Use one small destination helper in the existing navigation layer for project-scoped links, the switcher, desktop/mobile shell, command palette and programmatic navigation. Preserve destination parameters and fragments, but do not leak source-page filters into unrelated routes.

A deliberate switch to a different project pushes one history entry. Filling an absent parameter for an already-resolved selection replaces the current entry. Back/Forward only reads the resulting URL. Selecting the same project does not add history. Another tab changing stored last-used state must not override this tab's explicit URL.

Maintain workspace context on workspace-only destinations. Update moved imports, route-policy prefixes and fixtures. Compare normalized public routes, not raw route-group filesystem paths. Run the production build and the focused creation/navigation regression flows before expanding into membership and billing changes.

## Delivery record (Phase 2, 11 September 2026)

**Multi-workspace sign-in selection: DEFERRED**, as §0.1 permits. What shipped
instead is explicit workspace selection everywhere it is reachable after
sign-in: the switcher lists every accessible workspace (including empty ones)
and selecting one is an explicit act through the shared navigation owner, which
carries the workspace on the URL and drops the previous workspace's project.
Sign-in itself still routes into the caller's resolved workspace rather than
offering a chooser. Nothing about the deferral blocks it later: the selection
owner, the workspace-scoped keys and the explicit `?workspace=` parameter are
all in place, so the remaining work is a sign-in screen, not a re-architecture.

**Invitation delivery: no mail transport exists in this repository.** §2.4 says
to use the existing mail-delivery owner; there is none — no SMTP client, no
provider integration, no template layer, and inventing one is outside this
scope and would need its own authorization. The token lifecycle is therefore
implemented in full (expiring, single-use, stored only as a SHA-256 hash, bound
to the invited address on acceptance) and the acceptance link is returned ONCE
to the inviting administrator, who delivers it. When a mail owner exists it
becomes the one place `domain/workspaces/invitations.py` calls; nothing else
about the lifecycle changes.

**Owned-workspace cap.** `MAX_WORKSPACES_PER_USER` is replaced by
`MAX_OWNED_WORKSPACES_PER_USER = 1`, counting only memberships whose role is
`owner`. A membership held by invitation never consumes the invitee's own
allocation and never suppresses provisioning of the one workspace they own.

## Phase 2: workspace-owned billing and four enforced roles

### 2.1 One workspace, one account

Use one direct relationship: `BillingAccount.workspace_id`, non-null, unique and referencing `Workspace`. Create the workspace and its billing account together through the existing transaction/service owner. Remove the user-owned billing authority and the many-workspace `WorkspaceBillingLink` structure; do not retain both as competing ownership mechanisms.

Route entitlement, usage, billing-profile, quote, receipt and subscription operations through one `billing_account_for(workspace_id)` resolver. Remove assumptions that the authenticated user's personal billing account or `owner_user_id UNIQUE` determines authority. Creator identity may remain as audit metadata, but never as the payer-selection or authorization rule, and deleting/departing users must not cascade-delete the workspace's billing account.

This is a coordinated schema/caller change, not a promise that changing one resolver alone completes the work. Update the model, pre-launch baseline, bootstrap/auth repair, fixtures and existing billing callers in the same phase. Do not build a legacy data backfill, preserve the old ownership branch, or require a live reset to perform this review/handoff.

Count project/prompt occupancy and usage within the account's single workspace. The original instruction to aggregate multiple linked workspaces is superseded by the owner's one-to-one decision. Enforce the workspace's limits transactionally for every member; the workspace creator's other accounts are irrelevant.

### 2.2 Provisioning and commercial invariants

Refactor the existing ensure/provision path to ensure billing for a workspace idempotently. Repeated login must not create another workspace/account. Creating another workspace provisions only its own existing baseline terms, never a copy of another workspace's paid subscription or grants. Ordinary signup retains its intended workspace-bootstrap behavior; accepting an invitation joins the target workspace without creating a duplicate sponsor account or copying personal grants into it.

Retain existing prices, entitlement/grant accounting, immutable commercial evidence, and the account-level locked `entitlement_lifecycle_version`. Freeze `registration_cohort_at` from the original provisioning user's registration timestamp when the workspace account is created, preserving the original anti-reset intent. Never rewrite it on login, invite acceptance, or owner transfer. Do not enable deferred campaigns or build a new campaign-abuse system in this scope.

Owner changes modify membership authority, not the billing-account identity or the accepted subscription/receipt terms. No cross-workspace pooling or transfer is supported in this delivery.

### 2.3 Permissions

| Capability | Owner | Admin | Member | Viewer |
| --- | --- | --- | --- | --- |
| Read non-administrative workspace/project data | Yes | Yes | Yes | Yes |
| Create/edit/delete projects, manage prompts, configure product features | Yes | Yes | Yes | No |
| Start audits, crawls, generation and other product work | Yes | Yes | Yes | No |
| Manage billing, invoices, payment settings or purchase intents | Yes | Yes | No | No |
| Invite/remove members, change roles or transfer ownership | Yes | Yes | No | No |

Member retains all other existing non-billing/non-member-management product and workspace actions. Do not silently introduce a third restricted category. The plan does not add new destructive workspace-lifecycle product features. Viewer downloads/reads of existing reports may be allowed; initiating new generated work is not a read.

Define this static policy once next to the existing workspace authorization owners. API dependencies apply it; services/workers/MCP or other entry points that can perform the same actions must reuse the same policy rather than bypassing it or defining a second matrix. Verify every relevant entry point, including operations exposed as POST despite being reads and apparent reads that can trigger paid work.

Keep role authorization separate from entitlements: a role permits an action; the workspace's capabilities and remaining allowance decide whether that action is available. Both must permit it. Workspace Admin is not platform/operator admin and gains no global catalog, secret, or cross-workspace privileges.

Return safe effective capabilities for frontend controls. Enforce denial on the server; hiding a button is not the boundary. Do not serialize billing/customer secrets for Member or Viewer just because their shared provider asks for usage hints.

### 2.4 Workspace selection and invitations

Extend existing settings and the workspace/project switcher so a user can select an accessible workspace independently of its projects. Empty workspaces remain selectable and manageable. Keep the current design system and support desktop/mobile; do not redesign navigation while adding the missing management functions.

Implement the original invitation scope: invite an email with Admin, Member or Viewer role; list pending invitations; revoke/resend; accept into the target workspace. Both Owner and Admin can manage these actions.

Use expiring single-use tokens stored as hashes. Bind acceptance to an authenticated, verified matching identity, then persist `WorkspaceMember.user_id`. Repeated acceptance must not duplicate membership or create another billing account. Enforce role choice server-side; a Member or Viewer cannot invite/promote themselves by calling the endpoint directly. Use the existing mail-delivery owner, not a new email platform.

Keep one designated Owner. A transfer initiated by Owner or Admin changes the new Owner and the previous Owner's role in one transaction; the previous Owner becomes Admin. Reject removal/demotion/departure that would leave no Owner unless that same transaction installs the replacement. This is an invariant that applies equally to both privileged roles, not an Owner-only privilege.

Membership removal or role change must affect subsequent server operations and refresh the affected UI access state. Do not add per-project membership rows or billable-seat behavior.

## Phase 3: implement provider-neutral billing architecture

### 3.1 What is authorized now

Implement code boundaries, routing, contracts and tests that make the existing commercial core independent of Razorpay. Preserve completed working integration code behind its adapter. Do not finish its missing checkout, GST/provider parity, international, recurring-method, merchant-approval, tunnel, provisioning or sandbox-transaction tasks.

Do not integrate another real vendor without its selection and a separate integration task. Keep payment admission disabled. The application, workspace billing reads and public pricing must work without any provider credentials configured.

The independent quote-signing secret is already implemented at the review baseline. Preserve it and its no-fallback/secret-separation checks; do not redo it as new work. When isolating provider settings, keep equivalent secret-separation validation without coupling new quotes to the currently selected gateway secret.

### 3.2 Reuse the commercial core

Keep catalog/pricing, quote and tax calculation, accepted terms, billing accounts, entitlements, receipts, activation and reconciliation under their existing owners. Keep the existing `BillingProvider` protocol and neutral DTOs as the starting point, adjusting only demonstrated provider-shaped assumptions.

The core decides **what was sold and what payment evidence is required**. An adapter translates provider APIs, statuses, signatures, callbacks and public checkout initialization. Do not introduce a generic workflow engine, dynamic plugin loader, distributed payment service or parallel billing subsystem.

### 3.3 Explicit provider identity, environment and routing

Extend the existing factory to select an adapter by provider identity and environment rather than always constructing Razorpay. Use a small explicit mapping, not runtime discovery. Only register real configured adapters; use test doubles under test ownership.

Keep `provider` distinct from `provider_mode` (`test` or `live`). Operational `disabled` means no checkout admission, not a valid environment for a newly created payable intent. Missing or unsupported provider configuration returns a safe unavailable result before provider I/O; it must not fall back to Razorpay.

For new checkout, resolve an approved provider and compatible private price reference from server-controlled configuration/catalog. Freeze the chosen provider, environment and references into the intent before network calls. For existing activations, subscription actions, payments, refunds, callbacks and reconciliation, always use the persisted originating provider/environment, never the current new-checkout default.

Reuse existing identity fields and add only genuine gaps. Namespace external customer/payment/subscription/invoice/refund IDs and webhook deduplication by provider and environment. Do not let switching the new-checkout default reinterpret existing records. Keep one configured merchant account per provider/environment in this scope; do not build multi-merchant routing.

Never retry an uncertain creation against another provider. Reconcile with its original provider and existing idempotency rules. Checkout admission and reconciliation eligibility remain separate so stopping new sales does not disable existing obligations.

### 3.4 Configuration, browser checkout and callbacks

Separate shared settings, such as the checkout kill switch and quote-signing secret, from adapter-owned credentials, API origins, webhook secrets and readiness checks. Preserve fixed provider API origins, secret redaction and environment guards. Validate enabled provider operations, not unrelated application startup when billing is disabled.

Keep vendor-specific settings clearly vendor-specific inside their owner. Do not rename every `RAZORPAY_*` variable to a generic variable whose meaning changes when a different provider is selected. Isolate the existing block; add other providers only when real.

The shared checkout controller should handle pending, failure, verification and confirmed activation without inspecting Razorpay field names. Isolate the existing vendor SDK loader and callback parsing. Make the small public checkout-init contract describe a validated redirect or adapter-selected SDK flow, exposing only public initialization fields. Do not assume all vendors share subscription IDs, callback tuples or an HMAC scheme. Do not build future vendor UI flows now.

Callback verification belongs to the selected adapter and is bound to the authorized persisted activation. The application callback endpoint can remain activation-based. Keep provider-specific payload parsing typed and allowlisted; a neutral wrapper is not permission to accept arbitrary scripts, URLs or unchecked callback data. Do not retain old callback aliases solely for imaginary pre-launch clients.

### 3.5 Webhooks and shared settlement

A provider-specific webhook URL is not itself a design defect. Use `/billing/webhooks/{provider}` for common dispatch where that simplifies the current route, preserving `/billing/webhooks/razorpay` as its concrete existing path. Do not rename vendor signature headers into a fictitious shared protocol.

Each adapter authenticates the exact raw request using its correct configured credentials and parses it into the common event/evidence shape. Determine the environment from trusted server/endpoint configuration, not an unsigned field. Verify before any activation side effect. Unknown/unconfigured providers and invalid signatures never grant access.

Reuse the existing durable receipt, dedupe, leases, bounded retries, redaction and reconciliation machinery once. Keep vendor status mapping and invoice/payment association inside the adapter. A neutral event must retain enough originating identity and paid evidence for the same shared activation checks.

Preserve the required commercial invariants: a callback alone never grants paid access; captured/settled evidence must satisfy the accepted terms and amount/currency/period checks; duplicates cannot create duplicate receipts or grants; renewals require distinct paid-period evidence; transport uncertainty remains pending for reconciliation. Refactoring must not label these invariants externally verified when only local tests exist.

### 3.6 Prove the boundary without a replacement provider

Use existing test infrastructure with two lightweight provider identities/test doubles to prove routing isolation. They should test real shared behavior, not merely stub out every core assertion. No external keys, SDK network, Dashboard changes or real payments are required.

Prove that changing the new-checkout default leaves prior-record operations on their original adapter, equivalent external IDs in different providers/environments do not collide, callback/webhook authentication dispatch is provider-specific, duplicate delivery grants once, and an uncertain result does not create a second cross-provider attempt. Reuse existing settlement tests for amount/currency mismatch and confirmed-payment activation.

When a real provider is selected later, implement only its actual adapter/browser requirements, verify its commercial and tax role and supported flows, pass its sandbox acceptance, and seek separate payment-enablement authorization. That also applies to returning to Razorpay. Do not build subscription migration tooling now because there is no live customer migration to perform.

## Delivery order, validation and documentation

Complete Phase 1's customer-facing fix before broad Phase 2/3 billing edits. Then implement the workspace-account/role changes; then refactor payment-provider boundaries. Do not run parallel agents over the same billing ownership or settlement modules.

Use one bounded exploration pass per phase to map the existing owners and changed call sites. Implement within those owners. A review/simplification pass removes superseded pins, duplicate authority paths and unused adapters/helpers after the replacements pass their regression checks. Do not reopen the settled ownership/role decisions or turn this into another architecture-design project.

| Verification group | Required evidence |
| --- | --- |
| Creation | First and additional project creation land on the returned project without refresh; delayed pre-create lists cannot change selection; failed reconciliation cannot cause another create. |
| Context/navigation | Cold cross-workspace project link, empty workspace, direct onboarding workspace refresh, invalid project, failed resolution, navigation, Back/Forward and two-tab independence. |
| Scope | Workspace-dependent keys and requests agree, including retries; no previous-workspace payload is presented as the new workspace; account switches clear old-user state. |
| Authorization/billing | Owner and Admin parity; Member billing/member-management denials; Viewer write denials; invite/transfer invariants; shared workspace usage for members; separate usage across workspace accounts; billing with zero projects. |
| Provider boundary | Disabled/no-credential operation, originating-provider routing, identity isolation, provider-specific verification, duplicate settlement and uncertain outcomes. |
| Rendering | Unchanged normalized public route set, shared provider lifetime, public/auth routes unaffected, successful frontend production build and desktop/mobile changed flows. |

Extend existing behavior tests and use the smallest appropriate layer. Parameterize the role matrix rather than writing a new suite per role per endpoint. Keep a small browser set for actual creation/navigation and management interactions; use focused service/API tests for authorization and settlement. Use an ordinary seeded password account, not an auth bypass. Do not duplicate the same scenario at unit, API and browser levels without a distinct reason.

Run focused checks after coherent code changes. At the completed handoff, run the applicable repository checks and required CI once against the final diff, plus the production build. Re-run only a failing/changed portion locally as appropriate. Do not run full unrelated suites after documentation edits or every few changed lines, add source-text/rename tests, weaken existing gates, or claim a check passed without running it.

Update the original plan in place with this revision, the existing relevant architecture documentation, and a short provider-readiness checklist under the existing billing docs. Mark Razorpay integration paused and distinguish code-complete from externally unverified. Do not create parallel plans, duplicate ADRs, or extensive migration runbooks for greenfield data.

The implementer's final report must state changed paths, behavior demonstrated, checks actually run, residual failures, and provider integration items intentionally left paused. It must not claim payments are production-ready from mock/contract tests.

## Review basis

The original supplied plan's incident, shared route-group structure, membership boundary, billing protocol and commercial invariants are retained. Its role matrix, multi-workspace billing direction, migration programme, per-project ACL proposal, and Phase 3 execution restriction are replaced by the owner decisions and explicitly labelled scope choices above.

Relevant inspected paths at the review baseline:

* `frontend/lib/project/project-context.tsx`
* `frontend/lib/api/query-keys/core.ts`
* `frontend/lib/api/client.ts`
* `frontend/components/layout/onboarding-gate.tsx`
* `frontend/app/(app)/layout.tsx`
* `frontend/lib/billing/entitlement-context.tsx`
* `backend/app/api/projects.py` and `backend/app/api/deps.py`
* `backend/app/models/billing.py`
* `backend/app/connectors/billing/base.py` and `factory.py`
* `backend/app/domain/billing/quotes.py`
* `backend/app/core/config/billing_settings.py`

Framework references checked: official Next.js `useSearchParams` documentation and TanStack Query guidance on query keys and mutation-response cache updates. This was a static plan/code review, not an application run, build, test execution, deployment check or provider acceptance test.
