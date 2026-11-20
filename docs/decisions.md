# Owner decisions across features

Interpreted rules that still bind, each with its owner source and date. A
decision is deleted when a newer one replaces it or when code or an owner doc
fully encodes it. Feature-local rationale lives in the feature's owner doc,
correctness rules in [invariants](invariants.md), visual choices in
[design](design.md), billing in the [billing log](billing-decisions.md).
[Record owner decision](../.claude/skills/record-owner-decision/SKILL.md) says
how to add or change an entry.

## Platform and schema

- **Schema changes are forward migrations.** From `0002_<name>.sql` on, never a
  reset or an edited applied file; [invariant 17](invariants.md#17-schema-changes-are-forward-migrations)
  has the mechanics; production is never reset for a schema change. Owner,
  2026-11-04. Two owner-authorized exceptions refolded the baseline in place,
  each deployed only after the owner's own reset of every database: 0001–0049
  into `0001_baseline.sql` (owner, 2026-11-17), and `0002_ai_visibility_gaps`
  into a strict `0001_baseline.sql` with its existing-data branches removed
  (owner, 2026-11-19). Forward migrations from `0002` apply again after each.
  A third is open: while the owner keeps a single baseline, schema changes
  (the AI visibility gaps plan's and Site Health's alike) edit
  `0001_baseline.sql` in place and CI builds the database (owner, 2026-11-20);
  it ends when the owner names the next forward migration, after which edits to
  the baseline stop again.
  A reset is owner-run, never agent-run.
- **Access is looked up once per request** and never cached across requests, so
  removing a member, revoking a grant or ending a trial bites on the next
  request. Workers keep their own bounded reuse. Owner, 2026-11-02.
- **Failed reads surface within seconds**: one quick retry, then the inline
  error with Retry (policy in `QUERY_*`, `frontend/lib/config/operational.ts`).
  Owner, 2026-11-15.
- **Browser errors go to the API's structured log** through one same-origin
  endpoint: no new table, no third-party error service
  ([contract](api-error-contract.md#6-browser-error-reports)). Owner, 2026-11-02.
- **The app shell may sit in the back-forward cache** (`no-cache` HTML, not
  `no-store`); sign-out sends `Clear-Site-Data: "cache"` only (clearing
  `"storage"` would reset theme and cookie consent, undecided); API responses and
  bearer links stay `no-store`; the manifest is not standalone. Owner, 2026-11-13.
- **Browser minimum: Chrome/Edge 123, Firefox 132, Safari/iOS 17.5, Samsung 27.**
  No UI may depend on native popover alone (iOS Safari 18.3). Owner, 2026-11-13;
  [frontend architecture](frontend-architecture.md) owns the matrix.
- **Source files are limited by tokens (6,000), not lines**; the 500-line module
  rule is gone. Owner, 2026-11-13; [Development](DEVELOPMENT.md#source-file-size).
- **Visual effects are the owner's choice, not a check's.** The design-system
  policy guards only breakage, theming and exposure (colours as tokens,
  contrast, Tailwind `@source`, Radix imports, font files, CSS that does not
  parse); shadows, motion, radii, type and spacing ladders, card layout and
  token usage are not policed. Owner, 2026-11-20.

## Accounts, access and sign-in

- **One billing account per workspace.** A user owns one workspace and joins
  others by invitation; each workspace has one Owner, Owner and Admin hold equal
  permissions, Member runs the product, Viewer reads. No project ACLs, seat
  billing or account-link entity. Owner-confirmed, shipped in #61 and #58;
  [Workspace access](workspace-access.md) owns the behaviour.
- **Terms are accepted on the sign-in and sign-up forms, never on a later
  screen.** Since 2026-11-03 it is a statement under the form ("By continuing
  you agree to the Terms of Service and acknowledge the Privacy Policy"), not a
  checkbox. A session that predates a new revision signs in again rather than
  seeing an in-app consent screen. Owner, 2026-11-02 and 2026-11-03; the
  separate screen came back after #348 and #367, so don't reintroduce it.
- **Sign-up abuse controls.** Public sign-up refuses reserved mail domains
  (RFC 2606/6761) and a maintained disposable-domain list kept as repository
  config; Turnstile guards sign-up and every "email me a link" request, verified
  by the API and failing closed outside development. Owner, 2026-11-02. Sign-in
  is challenged after 5 failures for the address or network, and abuse budgets
  key on the IPv6 /64 (/56 for registration): owner AR-3, 2026-11-12
  ([audit remediation](plans/audit-remediation.md#owner-decisions-2026-11-12)).
- **Auth screens keep their look.** Email field `autocomplete="username"`; no
  show-password toggle, no `enterkeyhint`, button label and Confirm password
  unchanged; form errors stay per-field `role="alert"` with no summary. Owner,
  2026-11-13.

## Billing and metering

- **Provider portability; billing is operational but hidden.** Each
  intent, subscription and receipt binds to its originating provider and
  environment; Razorpay is the implemented provider. Checkout serves only
  workspaces holding `billing_checkout`; only the free trial is public. Owner,
  2026-09-24 and 2026-10-11 (B0, B2); enablement waits for the owner's
  separate live sign-off ([provider readiness](billing-provider-readiness.md)).
- **Platform AI is metered in AI credits** (1 credit = $0.001 of usage after a
  30% markup, at the serving model's token price); customers see only credits.
  The Agent has no customer-model (BYOK) route; BYOK stays for answer-engine and
  research providers. Owner, 2026-10-11 and 2026-10-12 (B4, B8, B12, B19,
  B31, B53); prices and plan sizes are configuration (B55).
- **JEV (TypeSafe) judgments are unmetered and unthrottled**: calls run in
  parallel against a bounded count and each job's deadline. TypeSafe is a
  published subprocessor and `JEV_API_KEY` is enabled in production without
  waiting out the DPA's 30-day notice (pre-launch, no DPA customers); later
  subprocessor changes follow the notice period. Owner, 2026-09-28.

## Agent, MCP and public API

- **One Agent runtime; the Action is the unit of work.** One in-app Agent reads
  through the same registered read tools as MCP, applies internal skills the user
  may pick but never sees, and keeps versioned deliverables in the chat. Skills
  are not exposed through MCP or as a download. Generating or approving a
  deliverable never declares implementation. Owner, 2026-09-25.
- **Native tool calling, no agent framework**, on both providers behind the
  platform gateway (Anthropic and OpenAI-compatible); default model Claude Haiku
  5.5 at medium effort; reads in one response run together; earlier turns replay
  append-only so the prompt cache and thinking carry. Owner A1–A3, 2026-10-12.
- **The Agent behaves like a normal Claude chat.** One draft state (no
  outline-first phase; an outline only on request), revision by exact edits,
  generous limits so long work finishes, a failed turn that saved nothing is not
  charged (B58). Anthropic message threads are rejected (expire, don't compact,
  not durable): transcripts stay append-only in PostgreSQL. Owner, 2026-11-04.
- **Web search and several documents per chat.** Provider-hosted search only,
  bounded per turn, results shown as untrusted web sources apart from CiteLadder
  records (no page fetch; none on the OpenAI-compatible route). A chat holds
  numbered documents; any methodology may write in any chat. Owner, 2026-11-04
  ([invariant 13](invariants.md#13-the-agent-is-bounded-orchestration)).
- **The Agent works proportionately, with simple skills.** A representative
  sample is enough unless the person asks for every page; web search runs only
  when asked or genuinely needed. A skill gives the goal, where the data is, a
  few judgement points and the deliverable's shape, with no numbered methods or
  repeated caveats; brittle skills hinder the model. Owner, 2026-11-04.
- **Agent chat UX.** [AI Elements](https://ui.shadcn.com/docs/ai-elements) are a
  pattern source ported into `components/ui/`, never a dependency. People never
  see tool names, record IDs, UUIDs, `citeladder://` references or budget
  numbers. The Agent may propose marking an Action implemented as a card; only
  the person's confirmation declares it. Owner, 2026-11-13.
- **Scoped API keys are explicit user decisions.** `api_access` is a paid-plan
  capability; Owner or Admin creates a key, its scopes intersect its creator's
  live role, removing the creator revokes it ([invariant 10](invariants.md#10-automation-stays-bounded)).
  Public reads: answers only. Public writes: bulk prompt changes only (status,
  topic, delete over a selection). No brand-fact scope; verdict overrides stay in
  the app. v1 keeps its conventions (no RFC 9457, no offset paging). Owner,
  2026-10-10 (D4.1–D4.3) and 2026-11-18.
- **MCP writes are confirmed user decisions.** Only with **Allow changes** ticked
  at consent (default off, adds `citeladder:write`); larger changes go through
  `confirm_change` after a previewed dry run. Prompts added over MCP are active
  at once; competitor suggestions are accepted or rejected directly; bulk
  activate, archive and assign-topic is one prepared change; **no prompt delete
  over MCP**; the in-app Agent stays read-only. Owner, 2026-10-10 (D4.2, D4.4)
  and 2026-11-18 ([MCP](mcp.md#changes)).
- **MCP reads grow by views first.** MCP and the Agent share one read catalogue
  in the Agent's cached prefix, so new reads are views or parameters on existing
  tools before new tools. Tool descriptions, links, docs site and changelog are
  refreshed with each change. Owner, 2026-11-18 ([MCP](mcp.md#the-catalogue)).

## Prompts and Visibility

- **Onboarding creates no prompts**; an empty prompt set is valid and Overview
  and Prompts ask the user to choose questions. Owner, 2026-09-26.
- **Generated prompts are reviewed before tracking.** Generate stages candidates
  in a separate table, only a user's accept creates an active prompt (never a
  `proposed` status on `Prompt`, which every measurement query would have to
  exclude). Owner, 2026-09-26.
- **A quality judgment gates generated prompts** (`jev-gate-1`, provisional
  thresholds): a strong fail never reaches review, an uncertain one is flagged;
  `JEV_MODE=shadow` makes it record-only. A rejected candidate with a judgment
  is kept without its text as a calibration outcome. A judgment never retires a
  tracked prompt. Owner, 2026-09-26 and 2026-09-27.
- **Prompt Builder.** Generated prompts over 16 words are dropped and reported;
  topics are buyer-facing categories, never product lines, models or the brand;
  users control topics, search queries, distribution and context end to end; the
  Agent keeps `prompt_discovery` for MCP, following the builder's steps. Owner,
  2026-11-01.
- **The Prompts table shows every cohort**, and each prompt's Change compares it
  with its own previous measurement. Owner, 2026-11-15; its Sources column and
  Brands and Sources filters read persisted mentions and citations, owner,
  2026-11-17.
- **One prompt library** across every prompt set, Commerce's included. Runs add
  evidence and never hide earlier prompts; manual adds, imports and generation
  go to the oldest non-Commerce set. Owner, 2026-11-15.
- **One comparable baseline per run**, chosen by the Visibility comparison rule
  and read by Overview and Visibility alike (`comparisonBasis` in
  `@citeladder/contracts/comparison-reason`). `comparable` and `matched_subset`
  show a change ("8 of 12 answers comparable"); every other status shows none and
  says why. Owner, 2026-11-02 and 2026-11-15.
- **The period chip may show only its icon.** At its default the period or
  measurement filter is an icon chip like the other frequent filters; the data
  window stays in sight as the filter row's end text ("Latest run · 18 Nov
  09:12"), not as the chip's value. Owner, 2026-11-18.

## Site Health and data

- **Crawler parity checks stay deterministic** on evidence the crawl already
  fetches; headless rendering and external-link checks stay out. Title and meta
  length, thin content and long paragraphs are advisories (config thresholds,
  never scored). Applebot joins both crawler-access checks, Applebot-Extended the
  AI-crawler check. Owner, 2026-10-17 and 2026-11-18.
- **User-visible text says "issues", never "defects"** (`finding_class` keeps the
  value `defect`). "Pages buried too deeply" is unknown unless crawl coverage is
  complete. Owner, 2026-11-01.
- **Site Health always opens on Pages**, never switching tab on its own. Owner,
  2026-11-02.
- **Browser Site Health reads carry no provenance id lists**; the rows keep them
  ([invariant 5](invariants.md#5-derived-artifacts-record-provenance)). Owner,
  2026-11-02. The Overview also drops the per-page eligibility reasons no screen
  reads, and a published Issues summary keeps its monitored affected count until
  the next publication instead of recounting it per read. Owner, 2026-11-20.
- **Domain verification, authorized-crawl receipts and enterprise SSO/SCIM wait**
  for an enterprise customer; before a crawl of the project's own site the user
  may choose to ignore robots.txt, with no verification required. Owner,
  2026-11-11.
- **Search Console imports final data only.** Trailing days not yet reported are
  their own state, never zero, and never null the rest of the window. Owner,
  2026-11-02.
- **An absent value is one muted dash, named by its kind** in its tooltip and
  accessible name; words stay only for states a reader can act on and for
  sentences. [Design](design.md) owns the rendering. Owner, 2026-11-18.

## Actions and content

- **One Actions feature; content gaps from content pages only.** One list, no
  per-surface screens; content-gap findings are ordinary Actions drawn only from
  competitor and editorial content pages (never product, category or home pages)
  and answers to tracked prompts. Every page in the URLs Gap filter is an Action.
  An Action opens as a page, never a drawer. Owner, 2026-11-10 and 2026-11-16
  ([Opportunities](opportunities.md)).
- **Actions group Issues (IA1).** Each Site Health defect or advisory rule is one
  Action per Issues group, filed by its Issues section; no per-page finding
  becomes an Action; the Issues page is unchanged. Owner, 2026-11-16.
- **Action statuses: New, In progress, Done, Declined.** Accept or Work with Agent
  moves to In progress, Mark implemented to Done (the declaration), and a chat
  output never changes status. Done is final for the user; measurement shows as
  a badge. Owner, 2026-11-16.
- **Content optimization** ([owner doc](content-optimization.md)), owner
  2026-11-10: storage stays in the one Opportunity/Action store (CO2); evidence is
  titles of competitor and editorial pages cited in answers (CO3); clustering is
  by topic, free, persisted with its version over the last 30 days (CO4, CO8);
  Analyze a page lists only the crawl's content pages (CO6); Site Health issues
  stay in Issues and rule suggestions appear only in the editor (CO11); no grades
  or scores (CO14); content kinds are `article`, `guide`, `how_to`, `listicle`,
  `comparison`, `alternative`, `case_study_review` (CO15); the editor lives inside
  the Agent window as Markdown in CodeMirror 6 with offsets equal to server
  offsets (E1, E2); reverting an applied suggestion needs its span unchanged (E4).
- **Commerce** ([owner doc](commerce-intelligence.md)), owner 2026-11-11: product
  metrics read all runs, re-derived from stored answers over 30 days and never
  rewriting raw answers (CM1); structured capture starts with the ChatGPT
  carousel (CM2); no ratings or attribute extraction (CM4); shopping prompts are
  a category matrix, about 15–20% branded (CM7); period comparisons come later
  (CM8).

## Public website and copy

- **The site presents CiteLadder as open source** (AGPL-3.0, repo
  `https://github.com/abhij1306/CiteLadder`) as a supporting pillar: the product
  keeps the name "CiteLadder" (never "CiteLadder Cloud"), the homepage gets no
  added open-source line, the GitHub mark sits in header and footer, and
  `/enterprise` does not pitch self-hosting. Owner, 2026-10-20.
- **Modules carry plain names and renamed public URLs keep a 301** from the old
  path, served by the marketing Worker before Astro (no chains; Content Briefs
  became Content Optimization). Inside the app and API there are still no
  aliases. Owner, 2026-11-04 and 2026-11-10.
- **The desktop navbar island hydrates only from 1280px** (`client:media`); no
  popover rebuild. Owner, 2026-11-13.
