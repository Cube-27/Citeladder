# Accepted cross-feature decisions

Keep accepted, still-applicable choices with their reason, scope and actual
source. Feature-local rationale belongs in its feature owner; correctness
rules belong in [invariants](invariants.md). Git and PRs retain superseded history.

## TypeScript application, Python schema tooling

The application uses TypeScript with Hono, Kysely and
Zod, with Python retained for schema metadata, Alembic migrations and their
maintenance/check tooling. Product operators, account bootstrap, development
seed/login tools and application policy belong to the existing TypeScript owners.
The retained Python package targets SQLAlchemy, Alembic and asyncpg as its direct
schema dependencies; schema test/static-analysis tools remain development
dependencies. Kysely types continue to come from the Alembic-migrated database.

The owner chose this stopping point to avoid migrating established schema
tooling merely to remove the remaining Python. Alembic remains the sole schema
author under [invariant 17](invariants.md#17-the-migration-baseline-remains-singular).
The migration reuses existing infrastructure; it requires no additional
always-on service. PRs 1–5 implement this boundary: operators, bootstrap, seed
tools and application policy are native; Python retains schema maintenance.

Source: owner-selected target in the 4 October 2026 migration-planning
conversation. The [completed migration plan](archive/citeladder-python-retirement.md)
records the slices; schema migration and full Python-environment retirement
are outside its scope.

## One commercial account per workspace

A workspace owns exactly one billing account. A user owns one workspace and may
join others by invitation; each workspace retains exactly one designated Owner.
Owner and Admin have equal workspace permissions. Billing, member management
and provider/integration credentials are administrative; Member has ordinary
product read/write/run access and Viewer has read-only product access.

This makes tenancy, access and commercial ownership agree without project ACLs,
seat billing or a second account-link entity. Ownership is counted separately
from invited membership. Workspace selection is explicit; project resolution
must still authorize the project's workspace.

Source: owner-confirmed commercial and workspace decisions, implemented in
[PR #61](https://github.com/Cube-27/Citeladder/pull/61) (44fc0d22), with shell
selection in [PR #58](https://github.com/Cube-27/Citeladder/pull/58) (cae5717f).
[Workspace access](workspace-access.md) and [billing](billing-entitlements.md)
own shipped behavior. Sign-in selection and invitation delivery remain deferred.

## Preserve provider portability; do not enable payments

The owner paused completion of Razorpay integration while preserving its adapter
and the option to return or select another provider. The commercial core binds
each intent/subscription/receipt to its originating provider and environment;
vendor keys and webhook vocabulary remain vendor-owned. This avoids rewriting
commercial accounting to change a payment transport.

Source: owner-confirmed provider-portability decision, implemented in
[PR #61](https://github.com/Cube-27/Citeladder/pull/61) (44fc0d22).
On 24 September 2026 the owner resumed
Razorpay under the [activation plan](plans/citeladder-razorpay-activation.md);
payments stay disabled until that plan's sign-off.

Real sandbox captures, recurring-method acceptance and GST parity remain
unverified. [Provider readiness](billing-provider-readiness.md) owns the
acceptance and separate enablement boundary.

## One Agent runtime; the Action is the unit of work

The separate Content and Growth Agent runtimes are replaced by one in-app Agent.
It reads through the same registered read tools as MCP, applies internal skills
the user may pick by name but never sees, and keeps one versioned deliverable
per chat; the chat is the saved work. Target-level work converges on one Action
per target, grouped and diagnosed deterministically from live Opportunities.
Skills stay internal: they are not exposed through MCP or offered as a
download, and the MCP surface is otherwise unchanged apart from removing its
retired skill catalog. Generating or approving a deliverable is not an
implementation declaration.

This removes two overlapping generation stacks, keeps MCP and the app from
drifting into different reads, and gives repeated findings on one target one
place to converge. The retired `content_creation` and `growth_agent` keys were
then renamed to one `agent` capability, route and rate key without read-time
aliases; pre-launch, the demo database is reset instead (26 September 2026).

Source: owner-settled [Agent workspace plan](archive/citeladder-action-center.md),
25 September 2026. [Agent](agents.md) and [Opportunities](opportunities.md)
own shipped behavior.

## Onboarding creates no prompts

Onboarding confirms business context and competitors, then creates the project
with an empty prompt set in the completion request. A project with no prompts
is a valid state; Overview and the Prompts page ask the user to choose the
questions to track. The previous onboarding portfolio request produced prompts
the owner judged low quality, added a completion worker and a polling state, and
committed users to prompts they had not chosen.

Source: owner decision of 26 September 2026 in the
[prompt generation v2 plan](plans/citeladder-prompt-generation-v2.md), PR 1.
[Onboarding](onboarding.md) and [prompts and Visibility](visibility-prompt.md)
own the shipped behavior.

## Generated prompts are reviewed before they are tracked

Generate stages candidates in a separate table; only a user's accept creates an
active prompt, and a rejected candidate leaves review (see the quality-gate
entry below for the text-free outcome it may leave). This reverses "generated
rows are active immediately": the owner judged generated quality too uneven to
track unseen. Candidates are not a `proposed` status on `Prompt`, because every
audit, capacity and visibility query would then have to exclude proposals and
one miss would corrupt measurement.

Source: owner decision of 26 September 2026 in the
[prompt generation v2 plan](plans/citeladder-prompt-generation-v2.md), PR 3a.
[Prompts and Visibility](visibility-prompt.md) owns the shipped behavior.

## The quality judgment gates generated prompts

Generation records bounded JEV (TypeSafe) judgments on the candidates it
selects, reversing "no fuzzy-similarity quality judges". The judgment is a hard
gate by default: a strong fail never reaches review, an uncertain candidate is
shown flagged and the rest pass. The owner first shipped it record-only (PR 3b),
then chose provisional, versioned thresholds (`jev-gate-1`) because judgments
can only be calibrated once the feature runs live. `JEV_MODE=shadow` restores
record-only behavior, in which a judgment ranks and flags the review list but
never drops a candidate. Calibration needs outcomes, so a rejected candidate that
carries a judgment, whether rejected by a user or by the gate, is kept as an
outcome record without its question text for a configured retention. This
narrows "rejected candidates are deleted". Code still owns every check code
can make, and a judgment never retires a tracked prompt.

Source: owner decisions of 26 September 2026 (PR 3b) and 27 September 2026
(PR 3c) for the [prompt generation v2 plan](plans/citeladder-prompt-generation-v2.md).
[Prompts and Visibility](visibility-prompt.md) owns the shipped behavior.

## TypeSafe is a published subprocessor; production runs JEV

The subprocessor, Privacy Policy and AI Policy revision naming TypeSafe
(United States) for prompt-suggestion and internal-link judgments was published
on 28 September 2026, and `PRIVACY_NOTICE_REVISION` moved to that date. The
owner enabled `JEV_API_KEY` in production at once rather than after the DPA's
30-day notice, because CiteLadder is pre-launch and has no DPA customers to
notify. Later subprocessor changes follow the DPA notice period.

Source: owner decision of 28 September 2026.
[Prompts and Visibility](visibility-prompt.md) and
[Site Health](site-health.md#internal-links) own the shipped behavior.

## JEV judgments are unmetered and unthrottled

JEV is built for parallel calls and costs almost nothing per judgment, so
CiteLadder does not cap its concurrency or meter judgments against AI credits.
Prompt generation sends every candidate's request at once, and an internal-link
analysis sends one request per source page at once. A bounded call count per
generation and each job's deadline remain.

Source: owner decision of 28 September 2026.
[Prompts and Visibility](visibility-prompt.md) and
[Site Health](site-health.md#internal-links) own the shipped behavior.
