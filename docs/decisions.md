# Accepted cross-feature decisions

Keep accepted, still-applicable choices with their reason, scope and actual
source. Feature-local rationale belongs in its feature owner; correctness
rules belong in [invariants](invariants.md). Git and PRs retain superseded history.

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

Source: owner-confirmed sections 0 and 0.1 of the
[retained original shell plan](archive/plans/citeladder-authed-shell-and-commercial-architecture.md),
implemented in #61 (44fc0d22), with shell selection in #58 (cae5717f).
[Workspace access](workspace-access.md) and [billing](billing-entitlements.md)
own shipped behavior. Sign-in selection and invitation delivery remain deferred.

## Preserve provider portability; do not enable payments

The owner paused completion of Razorpay integration while preserving its adapter
and the option to return or select another provider. The commercial core binds
each intent/subscription/receipt to its originating provider and environment;
vendor keys and webhook vocabulary remain vendor-owned. This avoids rewriting
commercial accounting to change a payment transport.

Source: owner-confirmed section 0 of the
[original shell plan](archive/plans/citeladder-authed-shell-and-commercial-architecture.md),
implemented in #61 (44fc0d22). On 24 September 2026 the owner resumed
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

Source: owner-settled [Agent workspace plan](plans/citeladder-action-center.md),
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
active prompt, and rejected candidates are deleted. This reverses "generated
rows are active immediately": the owner judged generated quality too uneven to
track unseen. Candidates are not a `proposed` status on `Prompt`, because every
audit, capacity and visibility query would then have to exclude proposals and
one miss would corrupt measurement.

Source: owner decision of 26 September 2026 in the
[prompt generation v2 plan](plans/citeladder-prompt-generation-v2.md), PR 3a.
[Prompts and Visibility](visibility-prompt.md) owns the shipped behavior.
