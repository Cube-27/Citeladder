# Site Health runtime

> **Status:** current authority for crawl acquisition, page analysis, public
> checks, findings, terminal results and Site Health consumers.

Site Health owns URL discovery, secure acquisition, immutable fetch evidence,
bounded normalized facts, page-kind classification, deterministic checks,
scores, grouped issues, snapshots and exports. The Agent owns deliverables and review.
Opportunities owns implementation declarations and verification events.

## Pipeline and ownership

```text
explicit Run new crawl
  -> PostgreSQL discovery/setup/analyze tasks
  -> SSRF-safe, DNS-pinned acquisition
  -> immutable attempts and artifacts
  -> bounded facts with availability, truncation, region and locators
  -> page kind plus independent traits
  -> applicable evaluations and evidence-backed findings
  -> locked crawl finalization and final page-analysis revisions
  -> persisted snapshot and equal-page cohort summaries
  -> read-only API, UI, exports, Agent and Opportunities consumers
  -> explicit implementation declaration
  -> fresh comparable crawl evidence
```

Read endpoints only render persisted projections. They never acquire, classify,
score, call a model/provider or repair state.

Native policy lives in `frontend/services/api/src/config/site-health.ts` and
its `config/site-health/` catalogs: acquisition, classification, checks,
readiness, architecture, link metrics, change intelligence and worker settings.
Startup validates environment bounds, cross-field relationships and catalog
references. Python retains fixed schema defaults and persisted status vocabulary.
Native entitlement owners resolve allowances; native writers freeze configured
limits on durable task and crawl rows.

After explicit crawl or Internal Links admission, the browser starts a separate
workspace-authorized POST to that run's `/run` endpoint while continuing to poll
persisted progress. The API awaits the existing scoped worker, avoiding Cloud Run
Job startup latency. Crawl execution admits work for 30 seconds, at concurrency
two or the smaller worker/pool limit, with a 180-second acquisition deadline.
Internal Links uses a 180-second judgment deadline and publishes its committed
results in the same request; timed-out judgments remain uncertain. These bounds
belong to the native feature configuration. Concurrent requests and background
jobs share the same PostgreSQL leases, retry backoff and attempt ceilings.
Interactive crawls also honor the runner's shared PostgreSQL drain lock; an
active drain retains the work so API and background crawlers do not pace hosts
independently at the same time.
The normal job wake-up and periodic recovery remain available when a browser
leaves or a request is interrupted. Committed successors also wake the runner
after interactive execution. Read endpoints never start this work.

Advanced crawl controls are available to the configured development operator's
owned workspace even when the general rollout switch is off. Entitlement reads
and crawl admission use the same development access check; URL admission and
execution bounds still apply.

The Site Health lane of the bounded runner claims every
`site_crawl_tasks` kind: `discover`, `site_setup`, `analyze`, `change_intel`,
`link_metrics` and `architecture`. The TypeScript owner locks crawl then task,
publishes immutable derived evidence and admits successors with acknowledgement
in one transaction; for `change_intel` that includes the analytics handoff. The
network-bound kinds acquire outside any transaction, then re-check lease and
crawl (and, for `analyze`, membership and entitlement) before committing their
evidence and the task outcome together. `discover` commits its artifact, the
URL's observation, frontier admission and the page's disposition; `site_setup`
publishes robots root access, its snapshot link and llms.txt evidence first,
then commits the sitemap admission and bounded robots-policy sample under the
same lease. Python claims no tasks and runs no Site
Health worker or crawl-control routes.

The TypeScript worker also owns the crawl lifecycle, the only path to a
terminal crawl. After a discover, site-setup or analyze task settles, it
reconciles the crawl under the crawl row lock: counters, the discovery and
analysis sub-states and, once that work drains, terminalization. A successful
analysis while sibling work remains skips the lock and only refreshes the
provisional summary on cadence. A still-queued row skips it too. Other
settlements (discover, site setup, failed analysis) update counters and
sub-states without rebuilding the provisional score, which only a new analysis
can change. Terminal
lease recovery reconciles the affected crawls. A worker runs three backstops
every `backstop_interval_seconds` (a crawl-scoped interactive worker on every
poll), including during a drain over an empty queue: stalled crawls (active, no
outstanding work, no write for `stalled_crawl_reconcile_seconds`), overdue
crawls (outstanding tasks fail with `crawl_overdue` and the same transaction
reconciles) and cancelled crawls. Cancellation commits only the stop, task
cancellation and fetch settlement, so Stop stays short under a busy crawl. The
worker then publishes the cancelled run's final revisions, snapshot and
successors under the crawl lock. It selects only crawls with a completed
analysis or classification-expected task on an active monitored page, so a
cancel with no measurement evidence keeps a null summary.

TypeScript alone recovers expired `site_crawl_tasks` leases in bounded,
oldest-first `SKIP LOCKED` batches before claiming work. Recovery spends one
attempt, releases the lease, and either makes the task due immediately or
fails it at its attempt ceiling.
The runner's Site Health lane processes due work and successors until idle or
the runner admission budget stops new claims. An idle drain waits for a deferred
or backed-off task that becomes due within the budget instead of exiting. Already claimed work finishes
under its existing task/acquisition bounds before the execution exits.
Each pass keeps up to the Site Health worker/global concurrency (also bounded
by the runner's database pool size) in flight, refilling a slot as each task
settles rather than waiting for the slowest task of a batch. Refills stop when
the runner stops admitting or after `claim_window_seconds`, so other runner
lanes still get turns; host pacing and acquisition limits still apply.
Analyze tasks extract facts and evaluate rules in Node worker threads before
taking commit locks. The commit rechecks the page's site/sitemap context;
changed context is interpreted once under the crawl lock without spending another attempt.
Source inspection and internal-link judgments run in the TypeScript analytics
worker; their failed-task recovery also covers native sweeper terminalization.

The TypeScript service serves every Site Health read route (`site-health`
family): the entitlement view, crawl detail, inventory, pages, page detail,
issues, issue history, events, exports, the dashboard, Overview, AEO
Readiness, architecture and changes. A page's presentation status is derived in
the same query that filters and pages it. Reads resolve the workspace's Site
Health runtime from its grants at read time and never refresh the persisted
runtime row. The TypeScript `site-health-crawls` family owns crawl creation,
the crawl list, URL preview, cancellation, page rerun and the monitored set.
Admission refreshes the runtime from current grants, then locks it before
the profile; the project row is locked first so concurrent creates admit one
active crawl. Selection locks the active crawl before runtime/profile to
serialize with worker publication, and the workspace runtime lock serializes
quota checks across projects. Billing and admission share capacity/account
locks before runtime refresh. Creation reserves the effective page-fetch
budget on the entitlement ledger in the same transaction as its initial tasks.
URL preview, crawl listing and monitored-set reads render persisted evidence
and resolve grants without refreshing runtime. A rerun from a terminal crawl
creates one fresh analyze task under the saved profile scope; an active crawl
allocates the next task generation. Agent/MCP reuse the native persisted readers
and content hand-off.

## Acquisition and evidence guarantees

The Node transport sends `CiteLadderSiteHealthBot/1.0 (+https://citeladder.com/crawler)`
and does not impersonate a browser. The robots.txt response decides access:

| robots.txt result | Crawl behavior |
|---|---|
| 200 | Parse and honor applicable Allow/Disallow rules; malformed lines are ignored |
| Empty 200, 404, 410, other 4xx | Crawl public pages under normal pacing and admission |
| 3xx | Followed, up to the fetcher's redirect limit |
| 401 / 403 | Never crawled — terminal `access_blocked` ("Access blocked"); re-crawling cannot fix it until the site's access configuration changes |
| 429, 5xx, DNS/timeout/network failure | Temporary disallow; robots.txt is rechecked after `robots_unreachable_recheck_seconds` |

Other policies are cached for at most `robots_cache_ttl_seconds` (24 hours).
Host pacing, concurrency and admission apply whether or not robots.txt exists,
and a missing file is never permission to bypass authentication, paywalls,
CAPTCHAs or other access controls. The site-root advisory
`technical.robots_txt_present` reports a missing file without affecting scores
or blocking discovery. A declared delay above the supported maximum blocks the
host instead of shortening the requested delay. The shared fetcher invokes a durable suppression check before
every URL/redirect hop, including discovery, logos, commerce and source inspection.
An in-flight HTTP request cannot be recalled; subsequent hops recheck the stop.

Trusted platform administrators can dry-run `pnpm --filter @citeladder/api acquisition:control
--actor <admin-email> --domain <domain-or-*> --reason <reason>` from `frontend/`.
`--apply` persists the stop; `--resume --apply` marks that persisted rule
unblocked (the row and its actor/reason remain). Parent-domain
suppression includes subdomains; unblocking a domain rule does not override a
global `*` stop. This command sends no HTTP requests. Operators must not enter
credentials or customer content in its reason. Crawler-page publication still
requires the audit plan's remaining authorization/robots/pacing acceptance.

### Crawler permissions and robots history

The validated [crawler catalog](../frontend/services/api/src/config/crawlers.json)
owns bot identity, operator, purpose, documented HTTP UA patterns and IP-range
sources. Robots-only tokens have no HTTP UA pattern. Catalog check membership
preserves the existing nine-bot technical check and four-bot search/citation
check; additional catalog entries do not expand scoring.

`site_facts.robots` is the persisted projection. Each bot records its matched
group (`specific_group`, `wildcard_group`, or `no_rules`), independent root
permission and policy over a bounded URL sample. Specific groups override wildcard groups;
repeated groups merge and longest matching Allow/Disallow wins, with Allow
winning ties. No matching group is displayed as “Not specified”. Unreadable
robots.txt and incomplete samples remain unknown. The first setup commit
persists root access and the snapshot pointer; the second adds sample policy.
The sample includes the root, admitted sitemap URLs and known observation URLs,
bounded by `robots_policy_sample_size`. A truncated body cannot establish the
sample policy. These permissions describe robots directives, not indexing,
citations or actual bot visits.

Append-only `robots_snapshots` retain a bounded UTF-8 body, truncation flag,
status, origin and hash of the full fetched body. Inserts use
`ON CONFLICT DO NOTHING` within workspace/project/origin/hash scope. Every
crawl retains its observation time (the indexed `robots_observed_at` column,
written with the snapshot pointer) and snapshot ID; A→B→A therefore produces
three observations referencing two bodies. The crawl pointer has a composite
workspace/project foreign key. `robots_snapshot_max_bytes` owns retention size.

`GET /api/v1/projects/{project_id}/site-health/robots-history` authorizes the
workspace and project, then keyset-pages persisted observations by observation
time and crawl ID. It returns distinct referenced bodies alongside observations;
read configuration owns its default and maximum page sizes. The Site Health
panel groups bots by purpose, exposes history in a disclosure and computes a
browser-side text diff between two observations on the loaded page. Ask agent
pins the crawl shown on screen through the shared full-screen/panel handoff
codec. MCP `read_ai_crawlability` accepts an optional exact crawl reference.
Business context's `crawlability` section reads the latest projection without acquisition.
There is no legacy `ai_crawlers` or `crawler_roles` reader.

- Crawls begin only from an explicit user request.
- PostgreSQL is the queue. Tasks use leases, heartbeats, retries, idempotency and
  `FOR UPDATE SKIP LOCKED`; claims commit before network I/O.
- The URL admission policy and the pinned website transport own SSRF checks,
  DNS pinning, redirect revalidation (scope and hard exclusions apply to every
  page hop, never to robots.txt), TLS validation and response limits.
- Fetch attempts and artifacts are append-only. `normalized_facts` remains the
  bounded evidence store; Site Health does not persist a second raw-HTML copy.
- Artifacts identify crawl, task, capture time, final URL, region and extractor
  version. Derived rows retain exact artifact/evaluation IDs and relevant
  classifier, analyzer, rule and scoring versions.
- Declared canonicals remain observations. They never replace crawler identity.
  Commerce may consume a canonical only when its declaration is unambiguous.
- HTML facts distinguish `available` from parser failure, unsupported media,
  client-rendering uncertainty and truncation. An absence verdict requires the
  relevant region to have been observed successfully.
- Static accessible-name extraction follows AccName 1.1 for directly referenced
  hidden naming nodes. Unreferenced hidden content and template content do not
  enter names or visible heading outlines. CSS/runtime-only behavior remains
  unavailable rather than guessed.
- Cancellation and partial completion preserve all evidence already committed.

Admission orders candidates by URL value tier (whole path tokens, the
section a URL sits in first, so `/blog/product-review` is an article), then by a
shuffle seeded by the crawl ID. The analyzed sample within a tier is random but
reproducible, and never biased to header or footer links. A URL whose `www.`/apex
twin is already in the crawl's frontier, batch or (for a sample) observations is
not admitted again, so a site that answers on both hosts cannot spend two slots
on one page; stored URL identities are unchanged. Admissibility (scope, depth,
page-kind filter) is decided before a twin is chosen. Value tiers are finer than
page kinds: a page-kind filter maps `about` and `contact` to `about_contact` and
`trust` to `trust_policy`. Ordering is computed in memory once per candidate and
in one sort over the crawl's capped frontier per batch, so it never slows the crawl.

Discovery and normalized facts share the parsed HTML document before fact
extraction prunes non-content subtrees. Discovery keeps its own scope-filtered
link budget; an oversized document still uses the stricter fact-extraction byte
cap. Sitemap documents are fetched in bounded concurrent groups through the
same robots, suppression and host-pacing controls, then consumed in breadth-first
order so response timing cannot change which URLs fit the admission budget.
The bounded sitemap URL manifest stays in the crawl's site facts, so discovering
a URL through a page first cannot erase its sitemap membership. Saved crawls
without a manifest retain their original observation-based membership evidence.

Provisional score refreshes use a growing page interval as the worker observes
more analyses, with a time trigger for slower progress. This reduces repeated
whole-crawl aggregation during fast crawls; terminalization always rebuilds the
complete persisted measurement regardless of the provisional cadence.

## Page kind and traits

The stable taxonomy is:

`homepage`, `article`, `editorial_index`, `product`, `category`, `pricing`, `docs`, `faq`,
`about_contact`, `service`, `local`, `guide`, `how_to`, `listicle`, `comparison`,
`alternative`, `case_study_review`, `trust_policy`, `other`.

The classifier reads page-owned structure before route/title suggestions.
Structured data can suggest a type but cannot certify the type whose markup is
being checked. The root-path homepage exception is exact: the bare root, known
index files, listed two-letter language roots and any region-qualified locale
root (`/en-in`, `/es-419`, `/zh-hant`; not `/en-shop`). A lone generic title
word (`contact`, `shipping`, `policy`) counts only as a whole page name (the
slug, the H1, or the title before its site suffix), because it also names
products ("Contact lenses"); multi-word phrases may appear anywhere. A product or
category purpose failure needs a purchase control, a price or captured
collection items; otherwise it is unknown (`page_kind_unconfirmed`). When page content was not observed (a
client-rendered shell), a winning route or title suggestion is low confidence
and the evidence records `content_unobserved`. The persisted classifier version
is the configured base plus a digest of every classification input, so a
pattern edit cannot ship under an unchanged version. Recommendation cards
and shared chrome cannot replace primary purpose. If incompatible kinds have
strongest-tier evidence, the classifier returns `other` and preserves all
alternatives, conflicts and reasons.

Traits remain additive observations. They distinguish FAQ blocks, listings,
variants, reviews, local/contact/about intent, case-study/comparison content and
procedural pages without multiplying kinds. Route/title evidence may suggest
inventory classification but cannot by itself activate a mandatory purpose
penalty.

Any page kind can receive a score from independently applicable checks.
Rule applicability still requires the relevant structural evidence; route-only
classification cannot activate a mandatory purpose penalty. Product and
category purpose checks fail only on a page with its own commerce structure (a
purchase control or price, or a captured collection) or a structural
classification; otherwise a failure is unknown with `page_kind_unconfirmed`. Repeated cards
and pagination alone do not promote editorial or comparison indexes to a
category; decisive collection affordances remain structural evidence. Exact
blog, news, article, insights, resources and press archive routes, including
their bounded page/category/tag archive paths, use `editorial_index` even when
the collection is absent. They receive collection-purpose checks, not individual
article author/source checks or product-card checks. A bound collection on an
archive stays an editorial index even when it exposes sorting or filtering.

Creator, source and editorial-date expectations require an observed prose article/rich-text
body, visible byline or research context in addition to an eligible kind.
Unconfirmed authorship remains unknown and cannot create a missing-author or
missing-source finding. Repeated cards and single excerpts whose headings link
to another document do not establish authored content. Rich-text classes on a
card or grid do not turn its excerpts into page-owned prose.
Primary-content extraction retains the selected region and page/section wrappers
around nested card lists while excluding the cards themselves. Heading hierarchy
checks report observed upward level skips; an absent primary outline is unknown,
not proof of skipped levels. Missing or invalid heading levels also remain unknown.
Article self-links use the same trailing-slash and tracking-parameter comparison
as indexing intent, so they do not turn authored prose into excerpts.
Generic card actions such as “View product” do not establish an item name.
An empty-collection exemption requires a captured zero-item container;
contradictory item observations and unavailable counts remain unknown.

Variant controls require a configured variant identity on the control, its
associated label, or its nearest named radio group/fieldset legend; unrelated
currency, country, quantity and payment controls cannot supply product-purpose
evidence. Collection facts retain bounded labels, including observed ARIA labels
on icon links, and resolved targets from the exact selected collection, so item checks do not
depend on product URL naming conventions. Missing retained item details remain
unknown. Organization name matching tolerates configured legal suffixes while
requiring the remaining name to match visible identity. A FAQ route with no
observed question/answer relationships is unknown, while an observed question
without an answer remains missing.

Without applicable AEO checks, unresolved purpose uses
`page_purpose_unresolved` and other kinds use `no_applicable_checks`.
Applicable checks with no determinate verdict use `unresolved_checks`.

## Public checks and findings

One config-owned catalog declares each check's claim, execution phase, scope,
applicability, required evidence, Web membership, optional single AEO pillar,
finding class, remediation and supported action.

Applicability is resolved before field presence. `not_applicable` needs positive
evidence of irrelevance. `unknown` covers unavailable, ambiguous, truncated or
conflicting evidence. `error` records evaluator failure. Legacy `partial` may be
read from old evidence but is incomplete and receives no public score credit.

A check is **scored** only when failing it demonstrably reduces crawlability,
indexing, AI-answer eligibility or page performance and its detection is
reliable enough to show a customer; every other check is **advisory**: shown
with guidance, never scored. The catalog's `score_roles` is the single source of
membership (`web_fundamentals`, `aeo_readiness`); startup validation requires an
AEO-scored rule to have exactly one pillar and rejects a scored diagnostic, so no
check moves a score without a visible finding. An established applicable defect
or improvement can still create a `SiteIssue` when advisory. Diagnostics
describe limitations and do not assert defects. Grouping occurrences never
multiplies score influence or claims a shared template fix without template
evidence.

The Web checklist uses equal-weight checks for title presence, canonical
integrity, indexability, soft errors, HTTPS, compression, mixed content, image
alternatives, document language and viewport. Meta description and canonical
presence, HSTS, TTFB (a single sample from one region), form names and heading
order are advisory.

Canonical integrity merges declaration conflict and target resolution. All
bounded declarations are preserved. No declaration is N/A. Multiple or invalid
declarations fail. An unavailable target is unresolved. A healthy redirect can
be consolidation guidance and does not automatically fail.

AEO scoring covers crawlability (indexability, snippet access, and site-level
access for search and AI-search crawlers), machine readability (initial HTML rendering and
valid, content-matching structured data), answer and evidence facts on product
and collection pages, provenance and freshness on authored and product pages,
and heading structure. Open Graph, structured-data presence, answer-first and
question-heading style, source support, organization identity, trust paths and
`llms.txt` (an unadopted convention, unknown when never requested) are advisory.
These checks do not establish Google limits, Core Web Vitals, general security,
actual indexing or citation eligibility.

Broken links, hreflang and sitemap relationships retain checked, unchecked and
rate-limited counts and remain unscored. Incomplete target resolution cannot
pass. Architecture retains its separate post-terminal projection and scoped
findings; depth, parentlessness, missing hubs, duplicates and orphans do not
penalize a public score in this release.

Search-intelligence diagnostics remain outside the Site Health score. Link
metrics persist normalized internal-authority share over the observed crawl,
including formula version, rank and incomplete/sample caveats; off-crawl targets
receive no transition weight. Anchor diagnostics group generic, repeated-target
and low-lexical-alignment evidence without automatic Opportunity promotion.
The old lexical topical-coherence projection is retired. Website's Internal
links tab suggests missing contextual links over an explicitly analyzed saved
crawl. Suggestions do not contribute to a health score.

### Internal links

The analysis proposes inline editorial links at exact captured source phrases.
It does not infer missing navigation or a parent/child site graph. TypeScript owns
scoped admission, retrieval, saved reads and publication; the native
JEV client (`JEV_API_KEY`) executes judgments through the existing
analytics queue. No provider runs on a read.

Admission freezes each usable page's title, H1, meta description, a short
destination excerpt, bounded source passages, page kind, observed main-content targets and main-content
inbound count from the crawl's link metrics. Trust/policy and about/contact
pages are excluded. Eligibility (available, untruncated extraction and
included page kind) is applied before the page cap; above the cap, indexable
pages are preferred and the rest follow a stable URL-hash order, so the cap
spreads across site sections instead of taking the alphabetically first URLs.
Source passages are sentence spans from persisted page-owned text, with exact
UTF-16 offsets into the source artifact. Ordered observed headings are separated
from prose; flattened text does not establish DOM paragraph or section locators.
Missing or truncated primary text records unavailable passage evidence; captured
text with no qualifying prose records an empty passage collection. Bounded
sentence length, word count and punctuation filter obvious fragments; JEV rejects remaining
navigation, TOC, card and boilerplate text. Diagnostics disclose pages without
usable captured passages rather than claiming they need no links.

Retrieval compares source passages with TF-IDF destination labels (title, H1 and
URL path); once a crawl has enough pages, words on a large share of them carry no
weight. An exact source phrase must share destination vocabulary before a pair
can be considered. This conservative lexical admission can miss synonyms.
Each source page keeps a bounded shortlist of related destinations it does not already link
from main content. A navigation-only link does not suppress a suggestion; a
link in an unclassified region does, and a source whose anchor capture was
truncated gets no suggestions. Product pages whose titles differ only by a
colour or size word are variants: they never suggest each other, and one
destination represents each variant family.

Each source page is one JEV request. Its state carries the rubric and the
source once, and each shortlisted destination with exact source placement options
under `targets`. A Noul judges whether a supplied placement adds useful, accurate
context; a Choice selects one placement or explicitly chooses `none`. Both are
required even for a single placement. Publication validates the chosen anchor
and offsets against frozen source evidence, never falls back on a missing or
invalid answer, and retains only the highest-ranked suggestion when anchors
overlap. Distinct phrases can support distinct destinations. JEV never writes
URLs or anchor text. The Noul threshold remains a provisional review default,
not permission to publish or a calibrated precision claim.

Review highlights the exact anchor in its source passage, and CSV export includes
that passage, its source page, artifact and URL identifiers, and extractor version.
Saved historical results remain readable with placement absent; no read or
analysis rewrites historical results. The optional placement read contract can be
removed when pre-placement saved runs are retired
from the serving database. New publication requires captured placement evidence.

The job has its own wall-clock budget on a heartbeated lease, not the
Generate-request JEV deadline. One transaction commits every request's dispatch
events, then all requests are sent at once; outcomes are written in batches as
they arrive. A deadline or interrupted job closes dispatched pairs as uncertain
without resending them. Publication periodically saves progress so suggestions
can be reviewed while the rest are checked. Results
distinguish running, completed-empty, partial and unavailable, with reasons and
elapsed time.

`site_internal_link_runs` retains the frozen crawl, page identities, candidates
and policy; TypeScript is its writer. The native executor appends dispatch and outcome events
to `site_internal_link_events`, one of each per page pair. Judgments are not
metered against AI credits. A missing permission or provider configuration
yields unavailable judgments, never an observed zero.

Cancelling stops new dispatches, but a cancelled run's in-flight judgments
still settle. The project's analysis slot stays occupied until that run's
judgment task is terminal, so a replacement never overlaps it.

One project-scoped API family exposes the saved read (including recent analysis
history), explicit analyze and cancel operations; the tab filters, pages and
exports the bounded result client-side. Suggestions join the source page's
existing Action. The user explicitly selects implemented links; a later complete
compatible crawl verifies a main-content link to the exact destination URL
without a model call. The anchor is a suggestion, so rewording it still
verifies. No CMS publishing occurs.

Limits and provisional thresholds live in
`frontend/services/api/src/config/internal-links.ts`.
Live rollout still requires editor-reviewed calibration; fixture tests do not establish recommendation quality.

### Change intelligence

Change Intelligence compares a terminal crawl with the newest earlier crawl of the
same origin, scope and analyzer/extractor versions; without one it records the
immediate predecessor's exact non-comparable boundary. Each snapshot is immutable,
keyed by its exact source analyses and artifacts, and supersedes the project's
previous snapshot. It compares bounded primary-text shingles and heading outlines
under extractor/analyzer provenance. Content change and modification-date
consistency are separate outputs. Only complete, compatible text coverage may
promote metadata-inconsistency or cosmetic-refresh actions; legacy, truncated or
extractor-incompatible comparisons remain recorded but suppressed.

## AEO pillars and scoring

The AEO pillars and baseline weights are:

| Pillar | Weight |
|---|---:|
| Answerability | 20 |
| Structure | 15 |
| Evidence | 15 |
| Machine readability | 20 |
| Provenance | 10 |
| Freshness | 5 |
| Crawlability | 15 |

Checks are binary and equal weight inside their role/pillar. Site-scoped
checks are evaluated where the site facts were observed (the crawl root) and
apply to every page: a site that blocks OAI-SearchBot fails crawler access on
each page's crawlability pillar. Blocking only training crawlers (GPTBot,
ClaudeBot, Google-Extended) is a visible, unscored finding: it does not stop
answer-time retrieval. Final page revisions list those site evaluation IDs
in their source manifest; evaluation rows are never copied.

```text
Web = 100 * satisfied checks / determinate applicable checks
Pillar = 100 * satisfied checks / determinate applicable checks
AEO = sum(scored pillar score * pillar weight) / sum(scored pillar weights)
```

A page role publishes a score when at least one applicable check is
`satisfied` or `missing`. Unknown/error/partial checks earn no credit and
remain in completion counts. No determinate checks means a null score.
Duplicate rule IDs count once; disagreeing outcomes remain unknown.

Web and pillar completion count determinate checks over applicable checks.
Page AEO completion is the weighted mean of applicable pillar completion.
No applicable checks gives null coverage; applicable but entirely unresolved
checks give zero coverage. A scored but incomplete result remains partial.

Crawl Web and AEO results are separate equal means of finalized page scores in
the selected crawl cohort. A page with 1/1 and a page with 0/9 average to 50;
the implementation does not pool them to 10. Page-kind means use the same page
arithmetic and reconcile to the cohort when weighted by scored-page count.
Full precision is persisted and display rounding happens at the edge.

Crawl and page-kind coverage count pages with a score, while their state also
retains incomplete checks within scored pages. Pillar rollups likewise count
scored pages and retain unresolved-check counts. Check completion, scored-page
coverage, classification coverage and discovery limits remain separate.
The UI rounds scores to whole numbers without inferring confidence from coverage.
Crawl coverage evidence also records the analyzed and failed URL counts and the
crawl's automatic analysis allowance. Overview's Crawl Coverage metric is the
share of found pages analyzed (not of the pages the crawl selected) and states
the reason in plain words, for example "20 of 100 found pages analyzed · plan
limit 20 per crawl · 2 failed to load". An unknown crawl keeps "Coverage
unknown", a crawl that found nothing shows "No pages found" rather than a
percentage, and any reason the counts do not already explain is appended. A
crawl with no recorded allowance stores `automatic_limit: null`, never 0.
Snapshots saved before these counts keep the earlier reason caveat. Bulk "first N" monitored selection takes the most
valuable pages first (highest observed value tier), URL order within a tier.
Website Overview and Pages use compact metric strips without repeated audit
captions; Overview also omits supporting occurrence, page and checklist counts.
Measurement caveats remain available to assistive technology, and detailed
evidence retains measurement and coverage states. Page-kind scores likewise
omit repeated visible audit captions.
The positive access-gate label is **No observed blocker**, which does not claim
actual indexing or engine eligibility.

## Terminal publication and provenance

Analyze tasks append an initial `SitePageAnalysis` with facts, classification,
traits and source evaluation IDs. Its scores and `finalized_at` are null.

Once work drains, the crawl lock owns the only publication sequence
([lifecycle](../frontend/services/api/src/site-health/lifecycle.ts)):

1. fence active work and resolve aliases;
2. evaluate bounded finalize checks from persisted evidence;
3. persist evaluations/issues against their original initial analysis;
4. append one final analysis per retained URL with `supersedes_analysis_id`;
5. freeze the direct checklist, applicability/outcomes, memberships, weights,
   audit time, versions, source evaluation IDs and artifact IDs;
6. switch `is_current`, persist snapshot and matching crawl score summary, then
   terminalize;
7. continue link metrics, Architecture, Change/Demand/Opportunity and
   verification orchestration.

Evaluations and issues are never cloned or reparented. Consumers resolve the
final manifest's evaluation UUIDs. Workspace authorization is required for
every source UUID, including supersession. Initial analyses persist provisional
page scores; active summaries expose their running means as a partial audit
alongside progress. Terminal cancellation/partial completion
still writes a null or partial snapshot; retry cannot create a second current
row or snapshot.

Comparisons require compatible checklist descriptors, versions, purpose and
cohort provenance. Missing descriptors and changed applicability semantics are
non-comparable.

## Consumers and actions

Page detail, Issues, history, Changes, snapshots, exports, the Agent and MCP
read the same persisted final-result contract. Browser requests use same-origin
`/api/v1` through the frontend proxy.

Website and Issues distinguish initial read failure from a failed same-scope
refresh. Initial failures expose an exact read retry; refresh failures retain
the known crawl, catalog and tabs with an inline notice. Any failed entitlement
refresh withholds entitlement-dependent mutation controls until that read
succeeds; a 401/403 also removes protected evidence. A project change never
reuses the prior project's crawl identity.

The Agent's context selects one current finalized analysis per URL from the
explicit source crawl. A Site Health handoff carries exact analysis, evaluation
and artifact IDs, target field, captured value, expected condition and
limitations. Grounded page edits from a handoff are limited to missing title and
meta description. Accessible
names, indexing, canonicals, price/stock, legal text, broken links and uncertain
template changes remain manual or investigation actions. Generating, reviewing
or exporting a deliverable never resolves the live finding or changes a score.

Issue-group Ask agent carries the crawl and deterministic group identifier,
with an optional selected occurrence page. The server verifies every reference
within the workspace/project. Aggregate handoffs request analysis and a bounded
implementation plan; complete persisted counts remain separate from the labeled
occurrence sample. A sample does not establish template grouping or complete
coverage. A newer crawl cannot silently replace the selected source.

The rule catalog derives handoff eligibility and remediation routing from one
config policy. Handoff requests identify crawl and URL; an optional analysis ID
must match the current finalized revision or its direct predecessor. The
handoff returns only requested, supported gaps in that revision's source
manifest. Other findings offer a copyable fix prompt.

Historical snapshots retain frozen measurements. Read projections supply
missing pillar labels and current action routing from the catalog without
rescoring or rewriting evidence.

Opportunities keeps explicit implementation declarations and append-only
verification events. Verification needs evidence captured after implementation,
the same target/entity, compatible check semantics and applicable purpose.
Missing pages, reclassification, N/A, unavailable capture or changed rules do
not verify a repair. Ranking and citation movement remain separate observed
outcomes.

## Validation and operations

Parser/classifier/evaluator tests use deterministic fixtures. Finalization
concurrency and workspace isolation use PostgreSQL. Tests disable dotenv and
cannot receive provider credentials. Pre-launch schema changes are folded into
`migrations/versions/0001_initial.py` and exercised only on disposable data.

Semantic changes use a fresh disposable pre-launch database. Resetting an
existing database requires explicit authorization and confirmation that it is
disposable pre-launch development data. Never reset non-disposable, shared,
staging or production environments under this policy. Do not backfill historical
evidence, run an old scorer against new rows or keep a runtime formula switch.
Deployment and external-provider execution require separate explicit authorization.

The current limitation is real-site calibration: no current local crawl rows or
original historical response bodies are available. Fixture and retained audit
evidence support bounded defect reproduction, not customer-site precision or a
score-suppression estimate.
