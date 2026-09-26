# Onboarding and company facts

## Responsibility

Onboarding establishes the owned website, market, reviewed company profile and
accepted competitors. Discovery output is evidence-backed suggestion, not
confirmed business truth. It creates the project, with an empty prompt set,
only after the user confirms the visible category, buyer type and market scope
choices where known. Generated positioning, audience and offerings remain
unreviewed until edited in the project.
[Workspace access](workspace-access.md) owns identity and project selection;
[prompts and Visibility](visibility-prompt.md) owns the prompts the user then
chooses to track.

## Action to persisted result

The [discovery API](../backend/app/api/brand_discoveries.py) accepts a
workspace-authorized, idempotent discovery request and returns persisted
progress. [Discovery](../backend/app/domain/projects/discovery.py) and the
[onboarding owner](../backend/app/domain/projects/onboarding/) coordinate
bounded first-party acquisition, identity research and provisional competitor
suggestions.
The [worker](../backend/app/workers/brand_discovery_worker.py) claims PostgreSQL
tasks with leases and commits before provider I/O.
Identity makes one model request with a 20-second timeout. Competitor suggestions
make at most three independent requests, each capped at 20 seconds. Failures
degrade to reviewable evidence. Onboarding makes no prompt-generation request.

The resolved homepage is reused. First-party pages and independent research
are separate bounded evidence sources. Identity keeps supported field citations
when a model adds an unsupported citation; a field citing only unknown sources
still rejects the identity result. One optional company, category, and market
search supplies snippets to the configured model for up to ten provisional
competitor names and domains. Search failure warns but does not block model
suggestions. Name/domain cleanup excludes owned and reference sites; it does
not prove commercial equivalence. The review screen starts with none selected,
permits up to five tracked choices and manual name/domain additions, and keeps
selected choices removable at capacity. Only selected domains are resolved
before completion acceptance, outside the discovery lock; failures leave the
choice editable. Invalid model output may be retried with the original request;
warnings preserve degraded research states.

[BrandResearchSnapshot](../backend/app/models/discovery.py) and
[discovery records](../backend/app/models/discovery.py) retain the research
manifest, model provenance and progress. BrandProfile field provenance records
origin, review state, reviewer and review time. The Projects-owned
`BusinessContext` serializes confirmed and inferred facets into that profile;
unknown facets remain absent, and its field sources distinguish visible choices
from inferred values. Reads never repeat discovery.

## Confirmation and completion

[Completion](../backend/app/domain/projects/onboarding/completion.py) locks the
authorized discovery, validates the confirmation and idempotency key, freezes
the reviewed input, persists the project/profile and its empty prompt set, and
marks the discovery `project_created` in one transaction. A rollback leaves no
partial shell. Completion makes no model call, creates no topics or prompts,
queues no worker task and starts no initial Site Health crawl. Same-key replays
return the same project; a different key conflicts. The user chooses what to
track next, from Overview or the Prompts page.

A discovery left `completing` by the retired completion worker, or its queued
`brand_completion` task, only finalizes its already committed shell; it never
generates prompts.

Reviewed category and market choices stay separate from provisional research
prose. The project market is a confirmed locale fact, while language may use
its default. BrandProfile remains the
store for offerings, positioning and audience, while Project owns locale.
The Projects-owned BusinessContext composes those facts for later prompt
generation without duplicating their storage.

The [onboarding screen](../frontend/components/onboarding/onboarding-screen.tsx)
enters the project as soon as a committed project ID is available. It seeds the
detail cache and navigates through the shared project destination owner.
After confirmation, the review controls are replaced immediately by page-level
creation progress. A retryable completion failure returns to the recoverable
review surface; a persisted terminal failure remains visible rather than
spinning. The completion request and route handoff expose separate timing
boundaries without delaying entry to the committed project.
Draft URL updates replace the router history entry while retaining its transaction
identity, so persisting the discovery ID or step does not remount the flow. These
updates stop during completion and the committed-project handoff. Leaving
onboarding discards retained transaction state; a fresh
Add project URL starts at Basics, while a discovery URL resumes that draft.
A shell-less terminal failure remains an error, not an endless progress state.
Overview and the Prompts page ask a project with no active prompts to choose
the questions it tracks; explicit generation can recover starting topics from
confirmed offerings.

## Dependencies and limits

- [Discovery configuration](../backend/app/core/config/brand_discovery.py)
  owns budgets, queue policy and statuses. Model/provider routing and encrypted
  credential custody stay in their existing owners.
- Project creation checks workspace role and occupancy. Discovery IDs and
  target projects are always workspace-authorized.
- Company facts and competitors also appear in Overview's Facts editor.
  [Command Center](../backend/app/domain/command_center/service.py) composes
  persisted evidence and chooses the next action; it does not acquire evidence.
- Offering harvest is bounded HTML evidence, not a sitemap or JavaScript
  rendering service. Missing evidence must not be padded with generic topics.
- Confirmation authorizes completion, not publishing, an external mutation or
  an automatic crawl. The Agent does not maintain a second company memory.

The [completion tests](../backend/tests/component/test_brand_discovery_completion.py)
cover atomicity, idempotency, isolation, recovery and the no-crawl boundary.
Historical evaluation results describe their recorded corpus/model only.
