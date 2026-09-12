# Content generation

## Responsibility

Content turns a user's instruction and authorized persisted evidence into a
reviewable draft. It owns generation requests, attempts, history, retry,
regeneration, cancellation and feedback. It does not own a publication workflow,
editorial revision system, automatic fact promotion or later implementation
verification. [Opportunities](opportunities.md) owns implementation declarations.

## Action and context

The [Content API](../backend/app/api/content.py) exposes the skill catalog,
context preview, target-page picker, generation and history actions. The
[service](../backend/app/domain/content/service.py) checks workspace/project
ownership, role, capability, concurrency and usage capacity, then resolves the
configured model route. A missing route fails before provider I/O.

The single [context builder](../backend/app/domain/content/context_builder.py)
authorizes optional target, Site Health reference, Opportunity and Demand IDs.
It combines reviewed brand context, target-page evidence, applicable issues and
a bounded related-page set selected by
[website context](../backend/app/domain/content/website_context.py).
Conflicting origins cannot silently select a different target. Optional evidence
may be missing; that is recorded as an omission, not filled with a fabricated fact.

The browser passes identifiers and the user's own instruction. An Opportunity
may suggest a skill and target, but the instruction field starts empty.
[Message building](../backend/app/domain/content/message_builder.py) separates
the user instruction from untrusted crawl/reference text. Context preview and
generation use this same owner rather than parallel client-built context.

## Queue, attempts and funding

[ContentGeneration and attempts](../backend/app/models/content.py) are the
durable queue/result owners. Enqueue freezes the context, numeric skill version,
messages/digest, provider route and key revisions, funding mode and idempotency
fingerprint before I/O. A repeated key with a changed request conflicts.

The [Content worker](../backend/app/workers/content_worker.py) claims leased
work and records dispatch attempts, result/error and usage settlement. It
rechecks cancellation and the authorized route before dispatch. Provider calls
do not hold database locks. [Billing and entitlements](billing-entitlements.md)
own credit reservations, release and debit; BYOK does not silently fall back to
platform funding. Failed and cancelled work must retain attempt provenance.

Try again reuses frozen request context; regeneration rebuilds context from
current authorized evidence. They are intentionally different operations.
Retry rendering stamps the skill version actually used; retaining the context
does not claim that a newer skill body is the original message.
Cancellation is restricted by lifecycle state. Customer-visible deletion or
history clearing archives/redacts terminal generations; it preserves financial
attempts and ledger provenance and cannot erase active work.

## Runtime skills and read surface

The [file-backed catalog](../backend/app/core/config/content_skills/__init__.py)
loads packaged SKILL.md files with id, label, channel, order, positive numeric
version and description. Their bodies are production generation instructions.
They are **not coding-agent skills** and are not subject to personal skill
cleanup. Packaging is declared in backend/pyproject.toml.

[Content configuration](../backend/app/core/config/content.py) owns generator,
context and selection policies. The
[screen](../frontend/components/content/content-screen.tsx) renders persisted
progress, context summary, output, feedback and history. It does not invent
validation status or claim the result was published. Feedback is an explicit
user observation, not approval to promote prose to business truth.

There is no second model judge or deterministic factual-claim validator.
Grounding instructions restrict claims to supplied context, but output remains
a draft requiring review. The
[API tests](../backend/tests/component/test_content_api.py) cover authorization,
context, frozen provenance, failure/cancellation, archival and skill admission.
