# Plan status

This is the current-work index, not authorization to execute a plan or operation.
Remaining work is consolidated in the backlog; historical plans are not active assignments.

## Active

None. The app redesign, audit remediation, both Site Health crawl plans and AI
visibility gaps were retired on 21 November 2026; their owner decisions that
still bind (AR, SH-B, CO, AV) are in [decisions](../decisions.md), and their
open questions are in the [backlog](backlog.md). Commerce product tracking,
backlog tier 1 and the Agent chat UX round shipped earlier. The feature owners
in [the documentation index](../README.md) describe what shipped.

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
