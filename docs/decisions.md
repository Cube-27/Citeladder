# Accepted cross-feature decisions

Keep accepted, still-applicable choices with their reason, scope and actual
source. Feature-local rationale belongs in its feature owner; correctness
rules belong in [invariants](invariants.md). Git and PRs retain superseded history.

## TypeScript application, SQL schema baseline

The application uses TypeScript with Hono, Kysely and Zod. The schema is one SQL file,
`frontend/services/api/migrations/0001_baseline.sql`, the only schema author
under [invariant 17](invariants.md#17-the-migration-baseline-remains-singular).
The TypeScript migrate CLI (`src/cli/migrate.ts`, `pnpm migrate`) applies it
once under an advisory lock in one transaction and records its SHA-256 in
`schema_migrations`; it runs from the API image, so the deploy builds one
application image. Kysely types are generated from a baseline-migrated database.

There is no adoption shim: a non-empty database without the ledger, or a
ledger checksum that differs from the file, fails the migrate job with an instruction to redeploy with `reset_database`.
Until there are live customers every schema change is folded into the baseline
and reaches production only through that reset option, whose confirmation check
stays.

Source: owner decision of 10 October 2026 (feature 14, execution platform).

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
own shipped behavior. The sign-in workspace chooser and invitation delivery
through self-serve authentication (#280) are implemented.

## Preserve provider portability; billing is operational but hidden

The commercial core binds each intent/subscription/receipt to its originating
provider and environment; vendor keys and webhook vocabulary remain
vendor-owned. This avoids rewriting commercial accounting to change a payment
transport. Razorpay is the implemented provider; the option to select another
remains.

Billing is fully operational but hidden, so that enabling it is one small
configuration change. Checkout serves only workspaces holding the non-public
`billing_checkout` grant (Razorpay test keys are accepted in production for
them alone); the public catalog reads checkout unavailable, and only the free
trial is live. Enablement waits for the owner's separate live sign-off tracked in
the [backlog](plans/backlog.md#acceptance-calibration-and-rollout).

Source: owner-confirmed provider-portability decision, implemented in
[PR #61](https://github.com/Cube-27/Citeladder/pull/61) (44fc0d22); the owner
resumed Razorpay activation on 24 September 2026 and set hidden operation on
11 October 2026 (billing decisions B0 and B2, refined by B42 in the
[billing decision log](billing-decisions.md)).

Real sandbox captures, recurring-method acceptance and GST parity remain
unverified. [Provider readiness](billing-provider-readiness.md) owns the
acceptance and separate enablement boundary.

## Platform AI is metered in AI credits; the Agent has no customer model route

Every platform model call spends AI credits (1 credit is $0.001 of usage after a
30% markup), charged on tokens at the serving model's price, and internal cost
follows the provider's published rates; customers see only credits. Prompt runs
replace audit credits as the measurement unit. The Agent always uses the
platform gateway: its customer (BYOK) model route was removed. Customer provider
keys (BYOK) remain only for answer-engine and research providers, as a lower
price of the same plan.

Source: owner decisions of 11 and 12 October 2026, billing decisions B4, B8,
B11, B12, B19, B23, B31 and B53 in the [billing decision log](billing-decisions.md).
Plan sizes and prices are configuration (B55). [Billing and
entitlements](billing-entitlements.md) and [Agent](agents.md) own shipped behavior.

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
place to converge.
Source: owner-settled Agent workspace plan,
25 September 2026. [Agent](agents.md) and [Opportunities](opportunities.md)
own shipped behavior.

## The Agent uses native tool calling

The Agent runs a native tool-calling loop on the providers' own APIs with no
agent framework (A1): the model calls reads and two built-ins (`load_skill`,
`save_document`) directly, one response's reads run together, and a chat's
earlier turns are replayed append-only so the prompt cache and thinking carry
across turns. It keeps both providers, Anthropic and OpenAI-compatible (A2),
behind the platform gateway. The default model is Claude Haiku 5.5 at medium
effort (A3). This replaces the JSON step protocol, which allowed one read per
step, threw away earlier reasoning and re-sent a rebuilt prompt each step.

Source: owner decisions A1–A3 of 12 October 2026 in the
[Agent native runtime plan](plans/agent-native-runtime.md); pricing in
[B53](billing-decisions.md#agent-native-runtime-2026-10-12). [Agent](agents.md)
owns the shipped behavior.

## Onboarding creates no prompts

Onboarding confirms business context and competitors, then creates the project
with an empty prompt set in the completion request. A project with no prompts
is a valid state; Overview and the Prompts page ask the user to choose the
questions to track. The previous onboarding portfolio request produced prompts
the owner judged low quality, added a completion worker and a polling state, and
committed users to prompts they had not chosen.

Source: owner decision of 26 September 2026 in the
prompt generation v2 plan, PR 1.
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
prompt generation v2 plan, PR 3a.
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
(PR 3c) for the prompt generation v2 plan.
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

## Scoped API keys are explicit user decisions

The public REST API at `https://api.citeladder.com/v1` is a paid-plan
capability (`api_access`, ten live keys per workspace; not the public trial).
Only an Owner or Admin creates a key. A key belongs to one workspace, may be
restricted to chosen projects, and its scopes intersect its creator's current
role on every request; removing the creator revokes the key. A write through a
key holding the matching scope is therefore an explicit user decision under
[invariant 10](invariants.md#10-automation-stays-bounded), and it runs through
the same command layer as the browser. Creating or spending POSTs require an
`Idempotency-Key`; an audit launch carries the caller's `max_attempts` ceiling.

Source: owner decisions D4.1–D4.3 of 10 October 2026 (competitive tracker F4).
[Public API](public-api.md) owns the shipped behavior.

## MCP writes are confirmed user decisions

An MCP connection can change product data only when the person ticked
**Allow changes** (unticked by default) at consent, adding `citeladder:write`,
and only as far as their live role in the project's workspace allows. Larger
changes are prepared, validated by a dry run of their command, and run only
through `confirm_change` after the user agreed to the preview; such a
confirmation satisfies [invariant 10](invariants.md#10-automation-stays-bounded).
Prompts added this way are active immediately, with no candidate staging,
unlike generated prompts. Existing grants are not re-consented (greenfield).
The in-app Agent stays read-only.

Source: owner decisions D4.2 and D4.4 of 10 October 2026 (competitive tracker F4).
[MCP](mcp.md#changes) owns the shipped behavior.

## The public website is flat

The marketing site and docs (`[data-public-surface]`) follow the
design-taste-frontend house rules where they differ from the shared
Attio/Linear material: nothing at rest casts a shadow (Lattice-style flat
surfaces), there is no thin divider or 1px outlined box outside real tables
and form fields, no gradient or button sheen, and no icon-topped card rows.
Surfaces separate by a tone step or by space; a section may change its whole
field colour. Coded product views (`data-ui`) keep the product's own material
inside their frame, and detached layers (menus, the consent bar) keep their
overlay shadow. Product views carry no "Illustrative example" caption. The
marketing H1 is the first screen's dominant element on desktop. The
authenticated app, sign-in and onboarding keep the shared material.

Source: owner, 16 October 2026 (design-taste-frontend inspection of the public
pages; "prefer skill over design system"). [Design](design.md) owns the system.
