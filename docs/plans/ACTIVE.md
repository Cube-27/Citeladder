# Plan status

This is the current-work index, not authorization to execute a plan or operation.
Remaining work is consolidated in the backlog; historical plans are not active assignments.

## Active

- [Architecture untangle](architecture-untangle.md) (owner decisions recorded
  2026-11-06): 22 dependency-ordered PRs that fix the onboarding discovery bug
  and verified defects first, then give queues, Site Health tasks, credit holds,
  prompt writes, engine surfaces, browser server state and routes one owner
  each; the plan is also the orchestrator's tracker.

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

- [Backlog](backlog.md): remaining engineering, deferred proposals, decisions,
  calibration and release acceptance. Select and scope an item before implementation;
  queue placement does not establish priority or approval.
