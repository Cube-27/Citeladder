# CiteLadder audit remediation and enterprise readiness

**Status: PR 1 implemented in `codex/audit-remediation`, based on `main`; PR 2 is the remaining work defined in Section 4. Neither label claims a GitHub PR exists or has merged. Public policy revisions and proposed management decisions remain unpublished pending approval.**

## 1. Summary and boundaries

Resolve the audit through coordinated policy, engineering, security and operational work for **Cube27 IT Private Limited**, operating CiteLadder.

Prepare for India, US, UK, Ireland/EU, Canada, Australia, New Zealand, Singapore and South Africa. Additional countries require legal, tax and payment review before admission.

This plan:

- Builds on existing legal pages, workspace authorization, encrypted credentials and read-only MCP.
- Targets the unified Agent described in the owner-selected [Agent workspace plan](citeladder-action-center.md). It does not rebuild retired Content or Growth Agent systems.
- **Excludes payment, checkout, refund-processing, invoice, e-invoice and billing-configuration code changes.** Payment policies and requirements for the later payment task remain included.
- Adds no publishing, website modification, outreach or other external-action capability.
- Does not authorize deployment, live provider calls, production deletion or insurance purchases.

**Plan file:** `docs/plans/citeladder-audit-remediation.md`.

The owner assigned implementation on 26 September 2026. The earlier plan-saving-only instruction is superseded. Preserve the payment exclusion and external operational approval gates.

## 2. Confirmed decisions

### Company and public policies

Use these owner-supplied details, without changing billing configuration:

| Field | Confirmed value |
|---|---|
| Legal entity | CUBE27 IT PRIVATE LIMITED |
| Registered office | Plot No. 12, Mulberry Garden 1, Magarpatta City, Hadapsar, Pune 411013, Maharashtra, India |
| CIN | U72900PN2020PTC194984 |
| Incorporation date | 14 October 2020 |
| Contact | contact@cube27.com |
| GSTIN | 27AAJCC0427H1ZU |
| GST state | Maharashtra — 27 |
| SAC | 998315 |
| LUT reference | AD2704260145735 |
| Owner-supplied GST rate | 18% |

CIN, registered office and company identity belong in the shared legal entity record. Tax details remain reference information for the later payment workstream; do not imply that an LUT reference or tax treatment applies indefinitely.

Update public policy dates when the revised policies are actually published. Preserve prior policy revisions and acceptance evidence; a later date edit must not rewrite an earlier agreement.

### Retention

| Trigger | Required treatment |
|---|---|
| Free trial expires without continuing entitlement | Stop new execution; provide export opportunity within the same period; complete active-data purge within **30 calendar days of trial expiry** |
| Paid service ends without continuing entitlement | **30 calendar days for export**, then complete active-data purge within a further **30 calendar days** |
| Verified deletion request | Stop affected collection/execution and complete active-data deletion within **30 calendar days**, or sooner where required |
| Residual backups | Expire deleted customer data within **90 calendar days after active-data deletion**; retain shorter existing backup lifetimes |

Do not introduce an indefinite free-workspace retention allowance. Cancellation takes effect at the end of the paid period; it does not itself start immediate deletion.

Legally required records and documented legal holds are exceptions limited to their necessary data categories.

### Providers, MCP and commercial policies

- Platform Agent processing uses **verified business/API providers**. Public Agent policy prose uses that description.
- Customer-selected custom endpoints remain available, with explicit disclosure of the recipient, customer responsibility and applicable provider terms.
- Actual subprocessors must still be named accurately on the subprocessor page.
- MCP connections authorize **explicitly selected workspaces**, with current membership checks on every read.
- Keep existing refund eligibility; introduce no discretionary seven-day unused-purchase refund.
- Adopt complaint acknowledgement within **48 hours**, resolution target of **30 calendar days**, refund decision within **five business days** of complete information, and initiation within a further **five business days**. Shorter legal deadlines prevail.
- Insurance and contractual liability allocation remain pending, as requested.

## 3. Implementation workstreams

### A. Reconcile the audit with the current product

Start by rechecking the implementation baseline after the unified Agent cutover.

Create a compact coverage table inside this plan tracking all 16 audit areas as **verified existing**, **requires implementation**, **external approval pending**, or **excluded payment implementation**. Record the owning subsystem and acceptance evidence.

### Reconciled coverage (PR 1 branch, not production acceptance)

| Area | State | Owner and acceptance boundary |
|---|---|---|
| 1. Company identity and grievance disclosure | external approval pending | Shared `legal.ts`; confirmed entity data above, named contact and telephone remain blank publicly |
| 2. Terms, Privacy, AI, DPA, AUP and commercial policy drafts | external approval pending | Existing legal review draft plus its remediation addendum; no publication or date change |
| 3. Versioned user acceptance | verified existing | `auth/policies.py`, workspace API and authenticated onboarding gate; PostgreSQL idempotency and historical revision coverage |
| 4. Enterprise contract references, MSA and order form | requires implementation | Internal MSA/order-form draft below; durable signed-agreement reference workflow still required |
| 5. Country readiness and transfers | external approval pending | Internal country matrix; no country is tax/legal approved by this implementation |
| 6. Processing inventory and lifecycle export/deletion | requires implementation | Inventory in legal review addendum; durable operator jobs, fences, legal holds and deletion replay remain open |
| 7. Retention and backup expiry | requires implementation | Section 2 clocks remain the requirement; automated expiry/purge and restoration evidence are not established |
| 8. Workspace authorization and Agent boundaries | verified existing | Existing role policy, pinned Agent context, bounded read tools and immutable outputs; affected Agent/MCP component coverage |
| 9. Security events and infrastructure access | requires implementation | Shared bounded event owner records login/logout, policy acceptance, MCP consent/revocation and acquisition control; membership, credential and tool-access coverage still required |
| 10. Incident, recovery and operational exercises | external approval pending | Internal runbook below; named responders, India log retrieval, restore and tabletop evidence outstanding |
| 11. MCP workspace selection and revocation | verified existing | Persisted code/grant selection, current membership intersection, legacy re-consent, user/admin management APIs and Settings; PostgreSQL scope/revocation tests |
| 12. Crawler and direct acquisition | requires implementation | Real bot identity, robots failure/delay handling and per-hop durable suppression implemented; owned-site authority receipts and complete redirect robots/pacing coverage still required before `/crawler` publication |
| 13. AI recipients and data licensing | external approval pending | Customer destination receipts; actual vendor contracts and data reuse/export rights require review; licensing restriction enforcement remains open |
| 14. Google data and cookies | requires implementation | Cookie reopening/withdrawal tested; Google sign-in/integration scopes inventoried, downstream-use/deletion review and deployed Zaraz/cross-host traffic acceptance outstanding |
| 15. IP, licenses, subprocessors and insurance | external approval pending | Frozen-lock dependency inventory and asset register; deployed artifact notices, vendor facts, notification delivery and broker decision outstanding |
| 16. Payments, invoices and tax activation | excluded payment implementation | Finance country matrix and acceptance-reference handoff only; no payment code changes |

“Verified existing” covers the named local behavior only. It is not legal approval,
deployment evidence, or completion of the entire plan. The remaining implementation
items above belong to PR 2 below and must be closed before declaring this remediation complete.

Specific reconciliation requirements:

- Existing legal pages and DPA are starting points, not proof of legal approval.
- Include Agent chats, instructions, context manifests, outputs, revisions and attempts in privacy and security work.
- Do not carry forward obsolete Content-provider remediation after its runtime is removed. Verify that retired routes and credentials can no longer receive customer data.
- Treat the existing legal review’s production observations as evidence to reverify, not current deployment facts.
- Coordinate shared MCP registry changes with the Agent plan; avoid competing authorization owners.

### B. Contracts, policies and acceptance evidence

Extend the existing shared legal-content owner.

Deliver:

- Revised Terms, Privacy, DPA, AI, Cookies, Refund, Cancellation, Subprocessors and Contact pages.
- A dedicated Acceptable Use Policy and crawler page.
- An enterprise MSA and order-form template for legal review.
- A country-readiness matrix covering privacy, transfers, contract enforceability, consumer protections, renewals, tax dependencies and required local representation.

Contract coverage must include confidentiality, input rights, customer-data ownership, generated-output rights and limitations, third-party dependencies, authorized crawling, abuse suspension, termination, export/deletion and human review. Remove unsupported outcome, certification or affiliation claims.

Keep existing liability and dispute clauses unchanged until the pending legal decision is resolved. Do not amplify blanket disclaimers suggesting Cube27 can exclude mandatory privacy duties or every responsibility for external disclosure.

Add durable, versioned acceptance evidence under the existing authentication/workspace owners:

- Record document revision, accepting actor, timestamp, acceptance context and applicable workspace.
- Capture acceptance during registration or first authenticated onboarding, including Google-created and operator-created accounts.
- Record authorized enterprise agreement references separately from ordinary user acceptance.
- Treat Privacy as a notice and optional processing choices as separate consent.
- Require renewed acceptance where an approved material change requires it.

**Checkout/order-linked acceptance is a documented handoff to the later payment task; do not modify checkout here.**

Country review must consider applicable obligations rather than assume that selling in English or describing customers as businesses removes them. EU/UK transfer arrangements and Australian overseas-disclosure requirements require specific review. See [ICO transfer guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/) and [OAIC overseas-disclosure guidance](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/sending-personal-information-overseas).

### C. Data inventory, export and deletion

Create one maintained processing inventory covering:

- Accounts, memberships, invitations and authentication identities.
- Projects, competitor configuration, crawl evidence and connected-source data.
- Agent conversations, context, instructions, outputs, revisions and attempts.
- MCP grants, credentials, analytics, support records and operational logs.
- Billing/legal records, object storage, caches and backups.
- Any additional stores actually found during implementation; do not invent an embeddings store.

For each category record purpose, controller/processor role, storage location, recipients, retention trigger, deletion method and any legal exception.

Implement support-assisted export and deletion using authorized operator commands backed by durable PostgreSQL jobs. A customer self-service deletion portal is not required for this slice.

Lifecycle requirements:

- Track request authority, scope, deadline, progress, failures and completion.
- Distinguish account deletion, workspace deletion, project deletion and integration-history deletion.
- Preserve other members’ workspaces when deleting a user; require ownership transfer or explicit workspace closure for a sole owner.
- Before purging, stop schedules and queued work, revoke affected credentials/access, and prevent in-flight jobs from recreating data.
- Make retries and concurrent requests idempotent.
- Export supported customer data in JSON/CSV and Agent outputs in Markdown, with a manifest explaining omissions and licensing restrictions.
- Never export secrets or raw credentials.
- Permit reactivation before scheduled offboarding purge, but never silently cancel an explicit deletion request.
- Keep minimal deletion records outside ordinary restored customer data so recovery can reapply deletions before reopening access.

Enforce the approved clocks through configuration and the existing durable queue. Authorized lifecycle deletion is an explicit exception to routine append-only evidence handling, not permission to edit historical evidence.

### D. Security, access and incident operations

Perform an affected-owner security review across APIs, workers, evidence downloads, Agent context, exports and MCP. Repair demonstrated gaps in the owning subsystem.

Add one shared security-event owner for authentication, membership/role changes, credential operations, MCP consent/revocation/tool access, exports, deletions and administrative actions. Keep event metadata bounded and exclude prompts, bodies, tokens and secrets.

Extend existing infrastructure and operations procedures to cover:

- MFA for privileged Cube27 infrastructure and production access.
- Least privilege, named access, access reviews and emergency access.
- Credential encryption, rotation, redaction and TLS verification.
- Security-log collection, restricted access, delivery-failure alerts and retention.
- Backup monitoring and an isolated restoration exercise.
- Dependency vulnerability checks, secret scanning and periodic independent security testing.
- Incident ownership, escalation, containment, evidence preservation, customer notices and reporting.

Design the incident process to support applicable CERT-In six-hour reporting and a rolling 180-day India log baseline. Verify system coverage, timestamps and retrieval rather than assuming Cloudflare logs alone suffice. The [CERT-In directions and FAQs](https://cert-in.org.in/Directions70B.jsp) are the starting authority.

Check applicable DPDP commencement provisions and subsequent changes against the official notification; do not copy the audit’s date calculation without review. See the [MeitY commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf).

### E. MCP and unified Agent controls

Extend existing OAuth grants to persist selected workspace authorizations through consent, authorization-code exchange and token rotation.

Authorization becomes:

**consented workspace ∩ current active membership ∩ permitted role ∩ active workspace lifecycle**.

Apply this consistently to enumeration, search, retrieval, cursors and shared registry calls. Newly joined workspaces receive no automatic access.

Add same-origin connection-management APIs and UI:

- Users list and revoke their own connections.
- Workspace Owner/Admin can inspect and remove a connection’s authorization to that workspace without gaining access to its other workspaces.
- Existing account-wide grants require renewed consent; never silently populate their workspace selection.
- Revocation takes effect on subsequent requests and before queued Agent work dispatches.

Keep MCP read-only. Preserve the Agent’s bounded internal `save_output` capability and explicit user approval of outline-to-draft generation. Tool text, retrieved content and model instructions must never grant permissions.

Classify registered tools as read, generate or narrowly bounded internal write. External actions, arbitrary URL/SQL execution, permission modification, prompt activation and publishing remain unavailable.

Any future publishing capability requires its own plan covering preview, explicit authorization, exact target/revision, before/after evidence, actor, timestamp and rollback.

### F. Crawler and third-party data controls

Fix the existing acquisition owner rather than adding another crawler.

- Send the actual identity `CiteLadderSiteHealthBot/1.0 (+https://citeladder.com/crawler)`.
- Remove browser-only impersonation behavior that suppresses this identity on crawler requests.
- Distinguish missing robots files from network/server failures; failures pause acquisition.
- Preserve parseable restrictions and handle redirects safely.
- Honor declared crawl delays or skip/pause hosts exceeding supported limits.
- Apply bounded timeouts, response sizes, per-host pacing, concurrency and backoff.
- Add durable domain suppression and an operator kill switch, checked during ongoing work.
- Record customer authorization for owned-site analysis.
- Keep authentication, CAPTCHA, paywall and access-control bypass unavailable.

Use [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) for robots behavior. Crawl-delay handling is an additional product policy, not an RFC requirement.

Inventory other direct web-acquisition paths, including discovery and earned-source inspection. Apply the same network and access-control safeguards, while distinguishing customer-owned analysis from third-party research.

Create a provider/data licensing matrix recording source, terms revision, permitted acquisition, storage, display, export, MCP delivery, redistribution and deletion restrictions. Include DataForSEO, research providers and AI providers actually used.

Do not infer permission for unrestricted storage or redistribution from an API subscription. Obtain clarification for ambiguous uses; block the affected use until resolved. [DataForSEO’s terms](https://dataforseo.com/terms-of-service) specifically warrant review.

Publish `/crawler` only when the implementation matches its statements.

### G. AI-provider boundaries, Google data and cookies

For platform Agent routes, verify business account ownership, processing terms, training settings, retention, subprocessors and actual deployed routing. Prevent an unapproved platform route from silently replacing an approved route.

For customer custom endpoints:

- Display the destination and explain the data categories transmitted.
- Record acknowledgement when configuring or changing the endpoint.
- Explain that customer provider terms/settings apply.
- Retain network restrictions, encrypted credentials, bounded context and secret redaction.
- Do not imply that customer responsibility removes Cube27’s own duties.

Audit Google sign-in separately from GSC/GA4 integrations. Verify minimal scopes, OAuth disclosures, revocation, imported-history deletion and permitted downstream Agent/MCP use. Publish Limited Use commitments only after matching controls are verified against [Google’s User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

Extend the existing cookie owner with a persistent **Cookie preferences** control. Rejection and withdrawal must stop subsequent optional analytics, clear applicable first-party analytics storage and preserve essential sessions. Verify actual browser traffic, including Cloudflare/Zaraz dashboard injection and cross-host behavior.

### H. Payment policies, IP and enterprise readiness

**Policies and handoff only:** align payment-related prose with the existing commercial model and approved response targets. Record later-payment requirements for merchant identity, policy acceptance references, compliant tax documents, renewal/cancellation behavior and refund/credit-note evidence.

Do not implement or activate these payment paths in this plan.

Complete:

- Dependency and asset license inventory, including deployed packages, fonts, images and redistributed notices.
- Competitor trademark disclaimer and removal of unsupported partnership claims.
- Enterprise security pack and questionnaire covering architecture, locations, access, encryption, backups, retention, incidents, vendors and offboarding.
- A subprocessor-change procedure implementing existing notice and objection commitments, with delivery evidence.
- An insurance decision brief for management, without committing to purchase or inventing limits.

## 4. Delivery order and verification

### PR 1 — implemented controls and internal review drafts

PR 1 contains versioned onboarding acceptance,
bounded security-event persistence for the implemented callers, explicit MCP
workspace consent and connection revocation,
customer endpoint acknowledgement receipts, truthful crawler identity,
robots failure handling, per-hop domain/global suppression, cookie preference
reopening and withdrawal, and the internal legal/operations/license inventory.
Browser impersonation and automatic account-wide MCP access have been removed.
Historical acquisition provenance remains readable.

PR 1 does **not** implement lifecycle jobs or close the remaining engineering
items in the coverage table. Its public policies keep their existing revisions.
The owner requested a behavior-preserving simplification of this diff and a
PR 2 handoff; do not start PR 2 as part of that cleanup.

### PR 2 — finish lifecycle, data-use and launch controls

**Entry point for the next assigned agent:** build on PR 1, not a new copy of
its models, routes, receipt stores or security-event writer. PR 1 is published
from branch `codex/audit-remediation`; start from its merged revision on main and
the current owner documents, and do not assume main contains PR 1 until it has
merged. Read `AGENTS.md`, affected invariants and the owners below first.

The following checklist is the remaining implementation scope. Sections 2 and
3 remain its requirements; this checklist does not replace or narrow them.
Work in dependency order and keep each slice runnable.

1. **Lifecycle requests, authority and retention state.** Extend workspace,
   project and integration owners with durable PostgreSQL operator jobs for
   export and deletion. Record verified authority, actor, scope, trigger,
   deadline, progress, failures, completion and idempotency. Distinguish account,
   workspace, project and integration-history requests. Implement category-scoped
   legal holds with approving authority and review dates. Put the Section 2
   trial, paid-service, explicit-request and backup clocks in configuration.
   Resolve the paid-retention proposal conflict only through recorded approval;
   do not silently change the confirmed schedule.
2. **Execution fences before deletion.** Inventory API admission, schedules,
   durable queues, credentials, MCP grants, Agent context/dispatch and terminal
   writes. Stop affected work and access before purge, and recheck lifecycle at
   dispatch and write boundaries so retries and late workers cannot restore
   deleted data. Preserve other members' workspaces during account deletion;
   require ownership transfer or explicit workspace closure for a sole owner.
   Reactivation may cancel scheduled offboarding before purge, never an explicit
   deletion request. Add lifecycle to the existing MCP membership/grant check.
3. **Export, purge and restoration replay.** Use the processing inventory in
   the [legal review package](../operations/CiteLadder_Legal_Pages_Final_Review_Draft_2026-09-24.md#part-e-internal-remediation-review-package--26-september-2026)
   to inventory actual tables, artifacts and external stores. Export supported
   JSON/CSV data and Agent Markdown with a manifest of omissions and licensing
   restrictions; exclude secrets and credentials. Make deletion retryable and
   concurrent requests idempotent. Keep minimal deletion records outside normal
   customer restore scope and replay them before restored access opens. Verify
   backup expiry bounds separately from active-data deletion. Inspect immutable
   ledger `RESTRICT` references in `models/billing.py` before designing purge:
   do not weaken billing evidence/FKs or cascade retained financial history.
   If compliant separation requires an excluded billing change, record the
   exact conflict for a scope decision instead of bypassing the safeguard.
4. **Acceptance and security evidence.** Add authorized enterprise agreement
   references separately from ordinary user acceptance. Verify prior policy
   content remains recoverable alongside revision receipts and that approved
   material changes require renewed acceptance. Extend `auth/security_events.py`
   at real transaction boundaries for Google sign-in, membership/role changes,
   credentials, MCP tool access, lifecycle/export and administrative actions.
   Add event kinds only with their emitting callers. Keep metadata bounded and
   test that failed/rolled-back mutations leave no misleading success evidence.
5. **Crawler authorization, redirects and pacing.** Record customer authority
   for owned-site analysis. Extend the existing `SecureFetcher`, robots cache
   and host gates so robots decisions and declared delays apply **before each
   destination request**, including redirects and third-party source inspection.
   The current source inspector's final-host check happens after acquisition;
   it is not sufficient. Inventory discovery, onboarding, logos, brand evidence
   and commerce acquisition as well as Site Health. Preserve SSRF/DNS pinning,
   byte/time limits, suppression and the kill switch. Pause unsupported delays;
   never restore browser impersonation or access-control bypass.
6. **Provider licensing and Google data.** Turn the licensing inventory into
   enforced permissions for storage, display, export, MCP and Agent context.
   Ambiguous rights must block the affected use until approved evidence exists.
   Verify Google sign-in separately from GSC/GA4 scopes and OAuth disclosures;
   connect revocation and imported-history deletion to the lifecycle owner and
   enforce permitted downstream use. Extend `domain/integrations`, the existing
   Agent context/tool registry and MCP projection owners, not parallel stores.
   Platform Agent vendor contract and no-training settings remain unverified.
7. **Policy and enterprise package closure.** Complete unpublished revisions
   of Terms, Privacy, DPA, AI, Cookies, Refund, Cancellation, Subprocessors,
   Contact, AUP and `/crawler` against the finished controls. Finalize the MSA,
   order form, country matrix, security questionnaire and payment-policy handoff
   using approved decisions only. Check competitor trademark/affiliation claims,
   deployed dependency and asset licenses, and required redistributed notices;
   the lockfile inventory is not deployed license clearance. Implement the
   subprocessor-change notice procedure with an owner and delivery evidence.
   Prepare notification mechanics without sending external messages until
   separately authorized.

**Owner routing:** [Workspace access](../workspace-access.md),
[MCP](../mcp.md), [Agent](../agents.md), [Site Health](../site-health.md),
[Earned sources](../earned-sources.md),
[Connected data](../integrations-traffic-analytics.md), and
[Billing and entitlements](../billing-entitlements.md) for retained financial
boundaries only. Use the existing PostgreSQL queue and singular migration
baseline; validate schema changes only on newly created disposable data.

#### PR 2 acceptance and external gates

- Prove account/workspace/project/integration isolation, exact retention clocks,
  ownership transfer, holds, reactivation, concurrent requests, retries and late
  workers with real PostgreSQL. Verify export redaction, provenance, licensed
  omissions and deletion replay after an isolated restore.
- Retain PR 1's selected-workspace, legacy re-consent, rotation, revocation and
  membership-loss coverage. Add lifecycle denial to API, worker, Agent and MCP
  paths; retrieved text/prompt injection must never expand authority.
- Test denied redirect destinations before network I/O, robots failures,
  declared delays, owned-site receipts and suppression during ongoing work.
  Test Google revocation/history deletion and restricted Agent/MCP/export uses.
- Verify acceptance history and enterprise references; verify security events
  contain no credentials, prompts or confidential request bodies. Use focused
  existing suites and extend the lowest meaningful owner boundary.
- Track deployed analytics/Zaraz and cross-host traffic checks, India log
  retrieval/retention and delivery-failure alerts, privileged MFA/access review,
  credential rotation, vulnerability/secret checks, incident tabletop, tested
  restore/RTO/RPO, backup expiry and verified-request exercises as **external
  acceptance**, not passed local tests. Keep named responders and provider
  account/contracts/settings evidence open until obtained.
- Keep Sections 5 and 6 open for management/legal/accountant/vendor decisions,
  including country admission, contact details, contract hierarchy/liability,
  finance/security retention exceptions, support/SLA, notice ownership and
  insurance. Link approved evidence when supplied; do not fill missing names or
  present proposed answers as approved facts.

PR 2 is complete only when the implementation checklist has executable coverage
and each external item has either recorded acceptance or an explicit blocking
status for its affected feature, market or promise. Launch/legal readiness still
requires those external gates. No payment/checkout/refund/invoice implementation,
live provider calls, production deletion, deployment or public policy publication
is authorized by this handoff. Public drafts stay internal until owner approval.

### Overall dependency order and verification

Across both PRs, the intended dependency order is:

1. Reconcile the unified Agent baseline; finalize inventory and policy decisions.
2. Establish acceptance records, security events and lifecycle controls.
3. Deliver MCP scoping, Agent boundary checks and crawler fixes.
4. Complete provider disclosures, Google controls and cookie withdrawal.
5. Publish matching policies; complete operational exercises and enterprise documentation.

External legal/provider review can proceed alongside engineering. An unresolved issue blocks its affected feature, promise or market; documenting it does not close it.

Required acceptance scenarios:

- Cross-workspace denial across APIs, workers, Agent context, MCP, downloads and exports.
- MCP selected-workspace consent, legacy re-consent, refresh, revocation, membership loss and newly joined workspaces.
- Trial and paid-service retention clocks, legal holds, concurrent deletion, retries, late workers and restoration without data resurrection.
- Agent prompt injection cannot expand authority, access another workspace or publish externally.
- Actual crawler headers, robots failure states, excessive delays, redirects, suppression and kill-switch behavior.
- Analytics makes no optional requests before consent or after withdrawal.
- Versioned acceptance survives policy changes; optional consent remains separate.
- Security events and exports contain no credentials or confidential request bodies.
- Incident tabletop, log retrieval, backup restoration and verified request handling.

Use focused native tests, with real PostgreSQL for authorization, persistence and concurrency. Follow repository credential isolation and disposable-data rules.

For each completed executable slice, run the required repository check once after the intended diff is complete, then review under [Review.md](../../Review.md). Preserve exact commands/results and distinguish local tests from external acceptance.

Public policies must retain their current revisions until approval. Internal proposals below are not an approved contract or operational claim.

## 5. Decisions pending

These remain explicit work for Cube27 legal/management and designated advisers. They are not delegated to an implementing agent to guess.

| Pending decision/evidence | Responsible party | What it blocks |
|---|---|---|
| Public grievance contact name/designation and business telephone | Cube27 | Final contact/grievance disclosures |
| Enterprise liability cap, exclusions, indemnities, dispute forum and agreement precedence | Cube27 legal/management | Final MSA and changes to existing liability clauses |
| Country-specific applicability, transfer instruments, representatives and mandatory customer rights | Legal advisers | Admission of each affected market and relevant contractual promises |
| Category-specific retention for tax, legal, dispute and security records; legal-hold procedure | Legal/accountant/security owner | Final exception schedule and unrestricted purge operation |
| Provider contracts, processing locations, platform no-training settings and ambiguous DataForSEO/research rights | Cube27/vendor owners/legal | Affected provider route, data use or export |
| Named incident lead and backup, grievance/support coverage, recovery objectives and operational evidence | Cube27 operations | Operational readiness claims and response commitments |
| Subprocessor-notice delivery mechanism and responsible owner | Cube27 operations | Demonstrating the existing DPA notice commitment |
| Cyber/E&O coverage, limits, territories, exclusions and whether coverage is a launch condition | Cube27 management with broker/legal | Closure of the insurance recommendation |
| GST/e-invoice applicability, LUT validity, overseas taxes and policy-linked payment acceptance | Accountant and later payment workstream | Payment readiness; **no payment code belongs in this plan** |
| Final legal approval of revised policies and enterprise documents | Cube27 legal/management | Claiming legal readiness |

**Current status:** PR 1 is implemented locally; PR 2 holds the remaining engineering work. Unresolved decisions and external acceptance remain open.

## 6. Owner-supplied proposals — internal, approval pending

The following is the owner's supplied decision brief, retained for management/legal review.
“Proposed answer” is not approval. Do not render these proposals in marketing,
public docs, policy pages, emails, checkout or enterprise agreements offered for signature.
No placeholder name, telephone, support promise, liability cap, governing forum,
country approval, insurance decision or vendor assurance may become public by inference.

**Retention conflict:** this brief proposes active deletion after the 30-day paid
export window. Section 2 permits a further 30 days to complete that deletion and
requires trial deletion within 30 days of expiry. Preserve Section 2 as the
existing implementation requirement; management must approve any replacement.
The proposed 60–90 day backup preference does not extend an existing shorter lifetime.
Finance/security exceptions require category-specific approval, not blanket
retention of the workspace.

Management / legal decisions required before launch
Who should be publicly named as CiteLadder's privacy/grievance contact?
Proposed answer: Appoint one senior Cube27 employee as the responsible contact, publish their name + designation, use a role email such as privacy@citeladder.com or grievance@citeladder.com, and provide a Cube27 business telephone number. Avoid publishing someone's personal mobile number.
Still needed: [Name], [Designation], [Business telephone].

What is the maximum liability Cube27 is willing to accept under a CiteLadder customer contract?
Proposed answer: General aggregate liability should be capped at fees paid/payable by that customer during the preceding 12 months. Exclude indirect/consequential damages, lost profits, lost revenue, lost search traffic, lost rankings and expected AI/search visibility. Do not give customers unlimited liability by default for ordinary breaches. For enterprise negotiations, confidentiality, security/data protection and IP claims can have a separately negotiated higher cap rather than automatically being unlimited. Fraud/wilful misconduct and anything that legally cannot be limited remain subject to applicable law.
Still needed: Management/legal approval of the 12-month cap and whether a separate higher cap is acceptable for particular claims.

Which contract takes priority if the MSA, Order Form, DPA or website Terms conflict?
Proposed answer: Use a defined hierarchy rather than leaving this ambiguous: DPA controls data-protection issues; signed Order Form controls pricing/scope/commercial terms; MSA controls the general relationship; online product policies/Terms come after those documents. A negotiated enterprise document should not accidentally be overridden by generic website Terms.
Still needed: Legal sign-off on the final precedence clause.

Which law and dispute forum should govern CiteLadder contracts?
Proposed answer: Use Indian law as Cube27's standard position, with one specified Indian court jurisdiction or arbitration seat selected by Cube27. Do not casually agree to every customer's home-country law. For sufficiently large enterprise contracts, Cube27 can negotiate this individually.
Still needed: Legal/management to specify the preferred city, courts/arbitration mechanism and escalation threshold at which Cube27 is willing to negotiate foreign law.

Which countries are we actually willing to sell CiteLadder to at launch?
Proposed answer:
Website, demo requests and enterprise enquiries: worldwide.
Paid self-service: approved-country allowlist only.
A reasonable initial commercial set is India, US, UK, Canada, Australia, New Zealand, Singapore and South Africa after tax/payment confirmation. Treat EU countries, including Ireland, and all other countries as manual enterprise review initially rather than automatically accepting checkout.
This means Cube27 can still win a customer almost anywhere without pretending every jurisdiction has already been legally/tax cleared.
Still needed: Management approves the initial self-service country list; accountant/legal confirms each country before payment is enabled.

How long should CiteLadder retain customer data after a customer leaves?
Proposed answer: Use one documented schedule:

Workspace/customer data: available for export for 30 days after termination, then deleted from active systems.
Crawler results, AI prompts/responses, agent context and analysis data: follow the workspace lifecycle; no indefinite retention merely because it is useful for analytics.
Backups: automatically expire under the normal backup rotation, preferably within 60–90 days rather than attempting ad-hoc deletion from individual immutable backups.
Security/system logs: retain at least the legally required period; CERT-In currently requires applicable entities to retain ICT logs securely for a rolling 180 days within India. CERT-In
Accounting/invoice records: retain according to Cube27's corporate/tax obligations. The Companies Act requires company books of account for at least eight financial years, while GST records generally have a 72-month minimum from the due date of the relevant annual return; the accountant should define the operational rule that satisfies both. Ministry of Corporate Affairs
Still needed: Accountant/legal confirmation of finance and litigation-specific exceptions.

Who can stop data from being deleted because of a dispute, investigation or legal hold?
Proposed answer: Only a designated Cube27 director/legal owner should be able to place a legal hold. Every hold should record reason, customer/data involved, approving person, date imposed and review date. Engineers should not independently retain deleted-customer data "just in case."
Still needed: [Legal-hold approving role/person].

Which external providers are allowed to receive CiteLadder customer data?
Proposed answer: Maintain an approved subprocessor/vendor register covering Cloudflare, hosting/database/observability infrastructure, AI model providers, DataForSEO and other data providers, and the payment processor once payments launch. For every provider record: data sent, purpose, processing/storage location, retention, contractual DPA, training/model-improvement treatment and deletion mechanism.
Customer data should only be sent through approved business/API accounts—not employees' consumer AI accounts. Where a model provider offers a no-training/business data commitment, use that configuration.
Still needed: Engineering/vendor owners populate the factual information; legal reviews questionable terms.

What are we actually permitted to do with DataForSEO and other research-provider data?
Proposed answer: Until the relevant contract explicitly confirms otherwise, CiteLadder may use licensed data to provide the customer-facing analysis for which it was purchased, but should not assume that raw datasets can be resold, bulk-exported, permanently archived or used to create a standalone competing data product. Any ambiguous export/resale/storage use should remain disabled until the vendor or lawyer confirms it.
Still needed: Written confirmation for the exact DataForSEO products CiteLadder uses: keyword, SERP/AI Overview, domain analytics and backlinks.

Who is responsible if CiteLadder has a security or privacy incident?
Proposed answer: Name a primary incident lead and one backup. I would assign responsibility by role rather than create a committee: Engineering/Security Lead = incident commander; senior management/director = backup/escalation owner. Engineering contains and investigates; management/legal decides customer/regulatory communications. Maintain one incident-response runbook with contact details and reporting deadlines.
Still needed: [Primary person's name] and [Backup person's name].

What support and SLA are we willing to promise customers?
Proposed answer: For standard CiteLadder subscriptions, promise business-hours support and a target initial response, not guaranteed resolution times. Do not promise 24×7 staffing, five-nines availability, one-hour recovery or similar commitments unless Cube27 can demonstrate them operationally. Large enterprise customers can purchase/negotiate a separate SLA.
A sensible initial position would be one-business-day target for ordinary support, with security incidents handled through the incident-response process rather than the normal support queue.
Still needed: Management approval of the support hours and enterprise SLA policy.

What RTO/RPO or disaster-recovery promises should we make?
Proposed answer: None contractually until engineering has actually tested restoration. Engineering should conduct a restore test and document the demonstrated recovery point and recovery time. Management can then decide what portion of that capability it is willing to contractually guarantee. Do not invent an RTO/RPO merely because an enterprise questionnaire asks for one.
Still needed: Actual backup/restore test evidence.

How will customers be told when CiteLadder adds or changes a subprocessor?
Proposed answer: Maintain a public Subprocessors page and send notification to workspace owners for material planned changes. A reasonable contractual starting position is 30 days' advance notice where practicable, subject to the final DPA; urgent security/provider replacements need an exception allowing notice as soon as reasonably possible. Assign one operations/product owner to keep the register current.
Still needed: [Owner responsible for subprocessor register].

Does Cube27 want cyber and technology E&O insurance before CiteLadder launches?
Proposed answer: Obtain quotes now for cyber liability + technology E&O/professional indemnity, including international SaaS customers. I would not make insurance a blocker for an initial controlled launch, unless a customer contract requires it. It should become much more important before Cube27 accepts large enterprise liability or enables agents/MCP to modify or publish to customer systems.
Still needed: Management chooses acceptable premium/coverage after receiving the broker quote rather than lawyers deciding whether insurance is "necessary."

What does Finance need to approve before CiteLadder accepts payments?
Proposed answer: Finance/accountant should provide a simple written matrix covering: Indian GST treatment, e-invoicing, exports under LUT, invoice format, foreign-currency receipts and the overseas VAT/GST treatment for every self-service country Cube27 intends to enable. Cube27 already has much of the underlying corporate/accounting structure; CiteLadder should use it rather than invent a parallel process.
Do not put payment implementation into this legal-readiness project. The output required here is simply Approved / Manual Review / Do Not Accept by billing country.
Still needed: Accountant sign-off before payment activation.
