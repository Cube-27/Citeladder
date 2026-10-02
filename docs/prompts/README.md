# Audit prompts

Reusable, **read-only** audit prompts for occasional runs with fast models
(GLM Flash, DeepSeek, Qwen Max and similar) or any coding agent. Each prompt
targets one risk area, names the exact files, says what is *not* a bug in this
repository, and asks for a fixed report format. That keeps cheaper models
focused and their output easy to check.

These prompts do not authorize changes. Fixing a finding is ordinary work under
[AGENTS.md](../../AGENTS.md).

## How to run

1. Start a fresh session at the repository root on an up-to-date `main`.
2. Open one prompt file and paste everything **below its `---` line** into the
   model. Every prompt first loads [`_contract.md`](_contract.md), which holds
   the shared rules, the list of known false positives and the report format.
3. Let the model spawn subagents if it can; each prompt has a suggested split.
4. Run [`verify-findings.md`](verify-findings.md) on the report, ideally with a
   **different model**. Act only on findings it confirms.
5. Keep reports out of the tracked tree. If a tool must write a file, the
   contract directs it to `.git/audits/`.

## Prompts

| Prompt | Area | Suggested cadence |
|---|---|---|
| [security-authorization.md](security-authorization.md) | Cross-workspace access, IDOR, roles, MCP/Agent tool auth | Monthly, and after new routes |
| [security-boundaries.md](security-boundaries.md) | SSRF, secrets, webhooks, cookies/CSRF, injection, CSP | Monthly |
| [agent-llm-safety.md](agent-llm-safety.md) | Agent bounds, prompt injection, model output, MCP grants | Monthly, and after Agent changes |
| [billing-entitlements.md](billing-entitlements.md) | Payments, credits, reservations, catalog, lock order | Before enabling payments; after billing changes |
| [backend-api-correctness.md](backend-api-correctness.md) | Read purity, unknown vs zero, pagination, errors (one area per run) | Rotate weekly |
| [backend-queue-concurrency.md](backend-queue-concurrency.md) | Leases, commit-before-I/O, idempotency, lock DAG | Monthly |
| [backend-performance.md](backend-performance.md) | N+1, indexes, unbounded reads, cold start | Quarterly |
| [data-integrity-provenance.md](data-integrity-provenance.md) | Append-only evidence, provenance, schema constraints | Quarterly |
| [config-policy-drift.md](config-policy-drift.md) | Hard-coded policy, duplicate owners, route ownership | Quarterly (cheap) |
| [frontend-design-system.md](frontend-design-system.md) | Semantic misuse of `design.md` (one surface per run) | Rotate per surface |
| [frontend-accessibility.md](frontend-accessibility.md) | WCAG 2.1 AA from source | Rotate per surface |
| [frontend-performance.md](frontend-performance.md) | SPA bundles, waterfalls, polling, re-renders, Web Vitals | Quarterly |
| [frontend-data-state.md](frontend-data-state.md) | Query keys, cache bleed, URL state, SSE, truthful UI | Monthly |
| [tests-quality.md](tests-quality.md) | Tests that protect nothing; decisions nothing protects | Rotate per area |
| [migration-residue.md](migration-residue.md) | Python/TypeScript and VM/Cloud Run leftovers, doc drift | After each migration PR |
| [infra-deploy.md](infra-deploy.md) | Dockerfiles, Workers, CI permissions, dependencies, cost | Quarterly |
| [verify-findings.md](verify-findings.md) | Second-pass false-positive filter | After every audit |

## Tips for fast models

- **One prompt per session.** Mixing audits dilutes attention and inflates
  false positives.
- **Rotate the area.** Prompts marked "one area per run" stay accurate only
  when narrow; the report's Summary records the area so the next run can move on.
- **Prefer a high reasoning or "thinking" setting** for the security, billing
  and concurrency prompts; the others work well in a normal mode.
- **Expect false positives** about missing authorization. Most are covered by
  `routes/define.ts` and `WorkspaceScope`; the verify pass checks this.
- **"No confirmed findings" is a good result.** Do not push the model to
  produce more.

## Maintaining these prompts

Prompts point at owner documents instead of restating their rules, so they stay
correct when policy changes. Update a prompt when a path it names moves, when
an audit keeps producing the same false positive (add it to `_contract.md`
section 2 or the prompt's "Not a finding"), or when a new risk area appears.
