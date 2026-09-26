# CiteLadder audit remediation and enterprise readiness

**Status: queued; saved on 25 September 2026. Implementation is deferred.**

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

The immediate task is limited to saving this plan and adding a queued reference to [plan status](ACTIVE.md), then stopping. Preserve unrelated changes. Do not implement any workstream without a later assignment.

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

Implement later in dependency order:

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

For the immediate **plan-saving task**, run only whitespace/reference checks. No executable tests or deployment are required.

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

**Current status:** plan saved and queued. Implementation remains deferred.
