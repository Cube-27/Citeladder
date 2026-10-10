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
Keenable search and fetch research in parallel when a key is configured. One
identity model request (20-second timeout) proposes the profile; a field citing
only unknown evidence rejects the identity, while unsupported extra citations
are dropped. One optional search then feeds at most three sequential competitor
suggestion requests (20 seconds each) for up to ten provisional names and
domains. Cleanup excludes owned, duplicate and reference sites; it does not prove
commercial equivalence. Without an identity there is no category to search on,
so competitor suggestion is skipped and the review warns. Every failure degrades
to a reviewable result with warnings rather than blocking the user. Onboarding
makes no prompt-generation request.

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

The review step shows the discovered websites (selected) and competitors. The
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
review; review edits themselves are held in the page until creation. It enters
the project as soon as completion returns its ID, through the shared project
destination owner, and shows page-level creation progress meanwhile. A
retryable completion failure returns to the review; a failed discovery stays
visible as an error. Leaving onboarding discards the draft; a fresh Add project
URL starts at the first step, while a discovery URL resumes that draft.

## After onboarding

Company facts are edited in Agent → Context
([brand profile panel](../frontend/components/knowledge-base/brand-profile-panel.tsx)):
category, buyer type and market scope (saved into the business context as
`reviewed`), description, positioning, audience, offerings and the business
map. Competitors, domains and market are edited in the
[project editor](../frontend/components/projects/project-edit-panel.tsx), which
keeps each competitor's aliases across renames. Overview shows a read-only
summary. Prompt generation and Site Health archetypes read the stored category
and facets, so a correction there changes what later generation asks.

## Brand facts

In a workspace in the fact-checking pilot (the `fact_checking` grant), Agent →
Context also lists **brand facts**: short statements of record on a closed set
of topics (pricing, plans, integrations, availability, markets, policies,
specifications, company), each with an optional source page. The
[brand facts owner](../frontend/services/api/src/projects/brand-facts.ts) creates
them as drafts; only confirmed facts are checked. Every change appends a
`brand_fact_revisions` row and an edit must name the revision it read, so a
stale edit is a conflict. Retiring keeps the history. Facts are typed by people,
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

The [completion and worker tests](../frontend/services/api/test/discovery.test.ts)
cover atomicity, idempotency, workspace and role isolation, lease contention,
retry and the no-crawl boundary.
