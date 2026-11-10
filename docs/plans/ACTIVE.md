# Plan status

This is the current-work index, not authorization to execute a plan or operation.
Remaining work is consolidated in the backlog; historical plans are not active assignments.

## Active

- [Billing improvement](billing-improvement.md) (feature 11, owner decisions
  recorded 2026-10-11): billing fully operational but hidden, in three PRs, so
  that enablement is a configuration-only PR.
- [Agent native runtime](agent-native-runtime.md) (owner decisions recorded
  2026-10-12): native tool-use loop with streaming and memory, then a
  Haiku/Sonnet and reasoning picker, then later improvements as an owner choice
  between Managed Agents and the native runtime, in three PRs.
- [Security audit 2026-10](security-audit-2026-10.md): the fixes needing no
  decision shipped in #384; the items needing the owner's decision are in the
  [decisions record](security-audit-2026-10-decisions.md).
- [Insight parity](insight-parity.md) (owner decisions recorded 2026-10-16 and
  2026-10-17): PR 1 (#414) and PR 2 (#419) shipped; PR 3 adds the editable
  Overview, its layout PDF and Site Health Recrawl.
- [State-machine fixes](state-machine-fixes.md) (complete 2026-11-07): all 12
  PRs merged (#653–#664), fixing the verified lifecycle defects from the
  [state-machine catalogue](../state-machines.md); owner answers B69–B71, and
  the billing edge cases found while building are deferred to the Razorpay
  acceptance gate (B72, [backlog](backlog.md)).

The [Architecture untangle](architecture-untangle.md) (owner decisions OD1–OD8,
2026-11-06 and 2026-11-07) is complete: 24 dependency-ordered PRs (#626 to #652)
fixed the onboarding discovery bug and verified defects, then gave queues, Site
Health tasks, credit holds, prompt writes, engine surfaces, browser server state
and routes one owner each.

The [Design system rollout](design-system-rollout.md) (owner decisions D1–D25
recorded 2026-11-05) is complete: the eight rollout PRs (#574 to #588) put
every surface on the new design system, and the owner's review rounds shipped
in #587, #589, #590 and #592.

The [Prompt Builder](prompt-builder.md) plan (owner decisions recorded
2026-11-01) is complete: generation quality (#483), the Prompt Builder sheet
(#487), and the Context page with Prompt discovery rebuilt on the builder's
endpoints (PR 3). Its calibration follow-ups are in the backlog.

The feature review programme, the competitive feature tracker and the app
geometry consistency plan are complete and archived under
[docs/archive](../archive/); their other unfinished items, including
enterprise SSO and SCIM (F9) and the AI Traffic control band that wraps at
982px, are in the backlog.

## Queued

- [Content optimization phase 1](content-optimization-phase-1.md) (owner
  decisions CO1–CO18 recorded 2026-11-10 in the
  [content optimization architecture](content-optimization.md), billing B73;
  rules in the [content rules engine](content-rules-engine.md)): content
  angles from cited titles, the content-gap Actions and the Content
  optimization list screen, in three PRs. In progress (assigned 2026-11-10).
- [Backlog](backlog.md): remaining engineering, deferred proposals, decisions,
  calibration and release acceptance. Select and scope an item before implementation;
  queue placement does not establish priority or approval.
