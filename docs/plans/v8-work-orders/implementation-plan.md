# v8 Cost/Latency + Tier Pricing — Implementation Plan

Execution plan for the frozen `docs/plans/v8-cost-latency-and-tier-pricing.md`.
I did not redesign anything and produced no mockups. What I did was verify the
frozen doc against the actual code at HEAD (`f049823`), and it drifted in ways
that change the work. That drift, plus the deltas from your five decisions, is
what this plan is about.

Detailed work orders (the build agents' actual instructions) live in
`/code/.plans/subplans/slice1-plan.md`, `/code/.plans/parts/slice23.md` and
`/code/.plans/parts/frontend.md`.

---

## 1. What the frozen doc gets wrong about the current code

These are verified against the files, and each one changes the work:

| Frozen doc says | Reality at HEAD | Consequence |
|---|---|---|
| Provider Settings "already renders `connected\|missing\|failed\|unavailable`" | `lib/providers/use-engine-connection.ts` models only `{status:'ok'\|'failed'}\|null` plus configured/not-configured. `unavailable` appears nowhere | The four-state vocabulary is **new work**, front and back |
| §2.1 Anthropic measurement "ran" (median 439/183/386/2334 output tokens, −56% cost, −49% latency) | **No committed artifact.** No harness script, no CSV, no fixture. `backend/scripts/` has 5 unrelated files | Those numbers are unverifiable. They become config defaults but cannot be *attributed* to anything |
| Worker concurrency is new work (§3.5) | Already built: `worker_concurrency=10`, `run_pipelined()` with per-slot claim loops, `_call_with_retries`, lease/heartbeat | T4 is **extension**, not greenfield. Avoids a duplicate execution path |
| "three tables, and only three" for the entitlement core | The same section separately requires `IdempotencyRecord` and `PendingActivation` | The executable core is **five** tables |
| Schema work is "additive" | You directed replacing `0001_initial` outright | No `0002`; one integrator rewrites the baseline |
| Grok logo/`rotating-engine-logos.tsx` were untracked | Both tracked at HEAD | Real §6.1 gate violation shipping today |
| Cost `unknown` when usage is missing (§3.2) | `cost_projection.py` degrades every missing/invalid value to **zero** via `_non_negative_int` | Silent zero-cost rows today |
| Repricing appends a new projection row (invariant 3) | `ExecutionCostProjection` has **unique constraints on `task_id` and `raw_response_artifact_id`**, which physically block a second row | Constraints must be replaced with `UNIQUE(raw_response_artifact_id, formula_version, pricing_version)` |

Two more worth flagging: OpenAI's parser **drops reasoning items wholesale**
(`_DROP_ITEM_TYPES={"reasoning"}`), so the reasoning-token signal the plan needs
is currently discarded — it must be captured as a *count* without leaking
content. And there is **no canonical `finish_reason`** anywhere; only Anthropic
preserves a raw `stop_reason`.

## 2. Your five decisions, and what each one changed

1. **Pulse instruction → unmeasured candidate.** Ships enabled, hashed against
   drift, labelled in code as unmeasured. The −56%/−49% figures are explicitly
   forbidden from being attributed to it until the harness runs.
2. **Trial → deferred, plus a dev login.** Trial *grant algebra* stays in PR1
   (it is pure resolver logic). Trial *checkout* returns `trial_unavailable`, and
   all four §8.2 abuse controls defer intact — not weakened. New: a dev-only
   seeded login behind a default-off flag that **hard-fails startup outside
   dev/test**, never bypasses `require_workspace_member`, never exposes
   platform-funded credentials, and has no frontend affordance.
3. **Coming-soon providers, marketing language unchanged.** Grok/Perplexity/
   Copilot integrate as far as honesty allows: catalog flag keys resolve,
   activation returns `provider_unavailable`, no route exists. The logos stay.
   This is a **recorded, approved deviation** from §6.1 and the §12 logo gate —
   the test changes from "logo absent" to "logo present, labelled coming-soon,
   not connectable", and the accessible label distinguishes shipped from
   coming-soon so it stops implying six working integrations.
4. **Capture-intent-and-resume** on public pricing. The intent is stored, then
   validated against the live catalog on resume (a stale key is discarded, never
   activated) and is **never trusted as authorization** — the resumed mutation
   still requires billing-owner auth.
5. **Schedules → PR3, first priority.** T12 leaves PR1 entirely, preserved
   verbatim for lift. Periodic work ships as bounded one-shot scripts, no
   scheduler service, nothing folded into the worker loop.

One thing I did **not** simply defer: the **billing reconciliation service and
CLI still ship in PR1**, manually runnable on day one. Without it a missed
webhook leaves a paying customer with no grants and no recovery path.

## 3. A cross-plan review caught 9 blockers

The two backend halves were drafted in parallel and their shared interfaces did
not line up. Every one is now reconciled:

- **The funded ledger was not callable.** One side reserved per *audit* with no
  reservation id; the other required a `reservation_id` and a `task_id` that did
  not exist yet at reservation time. Now: one canonical per-**task** contract
  (`reserve_funded_task` / `record_billable_attempt` /
  `release_unused_reservation`), reserved for that task's `max_attempts` in the
  same transaction that creates the task, with `reservation_id` frozen into task
  config. Also fixed: the ledger's `ON DELETE SET NULL` destroyed the
  `(task_id, attempt)` accounting identity for historical rows.
- **The entitlement cache was unsafe across replicas.** A per-subscription
  version cannot invalidate an account-level cache — an add-on's lifecycle event
  changes capability without touching the base subscription, and `max()` across
  subscriptions is unsound. This could **authorize spend after cancellation**.
  Now: one persisted account-level `entitlement_lifecycle_version`, bumped
  transactionally, included in every cache key.
- **Expected-cost config had two owners** with three mismatched field names.
  `core/config/costs.py` is now sole owner, consumed via one typed accessor.
- **`funded_execution_allowed` was expected but never exposed** — correctly so, a
  resolved allowance does not prove an *unspent balance*. Funded authorization is
  proven only by a successful ledger reservation.
- **PR1 did not deliver the provenance PR2 needs.** `measurement_mode` was added
  to the `Audit` model but not to the analysis schemas, service or exports; and
  trend series needed **partitioning** by mode/model/retrieval, not just
  labelling — a label alone still mixes unlike runs into one series.
- **The SSE stream is not resumable.** It exists, but the backend never reads
  `Last-Event-ID`, so every reconnect replays everything, and `payload` is an
  open dict no strict schema can parse. PR1 now adds both.
- **Public catalog vs authenticated connection state were conflated** — a public
  catalog cannot know a workspace's probe state. Split into two contracts, with a
  never-probed key resolving fail-closed to `missing`.
- **Deletion blast radius was incomplete.** Most important:
  `backend/tests/conftest.py:104` has an autouse fixture importing the deleted
  Free/Starter constants, which breaks **test collection for the whole suite** —
  it must be fixed first. Plus ~20 unlisted Site Health readers, two operator
  scripts, and stale `$49`/"Start free" copy in FAQ, demo and onboarding.
- **PR2's default pricing view could not render.** It defaulted to funded price
  with all three cards showing `base + credit_price` — but funded values are
  deliberately unset, so `credit_price` is null. Now BYOK base is the available
  price, funded renders as not-yet-priced, and §7.1's downward animation defers
  with the funded catalog.

## 4. PR1 — backend

~120–140 files. Too large to review as one undifferentiated diff, so it lands as
**8 ordered commits**, each independently verifiable:

| # | Commit | Contents |
|---|---|---|
| 1 | Shared contracts + models | Grant/ledger/registry models, agreed audit/provider/ledger interfaces. ORM only |
| 2 | Resolver + Site Health rewrite | Pure fold, account version, cache; **all** Free/Starter reader deletion incl. the conftest fixture |
| 3 | Measurement + cost projection | T1 harness (offline), pricing catalogue, append-on-reprice, `unknown` ≠ zero |
| 4 | Route + output policy | Per-mode caps/timeouts, pulse/benchmark constants, canonical `finish_reason`, reasoning-token capture, Gemini usage normalization |
| 5 | Commercial surface | Catalog, the six endpoints, activation, webhooks, reconciliation CLI |
| 6 | Enforcement + funded admission | Occupancy, rolling rate, ledger integration, admission control |
| 7 | Capacity + credentials | T4 pacing/semaphores/Postgres token bucket, T11 BYOK vs funded, SSE resumability |
| 8 | Schema sync + gates | **One integrator** rewrites `0001_initial`, validates upgrade/downgrade ordering, final sweep |

Commit 8 is deliberately last and single-owner: both halves change
`models/audit.py`, `core/config/audits.py`, `domain/audits/planner.py` and
`test_audit_worker.py`, and `consumable_ledger` depends on both halves' final
shape. Two agents editing the baseline in parallel would clobber each other.

**Fails closed, deliberately:** every unset per-search fee (blocks that route on
the funded path), OpenAI/Google expected costs, prompt-count-per-audit, and the
four §13 numbers. Unresolved entitlement grants nothing and alerts.

**Complexity ratchet.** `check_complexity.py` caps new functions at CC 15 and
freezes existing budgets — and the functions this work touches are already at
their ceilings: `create_audit` **23**, `_run_provider_call` **17**,
`apply_subscription_state` **15**, `replace_monitored_set` **28**. None can grow,
so the plan specifies decomposition (orchestrate precomputed decisions rather
than add branches) and runs the ratchet after **every** commit.

**Verify per commit:** `uv run pytest <focused> -q`, `uv run ruff check .`,
`python -m scripts.check_complexity`; plus on commit 8
`uv run alembic upgrade head` then `uv run alembic check` on a disposable DB.

## 5. PR2 — frontend

Five tasks, gated on merged PR1: contracts + selectors → pricing island →
landing → in-app usage/providers/runs → coming-soon providers.

The **hard sequencing rule**: PR1's merged DTOs are the sole authority. No zod
field is ever made optional to straddle two possible shapes — `strictValidate`
throws on drift, which is the point.

Structural decisions worth surfacing:

- `pricing/page.tsx` is a **sync server component** today and its test renders it
  directly, but the catalog is now a network read. Resolved as a client island so
  the page stays sync and the existing test survives.
- The price tween **reuses the existing GSAP `AnimatedNumber` pattern** from
  `product-window.tsx` (`gsap.to` + `onUpdate` setState with a `reduceMotion`
  early return) rather than adding a second animation primitive.
- `?byok=1` uses `window.history.replaceState`, copying
  `use-visibility-dashboard.ts` — deliberately not `router.replace`, which causes
  an RSC round-trip stutter.
- No `role="switch"` primitive exists; a new small one follows
  `segmented-control.tsx`'s accessibility conventions.
- `test/setup.ts` stubs `matchMedia` to always `matches:false`, so the
  reduced-motion test must override it explicitly or it silently passes.
- Per-file **line budgets** are enforced by `check-frontend-architecture.mjs`
  (`marketing-motion.css` 300, `marketing-theme.css` 400). Owners get **split**,
  never raised.

**Verify:** `pnpm test -- <file>`, `pnpm build`, `pnpm lint`, `pnpm check:policy`
(pnpm only).

## 6. Deferred to PR3

Written up in `docs/plans/v8-pending-features.md` (new file, committed with PR1),
in your priority order: **prompt scheduling first**, then cron wiring, trial
checkout + abuse controls, the coming-soon adapters, funded catalog completion,
and the measured execution policy. Each item records the specific dependency
that unblocks it, and nothing is weakened on the way out.

One flow-through: T5's batch lane ships **dormant** in PR1 (flag-off, test-only,
no deployment invocation) because its only production consumer is the PR3
dispatcher. It is not presented as a usable PR1 execution lane.

## 7. Two things I want to flag before you approve

**Editing `0001_initial` in place contradicts `Agents.md`**, which calls it "the
frozen explicit production baseline… never edit it; schema changes require
additive, reviewed revision files." You chose this deliberately on greenfield
grounds and I've planned for it — one integrator, `alembic check` green,
upgrade/downgrade exact inverses. Flagging it because a reviewer will cite that
rule, and if anyone else has a database from this baseline, this is not
recoverable for them.

**PR1 is genuinely large** — ~120–140 files spanning cost, pricing, entitlements,
credentials and enforcement, because you asked for one backend PR. The 8 commits
make it reviewable in sequence, but it is one merge event. If you'd rather split
at the natural seam, commits 1–4 (cost/latency/measurement) and 5–8
(entitlements/commercial) are independently coherent. Say the word and I'll split
it; otherwise I proceed as one PR.

---

## Approve to proceed

On approval I'll build PR1 across the 8 commits, run focused tests + ruff +
complexity + alembic per commit, then run simplify/review/testing passes before
opening it. PR2 follows once PR1's DTOs are merged and final.
