# Accepted cross-feature decisions

Keep accepted, still-applicable choices with their reason, scope and actual
source. Feature-local rationale belongs in its feature owner; correctness
rules belong in [invariants](invariants.md). Visual choices (faces, colours,
material, table styling, page layouts) are preferences that live in
[design](design.md), not here. Git and PRs retain superseded history.

## TypeScript application, forward SQL migrations

The application uses TypeScript with Hono, Kysely and Zod. The schema is
`frontend/services/api/migrations/0001_baseline.sql` followed by numbered
forward migrations (`0002_<name>.sql`, …), the only schema author under
[invariant 17](invariants.md#17-schema-changes-are-forward-migrations).
The TypeScript migrate CLI (`src/cli/migrate.ts`, `pnpm migrate`) applies the
pending files in order under an advisory lock in one transaction and records
each SHA-256 in `schema_migrations`; it runs from the API image, so the deploy
builds one application image. Kysely types are generated from a migrated
database.

There is no adoption shim: a non-empty database without the ledger, or an
applied file whose checksum changed, fails the migrate job. Every schema change
is a new numbered migration that applies to the existing production database in
place; the baseline and every applied file stay unchanged, and production is
never reset for a schema change. `reset_database` remains only for disposable
data, with its confirmation check.

On 17 November 2026 the owner took one checkpoint: the 0001-0049 chain was
folded into a new `0001_baseline.sql` (same schema, data-only repairs dropped),
which the owner deploys only after resetting every existing database. That is
a one-time owner-run operation, not a change to this rule; new migrations
continue at 0002.

Source: owner decision of 10 October 2026 (feature 14, execution platform),
superseded for schema changes by the owner on 4 November 2026: "from now
onwards schema changes go into 002 onwards instead of resetting and deleting
existing db for migration to avoid production resets". Checkpoint: owner,
17 November 2026: "audit and consolidate the migration files, since there have
been a lot of changes i want to run reset db and deploy", then "no the decision
stays the same but we are just creating a new checkpoint sort of".

## One commercial account per workspace

A workspace owns exactly one billing account. A user owns one workspace and may
join others by invitation; each workspace retains exactly one designated Owner.
Owner and Admin have equal workspace permissions. Billing, member management
and provider/integration credentials are administrative; Member has ordinary
product read/write/run access and Viewer has read-only product access.

This makes tenancy, access and commercial ownership agree without project ACLs,
seat billing or a second account-link entity. Ownership is counted separately
from invited membership. Workspace selection is explicit; project resolution
must still authorize the project's workspace.

Source: owner-confirmed commercial and workspace decisions, implemented in
[PR #61](https://github.com/Cube-27/Citeladder/pull/61) (44fc0d22), with shell
selection in [PR #58](https://github.com/Cube-27/Citeladder/pull/58) (cae5717f).
[Workspace access](workspace-access.md) and [billing](billing-entitlements.md)
own shipped behavior. The sign-in workspace chooser and invitation delivery
through self-serve authentication (#280) are implemented.

## Preserve provider portability; billing is operational but hidden

The commercial core binds each intent/subscription/receipt to its originating
provider and environment; vendor keys and webhook vocabulary remain
vendor-owned. This avoids rewriting commercial accounting to change a payment
transport. Razorpay is the implemented provider; the option to select another
remains.

Billing is fully operational but hidden, so that enabling it is one small
configuration change. Checkout serves only workspaces holding the non-public
`billing_checkout` grant (Razorpay test keys are accepted in production for
them alone); the public catalog reads checkout unavailable, and only the free
trial is live. Enablement waits for the owner's separate live sign-off tracked in
the [backlog](plans/backlog.md#acceptance-calibration-and-rollout).

Source: owner-confirmed provider-portability decision, implemented in
[PR #61](https://github.com/Cube-27/Citeladder/pull/61) (44fc0d22); the owner
resumed Razorpay activation on 24 September 2026 and set hidden operation on
11 October 2026 (billing decisions B0 and B2, refined by B42 in the
[billing decision log](billing-decisions.md)).

Real sandbox captures, recurring-method acceptance and GST parity remain
unverified. [Provider readiness](billing-provider-readiness.md) owns the
acceptance and separate enablement boundary.

## Platform AI is metered in AI credits; the Agent has no customer model route

Every platform model call spends AI credits (1 credit is $0.001 of usage after a
30% markup), charged on tokens at the serving model's price, and internal cost
follows the provider's published rates; customers see only credits. Prompt runs
replace audit credits as the measurement unit. The Agent always uses the
platform gateway: its customer (BYOK) model route was removed. Customer provider
keys (BYOK) remain only for answer-engine and research providers, as a lower
price of the same plan.

Source: owner decisions of 11 and 12 October 2026, billing decisions B4, B8,
B11, B12, B19, B23, B31 and B53 in the [billing decision log](billing-decisions.md).
Plan sizes and prices are configuration (B55). [Billing and
entitlements](billing-entitlements.md) and [Agent](agents.md) own shipped behavior.

## One Agent runtime; the Action is the unit of work

The separate Content and Growth Agent runtimes are replaced by one in-app Agent.
It reads through the same registered read tools as MCP, applies internal skills
the user may pick by name but never sees, and keeps its versioned deliverables
in the chat; the chat is the saved work. Target-level work converges on one Action
per target, grouped and diagnosed deterministically from live Opportunities.
Skills stay internal: they are not exposed through MCP or offered as a
download, and the MCP surface is otherwise unchanged apart from removing its
retired skill catalog. Generating or approving a deliverable is not an
implementation declaration.

This removes two overlapping generation stacks, keeps MCP and the app from
drifting into different reads, and gives repeated findings on one target one
place to converge.
Source: owner-settled Agent workspace plan,
25 September 2026. [Agent](agents.md) and [Opportunities](opportunities.md)
own shipped behavior.

## The Agent uses native tool calling

The Agent runs a native tool-calling loop on the providers' own APIs with no
agent framework (A1): the model calls reads and the built-ins (`load_skill`,
`save_document`, `edit_document`) directly, one response's reads run together, and a chat's
earlier turns are replayed append-only so the prompt cache and thinking carry
across turns. It keeps both providers, Anthropic and OpenAI-compatible (A2),
behind the platform gateway. The default model is Claude Haiku 5.5 at medium
effort (A3). This replaces the JSON step protocol, which allowed one read per
step, threw away earlier reasoning and re-sent a rebuilt prompt each step.

Source: owner decisions A1–A3 of 12 October 2026 in the Agent native runtime
plan (closed 11 November 2026); pricing in
[B53](billing-decisions.md#agent-native-runtime-2026-10-12). [Agent](agents.md)
owns the shipped behavior.

## The Agent behaves like a normal Claude chat

The Agent should behave like an ordinary Claude chat rather than a gated
workflow. A deliverable has one draft state: the outline-first phase and its
approval step are removed, an outline is written only when the person asks for
one, and the model revises a document with exact edits (`edit_document`)
instead of rewriting it. Limits are raised so long work finishes: 64 000 output
tokens per call, a 600-second model call, and larger per-turn call, tool,
message, reply and turn-time limits. A response cut off by the output cap is
retried once at low effort, and a failed turn that saved nothing is not charged
([B58](billing-decisions.md#agent-chat-behaviour-2026-11-04)). The removal keeps
no compatibility path, and processing versions stay at 1.

The chat should also be efficient. Anthropic's message threads (beta) are
rejected: they expire after five minutes, do not compact and are not durable.
Transcripts stay append-only and durable in PostgreSQL, and prompt caching is
fixed within replay. Processing, policy, runtime and protocol versions stay at
1, with no back-compatibility shims.

Source: owner, 4 November 2026 (Agent chat-behaviour request; efficiency and
message threads in the follow-up of the same day). [Agent](agents.md)
owns the shipped behavior and limits.

## Agent chats search the web and hold several documents

The Agent may search the web through the model provider's hosted search
(Anthropic `web_search_20250305`) when saved CiteLadder data cannot answer,
within `max_web_searches` per turn (5). Searched pages are untrusted
observations: replies cite them and they are shown as web sources, apart from
the CiteLadder records a turn read ([invariant 13](invariants.md#13-the-agent-is-bounded-orchestration)).
Searches are internal cost at the provider's published rate and customers see
credits ([B59](billing-decisions.md#agent-chat-behaviour-2026-11-04)). The
OpenAI-compatible route offers no hosted search, so a turn there answers from
CiteLadder data alone. Fetching a found page in full (web fetch) is not
included.

A chat holds several documents, numbered Document 1, Document 2 and so on in
creation order. Saving without a number adds a document; a number replaces or
edits that document. Any methodology may write in any chat, so the one-kind
rule and `agent_skill_kind_conflict` are removed. Each document keeps its own
revisions, edits and restores, and a targeted document attaches its chat's
Action as before.

Source: owner, 4 November 2026: "PR3 can include web search tool and multiple
doc". [Agent](agents.md) owns the shipped behavior.

## The Agent works proportionately, with simple skills

The Agent analyses proportionately: a representative sample is enough unless
the person asks for every page. It starts from the evidence already supplied
(an issue's sampled occurrences, the context), reads 3–5 representative pages
for an issue across many pages and says how many of the total the sample
covers, and reads a page's full text only when that page is directly relevant.
Agent page reads return 20 rows by default and at most 50 (MCP clients keep
their own larger pages). Web search runs only when the person asks for it or
the answer genuinely needs outside information; it is not a default step.

Skills are simple: each gives the goal, where the data is, a few points of
domain judgement the model would not reliably bring, and the deliverable's
shape, with no numbered methods, exhaustive verification demands or repeated
caveats the operating contract already states. The models are capable enough
that brittle skills hinder useful results. The in-app skills, the content
formats and the public plugin's twins follow this shape. Credit holds follow
[B60](billing-decisions.md#agent-chat-behaviour-2026-11-04).

Source: owner, 4 November 2026: "the model doesnt need to analyze everything
in one go, if i sent 112 pages it doesnt mean all needs to be checked and even
for web search why 5 calls? unless the user specifically asks or a analysis
needs web search", and "review all skills - we need to simplify most skills so
that model can actually deliver useful results and improve user experience,
the models are themself good enough that overly brittle skills can actually be
a hindrance". [Agent](agents.md) owns the shipped behavior.

## Onboarding creates no prompts

Onboarding confirms business context and competitors, then creates the project
with an empty prompt set in the completion request. A project with no prompts
is a valid state; Overview and the Prompts page ask the user to choose the
questions to track. The previous onboarding portfolio request produced prompts
the owner judged low quality, added a completion worker and a polling state, and
committed users to prompts they had not chosen.

Source: owner decision of 26 September 2026 in the
prompt generation v2 plan, PR 1.
[Onboarding](onboarding.md) and [prompts and Visibility](visibility-prompt.md)
own the shipped behavior.

## Generated prompts are reviewed before they are tracked

Generate stages candidates in a separate table; only a user's accept creates an
active prompt, and a rejected candidate leaves review (see the quality-gate
entry below for the text-free outcome it may leave). This reverses "generated
rows are active immediately": the owner judged generated quality too uneven to
track unseen. Candidates are not a `proposed` status on `Prompt`, because every
audit, capacity and visibility query would then have to exclude proposals and
one miss would corrupt measurement.

Source: owner decision of 26 September 2026 in the
prompt generation v2 plan, PR 3a.
[Prompts and Visibility](visibility-prompt.md) owns the shipped behavior.

## The quality judgment gates generated prompts

Generation records bounded JEV (TypeSafe) judgments on the candidates it
selects, reversing "no fuzzy-similarity quality judges". The judgment is a hard
gate by default: a strong fail never reaches review, an uncertain candidate is
shown flagged and the rest pass. The owner first shipped it record-only (PR 3b),
then chose provisional, versioned thresholds (`jev-gate-1`) because judgments
can only be calibrated once the feature runs live. `JEV_MODE=shadow` restores
record-only behavior, in which a judgment ranks and flags the review list but
never drops a candidate. Calibration needs outcomes, so a rejected candidate that
carries a judgment, whether rejected by a user or by the gate, is kept as an
outcome record without its question text for a configured retention. This
narrows "rejected candidates are deleted". Code still owns every check code
can make, and a judgment never retires a tracked prompt.

Source: owner decisions of 26 September 2026 (PR 3b) and 27 September 2026
(PR 3c) for the prompt generation v2 plan.
[Prompts and Visibility](visibility-prompt.md) owns the shipped behavior.

## TypeSafe is a published subprocessor; production runs JEV

The subprocessor, Privacy Policy and AI Policy revision naming TypeSafe
(United States) for prompt-suggestion and internal-link judgments was published
on 28 September 2026, and `PRIVACY_NOTICE_REVISION` moved to that date. The
owner enabled `JEV_API_KEY` in production at once rather than after the DPA's
30-day notice, because CiteLadder is pre-launch and has no DPA customers to
notify. Later subprocessor changes follow the DPA notice period.

Source: owner decision of 28 September 2026.
[Prompts and Visibility](visibility-prompt.md) and
[Site Health](site-health.md#internal-links) own the shipped behavior.

## JEV judgments are unmetered and unthrottled

JEV is built for parallel calls and costs almost nothing per judgment, so
CiteLadder does not cap its concurrency or meter judgments against AI credits.
Prompt generation sends every candidate's request at once, and an internal-link
analysis sends one request per source page at once. A bounded call count per
generation and each job's deadline remain.

Source: owner decision of 28 September 2026.
[Prompts and Visibility](visibility-prompt.md) and
[Site Health](site-health.md#internal-links) own the shipped behavior.

## Scoped API keys are explicit user decisions

The public REST API at `https://api.citeladder.com/v1` is a paid-plan
capability (`api_access`, ten live keys per workspace; not the public trial).
Only an Owner or Admin creates a key. A key belongs to one workspace, may be
restricted to chosen projects, and its scopes intersect its creator's current
role on every request; removing the creator revokes the key. A write through a
key holding the matching scope is therefore an explicit user decision under
[invariant 10](invariants.md#10-automation-stays-bounded), and it runs through
the same command layer as the browser. Creating or spending POSTs require an
`Idempotency-Key`; an audit launch carries the caller's `max_attempts` ceiling.

Of the AI visibility Phase 1 reads, only answers are public: one prompt's
answers across runs and the answers of a run selection, under the `read` scope.
The other Phase 1 reads (topics, matrix, competitor focus, fact-checking and the
rest) stay in the app. Of the app-only writes, only the bulk prompt changes are
public: status, topic and delete over a selection, under `prompts:write`. Brand
facts get no public scope, and verdict overrides stay in the app. v1 keeps its conventions: no RFC 9457 problem details and
no switch to offset paging. Each endpoint documents its own paging honestly,
and responses carry the draft IETF RateLimit headers. The API and MCP
references are kept current with what ships: tool and operation descriptions,
field and parameter descriptions, links into the app, the docs site and the
changelog.

Source: owner decisions D4.1–D4.3 of 10 October 2026 (competitive tracker F4);
owner, 18 November 2026 (AI visibility gaps plan): public API reads "Answers"
only, public API writes "Prompts only", v1 conventions "Keep v1 as is", and
"referesh tool descriptions and fix links and subsequently update docs subdomain
and changelog".
[Public API](public-api.md) owns the shipped behavior.

## MCP writes are confirmed user decisions

An MCP connection can change product data only when the person ticked
**Allow changes** (unticked by default) at consent, adding `citeladder:write`,
and only as far as their live role in the project's workspace allows. Larger
changes are prepared, validated by a dry run of their command, and run only
through `confirm_change` after the user agreed to the preview; such a
confirmation satisfies [invariant 10](invariants.md#10-automation-stays-bounded).
Prompts added this way are active immediately, with no candidate staging,
unlike generated prompts. Existing grants are not re-consented (greenfield).
The in-app Agent stays read-only.

A competitor suggestion is accepted or rejected directly, like adding a
competitor. Activating, archiving and filing a selection of prompts under a
topic is one prepared change. Prompts cannot be deleted over MCP.

Source: owner decisions D4.2 and D4.4 of 10 October 2026 (competitive tracker F4);
owner, 18 November 2026 (AI visibility gaps plan): confirmed writes for
accepting and rejecting competitor suggestions and for bulk activate, archive
and assign-topic as one prepared change, "no prompt delete over MCP".
[MCP](mcp.md#changes) owns the shipped behavior.

## MCP reads grow by views first

MCP and the Agent share one read catalogue, and every tool sits in the Agent's
cached prefix, so new visibility reads are views and parameters on existing
tools first: a topic filter on the overview, trends, results and sources reads,
`view: topics|matrix` on the overview and `view: facts` on fact checks. At most
three new reads were added: prompt metrics with history and past answers, query
fanouts, and competitors with list, focus and suggestion views. Tool
descriptions are refreshed with the metrics the reads return, and links, the
docs site and the changelog follow. Confirmed MCP writes for competitor
suggestions and bulk prompt changes are a separate decision; there is no prompt
delete over MCP, and the Agent stays read-only.

Source: owner, 18 November 2026 (AI visibility gaps plan, API/MCP audit Q3 and
Q4: "plus also referesh tool descriptions and fix links and subsequently update
docs subdomain and changelog, also update website content wherever
applicable"). [MCP](mcp.md#the-catalogue) owns the shipped behavior.

## Site Health crawler parity checks and Apple's crawlers

Site Health gains the deterministic crawler checks a comparison with two
open-source SEO crawlers (LibreCrawl and FreeCrawl) found missing: canonical
targets that redirect, are noindex or chain to another canonical; redirect
chains and loops; internal links to redirects; exact and near-duplicate main
content; sitemap URLs that redirect and sitemap `lastmod` dates that contradict
the page; and meta-refresh or script redirects. All run on evidence the crawl
already fetches, so they add no fetch or infrastructure cost. Headless
rendering and external-link checks stay out. Title and meta description length,
thin content and long paragraphs are in as advisories: config thresholds,
never scored, never defects.

Applebot joins both crawler-access checks (Apple's search and Apple
Intelligence crawler), and Applebot-Extended joins the AI-crawler check as a
training control.

Recrawling an existing crawl from the Changes view and scheduled Site Health
crawls are the top Site Health backlog priorities.

Source: owner, 17 October 2026, approving the crawler comparison report
("proceed with implementation of 5 findings plus applebot"; recrawl and
scheduled crawls "should go in backlog as top priority"); owner, 18 November
2026, on the Searchable comparison: "no healdess rendering but what about
readbaility/length heuristics for crawled pages", then "Title/meta length, Thin
content, Long paragraphs, advisory is fine".
[Site Health](site-health.md) owns the behavior.

## The public site presents CiteLadder as open source

The public website says CiteLadder's source is public under AGPL-3.0 at
`https://github.com/abhij1306/CiteLadder` (exact casing). Open source is a
supporting pillar, not the lead: the hosted product keeps the name
"CiteLadder" (never "CiteLadder Cloud"), the homepage carries no added
open-source line, and the GitHub mark sits in the header and footer instead.
`/open-source` compares self-hosted with hosted; the compare pages carry an
open-source row; `/enterprise` cites public, auditable scoring code but does
not pitch self-hosting, because the self-hosted build is single-workspace
with no login. This replaces the earlier rule that commercial pages make no
open-source or self-hosting claim.

Source: owner, 20 October 2026, approving the SEO and open-source plan with
the caveats "dont add a line in landing page instead your github logo with
link on the header" and "no citeladder cloud".

## Site Health says "issues", not "defects"; page depth needs complete coverage

User-visible Site Health text calls findings "issues" and never "defects":
the word is too strong for findings such as heading hierarchy. The internal
`finding_class` value stays `defect`, occurrences keep being counted as they
are, and the two heading-hierarchy rules are not merged. "Pages buried too
deeply" (`architecture.excessive_depth`) reports unknown unless crawl coverage
is complete, like its sibling architecture rules, because depth is a shortest
path over the observed link graph.

Source: owner decisions of 1 November 2026, reviewing the thenetreturn.com
crawl ("drop the defect word and keep occurences the same as now"; "for pages
buried too deeply we can go with option a").

## Generated prompts are short buyer questions under user control

Four decisions for the Prompt Builder (shipped November 2026;
[Prompts and Visibility](visibility-prompt.md) owns it):

- **A. Word cap.** Admission drops a generated or proposed prompt over 16 words,
  and the run result reports those drops under their own reason. The owner
  cited query-length data: traditional search averages about 4 words and
  conversational AI queries about 7, so drafting examples centre on 6–12 words.
- **B. Topics are buyer-facing categories**, not product-line names. A topic
  proposed from the business's offerings is the category a buyer
  would ask about ("golf nets"), never a product line, model name, size or
  the brand.
- **C. The Agent keeps `prompt_discovery`** for MCP use, rebuilt to follow the
  Prompt Builder's steps through the same endpoints (plan PR 3).
- **D. Users control generation end to end** in the Prompt Builder: topics,
  search queries and their source, distribution (branded or unbranded share,
  intent mix, cohort) and context (personas, services). This supersedes the
  earlier rule that users are asked only for a prompt and its topic and never
  for theme, intent or cohort.

Source: owner answers of 1 November 2026 in the CiteLadder session reviewing
the thenetreturn.com prompts.
[Prompts and Visibility](visibility-prompt.md) owns the shipped behavior.

## Search Console imports final data only

The Search Console import requests final data only (the Search Analytics API
default; no `dataState: "all"`). Google finalizes a day roughly two to three
days late, so the newest days of a range that ends with GA4's latest date have
no Search Console rows yet. Those trailing days are "not yet reported", a
state distinct from zero, unavailable and quality-flagged partitions, and they
never null or flag the rest of the window. Preliminary ("fresh") data is not
imported or shown.

Source: owner, 2 November 2026, choosing "Final data only" over importing
preliminary Search Console data.

## Site Health flags only material scored-cohort changes

Consecutive snapshots carry the composition-change reason only when a page kind
joined or left the scored cohort, or a kind's share of it moved by at least the
configured threshold (`overview_cohort_share_shift_points`, 10 percentage
points). Plain count drift below that is an ordinary comparable snapshot. The
note explains score movement, so it appears once, in the Change summary, and
omits an empty added or removed kind list rather than printing "None".

Source: owner report of 2 November 2026 on a new crawl whose Overview showed the
note twice for one page of drift (Category 52 to 53 of about 200, all deltas 0),
which the owner judged meaningless for a new crawl or a recrawl. The share rule
and its 10-point default are the implementer's, not an owner choice; the owner
may retune the threshold. [Site Health](site-health.md) owns the shipped behavior.

## Terms are accepted on the sign-in and sign-up forms, never on a later screen

The Terms of Service decision is made on the sign-in and sign-up pages
themselves; there is no separate acceptance screen after login. Since
3 November 2026 it is a statement, not a checkbox: "By continuing (creating an
account), you agree to the Terms of Service and acknowledge the Privacy
Policy" under the form, which every way in is described by. The server records
the decision against the published revision when the person authenticates. A
session that predates a new revision is ended and the person signs in again,
agreeing as they do, rather than being shown an in-app consent screen (the
implementer's choice for that edge case, as the least intrusive behaviour that
is not a separate screen; there are no customers yet).

Source: owner, 2 November 2026: "This was fixed first and then again ruined:
the TOS and privacy policy acceptance should not be a separate screen post
login, but there should be a check mark on the signup/login page itself — no
need to add a separate screen." The earlier fix was #198 (Terms on the sign-in
form); #348 and #367 moved it to sign-up only, which brought back the review
screen for sign-ins. Owner, 3 November 2026, restyling the sign-up page after
Goodie's: "we can also replace the tick box with just the statement like
higoodie". [Workspace access](workspace-access.md) owns the shipped behavior.

## Public sign-up refuses reserved mail domains

Public sign-up, by email and password or by Google, refuses an address in a
domain reserved by RFC 2606 and RFC 6761 (`.test`, `.example`, `.invalid`,
`.localhost`, `example.com`, `example.net`, `example.org`): no mail can ever
reach one, so no real person signs up with it. Tests still create such users
directly. The same configured list stops auth and invitation mail to those
addresses and keeps them out of the owner's signup notices.

Source: owner, 2 November 2026, answering "Reject reserved domains like `.test`
at sign-up? Tests can still create these users directly." with "yes", after
signup notices for `@example.test` test fixtures reached the owner's inbox.
[Workspace access](workspace-access.md) owns the shipped behavior.

## Product charts are plain SVG, without a chart library

Every product chart draws with the design system's own chart kit in
`components/ui/` (`TrendChart`, `StackedBar`,
`Sparkline` and the shared `chart.tsx` pieces): plain SVG and the chart tokens.
The app carries no chart library, Recharts included. That covers the source
usage chart, the Performance chart and Search Intelligence history.
[Frontend architecture](frontend-architecture.md) owns the chunk graph.

Source: owner, 5 November 2026, asked in the design-system orchestration session
"On 2 Nov you answered "no replace" to replacing Recharts with the app's own
chart component (recorded in docs/decisions.md). The design system draws every
chart as plain SVG, and PR 2c has already moved all charts to it locally,
uncommitted. Remove Recharts now, or keep it?", answering "Remove Recharts".
This supersedes the 2 November 2026 answer "no replace", which had kept
Recharts.

## Turnstile guards sign-up and email-link requests, and sign-in after repeated failures

Cloudflare Turnstile (free, already on the contact form) protects account
creation and every public "email me a link" request: email sign-up, a Google
sign-up start, resend verification and forgot password. The API verifies the
token, before any account row or mail exists, so the SPA and any non-browser
caller meet one rule in one owner; its secret is an API secret, and outside
development a missing one fails closed.

Source: owner, 2 November 2026, answering "Add Turnstile to sign-up? It's free
and you already use it on the contact form. I'd add it only to sign-up and to
email-link requests, not to sign-in," with "yes".

Sign-in was never challenged under that answer. The owner's decision AR-3 of
12 November 2026 ([audit remediation](plans/audit-remediation.md#owner-decisions-2026-11-12))
supersedes that part: sign-in is challenged after 5 failures for the address or
the network, and abuse budgets key on the IPv6 /64 (/56 for registration) with
a global sign-in failure ceiling.
[Workspace access](workspace-access.md) owns the shipped behavior.

## Public sign-up refuses disposable email domains

Public sign-up, by email and password or by Google, also refuses an address on
a maintained disposable-mailbox list kept as configuration in the repository
(`config/disposable-email-domains.json`, from the CC0-1.0
disposable-email-domains project, refreshed by a person with
`pnpm --filter @citeladder/api disposable-domains:refresh`, never at runtime).
It shares one sign-up domain gate with the reserved-domain refusal. Existing
accounts, sign-in and mailbox requests are unaffected.

Source: owner, 2 November 2026, answering "Block disposable email domains at
sign-up? It would use a maintained list kept in config," with "yes".
[Workspace access](workspace-access.md) owns the shipped behavior.

## Site Health responses do not carry provenance id lists

Browser-facing Site Health reads (dashboard and crawl score summary, Overview,
AEO Readiness, change summary) no longer return the provenance id lists:
classification source analysis, artifact and task ids, Web Fundamentals source
analysis, artifact and evaluation ids (also per top finding), and the readiness
and change snapshots' source analysis ids. The rows keep every list unchanged,
so derived results still retain their exact sources under
[invariant 5](invariants.md#5-derived-artifacts-record-provenance); no screen
rendered them, and they made a large crawl's Overview a few hundred kilobytes.
Single source references a reader acts on (an evidence page's analysis, a
change observation's sources, an eligibility checkpoint's sources) stay. The
public API's dashboard schema follows the shared contract.

Source: owner, 2 November 2026, asked "Remove the provenance ID lists from the
Site Health responses the browser gets? They stay in the database", answered
"yes". [Site Health](site-health.md) owns the shipped behavior.

## Site Health always opens on Pages

The Website screen opens on its Pages tab every time, its loading frame
included, and never switches tab by itself: not when a crawl starts, is polled
or finishes. A tab the reader picks, or a `?tab=` link, stays as chosen. The
default no longer follows the crawl phase, which had sent a finished crawl to
Overview and moved the selection whenever a crawl started.

Source: owner, 2 November 2026: "site health should always open on pages not
overview — currently it switches to overview on starting crawl which is
wrong." [Site Health](site-health.md) owns the shipped behavior.

## Access is looked up once per request

A request reads its session, membership and workspace entitlement state once
and reuses them for every check and handler in that request. Access is never
cached across requests, so a removed member, a revoked grant or an ended trial
loses access on the very next request rather than after a cache lifetime.
Long-running workers keep their separate, bounded access reuse.

Source: owner, 2 November 2026, answering "ok" to the recommendation to look
access up once per request and not cache access checks across requests (which
would delay a revoked user losing access by up to the cache lifetime).
[Workspace access](workspace-access.md) owns the shipped behavior.

## Browser errors are reported to the API's logs

The app reports its own failures (a code chunk that cannot load, a render
error, a route error, an error nothing caught) to a small same-origin endpoint,
which writes one structured log line that Cloud Logging collects. There is no
new table and no third-party error service. A report carries the error, a
truncated stack, the screen's path without its query string, the build and an
optional component label. The user comes only from the session, and the
workspace only when the session is a member of the one the request names.
Reports are rate-limited per client, sent once per error per page load and
capped per tab. A chart's or evidence panel's quiet "Couldn't load" fallback now
covers only a chunk that cannot load; any other error goes to the screen's
error boundary, so a chart handed the wrong data shape no longer hides as
"Couldn't load chart."

Source: owner, 2 November 2026, approving the proposed client error reporting
and the AI Traffic export change with "ok proceed and include the two items".
The [API error contract](api-error-contract.md#6-browser-error-reports) owns
the shipped behavior.

## The app shell may live in the back-forward cache; signing out clears it

The product's HTML shell is served `no-cache` instead of `no-store`, so the
browser's back-forward cache can restore it. Signing out sends
`Clear-Site-Data` so cached account pages go with the session, and a restored
shell re-checks its session. Bearer links and every API response stay
`no-store`. The app manifest no longer asks to open as a standalone app, since
the app is not installable.

Source: owner, 13 November 2026, answering the frontend modernisation
questions: "no-cache app shell + Clear-Site-Data on logout" and "Drop
`display: standalone`". The sign-out directive is `"cache"` alone; clearing
`"storage"` as well would reset theme and cookie consent and is not decided.
[Frontend architecture](frontend-architecture.md) owns the shipped headers.

## One comparable-baseline rule

A run has one comparable baseline, chosen by the Visibility comparison rule
(the nearest earlier compatible run in the same market) and persisted per run,
cohort and engine selector when the audit is finalized. Overview's change
figures and Visibility's comparison both read it, so they never name different
baselines for the same run. Overview's private rule (same frozen key, analyzer,
benchmark mode, engines and core prompts) is deleted. Comparison statuses stay
distinct (`no_baseline`, `changed_context`, `partial_coverage`,
`matched_subset`, `baseline_pending`, ...). Both screens show a change
against a `comparable` baseline and a `matched_subset` change computed from
the answers both runs share, with a note such as "8 of 12 answers comparable";
every other status shows no change and says why. One function
(`comparisonBasis` in `@citeladder/contracts/comparison-reason`) gives both
screens that answer and its words.

Source: owner, 2 November 2026, approving the read-projection work that
included unifying the baseline rule: "ok proceed and include the two items";
and owner, 15 November 2026, on whether Overview should show the partial
change: "Show partial change".
[Visibility](visibility-prompt.md) owns the shipped behavior.

## Failed reads surface within seconds

A read that fails with a server error or timeout retries once after a short
pause, then shows its inline error with Retry, about 2 to 3 seconds after it
started instead of after a run of silent retries. A bare network failure gets
one more quick try. The policy lives in `QUERY_*` in
`frontend/lib/config/operational.ts`.

Source: owner, 15 November 2026, asked whether a server error should surface
sooner during the design review: "Surface sooner".

## Plain module names and redirects on the public website

The website names each module by its job, not as an "Intelligence":
Cited Sources (`/platform/cited-sources`), Product Visibility
(`/platform/product-visibility`), Search Demand
(`/platform/search-demand`, the app's own name for it), Keyword Research (`/platform/keyword-research`)
and Content Optimization (`/platform/content-optimization`, the app's
content-gap work, listed in Actions since AS1). The website has been live for
months, so a renamed or moved public URL keeps a permanent (301) redirect from
its old path, served by the marketing Worker before Astro
(`frontend/apps/marketing/src/edge.ts`). This replaces the no-redirect rule for
public website URLs only; inside the app and API there are still no aliases or
shims. Marketing copy says what each module does and what the reader gets, with
no "X instead of Y" contrast or filler.

Source: owner, 4 November 2026, agreeing with an external review that the site
had "too much unnecessary intelligence": "since this is a live website now for a
few months the no redirect rule does not apply so rename and redirect
accordingly".

Content Briefs became Content Optimization, with a 301 from
`/platform/content-briefs` and the older `/platform/content-intelligence`
pointing straight to `/platform/content-optimization` (no redirect chains).
The page describes only what ships
([content optimization](content-optimization.md), phase 1). Source: owner,
10 November 2026: "content-briefs will become content optimization (with
redirect) and update the website page with relevant material based on current
implementation (ignore phase 2 which is not implemented yet)".

## Content optimization

[Content optimization](content-optimization.md) owns what ships; its plans
are closed and deleted.

| ID | Decision |
|---|---|
| CO1 | ~~Content optimization is its own sidebar entry directly below Actions. Actions and Content optimization never show the same work.~~ Superseded by AS1: one Actions list; content gaps are ordinary Actions. |
| CO2 | Storage stays in the one Opportunity/Action store. Declaration, verification and Agent attachment are reused. |
| CO3 | MVP evidence is the **titles** of URLs already cited in answers from **competitor sites and editorial/publisher sites** (not UGC, social, directories or marketplaces), grouped to find content the user lacks. Reading those pages is a later phase. |
| CO4 | Titles are grouped by the citing prompt's topic, then a model clusters them into content angles; the clustering is persisted with its version and reused while its inputs are unchanged. Window: dashboard-ready audits of the last **30 days**. |
| CO5 | Both gap types: an existing owned page that is not cited (opens the editor) and a missing page (a new-page brief through the existing content-creation workflow). |
| CO6 | Both triggers: automatic detection after audits, and a manual **Analyze a page** that lets the user pick only from the crawl's content pages (no free URL entry). Optimizing any URL is a later paid add-on. |
| CO7 | Per-suggestion editing: page on the left, suggestions on the right, Accept / Dismiss / Apply all; suggestions that need a fact go to the Agent with the user's input. |
| CO8 | Clustering is free (internal cost of the audit); generating suggestions is an Agent turn that draws AI credits. Recorded as [B73](billing-decisions.md#content-optimization-2026-11-10). |
| CO9 | The rules for auditing content are designed in a separate document ([content rules engine](plans/content-rules-engine.md)), inspired by Grammarly. |
| CO10 | ~~Route by page kind, not by rule: every Action on a content page is fixed in the editor; all other pages stay in Actions.~~ Superseded by AS1: no Action is routed to a screen by page kind; `actions.surface` is removed. |
| CO11 | **Issues is unchanged.** Site Health issues, including those on content pages, stay in Issues exactly as today. The new rule-based content suggestions never appear in Issues; they exist only in the editor. |
| CO12 | **Fetch on Optimize.** Opening the editor queues a one-page fetch of the live page; its main content becomes the editor's base Markdown. The crawl's flat text is not used as the base. |
| CO13 | MVP rules: imported Site Health findings plus one model pass over the rule catalog. Deterministic linters (Harper, retext) come next. |
| CO14 | **No grading or scores**, not even a readability grade. Suggestions are options grounded in what tends to do well, never a verdict on the content. |
| CO15 | Content page kinds: `article`, `guide`, `how_to`, `listicle`, `comparison`, `alternative`, `case_study_review`. FAQ, docs and every other kind stay in Actions. |
| CO16 | Angles match **content pages only**. When no content page covers an angle it becomes a new-page brief, even if a non-content page (pricing, product) touches the topic. |
| CO17 | The model pass works in the project's language. The later deterministic linters start English-only. |
| CO18 | Agent drafts of *new* content follow these rules in a later phase. The MVP covers existing content pages and new-page briefs through today's content-creation workflow. |
| E1 | The editor lives inside the Agent window. When a chat works on a page, `/agent/chats/:id` becomes a workspace: the page on the left, and on the right Suggestions / Outline / SEO with the chat docked below. There is no separate editor route and no slide-out panel. Chats without a page keep today's single column. |
| E2 | The page is Markdown edited in CodeMirror 6 with live-preview styling: headings, bold and links render as text, and their Markdown marks show only on the cursor's line. Server offsets equal editor offsets, so suggestions anchor exactly with no conversion layer. A true rich-text editor (ProseMirror) is deferred. |
| E3 | The workspace opens for an Action whose target is an owned page of a content kind (CO15), or a page picked in Analyze a page. Other Actions keep today's chat. |
| E4 | Revert on an applied or dismissed suggestion returns it to To review. Reverting an applied one restores the original text while that span is unchanged; otherwise the revert is refused and explains why. |
| E5 | The SEO tab shows Site Health's page-local checks from the editor's fetch, labelled with the fetch time. Editing the page doesn't rerun them. |

Source: owner, in chat, 10 November 2026: CO1–CO18 in the content
optimization architecture session; E1 ("Option 1") and E2–E5 ("Accept all")
in the phase 2 editor planning session.

## One Actions feature; content gaps from content pages only

There is one Actions feature. The decisions below supersede content
optimization CO1 (a separate Content optimization sidebar entry) and CO10
(routing Actions to screens by page kind), [above](#content-optimization).
The Actions simplification plan built them (#699, #700, #701 and #703) and has been deleted.

| ID | Decision |
|---|---|
| AS1 | One Actions list. No per-surface screens; `actions.surface` and the Content screen are removed. Content-gap findings are ordinary Actions. |
| AS2 | The list is a tree: status (New, In progress, Done, Declined), then goal, then grouping, then Actions by impact; each grouping shows ten, then "Show N more" ten at a time (owner, 16 November 2026: "max rows will be 10 visible rest will go in show more"). |
| AS3 | "Work with the agent" opens a new Agent chat with the Action attached and a prefilled, editable message; the user never has to type to start. |
| AS4 | Every page in the URLs Gap filter is already actionable ("Draft a request to be listed") and is listed on the Actions page (one definition of "gap"). |
| AS5 | Content gaps use only competitors' and editors' content pages as evidence (articles, guides, comparisons, listicles, reviews, case studies), never their product, category, collection or home pages, and only answers to tracked prompts. |
| AS6 | The Actions list has one control row: statuses, **All filters** (one menu, a submenu per filter) and Group by, then Create action and Accept all at its end (owner, 16 November 2026, approving the v3 design: "yes that is exactly correct"). |
| AS7 | An Action opens as a page, never a drawer: one centered reading column with a dock at the bottom holding its status decisions (Accept and Decline; Mark implemented once In progress) and Work with Agent. Each URL an Action touches has its own page listing every Action on it. Accepting moves an Action to In progress, Mark implemented moves it to Done, and the Issues page does not change (owner, 16 November 2026: "i should not be taken to drawer from actions so drawer should become a page"; "accepting anything moves it from open to in progress and marking implemented moves it to done, nothing will change in issues page"; approving the v3 design: "yes that is exactly correct"). |
| AS8 | AI visibility tabs drop their second row of filter selects: every filter moves into one shared **All filters** menu at the far right of the tabs row (a submenu per filter, search for long lists, a count of filters changed from their defaults, URL state), which the Actions list reuses. Sources' Domains/URLs switch moves to the start of the table toolbar; on Trends, Brand and competitors and Over time split the row evenly, and a faint dashed connector joins runs across a comparability break. |

Source: owner, 10 November 2026, in the owner chat that set the Actions
simplification plan: keep one Actions feature, remove the Content screen and
fold content work back into Actions (AS1), with the list, chat, filter,
detail-page and AI visibility layout directions above (AS2–AS4, AS6–AS8), and
content gaps drawn only from content pages and tracked prompts (AS5).

## Actions group Issues

| ID | Decision |
|---|---|
| IA1 | Every Site Health defect and advisory rule is one Action per Issues group: one rule across its URLs in the latest crawl, filed under "Let AI read your site" by its Issues section (SEO, AEO, Content); advisories rank below defects of the same severity. Diagnostics stay in Issues only. A site-level rule's Action holds the URLs its evidence names, and reads "Whole site" only when it names none. No per-page Site Health finding becomes an Action, and leftover ones retire on the next refresh. The Issues page and its drawer are unchanged. |

Source: owner, in chat, 16 November 2026, approving the Actions v3 plan:
"the smallest issue is a URL or a prompt or a content page and the actions page
is basically grouping", "actions page has top level categories which drill down
to more groupings (one example site health - aeo, seo, content - group of URLs -
URL)", "i dont see other issues so they will probably come in actions like
advisories", and "nothing will change in issues page".

## Action statuses: New, In progress, Done, Declined

| ID | Decision |
|---|---|
| AS10 | An Action reads as one of four statuses. New (stored `open`) → In progress by Accept or by Work with Agent on a New Action; New → Declined (stored `dismissed`) by Decline; Declined → New by Restore and → In progress by Accept; In progress → Declined by Decline; New or In progress → Done by Mark implemented (the declaration). Done is final for the user: measurement continues underneath and shows as a badge (measuring, verified), never as a separate status, and a later contradiction shows in that badge. A chat output never changes status by itself. Accept and Decline also work in bulk, and Accept all accepts every New Action under the current filter, server-side and bounded. The Issues page is unchanged. |

Source: owner, in chat, 16 November 2026, approving the Actions v3 plan:
"accepting anything moves it from open to in progress and marking implemented
moves it to done, nothing will change in issues page … u have to make sure of
layout shift and data flow now while building", and of the plan's design:
"yes that is exactly correct".

## Backlog closure

The owner went through the backlog item by item and closed it into three tiers.
The work to build now (tier 1) shipped on 11 November 2026, and its owner
documents describe it; the [backlog](plans/backlog.md) holds the pre-launch and
low-priority tiers.

| ID | Decision |
|---|---|
| BL1 | UI and UX improvements are the first priority among the work to build. |
| BL3 | The crawler keeps one bounded, redacted HTML reference snippet per issue family, not one per page, so the Agent can write an exact patch. |
| BL4 | Developer handoff is built: "Prepare developer ticket", a recorded deployment step tied to the Action, and dated evidence. The journey-coverage eval and end-to-end journey are dropped. |
| BL5 | Site Health gets scheduled crawls, weekly or monthly per project and off by default. |
| BL6 | Before starting a crawl of the project's own site, the user may choose to ignore robots.txt. Domain verification is not required for this. |
| BL7 | Domain verification, authorized-crawl receipts and enterprise SSO/SCIM are deferred until an enterprise customer asks. D9.2 (which plan carries SSO) stays open until then. |
| BL8 | `security_events` rows are kept for 30 days. |
| BL9 | An explicit operator entitlement replaces the production `DEV_LOGIN_PASSWORD` gate. |
| BL10 | The remaining Integrations and AI Visibility items, the feature-review leftovers (Opportunities, AI Traffic, Commerce, Onboarding, Visibility, Earned sources), Traffic impact and the fact-checking follow-ups are removed from the backlog. |
| BL11 | Of Production hardening, only the cloud cleanup is built now. Audit remediation, the remaining hardening, the acceptance and calibration gates and the billing review items move to the pre-launch tier. |
| BL12 | Agent native runtime PR 2 (model and reasoning picker) and PR 3, the Agent and MCP deferred proposals, sliding sessions, AI Traffic extensions and ad observations in audit exports move to the low-priority tier for future reference. Search Intelligence limits, indexes and retention wait for billing and production row counts. |

Source: owner, in chat, 11 November 2026, in the backlog closure session:
answers to four rounds of questions on each backlog section, plus the
follow-up asking for one tiered backlog file and one implementation plan of
parallel scoped PRs.

## Commerce product tracking

The owner set the scope of Commerce's product tracking release, shipped on
11 November 2026; [Commerce](commerce-intelligence.md) owns the resulting
behavior.

| ID | Decision |
|---|---|
| CM1 | Product metrics read **all runs**: the catalog is matched against brand and Commerce answers alike, and importing or changing the catalog re-derives product observations from the stored answers of the last 30 days as a new versioned pass; raw answers are never rewritten. (Owner, in chat, 2026-11-11: "All runs + 30-day backfill".) |
| CM2 | Structured shopping capture starts with the **ChatGPT carousel**: verify the product-card fields with one live DataForSEO task, then rank products by carousel slot with the card's price and merchant. Text parsing stays for every other engine. (Owner, in chat, 2026-11-11: "ChatGPT carousel first".) |
| CM3 | New catalog sources: **Shopify storefront URL** (public `products.json`), **Merchant Center feed file**, **CSV template with a category-tree review and import results**, and **product edit and archive**. (Owner, in chat, 2026-11-11, all four selected.) |
| CM4 | Per-product answer details: **mentioned vs catalog price** and **merchants**. Ratings and attribute extraction are not in scope. (Owner, in chat, 2026-11-11; ratings were first selected, then removed the same day after the live probes returned no card ratings: "remove rating implementation from plan".) |
| CM5 | Layout: **Shopping overview + Products table + product detail page**; competitor and prompt setup move into the detail page. (Owner, in chat, 2026-11-11.) |
| CM6 | **My catalog / All products**: approved and AI-observed competitor products get rows and detail pages with the same metrics; one click adds a discovered product to tracking. (Owner, in chat, 2026-11-11.) |
| CM7 | Shopping prompts are a **category matrix**: per category, buyer contexts × intent stages, mostly non-branded with about 15–20% branded comparisons; per-product prompts only for hero products the user picks. (Owner, in chat, 2026-11-11.) |
| CM8 | Time-range comparisons (change vs the previous period, charts by day/week/month) come **later**, not in the first release. (Owner, in chat, 2026-11-11.) |
| CM9 | The final phase updates **marketing, blog, docs and changelog** for the shipped feature. This is the owner's request to change public copy for this feature. (Owner, in chat, 2026-11-11: "add updating marketing, blog, docs and changelog as final phase of plan".) |

Source: owner, in chat, 11 November 2026, in the session that planned the
release; recorded in its plan, which was deleted once the release shipped.

## Agent chat UX

The owner set the Agent chat round after reviewing production chats from 10 to
13 November and an HTML mockup; it shipped on 13 November 2026 and
[Agent](agents.md) owns the resulting behavior.

| ID | Decision |
|---|---|
| AC1 | [AI Elements](https://ui.shadcn.com/docs/ai-elements) are a pattern source, not a dependency: their structure is ported into `frontend/components/ui/` on the existing primitives and tokens, with no shadcn CLI, `components.json` or `ai` package. |
| AC2 | Tool calls read as plain activity or are hidden ("model call 1, reading or saved document doesn't make any sense"): people never see tool names, record IDs, UUIDs, `citeladder://` references or budget numbers. |
| AC3 | Nothing shifts while a turn streams or when a control is clicked ("fix the text jumping on every tool call"). |
| AC4 | A long paste becomes a removable "Pasted text" attachment (mockup D); a pasted Action link becomes a mention, and an Action named in a reply becomes a chip with its status (mockup B). |
| AC5 | The Agent may propose marking an Action implemented as a card under its reply; only the person's confirmation declares it (mockup C). |
| AC6 | Each sidebar chat shows where it started and when it last moved; the no-credits reply gives the contact email. Credits top-up comes later. |
| AC7 | New chat centres the composer with **What should I work on?** open beneath it, and a + menu holds skills and Actions. Workflows leave the UI, since skills cover them; Action handoffs, the page workflow and next steps still pin one. |

Source: owner, in chat, 13 November 2026: implement mockups B, C and D and the
sidebar subtitle, a Claude-like composer, and a new chat start screen after a
Claude.ai reference; recorded in its plan, which was deleted once the round shipped.
The rest of mockup A (a context card, titles from the subject) was left out.

## Code taste, testing and documentation rules live in CLAUDE.md

The global `typescript-best-practices` and
`principle-test-behavior-not-implementation` skills are deleted. Their rules,
with new documentation rules, are the Code taste, Testing and Documentation
sections of [CLAUDE.md](../CLAUDE.md), so every agent reads them on every task
and no skill restates them.

Source: owner, 13 November 2026, approving the drafted CLAUDE.md wording
directly.

## Source file size is a token limit, not a line limit

Authored source files are limited to 6,000 tokens (bytes / 4) by a pre-commit
hook that CI reruns on the PR's changed files. Tests, codegen, migrations, docs
and data, marketing content, config owners, the design tokens and the MCP tool
registries are ignored. Files already over the limit on 13 November 2026 are
grandfathered in a baseline that may only shrink. The 500-line production
module rule and its per-module allowances are deleted everywhere, so the token
limit is the only size rule for production source; function cyclomatic
complexity 12 and the 800-line test-file ceiling stay.
[Development](DEVELOPMENT.md#source-file-size) owns the rule.

Source: owner, 13 November 2026, approving the token-size hook directly, and
adding the same day that the 500-line rule be removed completely.

## The website's desktop navigation loads only on wide screens

The website navbar's desktop menus stay the Radix island; it hydrates only
where it shows, from 1280px (`client:media`), not on every page and width.
Rebuilding it on native popover is declined while the browser matrix lacks
popover on iOS Safari before 18.3.

Source: owner, 13 November 2026, answering the modern-web audit: "Load only on
wide screens" (`client:media`), keep Radix, no popover rebuild.

## Auth fields and form errors stay as they look

The modern-web accessibility round changes nothing visible on the sign-in,
sign-up and password screens: the auth email field takes
`autocomplete="username"` (password fields already say `current-password` or
`new-password`), and the button label, Confirm password and the absence of a
show-password toggle and `enterkeyhint` stay. Form errors also stay as
they are (each field's own `role="alert"` message, no error summary); only a
required field's asterisk is hidden from assistive technology, which hears the
control's required state instead.

Source: owner, 13 November 2026, answering the modern-web review: "don't change
sign in or password toggle" (withdrawing the same day's "Sign in" button and
show-password toggle), and "None" for the form-error change.

## Browser support matrix: Chrome 123, Firefox 132, Safari 17.5

The supported minimum is Chrome and Edge 123, Firefox 132, Safari and iOS
Safari 17.5 and Samsung Internet 27 (its first Chromium ≥ 123). The
browserslist, the app's build target, `pnpm check:compat` and the update
notice (`public/browser-support.js`) follow it. Native popover needs iOS
Safari 18.3, so no UI may depend on it alone.
[Frontend architecture](frontend-architecture.md) owns the matrix.

Source: owner, 13 November 2026, answering the modern-web audit: "Raise the
minimum to Chrome 123, Firefox 132, Safari 17.5".

## One prompt library across every prompt set

The Prompts page is one library of every prompt in every prompt set of the
project, Commerce's buyer-prompt set included.
A run or an audit adds evidence to prompts already in the library, or adds new
prompts; it never hides earlier prompts or their results. Manual adds,
imports and Prompt Builder generation go to the main brand set (the project's
oldest non-Commerce set), never the newest set, and the launch dialog and
audit schedules default to that set. [Visibility and prompts](visibility-prompt.md)
owns the library's behavior; Commerce keeps filing its prompts in its own set.

Source: owner, 15 November 2026, answering "You described the page as a
library of all prompts", choosing "All sets in one library".

## An absent value is one dash, named by its kind

An absent value in a value position is the muted em dash whatever its kind,
with the kind named in its tooltip and accessible name; words stay only for
states a reader can act on and for sentences. [Design](design.md) owns the
rendering rule (owner, 2026-11-18).

## The Actions tree's geometry raises the eager CSS budget

The app's eager CSS gzip budget rises from 22,243 B to 22,339 B
(`frontend/scripts/bundle-budget.json`). The 96 B pay for the Actions v3 tree's
own rules, which Tailwind compiles into the eager stylesheet: the five-column
row grid at two breakpoints, the 76px goal cell, the strip hairline, the tree
indents and the selection dock's offset. They stay classes, because the design
system does not allow literal inline geometry.

Source: owner, 16 November 2026, on PR #933 after the cuts left it 80 B over,
choosing "Raise budget +96 B".
