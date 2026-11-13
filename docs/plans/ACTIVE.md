# Plan status

This is the current-work index, not authorization to execute a plan or operation.
Remaining work is consolidated in the backlog; historical plans are not active assignments.

## Active

- [Audit remediation](audit-remediation.md) (owner, 2026-11-12): fixes from the
  2026-11-12 codebase audit in 11 prioritized specs of parallel PRs, beginning
  with production safety and the deploy trust root. Its open owner decisions
  (O-1 to O-3) are not authorized for execution.
  - Spec 5 is the [Site Health crawl plan](site-health-baseline-crawls.md):
    one fixed set of tracked pages per project, re-audited by every crawl, with
    issues tracked page by page. Its 10 PRs (A1–A5, then B1–B5) carry owner
    decisions SH-B1 to SH-B13 and the audit's 16 crawl findings. Ask agent in
    the drawer is still pending an owner decision.

Commerce product tracking and backlog tier 1 shipped on 11 November 2026 and
their plans were deleted. The owner decisions behind them are in
[decisions](../decisions.md#commerce-product-tracking) (CM1–CM9) and
[backlog closure](../decisions.md#backlog-closure) (BL1–BL12, which also defer,
move and remove other backlog work); the feature owners in
[the documentation index](../README.md) describe what shipped.

- [Agent chat UX](agent-chat-ux.md) (owner, 2026-11-13): tool reliability,
  readable activity, a stable live turn, the composer, Actions everywhere, the
  confirm card and the sidebar subtitle, in eight PRs ending with a review pass.

## Partly delivered

- [Billing improvement](billing-improvement.md): PRs 1–3 merged; operator
  acceptance, plan and add-on sizing (B55) and the enable PR remain, tracked in
  the [backlog's billing section](backlog.md#billing-and-entitlements).
- [Content rules engine](content-rules-engine.md): the rule catalog and the L4
  model pass shipped; the L1–L3 linters and L5 are not assigned.

## Queued

- [Backlog](backlog.md): tier 2 (before launch: compliance, hardening, billing
  and release acceptance) and tier 3 (low priority, future reference only).
  Neither tier is an execution assignment.
