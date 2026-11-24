# Site Health

Site Health crawls a project's website, keeps immutable fetch evidence and
bounded page facts, classifies pages, evaluates a config-owned check catalog,
and publishes scores, issues and snapshots. The TypeScript API
(`frontend/services/api/src/site-health`) owns it; the UI lives in
`frontend/components/site-health`.

## Purpose and boundaries

Site Health owns URL admission, acquisition, fetch attempts and artifacts, page
analyses, rule evaluations, issues, score summaries, snapshots, robots history,
link metrics, Architecture, Change Intelligence and Internal Links. Other
owners hold related work:

| Area | Owner |
|---|---|
| Deliverables | [Agent](agents.md) |
| Implementation and verification | [Opportunities](opportunities.md) |
| Crawler logs | [AI Traffic](ai-traffic.md) |
| Allowances | [Billing and entitlements](billing-entitlements.md) |
| Runner start and tick | [Workers runbook](operations/WORKERS_RUNBOOK.md) |

Site Health satisfies [invariants](invariants.md) 3–10 and 15; this document
does not restate them.

## Crawl lifecycle

**Admission.** `POST /api/v1/site-crawls` (`planner.ts` `createCrawl`) is the
one crawl action ([SH-B7](decisions.md#site-health-crawling-sh-b-owner-2026-11-12-co-owner-2026-11-17)):
the one Run new crawl button and a scheduled crawl both admit through it. It runs as
one transaction. It locks workspace, project, runtime, membership, profile,
then capacity/account, and allows one active crawl per project. Page reruns
(`selection.ts`) lock project, runtime, membership, the active crawl, profile,
then capacity/account. In order, admission:

1. refreshes the held runtime from grants under the capacity lock;
2. admits the root;
3. fits the [tracked set](#url-admission-and-selection) to the plan's monitored-URL limit;
4. freezes scope (the root registrable domain), the page limit, grant
   projection, acquisition bounds and versions into `site_crawls.configuration`;
5. reserves the fetch budget;
6. enqueues one `site_setup` and `analyze` for the tracked pages: the root
   first, then pages named by a declaration still inside its verification
   window, then fill order. A first crawl tracks the root. A sample instead
   enqueues `discover` for the root and selects it.

The request takes only the project and the robots choice
([`crawl-request.ts`](../frontend/services/api/src/site-health/crawl-request.ts)).
A request that names no choice keeps the choice of the crawl the dashboard
shows (`dashboardCrawl`: the current crawl, else the newest site crawl) and who
confirmed it (`respect` before any crawl), so a failed crawl's choice is not
kept over a usable one and the crawl button's robots note is what runs. A full crawl's page limit is
the plan's monitored-URL limit, capped by the fetch budget left; a sample's is
`automatic_page_limit` within its discovery cap. A workspace holding the
`operator_controls` grant crawls unmetered. Nothing edits the monitored set:
crawls pick it (SH-B13). A page rerun (`selection.ts`) creates a crawl of the
tracked pages it names, one page or an issue's
[Re-run all](#consumers-and-actions), holding one page fetch per page; while a crawl is running it is refused with
`crawl_already_active`, so no work joins a crawl outside its fetch hold
(SH-B4). It keeps the robots choice as a request naming none does. Its
configuration carries `page_rerun`; it hands its pages to
verification and Opportunities but is never compared as a site crawl. It writes
no project snapshot and no score summary, so it is never a compared snapshot.

**The current crawl** ([SH-B1](decisions.md#site-health-crawling-sh-b-owner-2026-11-12-co-owner-2026-11-17))
is the project's newest usable crawl (`completed`, `partially_completed` or
`cancelled`, by creation) that is not a page rerun. `currentSiteCrawl` in
`reads/crawl.ts` owns it, and `currentSiteSnapshotQuery` reads its snapshot.
Every read that names no crawl uses it: the project `/pages` and `/issues`
reads, Overview, AEO readiness and Architecture, Opportunities, the Agent's
content context, MCP, AI Traffic pages, internal links and declaration
evidence. A rerun is
never the current crawl; it updates only its own page's evidence.

**Each page's latest audit** ([SH-B9](decisions.md#site-health-crawling-sh-b-owner-2026-11-12-co-owner-2026-11-17)).
A site crawl's page and issue evidence is each page's latest audit as that
crawl shows it (`pageAuditsSql` and `viewIssuesSql` in `reads/crawl.ts`): for
every page the crawl audited and every tracked page, the newest finalized
current analysis from any audit of the project (the crawl, a page rerun or an
earlier crawl) that began before the next usable site crawl, ordered by audit
time (`started_at`, else `created_at`). The crawl's own current analyses count
before they are finalized, so a running crawl shows its progress. So the
current crawl reads each tracked page's latest audit: a rerun landing after it
moves its page, and a tracked page a cancelled crawl never reached keeps its
earlier audit. Site-level findings (architecture rules, sitewide links) are
the site crawl's own, so a rerun of the root never drops them from the Issues
list, Pages counts, page detail, issue history, MCP or AI Traffic
(`shownIssueFilter` in `reads/page-rows.ts`). A page rerun read by id shows
only its own page. Every page-level reader goes through it; the analyze task
and link metrics stay the crawl's own. The read stays bounded by the tracked set:
it takes the crawl's own analyses and those of audits that began after it, and
looks further back one page at a time only for a tracked page the crawl never
analyzed. The Opportunity refresh keys the crawl source on the crawl and the
newest rerun it folds in, so a landed rerun refreshes Opportunities. When a
rerun lands, the site crawl it falls
in (`foldingSiteCrawl`: the newest usable site crawl created before it) has its
persisted Issues catalog, snapshot page columns and score summary recomputed in
the rerun's landing transaction (`issue-currency.ts`,
`refreshSiteSnapshot` in `snapshot.ts`). Coverage and discovery figures stay
the crawl's own, and the snapshot keeps its id and time, so the Change
summary's current values move with the latest audits. An active crawl's provisional score summary still scores only
its own analyzed pages.

The dashboard shows a running site crawl,
so its progress stays visible; otherwise the current crawl, or, before any
crawl is usable, the newest site crawl, so a failure still shows.

**Scheduled crawls.** A project may turn on one crawl schedule
(`crawl_schedules`, `GET|PUT /api/v1/projects/{project_id}/crawl-schedule`),
off by default, weekly or monthly, on every plan. The `crawl-scheduler`
periodic owner (`workers/crawl-scheduler.ts`) leases each due schedule and
admits the crawl through `createCrawl` with no robots choice, so it keeps the
shown crawl's as every crawl action does, and the fetch budget, grants and the
one-active-crawl rule apply unchanged. Skip, retry and turn-off rules are in
[state machines](state-machines.md) and `config/crawl-schedules.ts`.

| Task kind (`site_crawl_tasks`) | Does |
|---|---|
| `site_setup` | robots.txt, crawler stance, llms.txt; a full crawl's discovery: the sitemap walk and tracked-set fill, or the HTML walk's start |
| `discover` | an HTML walk or sample only: fetches a page; one parse for links and facts; admits children; marks it a document, an alias or for analysis |
| `analyze` | classifies, evaluates and provisionally scores one monitored page |
| `finalize` | one per drained crawl (and one per cancelled crawl with evidence): cross-page checks, final revisions in batches, then the terminal publication; `max_attempts` 3 |
| `link_metrics` → `architecture` | post-terminal link metrics, then the Architecture projection |
| `change_intel` | post-terminal change snapshot and analytics handoff |

`admission-writes.ts` is the only writer of these tasks, of URL identities
(`site_urls`), observations and system memberships. A task's slot
(crawl, kind, URL hash, generation) is unique (`uq_site_crawl_task_slot`); its
`idempotency_key` spells the slot out and is not separately indexed. Its
attempt budget is `max_attempts`.
URL admission enqueues into an active crawl only and raises a queued
conflict's priority; planner seeds and post-terminal successors keep an
existing row. Every sighting of a URL refreshes its identity for the crawl,
including a planner seed's own `discover` (a seed an earlier crawl knew is
re-decided like an admitted URL). A crawl keeps its first observation of each
URL.

The acquisition kinds fetch outside any transaction. Each then re-locks its
task and re-checks the lease, crawl status and workspace access; `analyze` also
re-checks membership and allowance. Evidence and the outcome commit together,
and a lost lease commits nothing. A claim moves the task straight to `running`;
the commit's fence, not a separate start, decides whether the attempt still
holds the lease. The commit reuses the crawl and task its kind loaded before
the fetch (`site_setup` re-reads them for its first commit's pointers).

Crawls, tasks and the evidence written per page (attempts, artifacts, analyses,
evaluations, issues, events, observations, frontier rows) take time-ordered
UUIDv7 ids (`db/ids.ts`), so inserts land at the right edge of each key index.

### Evidence partitions

Attempts, artifacts, issues, crawl events and URL observations are range
partitioned by `crawl_id`, and rule evaluations by `analysis_id` (their owner,
which snapshots reuse across crawls), one partition per UTC month of the
owner's UUIDv7 (CO-6). A read or join that
names the crawl or analysis next to the row id prunes to one partition; one by
row id alone probes each partition's key index. Keys and unique constraints carry the
partition key, and a reference into these tables names it too
(`(crawl_id, artifact_id)`, `(analysis_id, evaluation_id)`). Issue states,
change observations and commerce observations are meant to outlive an evidence
month, but foreign keys still reach these tables (page analyses cascade from
artifacts; commerce observations restrict them), so a plain `DROP` of a month
fails. No retention runs yet: retiring a month is a `DETACH`, then a `DROP` once
the surviving references are decided ([backlog](plans/backlog.md)).

The migrate job keeps the current month and three ahead
(`site_evidence_partition_targets`), creating each month in its own statement so
a parent's exclusive lock lasts one partition, and analyzes the partitioned parents, which
autovacuum skips, so deploying at least once a quarter keeps writers in monthly
partitions. Creating a month holds its table exclusively while PostgreSQL scans
the default partition, so that pause grows with the legacy rows. Rows
keyed by the random (v4) ids crawls had before partitioning, and rows
of a month nobody created, sit in each table's `_default` partition; a month
whose range the default already holds is skipped (the job logs it) until a
forward migration splits it out. The services hold no grants on partitions and
reach them only through the parent.

`site_setup` commits twice. The first commit holds root robots access, llms.txt
and the snapshot pointer, with the sitemap `pending`, and it unblocks the root's
analysis. The second commit holds discovery and the sampled robots policy; a
reclaimed task resumes there.

`analyze` reuses the crawl's `discover` artifact when the extractor version
matches. While that `discover` is open (or `site_setup`, for the root),
`analyze` re-queues without spending an attempt for up to
`analysis_dependency_max_wait_seconds`, then fetches the page itself.

**Execution.** The runner's `site-health` lane (`workers/runner.ts`) keeps
`min(worker_concurrency, RUNNER_DB_POOL_SIZE - 1)` tasks in flight, so one
pooled connection stays free for cadence work (live score, catalog
publication) instead of waiting out the pool timeout. It refills each
slot as a task settles, until the runner stops admitting or
`claim_window_seconds` ends. An idle drain waits for work that becomes due
within its budget; when deferred work is due after the budget ends, the exiting
runner job starts a successor execution (`CLOUD_RUN_RUNNER_JOB`) instead of
leaving it for the 20-minute scheduled tick. The `DRAIN_LOCK` advisory lock serializes drains.
The runner's Site Health transactions (claims, heartbeats, `commitTask`,
transaction-kind runs, thrown-failure settles and dependency deferrals) commit
with `synchronous_commit = off` (`SET LOCAL`, owner decision
[CO-1](decisions.md#site-health-crawling-sh-b-owner-2026-11-12-co-owner-2026-11-17)):
a database crash can lose their last fraction of a second, which lease recovery
redoes. Every other lane, billing, ledger and webhook commit stays durable.

Creating a crawl commits its first tasks, and that commit starts a runner
execution ([committed-work observation](backend-architecture.md)). No API
request drains a crawl: an in-request drain held API connections for minutes
and raced the runner for the crawl row. Reads never start work.

**Leases and retries.**

- Leases (`lease_ttl_seconds`) heartbeat. Failures retry with exponential
  backoff and jitter up to `max_attempts`.
- PostgreSQL conflicts (`40001`, `40P01`, `55P03`) requeue as `db_conflict`
  without spending an attempt, up to `db_conflict_max_requeues`.
- 429, 5xx, timeouts and connection failures retry. Other 4xx, `bot_blocked`
  and robots denial are terminal.
- Only `lease-recovery.ts` recovers expired leases: oldest-first `SKIP LOCKED`
  batches, one attempt each, reconciling crawls whose tasks hit the ceiling.
- A granted access check is reused for `access_check_ttl_seconds`, never past
  the grant's own expiry; a denial is never cached.

Every reader takes the active, terminal and usable (all terminal but `failed`)
crawl status sets from `packages/contracts/src/site-health/crawl.ts`
([state machines](state-machines.md)).

**Terminalization** (`lifecycle.ts`, the only path to a terminal crawl). Each
settled lifecycle task reconciles counters and sub-states, in its crawl's
single-flight chain inside the worker. It assesses the crawl outside the lock
and writes under the crawl row lock, assessing again under the lock only when
the row's state moved meanwhile. The slot that ran
the task refills at once, and one crawl's reconciles run one at a time in
settlement order. While siblings remain, a settled analysis (analyzed, failed or
cancelled) only refreshes the provisional summary, and a discover while
discovery continues only recounts progress, both on the `live_score_refresh_*`
cadence, as are the per-page `analysis.progress` and `discovery.progress`
events. The summary's elapsed-time bound lengthens to
`live_score_refresh_large_crawl_interval_seconds` once a crawl has admitted
`live_score_refresh_large_crawl_pages`. The provisional summary
(`live-score.ts`) is the equal-page average of the tracked pages' stored
provisional scores, with counts, from a few grouped queries that never read
rule evaluations (owner, 2026-11-17); the terminal summary rebuilds from
evaluations. It is read outside the crawl lock every task commit takes, which
is held only to write, skipping a crawl that settled meanwhile. An analyze commit
writes no crawl column and holds the row `FOR SHARE`, so page commits run side
by side; the analyzed count is counted by the reconcile, Stop and the live
counters, never bumped per page. When discovery and
analysis drain, the reconcile enqueues one `finalize` task and the crawl stays
active until it publishes (`finalize-task.ts`, owner decision CO-2):

1. outside any transaction, it resolves canonical-alias chains and keyset-reads
   the unfinalized analyses with only the facts cross-page rules read, building
   their context in memory;
2. in batches of `finalize.batch_pages` (about 200), each one short transaction
   under the crawl lock and the task's lease, root first, it inserts the
   batch's crawl-finalize evaluations and issues in multi-row statements,
   appends a final analysis per page (`supersedes_analysis_id`) and flips
   `is_current`; the first commit also marks the aliases. A page that already
   has its final revision drops out, so a replayed batch does nothing, and
   readers see provisional and final revisions mixed meanwhile. Each batch
   also refreshes the issue currency of its own pages;
3. one durable transaction then publishes the last state: the catalog and issue
   states, the snapshot and score summary (none for a page rerun),
   sets `completed`, `partially_completed` (with `partial_reason`; an analysis
   that met a page that is gone or not HTML is no shortfall, as in discovery) or `failed`
   (nothing analyzed, and either discovery found nothing or every applicable
   analysis failed), persists the terminal dashboard counters (`site_crawls.terminal_counters`,
   `terminal-counters.ts`), settles the fetch reservation and the task, and,
   for a crawl that did not fail, enqueues `change_intel` and `link_metrics`
   if any analysis succeeded, otherwise hands off to the analytics refresh.

**Bounded batches (owner decision CO-7, 2026-11-20).** Crawls of tens of
thousands of pages publish on the current infrastructure (an e2-micro database,
a 1 GiB runner), so no crawl-wide step holds the whole crawl. Site setup tracks
the sitemap's pages and queues their analysis one window of
`INVENTORY_CHUNK` URLs per short commit. Finalization keeps each page's links
and hreflang targets as indices into one shared URL table. The snapshot and
score summary fold the selected pages in keyset batches of
`finalize.projection_pages` (`score-summary.ts`), issue states land a batch of
pages at a time, and the snapshot's issue rollups and the catalog are SQL
aggregates. The scale fixture (`test/scale/`, its own CI job) runs a
generated crawl through setup, analysis, a batched publication and finalize,
and asserts that no read returns more than one batch of analyses.

A `finalize` that fails retries on the normal backoff; after its third attempt
(or failed as overdue) the next reconcile ends the crawl `failed` with the
recorded reason and settles the fetch hold. Stop can land between batches: the
task cancels itself and the cancelled crawl is published by its own `finalize`.

**Backstops** run with lease recovery as one single-flight background job on a
timer beside the claim loop, never before a claim: recovery every
`poll_interval_seconds` (at once again while a reclaim batch fills), the
backstops every `backstop_interval_seconds`. Every pass awaits the job before
it returns, so an empty drain still runs them.

- **Stalled:** an active crawl with no open task and no write for
  `stalled_crawl_reconcile_seconds` is reconciled.
- **Overdue:** an active crawl that settled no task for
  `crawl_no_progress_seconds` (30 min, longer than the 20-minute tick a runner
  gap waits for), or that is older than the `overdue_crawl_seconds` cap (12 h),
  has its open tasks failed with `crawl_overdue`, then is reconciled (owner,
  2026-11-17). A large crawl runs as long as it keeps moving; a running
  `finalize` settles only once, so its heartbeat counts as movement.
- **Cancelled:** a cancelled crawl with measurement evidence but no snapshot
  gets one `finalize` task, which appends its final revisions in batches and
  publishes it (no alias or cross-page pass). A cancelled page rerun is
  published once, its `change_intel` task standing in for the snapshot it never
  writes. A cancelled crawl whose publication failed for good stays
  `cancelled` and is not retried.

Stop (`controls.ts`) commits only the cancellation and fetch settlement. It
cancels open tasks with `SKIP LOCKED`, never waiting on a claim or heartbeat
that holds one; that task's worker finds the crawl stopped, cancels it, and its
settlement rewrites the stopped crawl's counters.

## URL admission and selection

`classifyUrlAdmission` (`url-admission.ts`) decides every link, sitemap URL,
root and page redirect hop, in order (discovery and analysis fetches screen
their hops with the same `crawlAdmit`, so neither follows a redirect off the
site):

1. Reject scheme-less absolute references and join artifacts (`invalid_url`).
2. Reject hard-excluded query keys (`page`, `q`, `sort`, `filter`, …).
3. Canonicalize (`url-identity.ts`): drop tracking, variant and template keys
   (`ignored_query_keys`: quick view `qv`, `variant`, …), sort the query,
   normalize escapes, then hash with SHA-256. A tagged link therefore admits
   its clean target, the same identity the link checks judge. `view` stays: it
   names an A/B template on Shopify but selects content elsewhere (Joomla's
   `?option=…&view=article`), and a template variant's canonical already keeps
   it out of analysis.
4. Apply hard exclusions: the host's first label; login, account, cart,
   checkout and search paths; asset extensions (sitemaps excepted); URL length.
5. Apply scope: the root registrable domain and its subdomains.

Document URLs become `inventory_only`
and are never analyzed. The lists live in `analysis.json`
(`acquisition.hard_exclusion_*`) and the reason codes in `acquisition.json`
(`crawl.exclusions`).

**Value tiers** order admission and are separate from page kind. The sitemap
decides first (owner, 2026-11-24): a sitemap URL takes the tier its child
sitemap's path names, through `sitemap_source_kinds`. The file name decides only
when every word in it names the same kind, apart from neutral words
(`sitemap_neutral_words`, numbers, one- and two-letter tokens such as locale
codes), so `sitemap-core-brand-category-2.xml` is `category` while
`product_updates-sitemap.xml` and `page-sitemap.xml` decide nothing. Folder
words add a kind when they name one (`/blog/sitemap.xml`) and are otherwise
ignored (`/medias/`); a folder and file naming different kinds decide nothing.
A URL in several named children takes the highest tier, so fetch order never
matters. Products filed under `/Categories/...` and listings under bare slugs
are why the path alone misreads. The source lives in memory for admission only.
Otherwise the first path segment that names a tier, matching whole tokens,
decides it; synonyms come from `value_fallback_tokens`. So
`/blog/product-review` is `article`. A
fallback token never names a different kind than the classifier's
`route_patterns` gives the same segment (`store` is `local`, `shop` is
`category`, `help` and `support` are `docs`), or the tracked set fills with
pages the analyzer files elsewhere.

Tier weights are `value_priorities` in `acquisition.json`.

Within a tier, candidates sort by `url_hash`, the SHA-256 of the canonical
URL. The order is the project's, the same in every crawl, and not biased toward
header or footer links.

The tracked-set fill (`trackedFillOrder`, computed once over the analyzable
sitemap pages and consumed in windows) interleaves the tiers by their
`tracked_shares` (`acquisition.json`): the next page comes from the tier
with the lowest (taken + 1) / share, higher tier first on a tie, and an exhausted
tier drops out so its share goes to the rest. Every prefix of the order is
therefore a mix: one dominant type never takes the whole allowance. The HTML
walk tracks pages as their fetches commit, so it follows admission order
instead.

**www/apex twins.** A URL whose `www.`/apex twin is already in the batch or the
frontier is skipped. In sample mode, a twin that was already observed also
counts. Stored identities are not merged, and scope and depth apply before a
twin is chosen.

**Discovery** ([SH-B5](decisions.md#site-health-crawling-sh-b-owner-2026-11-12-co-owner-2026-11-17)).
Every full crawl's `site_setup` reads the sitemaps first. When they list
admissible URLs, their deduplicated count is the crawl's `discovered_url_count`
and `site_facts.sitemap.discovered_count` ("Discovered N").
`site_facts.sitemap.discovered_complete` is false when a safety ceiling
(`max_sitemap_documents`, `max_sitemap_urls`, `max_sitemap_document_urls`,
index depth), an index entry on another domain or an unread document cut the
walk short ("at least N"); `limit_reached` and
`unread_count` say which (coverage reasons `sitemap_limit_reached` and
`sitemap_documents_unread`). A document is unread when no answer settled it
(timeout, 408, 429, 5xx, oversize). A seed's 4xx or unparseable body means the
server serves none, but a child its index names that answers so is unread (a
CDN can serve a cached index naming replaced children), and then the walk
refetches that index once with a cache-busting query.
Discovery is free, has no plan cap and no manual trigger, and fetches no page.
A walk with an unread document runs again from its seeds after
`sitemap_walk_retry_delay_seconds`, doubling, up to `sitemap_walk_retries`
times (the task is deferred with the sitemap still `pending`); then it counts
what it read. The HTML walk is a fallback only for a site whose sitemaps were
all answered and list nothing (owner, 2026-11-17): a sitemap that stayed
unreadable completes discovery with the pages already known.
Otherwise `site_setup` queues the root's `discover` and discovery runs. Eligible
candidates enter `site_discovery_frontier`, up to `max_frontier_urls`; the walk
admits the best pending rows up to its bound (the plan's discovery cap, at
least the page limit), and each admission queues a `discover`. The root carries
the `technical.sitemap_present` ("No sitemap") issue when no sitemap document
was read and every one tried was answered; an unread one leaves it `unknown`.
A served document that does not parse as a sitemap is `technical.sitemap_valid`
("Sitemap could not be parsed"), never "No sitemap".

**Tracked pages** (SH-B6, `tracked-set.ts`). Active `monitored_site_urls` with
a `fill_order` are the project's tracked pages, and every full crawl analyzes
exactly them, within its fetch hold. While the set is below the crawl's page
limit, the crawl fills it in the stable order above: the root at admission,
then sitemap pages in `site_setup` (a listed document such as a PDF counts as
discovered but never takes a slot), or, in an HTML walk, each fetched URL that
proved to be a page (never a dead link, document or alias). Walked pages join
as their fetches commit, so which pages fill the set from a walk depends on
fetch timing; once joined, their positions are fixed. A page is tracked
once and never re-picked. The plan's monitored-URL limit is a window over the
fill order, applied at admission: a downgrade deactivates the pages past it
(`deselected_at` is when they left), and an upgrade restores them before any
new fill. A tracked page that fails, redirects or turns out to be an alias
stays tracked; a failed fetch releases only a sample's membership.

**Sample mode** (`discovery_mode: sample`) has no frontier. It admits up to
`sample_discovery_url_cap` URLs directly and analyzes within the workspace-wide
`sample_url_limit` (`free_sample`). It ends `sample_completed` and never walks
sitemaps or requests llms.txt.

**Sitemap inventory.** `site_facts.sitemap` keeps counts (`file_count`, `discovered_count`), never
URL lists. Every admissible listed URL, tracked or not, is saved as a
`site_urls` identity, an observation and a `site_sitemap_entries` row, so the
crawl's inventory shows them all. The entry is the only authority for sitemap
membership and keeps the URL as listed and its first declared `<lastmod>`, as
written, which a page's analysis reads. A URL the crawl had already observed
(the root, planner seeds) keeps its identity and first sighting. The inventory
writes in chunked commits under the task lease, before the commit that takes
the workspace runtime lock, fills the tracked set in the tracked order and
queues analysis, so a large sitemap never holds that lock. The sitemap checks
at finalize (`sitemap_url_unreachable`, `sitemap_orphan`) judge the listed
pages the crawl tracks; an untracked one is never fetched.

**Referrers and failed fetches.** Each discovered URL keeps the pages that
linked it, first sighting first. The frontier row holds up to
`max_referrers_per_url` of them and still records new ones after the frontier
is full. The admitting page is also stored as the observation's and task's
`parent_site_url_id`. A non-root `discover` that fails for good is observed
with its status code, unless its failure is `excluded` (`task-outcome.ts`).
Without an analysis task, the page row and the crawl counters read that failed
`discover`. A broken link therefore appears in Errors, and in the
HTTP 4XX/5XX counts, with the pages that link it (`linked_from`), even when no
selected page links it.

**Canonical aliases** (`canonical-alias.ts`). A system-selected page whose
declared canonical names another active page this crawl already fetched becomes
`duplicate` and loses its membership. A page whose target is not fetched yet is
analyzed; finalization resolves chains and cycles and excludes it only when its
target ended active. The crawl root is never aliased, because it carries the
site checks. An alias whose analysis was retired reads `not_measured` with
error code `duplicate` and `excluded` scores, never pending.

## Acquisition and evidence guarantees

`page-fetch.ts` and `web-evidence/acquisition.ts` send
`CiteLadderSiteHealthBot/1.0 (+https://citeladder.com/crawler)`; they never
impersonate a browser. Every fetch applies DNS pinning, SSRF checks, ports
80/443, TLS, redirect and byte limits, and per-host pacing shared across the
worker. A fail-closed durable suppression check runs before every URL and
redirect hop.

| robots.txt | Behavior |
|---|---|
| 2xx | Rules honored; an empty body allows all |
| 401 / 403 | Host blocked (`access_blocked`) |
| other 4xx | No rules (`not_found`) |
| 429, 5xx, network failure | Retried up to `robots_transient_attempts` times with exponential backoff from `robots_transient_backoff_seconds`; still failing, the page fails retryable (`robots_unavailable`) and the result is never cached |
| Refused by the fetcher (too large, redirect limit, blocked address, suppression) | Unreadable, asked once and cached like a readable answer; the page fails `robots_unavailable`, not retryable |

Readable policies are cached for `robots_cache_ttl_seconds`. A crawl delay
above `max_crawl_delay_seconds` blocks the host. A missing file never permits
bypassing access controls, and a challenge page is terminal `bot_blocked`.

**Ignoring robots.txt.** Run new crawl sends no robots choice, so it keeps the
shown crawl's. Its menu offers ignoring robots.txt after the person confirms
they are authorized to crawl the site, or, after a crawl that ignored it,
respecting it again. The crawl freezes
`robots: 'ignore'` and `robots_decision` (user id, email, time) in its
configuration.
Only the crawl's own `discover` and `analyze` fetches pass the choice to
`SitePageFetcher` and `PageAcquirer`, per request: it covers only the crawl's
registrable domain and its subdomains, so a redirect to another host respects
that host's robots.txt. It waives only the disallow rules of a readable file:
access-blocked or unreachable robots.txt, crawl delay, pacing, SSRF checks and
suppression still apply. `site_setup` still records the robots snapshot, and
every other fetcher (competitors, earned sources, commerce, page documents)
respects robots.txt. A page fetched despite an exclusion carries
`acquisition_options.robots_excluded` on its artifact and reads as
`robots_excluded: true`.

**Operator stop** (`pnpm --filter @citeladder/api acquisition:control`, see
[Development](DEVELOPMENT.md)): it dry-runs unless `--apply` is given, a domain
rule also covers its subdomains, unblocking a domain cannot override a global
`*`, and the reason must never hold credentials or customer content.

Attempts and artifacts are append-only. `site_fetch_artifacts.normalized_facts`
is the bounded evidence store, and no raw HTML is kept beyond one redacted
reference snippet per page: the page's first unnamed form control within its
label context, redacted to tags and attribute names (`analysis/reference-snippet.ts`).

The Issues catalog (`site_issue_catalogs.reference_snippets`) keeps at most one
snippet per issue family per crawl: the first affected page in URL order (then
issue id) whose facts carry one, with its page URL and exact issue and artifact
IDs. Only `web.accessibility_form_names` captures one today. No UI read serves
it; the Agent's `read_site_pages` returns it as `reference_snippet` when given
that rule, and an issue group's Action context carries it. Each Issues group (one per rule) is also one Action; the Issues page is
unchanged
([IA1](decisions.md#actions-and-content)).

Facts distinguish an available extraction from parse failure, unsupported
media, client rendering and truncation. Declared canonicals are observations,
never URL identity. Hidden nodes enter accessible names only through
`aria-labelledby`. Labels follow HTML's labeled control: a label with `for`
names only the first element with that id (an empty `for` names nothing), and a
label without `for` names only its first labelable descendant.

### Crawler permissions and robots history

`config/crawlers.json` lists 13 bots. Each has an identity, operator, purpose
(`search_engine`, `ai_search`, `ai_training`, `ai_user_fetch`), robots tokens
and its check membership. `site_facts.robots.bots` stores per bot the matched
group, root access and a sampled policy (`all_allowed`, `restricted`,
`all_disallowed` or `unknown`; an unreadable or truncated body is `unknown`).
These fields describe directives, not indexing or actual visits.

`robots_snapshots` keeps one append-only row per distinct 2xx body, keyed by
workspace, project, origin and the full-body SHA-256. The stored body is cut at
`robots_snapshot_max_bytes`. Each crawl keeps `robots_snapshot_id` and
`robots_observed_at`.


## Page analysis

Interpretation runs on a worker-thread pool (`analysis/off-thread.ts`); a crash
or timeout fails only that job. The same pool parses sitemap XML (an overrun
counts as an unread document) and the logo refresh's homepage HTML, so neither
blocks the event loop.

Relative links, assets, canonical declarations, hreflang alternates and
meta-refresh targets resolve against the document base (the first `<base href>`, else the final URL), as a
browser resolves them; stored link facts hold the resolved URL. Microdata items
are read as their equivalent JSON-LD objects, so both syntaxes meet one
required-property contract. Separate `X-Robots-Tag` header lines are scoped
separately: an agent-scoped line never swallows a generic one.

- **Discover:** parses once. Links come from the whole document, including
  `<template>`, up to `max_links_per_page`; facts come from the region-pruned
  view.
- **Analyze:**
  - sets `classification_expected` before parsing supported HTML;
  - re-interprets once, without spending an attempt, if the page context
    (site facts, sitemap membership, audit time) changed before commit.
- **Site facts:** only the crawl root's analysis receives `site_facts`.

`analyzePage` derives page kind, traits, evaluations and provisional scores into
an initial `site_page_analyses` row (`finalized_at` null). Its provisional
scores count the scored crawl-finalize and site checks that have not run yet
as `unknown`, so a page cannot read 100 before finalization.

### Classification

`analysis/page-kinds.ts` classifies by evidence tier, not by summed weights,
into `classification.page_kinds` (18 kinds plus `other`).

Tiers, by descending confidence: structural (high: root path, product buy box,
a collection with bound sort or filter controls, a local address entity), route
(medium: slug and route patterns, nearest segment to the root wins) and
semantic (low: docs host, FAQ pairs, byline plus date, title keywords,
structured data); signals live in `page-kinds.ts` and `analysis.json`.

The highest tier with evidence decides. If kinds tie in that tier, the result
is `other` (`conflicting_top_tier_evidence`). Structured data never decides
alone (`schema_only`). Evidence keeps every signal, alternative and conflict. A
structural winner that has any dissenting signal gets medium confidence.

- **Paths** are normalized by `site-health/routes.ts`, which
  `analysis/page-kinds.ts` and source-page assessment share.
- **Unobserved content:** a client-rendered shell has no extraction. Its winner
  drops to low confidence, and the page records `content_unobserved`.

Traits (`analysis/traits.ts`) are additive observations and never multiply
kinds.

`analysis/rules.ts` resolves applicability before outcome. The keys are
`always`, `has_html`, `site_root`, `crawl_finalize` and the `page_kind*:` and
`page_trait*:` prefixes; `content` excludes JS shells. Two gates turn would-be
failures into `unknown`:

- **Purpose gate:** a check in `purpose_confirmed_check_ids` fails a product or
  category page only when the page has its own purchase control, primary price
  or captured collection items, or a structural classification. Otherwise the
  reason is `page_kind_unconfirmed`.
- **Authored gate:** a check in `authored_content_check_ids` needs authored
  content, a visible byline or research context. Otherwise the reason is
  `authored_content_unconfirmed`.

## Checks and scoring

`config/site-health/rules.json` is the catalog. Each rule has a scope (`page`,
`site`, `cluster`, `graph`), `applicability_key`, `finding_class` (`defect` or
`diagnostic`), severity (High, Medium, Low; `critical` only for
`technical.indexable`), `score_roles`, remediation and an optional composite
contract. Pillars come from `reads.json` `aeo_check_pillar`. `validation.ts`
requires every `aeo_readiness` rule, and only those, to have exactly one
pillar; forbids scored diagnostics; and requires a score role on every defect
whose scope is `page` or `site` and that is not `crawl_finalize` (owner,
2026-11-23: there are no advisory or unscored page checks). Crawl-finalize
findings (graph, cluster, sitewide and sitemap rules, and the availability
issues) keep their severity and stay out of page scores: architecture findings
are filed once on the homepage and most need complete coverage, so scoring them
per page would multiply one finding by the page count and cap every
plan-limited crawl. `technical.canonical_integrity` is the one scored
crawl-finalize rule. Diagnostics (`technical.hsts_present`,
`aeo.llms_txt_present`) never raise an issue or score.

Outcome normalization:

- `not_applicable` keeps only `structural_na_reasons`; any other reason becomes
  `unknown`.
- Truncated extraction turns `missing` into `unknown`.
- A page the analyzer cannot read leaves its page-owned checks `unknown`. The
  one exception is a client-rendered shell (`client_rendering_required`): a
  page that loads script and has no H1 and fewer than
  `server_rendered_min_words` words in its main region (header, nav and footer
  chrome excluded). It fails `aeo.server_rendered_content`, the check that
  detects it; its content checks read `unknown`.
- A throwing or unmapped check is `error`.

`missing` or `partial` on a visible, non-diagnostic evaluation creates an issue.
Severity orders issues and never weights a score; `weight` is provenance only.
Issues, issue groups, catalogs and Actions carry no class: a group is one rule
(`issueGroupId(crawl, rule)`), and the issues route refuses unknown query
parameters, so a `finding_class` filter is a validation error.

Which checks are scored and their roles are in `rules.json`; pillar weights (`readiness_dimension_weights`, summing to 1) are in
`reads.json`.

**Site checks** run on the crawl root and score on every page. Finalization
(`terminal-analysis.ts`) and aggregation (`measurement-aggregation.ts`) replace
each page's site rows with the root's applied evaluations, and final manifests
list their IDs; rows are not copied. A scored site check that was never
evaluated (no root analysis or no site facts) is `unknown`
(`site_facts_unavailable`) and keeps measurement partial. Likewise a scored
crawl-finalize check a page's final analysis lacks (a cancelled crawl skips
finalization) is `unknown` (`crawl_not_finalized`), unless the page's own facts
rule it out: canonical integrity without a declared canonical stays
`not_applicable` (`no_canonical`).

**Crawler access.** A bot fails when its root, or every sampled URL, is
disallowed. Partial closure is `restricted` and passes. Without a fetched
robots.txt the result is `unknown` (`robots_not_fetched`), except that a
missing file (`not_found`, RFC 9309) means no rules, so every bot is measured
as allowed; a fetched but
unreadable one with no observed block is `unknown` (`robots_unreadable`). Check membership is
each bot's `checks` array:

- `search.crawler_access` (scored) covers the search bots;
  `technical.ai_crawler_access` (Low, web fundamentals) adds the training and
  user-fetch bots.

**Sitemap and redirect page checks** (`analysis/indexing.ts`, web fundamentals).
`technical.sitemap_redirect` fails when the URL the sitemap lists and
the URL the crawler reached differ in identity form (`canonicalUrl`, so query
order and tracking keys are not a redirect); `technical.sitemap_canonical` then
judges the reached page's canonical. `technical.sitemap_noindex` (Low) fails a
listed page that carries noindex. The noindex itself stays the site's
choice: sitemap membership is not indexing intent (Shopify lists every
collection), so `technical.indexable` is not applicable there, and the snapshot
gate counts that page, like a 404 or 410, as excluded. The listing is sitemap
hygiene that hides nothing from search, so its severity is Low.

**Crawl-finalize checks** (`lifecycle-finalize.ts`) evaluate canonical
integrity, internal-link targets, internal links to redirects, duplicate
content and hreflang return tags per page, and sitemap orphans, sitemap
reachability, redirect chains and sitewide links on the root. They read only this crawl's
persisted attempts; targets never fetched, or rate-limited with 429, stay
unchecked and cannot pass. A link is internal when its host shares the page's
registrable domain, the same scope the crawler admits, so `docs.`/`www.` links
count. Links in hidden markup or template content (a collapsed menu) are links
crawlers follow, as discovery does: page facts keep them as
`links.unrendered_anchors`, and these checks and the link graph count them for
targets, inbound links and depth, never for anchor text or main content. A
401/403 link target is sign-in-gated, not broken; a 401/403 sitemap
URL is still unreachable.

Canonical integrity is `not_applicable` with no declaration, `unknown` while the
target is unresolved, `missing` for a bad, redirected, noindex or chained
canonical target, and a fetched but unanalyzed target is judged on its response
alone (`target_analyzed: false`).

**Sitewide links.** A link target is sitewide when at least
`sitewide_link.min_linking_pages` analyzed pages, and `min_page_share` of all
of them, link it: template navigation, header and footer links. A broken or
redirecting sitewide target is one fix, so it is judged once, on the crawl
root, by `technical.sitewide_broken_link` or `technical.sitewide_link_redirect`
(site scope, crawl-finalize, unscored). Their evidence names each failing target, where
it lands, how many pages link it and a sample of those pages (with their
artifact IDs), plus the target's resolution source IDs; the Issues group counts
the distinct linking pages, and the rail lists the targets. With no failing
target, an unfetched or rate-limited sitewide target leaves them `unknown`
(`unchecked_targets`), never satisfied. The Issues summary's page total is at
least the largest site-level group's count, since those findings record a count
and a sample rather than every page. On each page that
target leaves the broken-link and link-redirect sets, as excluded targets do,
and stays named under `sitewide_targets`; the page's own failing links keep
their per-page issues. Without the root in the finalize pass, every page keeps
judging its sitewide links itself.

**Architecture rules** (`architecture-rules.ts`) run on the observed link graph
after terminalization and file one finding against the homepage, naming the
pages they found. `architecture.orphan_pages` names pages no analyzed page
links. `architecture.unreachable_from_home` names pages that have inbound links
but no followed path from the homepage (a section linked only from itself);
true orphans never repeat there. Both are crawl-finalize findings, need complete
coverage, and without an observed homepage the unreachable rule is `unknown`
(`homepage_not_observed`).

**Duplicate content** (`analysis/duplicate-content.ts`) compares pages
(exact SHA-256 and near SimHash), without transitive clustering; a page
outside the comparison is `not_applicable` with the reason. Only SimHashes
sharing one of `max_hamming_distance + 1` bit bands are compared, which finds
every pair within the distance without comparing every pair of a large crawl,
and each page keeps its closest evidence URLs, exact copies first.

```text
role / pillar score = 100 * satisfied / applicable, null when nothing is satisfied or missing
coverage            = (satisfied + missing) / applicable
AEO page score      = sum(pillar score * weight) / sum(weights of applicable pillars),
                      an unmeasured pillar counting 0; null when no pillar is measured
crawl score         = sum of page scores / pages where the role applies, an unscored
                      page counting 0; null when no page is scored
crawl pillar        = sum of page pillar scores / pages where the pillar applies
```

A score reaches 100 only when every applicable check ran and passed: an
`unknown` scored check earns nothing but stays `unknown` in its outcome and
measurement state. An expected schema type that is absent fails
`aeo.schema_required_valid` (`expected_schema_absent`) rather than leaving the
property checks `not_applicable`. A page with no structured data at all also
fails `aeo.structured_data_present`; both count, so no schema scores below a
schema of the wrong type, which scores below the expected one. The length checks
stay `not_applicable` on an empty title or description, which the matching
presence check already fails. Score cards and page scores show the checks that
ran as "N of M checks run" (`web_fundamentals_checks`, `aeo_readiness_checks`);
`limited_evidence` stays the stored state.

These formulas are in `analysis/scoring.ts`.

- **Duplicate rows:** they count once, and disagreeing duplicates count as
  `unknown`.
- **Page-kind rollups** use the same arithmetic, with crawl-wide site checks.

## Coverage and measurement states

The measurement cohort is the active monitored set, using each member's latest
completed analysis in the crawl (`score-summary.ts`); snapshots read it, and
provisional summaries average the same members' stored page scores. Classification coverage counts analyze tasks with
`classification_expected` as classified, `other` (with reason groups) or
failed.

`coverage.ts` persists crawl coverage with the snapshot:

| State | When |
|---|---|
| `partial` | the frontier limit was reached, the frontier was not exhausted (`requested_page_limit_reached` when the page limit left frontier URLs), or discovery was bounded (sample, non-`auto`, cancelled); for a sitemap crawl, a safety ceiling or an off-domain index entry cut the read short, a document went unread, or it lists URLs the crawl does not audit |
| `unknown` | discovery failed, observed nothing or did not complete |
| `complete` | the frontier was exhausted, or the crawl observed every URL of a sitemap read in full |

The evidence records `observation_count`, `analyzed_url_count`,
`failed_url_count` and `automatic_limit`, which is `null` (never 0) when no
allowance was recorded. It also records `value_kinds`: the URLs found and
analyzed per admission tier. Tiers listed in `coverage_expected_value_kinds`
(about, contact, pricing) appear as zero when never found. A crawl without a
frontier, such as a sample, reports no tiers.

The Overview's crawl coverage is analyzed ÷ found (`observation_count`), not ÷
selected; an expected type never found is absence from the crawl, not proof of
absence from the site.

**Scored cohort composition.** The Change summary compares against the
newest earlier comparable snapshot (`snapshot.ts`): one under the same versions
from a usable crawl (not failed), created earlier, that analyzed a page, is not a page rerun, and
has the same origin and scope as Changes requires (`sameScope`). With none, it
reads `no_comparable_snapshot`. `cohort-composition.ts`
sets `cohort_composition_changed` only when a page kind joined or left the
scored cohort, or a kind's share moved by at least
`overview_cohort_share_shift_points` (`reads.json`); smaller count drift is
`comparable_snapshot`. The note renders once, in the Change summary
(`cohort-composition-context.tsx`), with both counts by kind and only the
non-empty added or removed lists.

## Versions and provenance

Processing versions live in `config/site-health.ts` and the policy JSON files;
the classifier version is its base plus a SHA-256 prefix of every
classification input (`classifierVersion`). Crawls freeze these in their
configuration. Final analyses keep
`supersedes_analysis_id`, `source_evaluation_ids`, `source_artifact_ids` and a
frozen `expected_checkpoint_profile`. A snapshot stores its analysis set as
rows (`site_health_snapshot_analyses`) and no list of evaluation ids (owner
decision CO-6): evaluations carry their `analysis_id`, each analysis names its
own, and architecture evaluations are reached through their crawl. Score
summaries and change snapshots keep their provenance id lists, but browser
responses do not carry them
([decision](decisions.md#site-health-and-data)); single references a reader
acts on, such as an evidence page's `source_analysis_id`, stay. Any classification edit changes the
classifier digest. Versions stay at 1 until customers exist; after that, other
semantic changes bump their version under
[invariant 5](invariants.md#5-derived-artifacts-record-provenance).

## Internal links

Internal Links suggests inline links at exact captured source phrases over an
analyzed crawl. It never infers navigation or affects a score, and no provider
runs on a read. TypeScript owns admission, retrieval, reads and publication;
JEV judges pairs through the analytics queue. Limits are in
`config/internal-links.ts`.

| Stage | Behavior |
|---|---|
| Candidates | Eligible pages are selected before the cap, and passages are exact spans into the source artifact; retrieval, anchor and suppression rules live in `internal-link-pages.ts`, `-candidates.ts` and `-placements.ts`. An existing main-content link suppresses a pair; a navigation-only link does not. |
| Judgment | One JEV request per source: per target, a Noul usefulness question and a placement Choice (including `none`). Publication re-validates the anchor against frozen evidence, never falls back, keeps the higher-ranked suggestion when anchors overlap, and keeps at most `max_links_per_target` suggestions per destination. A source's Action ranks by how far its strongest link clears `accept_threshold`. |
| Execution | Dispatch events commit before sending. At the deadline, dispatched pairs close as uncertain and are never resent. A missing permission or provider yields unavailable judgments. Cancel stops dispatch; the project's slot stays busy until the judgment task ends. A publication task that fails terminally ends its run `failed` (its compensator), freeing the slot; the task row keeps the error code. |
| Verification | After the user marks a link implemented, a later complete, compatible crawl confirms a main-content link to the exact destination, with no model call and no CMS publishing. |

## Change intelligence

`change_intel` compares a terminal crawl with the newest earlier crawl that has
the same origin, scope and analyzer/extractor versions. Every full crawl,
Run new crawl and [scheduled crawls](#crawl-lifecycle) included, audits the same
tracked pages, so consecutive crawls are comparable by construction. Scope excludes the
page limit, which is the fetch budget left at admission; the comparison reads
only pages both crawls analyzed. Page reruns write no snapshot and are never a
predecessor, and Changes never shows a snapshot an older rerun wrote. With no
match, it records a non-comparable boundary against the newest earlier crawl
with analyses. A declared Site Health fix that the later crawl shows met is
marked as an expected change. URL presence (a page added or removed) is
claimed only for a complete pair: both crawls `completed` with
`inventory_complete`, which reconcile sets only for coverage `complete` (no
page or frontier limit, pending frontier, sample or other bound). A page A
analyzed is removed only when B's observed inventory lacks it; one B observed
but did not analyze (deselected, failed) is not. Snapshots are immutable except
for one in-place refresh: a page rerun landing in its crawl recomputes its page
columns ([each page's latest audit](#crawl-lifecycle)). They carry their source IDs, supersede the
newest snapshot of a crawl no newer than theirs (chosen under a project lock),
and are reused when inputs are unchanged. Changes shows the newest crawl's
snapshot, so an older crawl's late comparison never replaces it. Content change and
date consistency are separate outputs. Only `complete` comparison coverage can
promote metadata or cosmetic-refresh actions (`config/site-health/change-intel.ts`).

## Consumers and actions

Page detail, Issues, history, Changes, snapshots, exports, the Agent and MCP
read the same persisted final results.

A crawl's current issues are those whose evaluation a current analysis names,
provisional or final, plus its architecture findings (CO-7: a running crawl
shows what it has found so far). `site_issues.is_current` persists that, and
the Issues catalog, detail and export filter on it (`issue-currency.ts`). Each
writer that changes it updates only the issues of the analyses it touched, in
its own transaction: an analysis written over an earlier one, a finalize batch,
a duplicate alias retiring analyses. Architecture findings are written current. Issues and evaluations
are otherwise never rewritten. A site crawl's reads show each page's current
issues from its latest audit, plus its own site-level findings
([each page's latest audit](#crawl-lifecycle)).

An issue's state across audits is kept per project, page and rule in
`site_issue_states` (`issue-states.ts`; SH-B2, SH-B8, SH-B9). Every audit that
lands updates the pages it audited, in its own transaction: the terminal
publication of a full crawl, a cancelled crawl or a single-page rerun (one
whose pages all answered 404 included), the same refreshes of `is_current`
above, and the architecture writer for the root page's site-level findings.
On a page analyzed at its own URL, a current issue opens (or reads `regressed`
when it had been `resolved`), and a rule whose evaluation now reads `satisfied`
or `not_applicable` resolves. A rule the audit did not judge (unknown, error,
not evaluated) keeps its state. A page whose newest analyze attempt answered
404/410 gets a `technical.page_not_found` issue, and a page whose fetch ended
at another URL gets `technical.page_redirects`. Its other unresolved issues
read `page_unavailable`, never `resolved`. When the page answers at its own URL
again, the availability issue resolves and the rest are judged as usual; one the
audit did not judge returns to `open`. Any other failed fetch is no audit and
changes nothing. An audit older than one the page already landed changes
nothing, so a late cancelled crawl never overwrites a rerun. A page that left
the tracked set (a downgrade) is never audited again: each landing moves its
unresolved issues to `no_longer_tracked`, never `resolved`, so they leave the
open count; when it is tracked again, the first audit landing on it judges
them, and one it does not judge returns to `open`. Each row
names the crawl and the exact issue, evaluation, analysis or fetch attempt that
decided it. After each landing, `site_issue_trend` stores the project's open
count for the UTC day: issues in the configured open states (`open`,
`regressed`, `marked_fixed`; `config/site-health/reads.json` `issue_states`).
The Overview's open-issues trend card (SH-B9, SH-B11) reads `site_issue_trend`
as `open_issue_trend`, oldest first, up to `overview_issue_trend_day_limit` days;
it is the only change graph. Per-crawl scores come from the crawl list
(`GET /site-crawls?project_id=`, site crawls only, page reruns excluded), each
crawl's own `score_summary`.

**New and Fixed** (SH-B12; `reads/issue-changes.ts`). Each issue group carries
`new_url_count` and `resolved_url_count` against the previous usable site crawl
(`adjacentSiteCrawls`), at that crawl's audit time: New counts the group's pages
on which that crawl's view held no current issue of the rule, so a page fixed
then and failing again counts as New;
Fixed counts the rule's states `resolved` since it, and before the next usable
site crawl when an older crawl is viewed, that were seen at or before it, so a
page that went unavailable or left the tracked set is never fixed. With no
previous crawl, a site-level rule, or Fixed under a page-kind filter, the
count is null (unknown), never zero. A landing writes the states before it
rewrites the issue catalog, so the persisted catalog counts what just landed. A
group that every page fixed leaves the list, so its Fixed count is not shown.

**Mark fixed and Re-run all** ([SH-B12](decisions.md#site-health-crawling-sh-b-owner-2026-11-12-co-owner-2026-11-17);
`issue-fixes.ts`, routes in the `site-health-crawls` family) act on one issue
group of a crawl, across the pages the issues the crawl shows name: each
page's latest audit (`viewIssuesSql`), as the Issues list reads them.
`POST /site-crawls/{crawl_id}/issues/{group_id}/mark-fixed` moves the group's
rule to `marked_fixed` on every page where it is `open` or `regressed`
(`markIssueFixed`, under the same project lock as a landing), stamping
`marked_fixed_at`. Only an audit decides it afterwards: one that passes the rule
resolves it, one that finds it reopens it, except an audit fetched before the
mark, which cannot judge the fix and leaves the mark standing. A mark keeps the
issue open, so the trend does not move.
`GET /site-crawls/{crawl_id}/issue-fixes` reports per group "N of M pages
fixed" (a verified page leaves the Issues list but stays among M; the Re-run
all page count is null, not zero, for a site-level finding).
`POST /site-crawls/{crawl_id}/issues/{group_id}/rerun` re-audits every tracked
page the group is still unresolved on as one page-rerun crawl
(`createPageRerunCrawl`, which also runs the single-page re-audit). It holds one
page fetch per page and is refused with `site_health_fetches_exhausted` when
fewer remain, with `crawl_already_active` while a crawl runs (SH-B4), and with
`rerun_not_allowed` when no such page exists. The dashboard never shows a page
rerun. A site-level finding
(architecture, sitewide links) is judged only by a full crawl, so Re-run all
never names its page.

The terminal publication, the architecture writer after its findings, a page
rerun landing in the site crawl that shows it and, while a crawl runs, its
batched publication persist the crawl's unfiltered Issues catalog per finding
class, over the issues the crawl shows (`site_issue_catalogs`,
`issue-catalog.ts`): the ranked groups as the list shows them and the summary
tiles, all SQL aggregates bounded by the rule groups. A running crawl publishes
it every `issue_publication_page_interval` analyzed pages (CO-7), computed
outside the crawl lock and written only while the crawl is still active, so
the terminal catalog is never overwritten; the Issues screen labels a running
crawl's list as in progress and a stopped or failed one's as incomplete. An
unfiltered Issues read pages that persisted list. A filtered read (search,
severity, category, dimension, rule, page or page kind) computes its groups and
summary from the current issues, as does a crawl whose catalog is not written
yet. The
monitored affected count is published with the summary, so a persisted one lags
a monitored-selection change until the next publication; a computed summary
counts it live ([decisions](decisions.md#site-health-and-data)).

Every rule lists under one Issues tab (`section`: technical, content or aeo);
the API owns the mapping (`issue_section_by_category` in
`config/site-health/reads.json`). A tab and a sort are applied to the listed
groups, so the persisted catalog still answers a tab with no other filter, and
`section_counts` count the groups before the tab is applied. Cursors are bound
to the tab and order, as to the filters. Overview top issues carry their tab
(null for a retired rule).

The dashboard counters of an active crawl are the ones its post-settle
reconcile last persisted (`site_crawls.live_counters`), recounted at most every
`live_counters_refresh_seconds`, so they may lag by that much (owner decision
CO-3). Only "stalled" is probed at read time, as an expired lease among the
crawl's open tasks through `ix_site_crawl_tasks_open`. A terminal crawl's
counters are the ones persisted with its terminal status: by terminalization,
by Stop in the cancelling transaction, again when a task Stop skipped settles,
when the cancelled crawl is published and when an analysis is appended over a
finalized one. Only the monitored selection count is read live. A crawl
without persisted counters (none of its tasks settled yet, or terminal before
counters were persisted) is counted from its tasks.

The Issues page-kind filter (`page_kind`) files a per-page finding under its own
page's current, finalized analysis kind; every analysis names the crawl's site
checks, so those sources alone would file a site check under every kind. A
site-level finding (a sitewide link or an architecture rule) belongs to the
kinds its evidence's `page_kind_counts` names, counted over every affected
page rather than the sample, and its group and rail count only that kind's
pages.

`GET /projects/{id}/site-health/pages` and `/issues` answer the crawl-scoped
reads for the project's current crawl and name it (`crawl_id`); the route
prefetchers use them on a cold load beside the dashboard, not after it.

The Site health screen always opens on its Pages tab, the loading frame
included, and never changes tab by itself: not while the crawl resolves,
starts, runs or finishes. A tab the reader picks, or a `?tab=` link, stays
selected ([decision](decisions.md#site-health-and-data)). The pages search is
matched on the server and bound into the cursor.

Each issue names its catalog group (`group_id`), so a page-detail card's Ask
agent carries the issue-group reference for that page; the page's own Ask agent
carries the page.

A URL's issue history lists only resolved issues: rules recorded on the page in
the selected crawl's superseded analyses or the project's earlier crawls that its
current finalized analysis no longer reports, one row per rule at its latest
record. Current issues, the root's attached site-level (architecture) findings
included, stay in page detail and never repeat there. Without a
finalized current analysis nothing is known to be resolved, and the page says so
(`current_analysis_finalized: false`) instead of reading as an empty history.

A content handoff names a crawl, a `site_url_id` and a required
`source_analysis_id`. That analysis must be the current finalized analysis or
the one it supersedes. The handoff returns only the requested missing or
partial title or meta description (`content_addressable_check_fields`). Other
findings get a copyable fix prompt.

Issue-group Ask agent carries the crawl, the group and an optional page. The
server verifies each reference and returns a bounded sample with total counts.

Generating or exporting a deliverable never resolves a finding or moves a score.

## Configuration

Settings, their defaults and `SITE_HEALTH_<SETTING>` overrides live in
[`config/site-health/settings.json`](../frontend/services/api/src/config/site-health/settings.json);
`validation.ts` enforces cross-field bounds, and settings marked frozen are
copied into each crawl. Policy lives in the sibling `acquisition.json`,
`analysis.json` and `reads.json`.
