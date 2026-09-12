# Onboarding and company facts

## Responsibility

Onboarding establishes the owned website, market, reviewed company profile and
accepted competitors. Discovery output is evidence-backed suggestion, not
confirmed business truth. It creates the project and its starting portfolio
only after the user confirms positioning, audience and products/services.
[Workspace access](workspace-access.md) owns identity and project selection;
[prompts and Visibility](visibility-prompt.md) owns the resulting portfolio.

## Action to persisted result

The [discovery API](../backend/app/api/brand_discoveries.py) accepts a
workspace-authorized, idempotent discovery request and returns persisted
progress. [Discovery](../backend/app/domain/projects/discovery.py) and the
[onboarding owner](../backend/app/domain/projects/onboarding/) coordinate
bounded first-party acquisition, identity research and competitor qualification.
The [worker](../backend/app/workers/brand_discovery_worker.py) claims PostgreSQL
tasks with leases and commits before provider I/O.

The resolved homepage is reused. First-party pages and independent research
are separate bounded evidence sources. Structured identity output and
competitive signatures feed brand-neutral competitor searches; candidates must
cite retrieved evidence, match the buyer/market and resolve on their declared
non-owned domain. Editorial publishers can supply evidence about a competitor
but do not become that competitor by being the source. Schema and reference
validation remain mandatory even when a provider supports native structured
output. Bounded repair handles contract failures; retryable provider failures
use the configured backoff. Warnings preserve degraded research states.

[BrandResearchSnapshot](../backend/app/models/discovery.py) and
[discovery records](../backend/app/models/discovery.py) retain the research
manifest, model provenance and progress. BrandProfile field provenance records
origin, review state, reviewer and review time. Reads never repeat discovery.

## Confirmation and asynchronous completion

[Completion](../backend/app/domain/projects/onboarding/completion.py) locks the
authorized discovery, validates the confirmation and idempotency key, freezes
the reviewed input, persists the project/profile and initial empty prompt set,
and queues a brand-completion task in one transaction. A rollback leaves no
partial shell. The response can carry the committed project ID while portfolio
generation is still running; no initial Site Health crawl is started.

The worker selects topics from the confirmed profile, accepted competitors,
persisted offering harvest and page evidence. If topic selection is unavailable
or insufficient, confirmed products/services supply bounded starting topics.
It then generates prompts, re-locks the discovery and persists topics, prompts
and terminal completion together. A terminal-state guard and prompt uniqueness
prevent repeated delivery from creating a second portfolio. Same-key replays
return the same shell; exhausted work has a completion-specific failure.

The [onboarding screen](../frontend/components/onboarding/onboarding-screen.tsx)
enters the project as soon as a committed project ID is available. It seeds the
detail cache and navigates through the shared project destination owner.
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
