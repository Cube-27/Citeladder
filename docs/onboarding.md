# Onboarding and company facts

## Responsibility

Onboarding turns a brand name, website and market into a project with a
reviewed identity and accepted competitors. Discovery output is
evidence-backed suggestion, not confirmed business truth. The project is created,
with an empty prompt set, only after the user confirms the category, buyer type
and market scope. Generated positioning, description, audience and offerings
are stored as unreviewed suggestions.
[Workspace access](workspace-access.md) owns identity and project selection;
[prompts and Visibility](visibility-prompt.md) owns the prompts the user then
chooses to track.

## Research

The [discovery API](../frontend/services/api/src/routes/brand-discoveries.ts)
accepts a workspace-authorized, idempotent request, commits the discovery and
one queued task, and returns persisted progress. The browser then posts to
`/brand-discoveries/{id}/run` while polling progress. That request runs this one
task through the [worker](../frontend/services/api/src/workers/discovery-worker.ts)
on the API, bounded by a 180-second deadline, so onboarding does not wait for a
Cloud Run Job to start. The request, a duplicate tab and the background runner
compete for the same PostgreSQL lease; none bypasses retry backoff or the
attempt limit (3 by default, frozen on the task at creation). The handler awaits
execution and never detaches work after its response.

If an attempt fails transiently, the task waits about 30 seconds and the runner
stays alive for it: the discovery lane reports its next due task, so the retry
does not wait for the periodic tick. Site failures (invalid URL, blocked or
unknown site, out-of-scope redirect) fail at once.

The [research owner](../frontend/services/api/src/projects/research.ts) reads the
resolved homepage and a bounded set of first-party pages, and runs independent
Keenable search and fetch research in parallel when a key is configured. Each
run has one budget equal to the 180-second interactive deadline. One identity
model request proposes the profile under its own deadline (90 seconds by
default, never more than what remains of the budget) and asks only for the
output an identity needs; a field citing only unknown evidence rejects the
identity, while unsupported extra citations are dropped. One optional search
then feeds at most three sequential competitor suggestion requests, which share
what is left of the budget, for up to ten provisional names and domains.
Cleanup excludes owned, duplicate and reference sites; it does not prove
commercial equivalence. An identity the model judges `insufficient_evidence` is
recorded on the snapshot (`identity_status`) and raises the review warning
`insufficient_evidence`.

Every website, owned domain and competitor domain is stored as its site
([`siteDomain`](../frontend/services/api/src/analysis/domains.ts), AR-5): the
registrable domain, except that a host on a shared platform is a site of its
own. The public suffix list's private section covers most platforms
(`acme.myshopify.com`, `acme.github.io`); `shared_platform_domains` in
`config/discovery.json` covers the rest (`acme.wordpress.com`). So
`acme.myshopify.com` owns only itself, two stores on one platform are distinct
competitors, and a first-party redirect to another store is out of scope.

An identity request that fails, times out or returns an unusable answer is never
saved as a review without competitors: the task retries within its attempts,
and the last attempt, or a pricing refusal at once, fails the discovery with
`brand_identity_unavailable`. Spent AI credits fail it at once with
`ai_credits_exhausted`, which onboarding answers with billing, not a rerun. Without a configured model there is
no identity or category, so competitor suggestion is skipped and the review
warns. Other research failures (external research, the competitor search or
suggestions) degrade to a reviewable result with warnings. Onboarding makes no
prompt-generation request. Failures log their class, code, phase and elapsed
time, and a model deadline is logged as `timeout`, not a connection failure.

A failed discovery, or a review warning `research_degraded` or
`competitors_not_found`, offers **Run discovery again**. It posts to
`/brand-discoveries/{id}/rerun`, which creates a new discovery from the finished
one's saved input under a fresh idempotency key; the new discovery spends a
daily admission like any other, and the finished discovery and its task are
left as they are. The onboarding URL then follows the new discovery's ID. A
failure caused by the website address also offers **Edit website**.

Workspace access is checked before each network request through a short-lived
per-worker cache (30 seconds by default), so revocation takes effect within that
window without four queries per fetch. Progress reports the phase, whether the
homepage was read, and, once research finishes, the pages read and competitors
found.

The brand research snapshot (`brand_research_snapshots`) retains the evidence
manifest, model calls with prompt versions, field citations and research
metrics. First-party captures carry a content-derived source ID and extraction
version; external research keeps the provider source ID (or a content-derived
one) and the parent search for fetched pages. Reads never repeat discovery.

## Review and completion

The review step shows the discovered websites (selected) and competitors first,
then what the brand sells and where its buyers are. The
first suggestions up to the five-competitor cap start selected; the user can
deselect, edit or add competitors by name and domain. Editing a suggestion
changes its name and primary domain and keeps its other domains. The user
confirms the category from up to three suggested phrasings or types one, then
picks the buyer type and market scope.

[Completion](../frontend/services/api/src/projects/discovery.ts) validates the
idempotency key and the confirmation (at most five competitors, each with a
distinct public domain), locks the authorized discovery, requires it to be
`ready` with persisted research, and in one transaction creates the project,
brand profile and empty prompt set and marks the discovery `project_created`.
A rollback leaves no partial project. Competitor websites are not fetched again.
Completion makes no model call, creates no topics or prompts, queues no task and
starts no Site Health crawl. A same-key replay returns the same project; a
different key conflicts; a replay after the project was deleted reports no
project.

The Projects-owned `BusinessContext` stores the confirmed category, buyer type,
market scope, market and language as `reviewed` and the remaining identity
facets as `inferred`; unknown facets stay absent. BrandProfile field provenance
records the AI-suggested origin of description, positioning, audience and
offerings, unreviewed, linked to the research snapshot.

The [onboarding screen](../frontend/components/onboarding/onboarding-screen.tsx)
keeps the discovery ID and step in the URL, so a reload resumes research or
review. In-progress review edits (websites, competitors and the confirmed
profile) are kept in the tab's session storage, keyed by discovery, so a reload
returns to them; completion or a changed brand clears them, and the server
validates everything at completion. Focus moves to the new stage's heading on
each step change, but not on a reload. It enters
the project as soon as completion returns its ID, through the shared project
destination owner, and shows page-level creation progress meanwhile. A
retryable completion failure returns to the review; a failed discovery stays
visible as an error with **Run discovery again**. Leaving onboarding discards the draft; a fresh Add project
URL starts at the first step, while a discovery URL resumes that draft.

## After onboarding

Company facts (Agent → Context) and the Prompt Builder edit through one
brand-profile update, which marks each sent field `reviewed`; category, buyer
type and market scope are saved into the business context as `reviewed`. A
changed category clears the fields derived from the old one. The
[project editor](../frontend/components/projects/project-edit-panel.tsx) saves
competitors, domains and market as a diff through the competitor command, so a
kept competitor or domain keeps its ID (and a competitor its logo and aliases),
including through a rename. Prompt generation and Site Health archetypes read
the stored category and facets, so a correction there changes what later
generation asks.

## Overview layout

Overview is a widget grid, one layout per project
([layout](../frontend/services/api/src/projects/overview-layout.ts),
`overview_layouts`). Until someone edits it, the project shows
`overview_default_layout` (`config/projects.ts`): today's sections. Members and
Admins edit through the Layout menu: edit, add a widget, or reset to the
default. While editing, each widget can move, switch between half and full
width, or be removed; the last widget stays. A save names the version it
edited (`PUT /projects/{id}/overview/layout`), so a stale save fails with
`overview_layout_conflict` and shows the layout that won. Viewers see the
layout without the menu. Each widget appears once. Library widgets read their
pages' persisted reads with the pages' defaults: latest run, organic prompts,
default market.

Export PDF (`GET /projects/{id}/overview/report.pdf`,
[report](../frontend/services/api/src/projects/overview-report.ts)) prints the
saved layout widget by widget from the same reads. No internal ID or
processing-version code is printed (owner, 2026-11-01). Before the first
completed run a widget reads not available; a missing value prints the app's
dash and an observed zero stays zero.

## Brand facts

In a workspace in the fact-checking pilot (the `fact_checking` grant), Agent →
Context has a **Brand facts** tab: short statements of record on a closed set
of topics (pricing, plans, integrations, availability, markets, policies,
specifications, company), each with an optional source page. The
[brand facts owner](../frontend/services/api/src/projects/brand-facts.ts) creates
them as drafts; only confirmed facts are checked. Every change appends a
`brand_fact_revisions` row and an edit must name the revision it read, so a
stale edit is a conflict. Retiring is final and keeps the history for earlier runs. Facts are typed by people,
not suggested from research. [Fact-checking](visibility-prompt.md#fact-checking-pilot)
freezes the confirmed revisions when an audit starts.

## Dependencies and limits

- [Native discovery configuration](../frontend/services/api/src/config/discovery.ts)
  owns research budgets, timeouts, attempts, the access-check TTL, prompts and
  excluded reference domains. The brand-identity policy owns the competitor cap
  and field limits. Model routing and credential custody stay in their owners.
- Project creation checks workspace role and occupancy. Discovery IDs are always
  workspace-authorized; viewers cannot create, run or complete a discovery.
- Offering harvest is bounded HTML evidence, not a sitemap or JavaScript
  rendering service. Missing evidence must not be padded with generic topics.
- Confirmation authorizes completion, not publishing, an external mutation or a
  crawl. The Agent does not keep a second company memory.
