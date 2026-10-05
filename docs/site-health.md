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
references. Python retains model defaults, terminal status vocabulary and the
supported entitlement/operator allowance projection. Its shared settings are
`automatic_page_limit`, `max_requested_page_limit`, `sample_url_limit`,
`sample_discovery_url_cap` and `max_attempts`; the generated bridge exports only
those settings and the shared model/read defaults.

During the TypeScript cutover, `site-health-worker-ts` claims every
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
provisional summary on cadence. A still-queued row skips it too. Terminal
lease recovery reconciles the affected crawls. Each worker pass, including a
drain over an empty queue, runs three backstops: stalled crawls (active, no
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
fails it at its attempt ceiling. The Python global sweeper excludes this queue.
The runner's Site Health lane processes due work and successors until idle or
the runner admission budget stops new claims. Already claimed work finishes
under its existing task/acquisition bounds before the execution exits.
Each pass admits a parallel batch bounded by Site Health worker/global
concurrency and the runner's database pool size; host pacing and acquisition
limits still apply.
Analyze tasks extract facts and evaluate rules in Node worker threads before
taking commit locks. The commit rechecks the page's site/sitemap context;
changed context is interpreted once under the crawl lock without spending another attempt.
Source inspection and internal-link judgments run in the TypeScript analytics
worker; their failed-task recovery also covers Python-sweeper terminalization.

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
allocates the next task generation. Python retains only the persisted reads
and content hand-off used by Agent/MCP until their cutover.

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
uses the existing handoff codec. MCP `read_ai_crawlability` and the business
context `crawlability` section read the same projection without acquisition.
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

`homepage`, `article`, `product`, `category`, `pricing`, `docs`, `faq`,
`about_contact`, `service`, `local`, `guide`, `comparison`,
`case_study_review`, `trust_policy`, `other`.

The classifier reads page-owned structure before route/title suggestions.
Structured data can suggest a type but cannot certify the type whose markup is
being checked. The root-path homepage exception is exact. Recommendation cards
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
classification cannot activate a mandatory purpose penalty. Repeated cards
and pagination alone do not promote editorial or comparison indexes to a
category; decisive collection affordances remain structural evidence.

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

Findings are independent of score membership. An established applicable defect
or improvement can create a `SiteIssue` even when unscored or unsupported by a
generator. Diagnostics describe limitations and do not assert defects. Grouping
occurrences never multiplies score influence or claims a shared template fix
without template evidence.

The config-owned Web checklist uses equal-weight checks for title and meta
description presence, canonical presence/integrity, indexability, soft errors,
HTTPS, HSTS, compression, TTFB, mixed content, image alternatives, form names,
document language, heading order and viewport.

Canonical integrity merges declaration conflict and target resolution. All
bounded declarations are preserved. No declaration is N/A. Multiple or invalid
declarations fail. An unavailable target is unresolved. A healthy redirect can
be consolidation guidance and does not automatically fail.

The AEO catalog also includes Open Graph, structured-data presence and initial
HTML rendering. Score membership is separate from finding class. These checks
do not establish Google limits, Core Web Vitals, general security, actual
indexing or citation eligibility. Lengths, H1 counts and `llms.txt` remain
unscored facts, diagnostics or improvements.

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
scoped admission, retrieval, saved reads and publication; the existing Python
JEV connector (`JEV_API_KEY`) executes judgments through the existing
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
and policy; TypeScript is its writer. Python appends dispatch and outcome events
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

Checks are binary and equal weight inside their role/pillar.

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
