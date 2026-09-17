# Earned-source page intelligence — third-party opportunity loop

Active, selected by the owner. [Opportunities](../opportunities.md),
[Visibility](../visibility-prompt.md) and [Site Health](../site-health.md) own
shipped behavior. The originating material is an external product audit
(`CiteLadder_AI_Visibility_Product_Plan.md`) and a subsequent external review of
an earlier draft of this plan; both are retained as guidance only. Findings were
re-verified against `main` at `0aaebd41` and only confirmed ones appear below.
Listed work is not authorization to execute it. Scope each slice explicitly
before starting it.

## Problem

CiteLadder already captures cited URLs and the answer evidence around them, and
the Sources projection already groups by `Citation.url`. What it does not do is
inspect those external pages. It cannot establish page-level brand or competitor
presence, cannot qualify a page-specific action, and cannot verify that an
external placement actually changed. Every third-party recommendation it produces
today is inferred from a domain name and answer-level co-occurrence.

The intended end state is one workflow: a cited page is inspected, a qualified
inclusion or correction gap is identified, a grounded brief is prepared, a human
performs the work, and CiteLadder separately confirms the placement — with
"placement live" and "visibility moved" free to disagree and both stay true.

## Confirmed defects

- The earned detector keys on `earned-source:{source_class}:{domain}` and leaves
  `target_url` null (`analysis/opportunities/earned_detector.py:63,65`). Because
  `_write_recompute` carries human status forward only on an exact
  `(rule_id, target_key)` match, any reclassification supersedes the row with no
  successor and silently discards a `dismissed` or `in_progress` decision.
- Answer-level competitor names are attached to every domain cited in that answer
  (`analysis/opportunities/source_mix.py:178`). This is a scoring input through
  `competitor_cooccurrence_factor`, not a display artifact, so a competitor merely
  named in prose raises the priority of an unrelated cited page.
- `action_path()` returns `None` for `other_third_party`
  (`source_mix.py:47-52`), which forces `actionable` false. Any domain outside the
  roughly fifty hand-maintained entries in `core/config/source_patterns.py` can
  never produce an earned opportunity, however often it recurs.
  `observational_path()` classes the same domain as earned, so the two disagree.
- `build_source_projection` returns empty when `gap_prompt_indices` is empty and
  otherwise filters to those prompts only (`source_mix.py:109-112`). Earned
  opportunities can therefore arise only from prompts already classified as
  brand-absence gaps. A page where the brand is present but wrongly described, or
  present and losing ground, is structurally invisible.
- `by_domain()` keeps one citation per domain (`source_patterns.py:141`). In the
  source-mix path this is bounded loss because calls are per answer; the fully
  lossy case is `detectors._gap_source_pattern` (`detectors.py:175`), which
  flattens every repetition first.
- The implementation check for every non-site, non-traffic opportunity falls
  through to `{metric: visibility_score, direction: increase, expected_value: 1}`
  (`domain/opportunities/implementation_events.py:77-85`), evaluated as
  `value >= expected - tolerance` against a project-wide `MetricSnapshot`
  (`verification.py:272,289`). That is an absolute floor of 1.0, not a delta and
  not scoped to the opportunity, so any healthy project passes as verified without
  having changed anything. A supplied `expected_checks` also replaces the
  server-projected contract outright (`implementation_events.py:300-301`). Both are
  live correctness defects on existing rules, independent of this feature.

Additionally, and absent from the originating audit: Gemini citations are Google
grounding-redirect URLs rather than publisher URLs
(`connectors/answer_engines/gemini_parser.py:29-32`). Nothing unwraps them, so
every token is a distinct `Citation.url` and the URL drill-down in
`domain/analysis/source_projection.py:88` is structurally useless for Gemini.

## Decisions

- Deliver the loop across three pull requests. The existing verification defects
  are corrected in the first, not the last: they damage the integrity of
  verification that already ships, and every later slice builds on them.
- Preserve every captured citation. Reuse an eligible fresh inspection rather than
  refetching it. Automatically inspect new and stale cited pages within a
  configured budget, prioritizing relevance and recurrence among those candidates
  only. Provide an explicit authorized inspect command for a captured source
  outside the automatic selection, using the same queue, authorization and budget.
  Reads never trigger inspection, and the Sources inventory stays fully visible
  whether or not its pages have been inspected.
- Retrieval is triggered by staleness, an explicit command, or a due placement
  check — never by a content hash, which is only knowable after retrieval. After
  retrieval, the hash decides whether content analysis reruns. An unchanged page
  still updates the last-checked observation.
- Unwrap grounding redirects at inspection time, never at analysis time. Analysis
  detects the redirect shape offline and records `unresolved`; the inspector
  resolves it and back-fills identity on the citations that share that exact raw
  URL within the authorized scope.
- Derive page format from the inspected page. Do not promote a domain's
  classification from a single page. An unknown publisher with a recognizable
  comparison page is actionable on that page; it does not become a known publisher
  category. Unknown publisher with insufficient evidence stays an explicit
  research state.
- Retire the domain-keyed detector through a controlled cutover rather than
  running both. Legacy rows and their history stay readable; the old detector
  stops generating tasks once the replacement is ready.

## Deployment contract

The product has no users and no database to preserve. Schema changes fold into
`migrations/versions/0001_initial.py` and the database is reset and rebuilt; there
is no incremental upgrade path and none is required until the product is ready for
users. Every slice below assumes a rebuild, not a migration.

## Reuse

The fetch stack already exists and is hardened. Building a second crawler is the
principal failure mode of this work.

- `connectors/web_evidence/fetcher.py:90` `SecureFetcher` re-validates every
  redirect hop and bounds bytes, time and hops. `enforce_scope` already defaults
  false, so arbitrary off-site URLs are a supported mode today.
- `connectors/web_evidence/url_policy.py` owns canonicalization, registrable
  domain and address validation. `resolver.py:11` pins DNS against rebinding.
- `connectors/web_evidence/robots.py:25`, `workers/site_health/robots_cache.py:23`
  and `workers/site_health/host_gate.py` own politeness.
- `connectors/web_evidence/brand_evidence.py:221` `extract_brand_page` is the
  light HTML-to-facts path and already neutralizes hostile page text at
  `:332-339`. Build on it, not on `analysis/site_health/parser.py`, whose
  713-line contract is owned-site rules.
- `domain/site_health/normalization.py:27` `canonical_identity` yields the
  `(canonical_url, url_hash)` pair.
- `domain/commerce/competitors.py:684-706` is the working template for bounded
  concurrent inspection of N external URLs inside one queue task.
- `AnalyticsTask` (`models/analytics.py:74`) is the queue lane, with its existing
  `FOR UPDATE SKIP LOCKED` claim and lease machinery.
- `enqueue_audit_opportunity_tasks`, already called from
  `workers/audit/terminalization.py:504`, is the only opportunity recompute entry
  point. Do not add a second.
- `domain/opportunities/projection.py:28` `_stable_key` is the only opportunity
  anchor encoding. Do not introduce a second one.

## Data contracts

Four tables in `backend/app/models/source_pages.py` and five nullable columns on
`Citation`.

`Citation` gains `resolved_url`, `canonical_url`, `url_hash`,
`url_identity_method` and `url_identity_version`, indexed on
`(workspace_id, url_hash)`. These belong on the row because the source projection
groups by `Citation.url` in SQL; grouping by hash is what repairs the Gemini
drill-down without a join. The original `url` is never overwritten, and every
identity write records the method and version that produced it.

`source_pages` is a project-scoped mutable projection keyed
`(project_id, url_hash)`, holding canonical URL, registrable domain, domain-level
source class, page format with its own derivation method and version, inspection
state and reason, latest snapshot, content hash, last-inspected and last-cited
observations, and inspector version. It is project-scoped because brand and
competitor presence are project-relative. There is no foreign key from
`citations`: that table has no `project_id` and is written before any inspection
exists, so the join is soft and every query carries `project_id` explicitly.

Source class and page format are separate fields with separate provenance and are
never collapsed. A page format established from one inspected page never rewrites
the domain's source class.

`source_page_snapshots` is append-only and stores no raw HTML, preserving the
invariant at `models/site_health/acquisition.py:1-3`. It keeps requested and final
URL, redirect chain, status, content type, byte count, redacted headers, bounded
page facts, evidence passages, extraction coverage, robots state and extractor
provenance. Its content hash is taken over normalized extracted text, so a change
means the prose changed rather than that an advertisement rotated. Passage offsets
index the normalized text of that snapshot and that text is not retained; each
passage therefore carries its own bounded quoted window, and the offsets are
provenance and ordering only.

`source_page_entity_presences` is append-only and relational because the detector
filters and the API sorts on it. Persisted presence is restricted to `present`,
`not_detected`, `ambiguous` and `partial`, all of which require a snapshot.
`not_inspected`, `blocked` and `stale` are page-level states and are never written
as presence rows. One resolver in `domain/source_pages/projection.py` maps the page
state and the presence row onto the API vocabulary, so the two cannot drift.

Each presence row freezes the entity roster identity and alias version it was
assessed against. A roster or alias change invalidates prior assessments rather
than silently aging them. Because normalized text is not retained, reassessment
after a roster change requires a fresh retrieval; that cost is explicit and counts
against the budget like any other inspection.

`placement_checks` carries the external target for verification and never uses an
owned `SiteUrl`. It anchors on the implementation event, because the same page and
action can be attempted more than once and a check must know which declaration it
verifies. It retains the project-scoped source identity, the expected change, the
frozen baseline snapshot and the later observation snapshot. The opportunity
stable key is carried alongside for continuity and navigation across recompute,
never as the verification anchor.

## Module ownership

`backend/.importlinter` makes `api` and `workers` transitively checked leaves,
`core` the floor, and forbids `models` and `connectors` from importing upward. The
layering for this feature is `core`, then `models` and `connectors`, then
`analysis`, then `domain`, then `workers` and `api`.

| Concern | Owner |
|---|---|
| Limits, versions, state vocabularies, budget window | `core/config/source_pages.py` |
| Earned action catalog constants | `core/config/earned_actions.py` |
| Offline redirect-shape detection | `connectors/answer_engines/grounding_redirect.py` |
| Third-party page fetch request shape | `connectors/web_evidence/source_page_fetch.py` |
| Extraction, coverage, presence, page format | `analysis/source_pages/` |
| Page-keyed earned detector | `analysis/opportunities/earned_pages.py` |
| Identity, admission, budget, persistence, read projection | `domain/source_pages/` |
| Inspection executor, concurrency, robots, pacing | `workers/source_pages/inspector.py` |

`RobotsCache` and the host gate live under `app.workers`, which neither
`connectors` nor `domain` may import. The worker therefore owns politeness and
imports them directly, keeping one robots implementation and no policy violation.
Relocating them into `connectors/web_evidence/` is cleaner but would pull Site
Health into this work; it is recorded as a follow-up, not done here.

## Inspection admission and budget

Counting completed snapshots does not bound spend. Two workers can each read the
same remaining allowance and both proceed, and a worker that fetches and then
crashes leaves no record of what it spent. Admission must therefore be atomic and
must account for queued and in-flight work, not only completed work.

- The budget window is per project per rolling day, declared in
  `core/config/source_pages.py`. Automatic inspections, manual inspections, redirect
  resolutions, placement rechecks and retried attempts all consume it. Nothing
  consumes budget outside this accounting.
- Admission claims candidate pages by transitioning `source_pages.inspection_state`
  to `queued` inside one transaction, under the existing project lock, with the
  claim count bounded by the remaining allowance. An attempt is recorded before the
  request leaves the process, so a crash spends its unit rather than hiding it.
  Lease expiry returns an abandoned claim to the pool through the existing sweeper.
- Selection orders candidates as: never inspected, then stale beyond the
  configured age, then due placement rechecks. Relevance and recurrence rank
  candidates within those sets. A page inspected recently enough is reused, not
  refetched.
- Recurrence stored on `source_pages` is a project-wide scheduling value and is
  never rendered as the citation count for a selected engine, cohort or period.
  Displayed citation frequency comes from the full captured evidence through the
  existing source projection. Page-presence coverage separately discloses which
  subset was inspected.

## Lifecycle

Today `terminalization.py:504` enqueues the opportunity refresh immediately after
the audit commits. If inspection is enqueued from the same hook, recompute always
races ahead of the evidence it needs and the page detector sees nothing.

The ordering is therefore explicit: an audit terminalizes and enqueues inspection
only. Eligible inspections run and commit their snapshots and entity observations.
Completion of an inspection batch enqueues the existing
`enqueue_audit_opportunity_tasks`, bounded per batch rather than per page. Pending
placement checks are then evaluated against eligible new snapshots.

Audit completion stays independent of inspection success. A blocked publisher page
never turns a successfully measured AI answer into a failed audit, and a queue
outage never rolls back audit evidence.

The page detector reads the full eligible answer set, not only prompts classified
as brand-absence gaps. That restriction (`source_mix.py:109-112`) is what makes
correction and defence cases unreachable today.

## Detector contract

The page-keyed target is `earned-page:{url_hash}`. Source class and page format
become evidence fields and never key fields, which permanently retires the
lost-status defect. Four rule ids are introduced rather than one rule carrying an
action field, because `_score_hits` consolidates on `(rule_id, target_key)` and the
partial unique index is keyed identically; a single rule would collapse two
different actions on one page into one row with one status, and acquiring a listing
and correcting a listing have different done-states.

Qualification is hard and precedes ranking. No rule fires without sufficient
extraction coverage, a relevant market and topic, correct entity matching and a
feasible action. An unqualified candidate stays a source state or a research
candidate; it never becomes a fabricated action.

- `earned_page_acquire_listing`, high: the page was inspected with sufficient
  coverage, its format admits inclusion, its topic and market are relevant, at
  least one competitor is present, and the brand is not detected.
- `earned_page_correct_listing`, medium: the brand is present and a specific
  discrepancy is identified against reviewed brand facts, supported by the page
  passage that contains it. Brand presence alone never produces this task.
- `earned_page_defend_listing`, low: a usable prior snapshot exists and the
  placement deteriorated — removed, materially altered, or a new competitor
  displaced it. Brand and competitors both being present is a healthy watch state
  and produces no task.
- `earned_page_research_source`, low: the source is relevant and sufficiently
  recurrent, or the user asked for it, but classification, presence, coverage or an
  actionable route is unresolved. A routine fetch failure is a visible source
  state; it does not by itself earn an opportunity.

Research is `low` and not `info`. With `SEVERITY_WEIGHTS[info]` at 0.5, a scale of
10.0 and a surfacing floor of 10.0, an info hit at base factors scores 5.0 and is
dropped — the comment at `core/config/opportunities.py:679-683` states this
outright. A research hit has base factors by definition, so `info` would
reintroduce the silent-drop defect this plan exists to remove.

Where evidence would satisfy both acquisition and defence — a brand that was
present and is now gone — defence wins, because it carries the prior snapshot that
explains what changed. One page and one intended outcome produce one task.

All four set `target_url` to the canonical page URL, where today the earned hit
sets null. That makes `_resolve_targets` reachable
(`implementation_events.py:143-145`), where it would call `resolve_owned_page` on a
third-party URL and raise a conflict. External target handling must therefore land
before any interface can declare against these rules.

`page_competitor_presence_factor`, computed from verified on-page presence, is the
only competitor input to the new rules' priority. Answer-level co-occurrence is
retained as descriptive evidence and stated as such; it never boosts a page score.
The analyzer, rule and formula versions are bumped together per the contract at
`core/config/opportunities.py:41-46`.

`source_mix.py` is left alone during the transition because the outgoing detector
consumes it, not because changing it would rewrite history — a versioned change
affects future computation only, and frozen `OpportunitySnapshot` rows keep their
recorded versions regardless. Once the old detector is retired, the earned action
path through `action_path()` goes with it. The mix projection survives for the
Sources display, with answer-level co-occurrence labelled honestly.

## Legacy transition

A domain-level decision does not distribute across pages. Marking a publisher
opportunity `in_progress` because someone is contacting the author of one article
says nothing about five other articles on that domain, and dismissing one vague
domain suggestion does not dismiss every future inclusion or correction on that
publisher.

Legacy opportunities and their status history are preserved and remain readable.
Status carries forward only where there is an unambiguous successor: the same
registrable domain resolving to exactly one qualified page with a matching action
intent. Everywhere else the legacy decision is linked as context and the new
page-specific task starts with its own status. The old detector is retired in one
controlled cutover; it does not continue generating tasks alongside the new one.

## Slices

Inspection foundation and verification correctness, in order: correct the
visibility-metric check to compare against a persisted baseline rather than an
absolute floor and scope prompt-keyed opportunities to their own metric; close the
client override of server-projected expected checks; configuration, models and the
schema rebuild; pure identity and redirect-shape detection, moving the Google
redirect predicate down out of `analysis/scoring.py:147-176`; identity columns
written during analysis; pure extraction, coverage, presence and page-format
derivation; the fetch primitive; atomic admission with budget and staleness; the
worker executor enqueued from audit terminalization with batch-completion
recompute; and the read projection, endpoint, Sources panel and authorized manual
inspect command.

Qualified page opportunities, in order: the earned action configuration split and
the four rules with their version bumps; the evidence bundle and pure detector
including its qualification gate and overlap resolution; extraction of the
visibility evidence loaders out of `recompute.py`; wiring the detector into hit
collection over the full eligible answer set; external implementation targets
accepting an external page and freezing the check contract; the earned brief
through the existing Content handoff with appropriate output types rather than a
generic article; the endpoint and the Sources-to-Opportunity route; and the
controlled retirement of the domain-keyed detector with the conservative status
transition.

Two of those are load-bearing rather than tidying. `core/config/opportunities.py`
is 716 lines and `domain/opportunities/recompute.py` is 793 against a hard 800-line
module ceiling in `backend/scripts/complexity_policy.json`; neither the four rule
entries nor the new detector branch fits without the split first.

Placement observation and outcome presentation, in order: the placement check
table and its evaluation against fresh source snapshots; the verifier comparing an
observation against the frozen baseline for the specific expected change; and the
interface showing action-specific proof, or an honest unavailable state,
presenting placement observations separately from comparable visibility movement.

## Boundaries

This plan does not authorize an outreach platform, bulk mail, negotiation workflow,
autonomous posting, fabricated reviews, a second aggregate visibility score, a
second crawler, a graph database, or any expansion of Site Health, feed management
or catalog enrichment. It does not authorize paywall or authenticated community
bypass. External page text is untrusted data and never an instruction to an
enrichment step.

It does not re-propose work already queued in
[Integrations and AI Visibility](citeladder-integrations-audit-followups.md);
prompt-portfolio coverage, answer-text competitor discovery, fanout-to-action
navigation and contextual brand narrative are explicitly out of scope here.

Reads render persisted projections and never fetch, enqueue or repair. Manual
inspection is an explicit authorized command, not a read side effect. Third-party
hosts get a stricter per-host delay than owned-site crawling, and a
robots-disallowed page produces a blocked state visible in Sources rather than a
silent skip.

## Acceptance

- A domain with two cited articles yields two inspectable page records, and a page
  that was never fetched is never reported as a confirmed brand absence.
- A positive page-content claim resolves to a specific snapshot and a quoted
  passage. A non-detection instead reports extraction coverage, matching method and
  its limitations, because no passage can prove an absence.
- A competitor named in an answer is visibly distinct from a competitor found on
  the page, and only the latter affects a page opportunity's priority.
- An unknown publisher with a recognizable comparison page produces a qualified
  action on that page without its domain being promoted to a known category.
- Both brands being present on a healthy page produces no task. A placement that
  disappears produces one defence task, not a defence and an acquisition.
- A suggested action names the exact URL, the specific gap, the affected prompts
  and the observed citation frequency. Re-running the same evidence does not
  duplicate the task or lose a human status.
- A legacy domain decision never marks multiple pages as work in progress.
- Two workers admitting inspections concurrently cannot exceed the budget, and a
  worker that fetches and crashes has spent its unit.
- Opportunity recompute for an audit observes that audit's page evidence, and a
  blocked publisher page never fails the audit.
- A declared implementation targets an external page without touching owned site
  URLs, and a prepared brief cannot manufacture placement evidence. A correction
  check verifies the specific expected change, not merely that the brand appears.
- Placement live and visibility moved are reported as two independent observations,
  and a project whose score already exceeds the old floor no longer passes
  verification without having changed.
- A page inspected in one project is invisible to another project in the same
  workspace.

Apply the existing repository validation policy to each finished executable diff.
Add `docs/earned-sources.md` as the canonical feature document, register it in
`docs/README.md`, and update [Opportunities](../opportunities.md) for the four new
rules when they land.
