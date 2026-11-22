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
- **An app route change deletes the old route.** The signed-in app keeps no
  redirect, alias, tab-key remap or URL rewrite for a renamed or removed path or
  tab: an unknown path gets the not-found page, an unknown tab the page's
  default. Owner, 2026-11-20.
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
- **Source code has no comments.** Names, types, tests and owner docs carry
  the meaning; a check enforces it and allows only machine-read directives.
  Owner, 2026-11-21 (#1136).
- **Three design checks, no more.** No literal colours in app code, WCAG AA
  contrast of token pairs, and no Radix import outside `components/ui`; every
  other visual choice is the owner's, held by review. Owner, 2026-11-20
  ([AR-6](#app-design-ar-owner-2026-11-20-unless-dated)).

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
  ([audit remediation](#audit-remediation-owner-2026-11-12)).
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
- **The Agent drives the app.** A person can do their project's data and
  analysis work from the chat without visiting the screens: the Agent may make
  every project-data and analysis change a button makes, deletes included, each
  as a previewed card that only the person's click executes. Billing, plan,
  members, API keys and settings stay button-only. A long job is launched, the
  turn ends and the person resumes on return; no sub-agents. Sign-in lands on
  Overview until the Agent is tested; landing on the Agent is the last step.
  Owner, 2026-11-18 and 2026-11-22 ([plan](plans/agent-hero.md)).
- **Agent model picker: Claude only.** Haiku 5.5, Sonnet 5.5 and Opus 5.5 at
  low, medium or high effort, chosen per chat
  ([B75](billing-decisions.md#agent-charging)). The OpenAI-compatible route
  stays in code and is not offered. Owner, 2026-11-22.
- **Agent uploads, inline views and connectors.** An uploaded file is chat
  material the Agent can convert into a CiteLadder import format and save
  through a card. The Agent shows the app's existing charts and tables in the
  thread from persisted reads. Integrations are connected from the chat, and a
  curated list of outside connectors (Slack, Jira or Linear, Notion, Google
  Drive and Docs, WordPress) is read and written behind a card. Owner,
  2026-11-22.
- **Agent skills.** Existing skills get a quality pass and simple skills are
  added for features that have none. Skills that act and cross-feature
  playbooks come after, tested locally before merge; how the harness runs a
  playbook is undecided. Owner, 2026-11-22.
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
  over MCP**. Owner, 2026-10-10 (D4.2, D4.4) and 2026-11-18
  ([MCP](mcp.md#changes)).
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
  became Content Optimization). Only the website and docs sites keep
  redirects; the API keeps no aliases and the app follows the route rule under
  Platform. Owner, 2026-11-04 and 2026-11-10.
- **The desktop navbar island hydrates only from 1280px** (`client:media`); no
  popover rebuild. Owner, 2026-11-13.

## App design (AR, owner 2026-11-20 unless dated)

[Design](design.md) holds the values; these are the rules behind them.

- **AR-1 Look:** blue-tinted neutrals in light and pure neutral greys in dark, Google Sans as the sans face, an inset content panel on tinted paper, white
  surfaces and controls with no outer border or shadow, corners at the button
  radius, compact controls (2026-11-22). **AR-2 Text:** body and labels 14px, captions 12px, controls 32px and the page header 48px (owner, 2026-11-22).
- **AR-3 Metrics** sit in one strip with hairline dividers, never cards, with no
  meters, rings or bars in a cell. **AR-4 Tables:** the first column takes the
  spare width and the others hug their content.
- **AR-5** The line language (solid observed, dashed draft, `—` absent, printed
  `0`) and the accent meaning "you, here" stay; the accent also marks focus.
- **AR-6** Only the three design checks under Platform remain. **AR-7** The
  website and docs keep their look; the app's tokens are its own.
- **AR-8 Sidebar collapse:** the toggle sits at the end of the Integrations row
  when expanded and on its own row in the icon rail (2026-11-21).
- **AR-9 Widths:** 1040 column for Overview, Projects, Issues, Actions, page
  detail, Agent, Settings and Agent context; 720 for Billing and Runs. Settings
  and Agent context list their sections in a sticky left rail, never a tab row,
  so their header and rail never move; only Business map's content is wider.
  Side space beats space in the middle (2026-11-20 and 2026-11-21).
- **AR-10** Pages are placed in standard layouts, never arranged by hand.
  **AR-11** A PR that grows the line count needs a reason.
- **AR-12** Sign-in and account pages keep the split screen with the showcase
  and an unboxed form; setup keeps its own layout. **AR-13** Focus is a subtle
  accent edge and glow.
- **AR-14 No helper text** under a heading or field unless it carries what the
  label cannot (a limit, a count, an error).
- **AR-15 Business facts** are edited in the Prompt builder and Agent context's
  Business map only, sharing one offerings grid; Context's Company tab holds the
  target audience. The Prompt builder has its own Tracking row and keeps its
  steps in a left rail.
- **AR-16** Distribution shares and the intent mix are split bars in 5% steps
  totalling 100. **AR-17** A page whose content fits shows no scrollbar
  (2026-11-21).
- **AR-18 Icons** are Tabler's. A glyph beside text is centred on it and draws
  no taller than the text, so 14px beside the 14px body (2026-11-21).

## Audit remediation (owner 2026-11-12)

IDs from the 2026-11-12 codebase audit; "AR" here predates the app design's.

- **AR-1** An unset or unknown `APP_ENV` refuses startup. **AR-2** Dev-only seed
  and reset tooling lives outside the tracked repository.
- **AR-3** Abuse budgets key on the IPv6 /64 (/56 for registration) with a
  global login-failure ceiling; Turnstile on login after 5 failures; a separate
  anonymous MCP registration pool.
- **AR-4** Agent reply links to unknown hosts confirm with the full URL first.
- **AR-5** Owned and competitor domains are platform-aware: shared-platform
  hosts are kept whole. **AR-6** Brand matching joins words only through
  configured aliases; names under 3 characters are not assessable on cited
  pages.
- **AR-7** Controls a role lacks are hidden, not disabled. **AR-8** Browser
  floor: Chrome/Edge 120, Safari/iOS 17.4, Samsung 25, with an update notice.
- **AR-9** Non-UTF-8 imports are refused with guidance; every import offers a
  sample CSV. **AR-10** `GET /health` answers a constant body without the
  origin token; every other path, `/ready` included, requires it.
- **AR-11** The API complexity and duplication ratchets skip only
  `services/api/src/generated/` (2026-11-13).

## Site Health crawling (SH-B owner 2026-11-12, CO owner 2026-11-17)

[Site Health](site-health.md) owns the contracts.

- **SH-B1** Every surface reads one current crawl: the newest usable crawl that
  is not a one-page rerun; a rerun updates only its page. **SH-B9** Screens read
  each tracked page's latest audit; re-audits update the totals; the only change
  graph is open issues over time.
- **SH-B2** Issues are tracked per page: an issue stays open until it is
  resolved on all its tracked pages, and a fix verifies only when every rule
  its finding folds together passes.
- **SH-B4** Nothing that changes analyzed pages or re-audits runs inside a
  running crawl; it is refused until the crawl ends.
- **SH-B5 Discovery:** the sitemap, deduplicated and free, with no product
  limit; every discovered URL is saved; index entries are followed on the
  site's own domain to a safety ceiling (about 1,000 files or 500,000 URLs); a
  file over 50 MB stays unread. Every full crawl re-reads it. The HTML walk runs
  only when there is no sitemap (with a "No sitemap" issue); an unreadable
  sitemap is retried, then the crawl analyzes what it knows as partial
  (2026-11-14 and 2026-11-17).
- **SH-B6 Tracked pages** are picked by value tier in a stable order, never by
  the person and never re-picked; full crawls fill the set up to the plan
  limit; an upgrade extends it, a downgrade keeps the first N.
- **SH-B7** One crawl action audits the same pages each time. **SH-B8** A
  tracked page answering 404 or a redirect stays tracked, reads "page
  unavailable" and opens that issue. **SH-B10** No crawl cooldown.
- **SH-B12** Mark fixed ("N of M pages fixed") and Re-run all exist; no "new
  since baseline" deltas and no per-issue score gain. **SH-B13** The tracked set
  has no editing API and the crawl request no advanced scope options.
- **Stall and live score** (2026-11-17): a crawl fails as overdue only after 30
  minutes with no task settled, capped at 12 hours; while it runs the score card
  is the average of stored page scores.
- **CO-1** Only the runner's Site Health transactions turn
  `synchronous_commit` off (`SET LOCAL`); billing, ledger, webhook and paid
  provider commits stay durable. **CO-2** Terminalization is batched and leased;
  3 failed attempts end the crawl `failed` with a reason; a cancelled crawl
  stays `cancelled`.
- **CO-3** Live counters come from the crawl row, up to about 30 s old.
  **CO-5** A workspace-only index is dropped only if another index leads with
  `workspace_id`, else replaced by a composite that does.
- **CO-6** Evaluations carry their `analysis_id`; snapshots store no evaluation
  id list; evidence tables are partitioned by crawl month.
- **CO-7** Crawls of tens of thousands of pages complete on today's
  infrastructure: analysis, the score and Issues publish in batches while the
  crawl runs, a cancel keeps what was published, and every crawl-wide step
  works in bounded batches (2026-11-20).

## AI visibility (AV, owner 2026-11-17 to 2026-11-20)

- **AV-3** Only views of persisted fact-check data return. **AV-4** No strongest
  or weakest engine. **AV-5** Answers group by the topic frozen at the run;
  topic renames show.
- **AV-6** Competitors get theme counts; quotes stay brand-only. **AV-7**
  Position and win rate count only the tracked roster.
- **AV-8** Query fanouts count queries exactly as engines returned them, with
  Share, Change against the previous comparable run and Brands matched.
- **AV-11** Competitor discovery extends the perception template, adding no
  call. **AV-12** Verdict overrides count in accuracy with an "N edited" note;
  brand facts are typed by people, never drafted by models.
- **AV-13** Cross-run answers are a section on the prompt page. **AV-14** Brand
  has Insights and Perception; Perception has Brand, Market, Objections and
  Fact-checking tabs. **AV-15** A screen shows only data CiteLadder stores.
- **AV-16 Navigation:** Home (Overview, Actions), Brand (Insights, Perception,
  Competitors), Tracking (Prompts, Prompt builder, Sources, Runs), Website
  (Site health, Issues, AI traffic), Search (Performance, Keyword research),
  Commerce (Shopping, Products), Integrations in the foot. **AV-22** The search
  page is named Keyword research. **AV-23** The palette lists Fact-checking,
  Query fanouts and Prompt builder.
- **AV-24** Brand detection is fixed before any probe, and branded answers show
  on Perception. **AV-25** Brand facts has editable Aliases; matching
  normalises case, "&"/"and", spaces and punctuation on whole words.
  **AV-26** For prompts naming the brand, it counts as mentioned and perception
  reads the whole answer.
- **AV-27** Onboarding saves 5 to 8 buyer-facing themes (never company facts),
  hidden during onboarding; users edit them freely; probe answers map onto
  them. **AV-39** Perception › Brand classifies against these themes plus
  `Other`, from the next audit, with no backfill.
- **AV-28** The first probe groups objections by meaning; later probes map onto
  them and add only genuinely new groups; users rename, merge or delete.
- **AV-29 to AV-35 Probes:** one run asks market and objection questions, three
  times per search-capable engine with a saved key (managed mode uses
  CiteLadder's); direct questions ask about the project's brand only, theme
  questions cover competitors; on demand with an optional schedule; charged in
  AI credits shown first; tables lead with the position score (100 when named
  first, minus 10 per later place, 0 when not raised).
- **AV-36** No objection detail page and no "Draft rebuttal". **AV-37** An
  objection's Ask agent opens Agent chat, which lists its sources and suggests
  edits, outreach or advice, never acting on its own.
