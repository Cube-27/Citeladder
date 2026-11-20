# Plan status

This is the current-work index, not authorization to execute a plan or operation.
Remaining work is consolidated in the backlog; historical plans are not active assignments.

## Active

- [App redesign](app-redesign.md) (owner, 2026-11-20): one compact component
  set and standard page layouts for the signed-in app, built in three waves
  (foundation, components and shell, pages) with owner decisions AR-1 to
  AR-11.
- [Audit remediation](audit-remediation.md) (owner, 2026-11-12): fixes from the
  2026-11-12 codebase audit in 11 prioritized specs of parallel PRs, beginning
  with production safety and the deploy trust root. Its open owner decisions
  (O-1 to O-3) are not authorized for execution.
  - Spec 5 is the [Site Health crawl plan](site-health-baseline-crawls.md):
    one fixed set of tracked pages per project, re-audited by every crawl, with
    issues tracked page by page. Its 10 PRs (A1–A5, then B1–B5) carry owner
    decisions SH-B1 to SH-B13 and the audit's 16 crawl findings. Ask agent in
    the drawer is still pending an owner decision.
- [Site Health crawl optimization](site-health-crawl-optimization.md) (owner,
  2026-11-17): crawl throughput on the current infrastructure at no extra cost,
  in five measured PRs with owner decisions CO-1 to CO-6. Paid scaling waits in
  the [backlog](backlog.md#site-health-crawl-scaling-needs-spend) behind
  measured triggers.
- [AI visibility gaps](ai-visibility-gaps.md) (owner, 2026-11-17): reporting
  views, derivations and probes the product lacks against an AI-visibility
  reference, with owner decisions AV-1 to AV-21. Phase 1 fills the new Brand,
  Tracking and Search pages (N1–N7) and adds W1–W11, W14 and W15; Phase 2 is the
  W12 and W13 probes; Phase 3 updates the docs site and changelog. The mockups
  were approved on 2026-11-18, and the new sidebar with empty Brand pages has
  shipped.

Commerce product tracking and backlog tier 1 shipped on 11 November 2026, and
the Agent chat UX round on 13 November 2026; their plans were deleted. The
owner decisions behind them are in [decisions](../decisions.md); the feature
owners in [the documentation index](../README.md) describe what shipped.

## Partly delivered

- [Billing improvement](billing-improvement.md): PRs 1–3 merged; operator
  acceptance, plan and add-on sizing (B55) and the enable PR remain, tracked in
  the [backlog's billing section](backlog.md#billing-and-entitlements).
- [Content rules engine](content-rules-engine.md): the rule catalog and the L4
  model pass shipped; the L1–L3 linters and L5 are not assigned.

## Queued

- Agent as the app's hero (owner, 2026-11-18), not started: "improve the in
  app agent substabtially and make it the main hero of the app ... the idea is
  to basically have parity between mcp and in app agent and the agent drives
  the app not the other way round". It changes accepted rules (the in-app
  Agent is read-only under [MCP writes](../decisions.md#agent-mcp-and-public-api)
  and invariants §10 and §13), so it needs a scoped plan and the owner's
  answers before work starts.
- [Backlog](backlog.md): tier 2 (before launch: compliance, hardening, billing
  and release acceptance) and tier 3 (low priority, future reference only).
  Neither tier is an execution assignment.
