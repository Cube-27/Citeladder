# Onboarding and company facts

## Responsibility

Onboarding establishes the owned website, market, reviewed company profile and
accepted competitors. Discovery output is evidence-backed suggestion, not
confirmed business truth. It creates the project and its starting portfolio
only after the user confirms the visible category, buyer type and market scope
choices where known. Generated positioning, audience and offerings remain
unreviewed until edited in the project.
[Workspace access](workspace-access.md) owns identity and project selection;
[prompts and Visibility](visibility-prompt.md) owns the resulting portfolio.

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
degrade to reviewable evidence. Portfolio generation makes one request per
durable attempt, capped at 20 seconds, with at most three attempts. Provider
authentication and rate-limit errors terminate immediately.

The resolved homepage is reused. First-party pages and independent research
are separate bounded evidence sources. One optional category-and-market search
supplies snippets to the configured model for up to ten provisional
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

## Confirmation and asynchronous completion

[Completion](../backend/app/domain/projects/onboarding/completion.py) locks the
authorized discovery, validates the confirmation and idempotency key, freezes
the reviewed input, persists the project/profile and initial empty prompt set,
and queues a brand-completion task in one transaction. A rollback leaves no
partial shell. The response can carry the committed project ID while portfolio
generation is still running; no initial Site Health crawl is started.

After the business context and competitor choices are confirmed, the worker
makes one structured portfolio request with the confirmed context, accepted
competitors, offering harvest and persisted research. Request-local buyer
intents link topics to core prompts and may also link diagnostic and comparison
prompts. Code validates those links, evidence references and prompt cohorts,
then admits supported topics and prompts. An empty valid core portfolio uses
the recoverable completion-failure flow. A failed attempt is retried by the
durable worker with the same frozen input. The worker re-locks the discovery and
persists topics, prompts and terminal completion together. Generated topics
join any existing project topics before prompt binding; unresolved core or
explicitly topic-bound prompts reject the transaction. A terminal-state guard
and prompt uniqueness prevent repeated delivery from creating a second
portfolio. Same-key replays return the same shell.

The request separates reviewed category and market choices from provisional
research prose. Both have explicit source references; the project market is
supplied as a confirmed locale fact, while language may use its default.
BrandProfile remains the
store for offerings, positioning and audience, while Project owns locale.
The Projects-owned BusinessContext composes those facts for generation without
duplicating their storage.

The [onboarding screen](../frontend/components/onboarding/onboarding-screen.tsx)
enters the project as soon as a committed project ID is available. It seeds the
detail cache and navigates through the shared project destination owner.
After confirmation, the review controls are replaced immediately by page-level
creation progress. A retryable completion failure returns to the recoverable
review surface; a persisted terminal failure remains visible rather than
spinning. The accepted request, terminal worker attempt, queue-to-terminal
completion, and route handoff expose separate timing boundaries without
delaying entry to the committed project.
Draft URL updates replace the router history entry while retaining its transaction
identity, so persisting the discovery ID or step does not remount the flow. These
updates stop during completion and the committed-project handoff. Leaving
onboarding discards retained transaction state; a fresh
Add project URL starts at Basics, while a discovery URL resumes that draft.
A shell-less terminal failure remains an error, not an endless progress state.
A project with no topics can later use explicit prompt generation from its
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
  an automatic crawl. Growth Agent does not maintain a second company memory.

The [completion tests](../backend/tests/component/test_brand_discovery_completion.py)
cover atomicity, idempotency, isolation, recovery and the no-crawl boundary.
Historical evaluation results describe their recorded corpus/model only.
