# Searchify — Verified Backlog

> Single source of truth for open issues. Every entry below was re-verified against the
> current code on the working branch (2026-08-02) and confirmed still valid; entries whose
> premise no longer holds were removed. To clear these: verify each against current code,
> keep changes minimal and scoped to the owning subsystem, add/adjust tests in the existing
> framework, and run the focused verify commands from `AGENTS.md` before reporting done.

## How to work these

- Fix only entries that are still valid; skip (don't re-add) anything that no longer
  reproduces.
- Put code in the owning subsystem (`backend/app/...` / `frontend/...`), never hardcode
  config inline (invariant 1), and respect the always-on rules in `docs/invariants.md`.
- Backend: `uv run pytest tests/unit/test_<area>.py -q && uv run ruff check .`
- Frontend: `pnpm test -- <file> && pnpm lint`

---

## Priority 1 — High (user-facing breakage / hard failures)

### 1. Onboarding fails closed for un-crawlable URLs (no model-knowledge fallback)

- **Area:** `backend/app/domain/projects` + `backend/app/domain/prompts` + `backend/app/api`
- **Files:**
  - `backend/app/domain/projects/brand_profile_suggestions.py:184-193`
  - `backend/app/domain/projects/suggestions.py:335-349` (`_ground_brand_context`)
  - `backend/app/domain/prompts/topical_binding.py:187` (`build_project_vocabulary`, fail-CLOSED at :19-20)
  - `backend/app/domain/audits/planner.py:548-565` (`_validate_prompt_bindings` → 422)
  - `backend/app/api/brand_suggestions.py:95-105`, `backend/app/api/projects.py:268-278`
- **Verified state:** CONFIRMED REGRESSION. Site-health `SiteCrawl` data gates **nothing** in
  audits or content generation — both degrade gracefully. The hard fail lives in the **brand
  evidence layer** introduced to stop fabricated grounding:
  - `suggest_brand_profile` (`brand_profile_suggestions.py:184-193`) is **unconditionally**
    fail-closed: `if not evidence.is_sufficient: raise BrandEvidenceUnavailableError` → HTTP
    **422** (`projects.py:268-278`). There is **no curated-field escape hatch** here — unlike
    the sibling suggestion path — so even a user who typed a description cannot get a profile
    draft.
  - `_ground_brand_context` (`suggestions.py:335-349`) has the escape hatch
    (`_has_curated_context`, :306-320) but **onboarding sends only name + URL + locale**, so
    for an un-crawlable URL it always hard-fails → **422 `brand_evidence_required`**, zero
    suggestions returned (`brand_suggestions.py:121-122`).
  - Because onboarding then produces no BrandProfile/topics, the audit-creation topical gate
    (`planner.py:548-565`) sees an empty/brand-name-only vocabulary and fail-closes with 422
    `binding_vocabulary_empty` / `prompt_off_topic` — so visibility measurement itself can end
    up unreachable downstream of what is really a brand-grounding failure.
  - Evidence crawling is fail-open internally (`collect_brand_evidence` never raises; robots is
    fail-open by design), and SecureFetcher does no JS rendering, so JS-rendered sites are
    classified un-crawlable by design. NOTE: a "use model training knowledge" fallback was
    removed deliberately as an anti-fabrication policy — reintroducing it must be a conscious
    product/security decision, not an accidental revert.
- **Fix direction:** Restore graceful degradation for onboarding when a URL is un-crawlable:
  (a) give `suggest_brand_profile` the same curated-field escape hatch the other suggestions
  have so a typed description unblocks the 422; (b) do **not** let an empty BrandProfile from a
  failed crawl make audit creation fail closed — either relax `binding_vocabulary_empty` for
  genuinely un-crawlable projects or surface it as a setup-complete nudge rather than a hard
  422. Keep the anti-fabrication gate for truly ungrounded (name-only, no description, no
  readable site) requests. Add unit tests covering: un-crawlable URL + typed description →
  suggestions/profile proceed; un-crawlable URL + no description → still 422.

### 2. Products evidence deep-links point at a deleted route (404)

- **Area:** `frontend/components/products` + `frontend/app/(app)/runs`
- **Files:**
  - `frontend/components/products/product-evidence-table.tsx:315`
  - `frontend/app/(app)/runs/[runId]/page.tsx:50`
  - stale comment `frontend/lib/api/schemas.ts:1968`
- **Verified state:** CONFIRMED. `product-evidence-table.tsx:315` links to
  `` `/runs/${item.audit_id}/executions/${item.task_id}` ``, but
  `app/(app)/runs/[runId]/executions/[executionId]/page.tsx` was deleted in favor of the
  in-run drawer — these "Open" links 404. The run page reads `?execution=<id>` only once via
  `useState(() => searchParams.get('execution'))`, so it doesn't honor a post-mount deep link
  either. `schemas.ts:1968` still comments "Execution id — links to
  `/runs/[runId]/executions/[executionId]`".
- **Fix direction:** Point products evidence "Open" at `/runs/{audit_id}?execution={task_id}`
  AND make the run page honor the param reactively (a `useEffect`/derived state keyed on
  `searchParams.get('execution')`, not a one-shot initializer) so deep links work after mount.
  Update the `schemas.ts:1968` comment. Add a run-detail test for the `?execution=` deep-link
  path.

### 3. Execution evidence e2e spec asserts the removed navigation flow

- **Area:** `frontend/e2e`
- **File:** `frontend/e2e/runs.spec.ts:160-166`
- **Verified state:** CONFIRMED. The spec still does
  `page.getByRole('link', { name: 'Evidence' })` and asserts the URL becomes
  `/runs/{id}/executions/{execId}$`, but the Evidence action is now a `<button>` that opens an
  in-page drawer and never navigates. The spec will fail; its header comment also still
  describes the deleted "open execution" page flow.
- **Fix direction:** Target the Evidence **button**, drop the URL-navigation assertion, and
  assert the evidence **dialog/drawer** is visible (keep the answer-text and citation checks,
  scoped to the drawer). Update the spec's stale header comment.

---

## Priority 2 — Backend correctness / hardening

### 4. `measurement_policy_from_configuration` raises instead of falling back

- **File:** `backend/app/core/config/audits.py:529-549`
- **Verified state:** CONFIRMED. Falls back to mode defaults only when the frozen block is
  missing/falsy; a present-but-incomplete frozen block still does direct key indexing
  (`frozen["retrieval_enabled"]` etc., :543-548) → `KeyError`. The pre-T3 path passes
  `str(configuration.get("measurement_mode") or BENCHMARK)` straight into
  `measurement_policy_for_mode`, which raises `ValueError` for an unknown mode instead of
  defaulting to benchmark.
- **Fix direction:** Treat an incomplete/incompatible frozen block as "no frozen block" →
  return mode defaults; default unknown `measurement_mode` to benchmark. Preserve the
  complete-frozen-block path. Add tests: incomplete block → defaults; unknown mode → benchmark;
  complete block → unchanged round-trip.

### 5. `_inject_frozen_provenance` omits audit-level fallback context

- **File:** `backend/app/domain/audits/schemas.py:235-252`
- **Verified state:** CONFIRMED. Calls `execution_frozen_provenance(request_snapshot=...,
  route_snapshot=...)` only; does **not** pass `audit_measurement_mode`/`audit_configuration`,
  even though `execution_frozen_provenance` (:150-169) accepts those fallback kwargs. Missing
  snapshot fields resolve to `""`/`None` with no audit-level fallback.
- **Fix direction:** Pass audit-level fallback context from **already-loaded** attributes on
  `data` (`audit_measurement_mode`, `audit_configuration`) — never any relationship access that
  could lazy-load under async sessions. Add a test for a task with a partial snapshot resolving
  from the audit-level fallback.

### 6. `frozen_retrieval_enabled` short-circuits on an explicit `None`

- **File:** `backend/app/domain/audits/schemas.py:104-109`
- **Verified state:** CONFIRMED. Returns `bool(snapshot["retrieval_enabled"])` as soon as the
  key exists; an explicit `retrieval_enabled: None` short-circuits to `False` instead of being
  treated as unrecorded — it should keep checking later snapshots and ultimately return `None`
  when no recorded value exists.
- **Fix direction:** Only return a boolean for a non-null `retrieval_enabled`; treat explicit
  `None` as unrecorded and continue; return `None` when nothing is recorded. Add a test with a
  first snapshot `None`, later snapshot `True` → `True`; all `None` → `None`.

### 7. `_AuditEventEnvelope.occurred_at` accepts only one inbound name

- **File:** `backend/app/domain/audits/schemas.py:431`
- **Verified state:** CONFIRMED. `occurred_at = Field(validation_alias="created_at")` — a
  single alias, so input under `occurred_at` is rejected while `created_at` is accepted and
  only `occurred_at` is emitted.
- **Fix direction:** Use `AliasChoices("created_at", "occurred_at")` for validation while
  keeping serialization emitting `occurred_at`. Add a test feeding both names.

### 8. Sort-key duplication / tie-breaker gaps in attribution

- **File:** `backend/app/domain/attribution/snapshot.py`
- **Verified state:** CONFIRMED (two related defects):
  - A1 `build_a1_projection` `by_ai_source.sort` (:342-344) still uses a duplicated inline
    lambda instead of the shared `_source_revenue_sort_key` helper (:158-162) that A2 uses.
  - A2 `by_product.sort` (:556) uses `key=lambda row: (-row["revenue"], row["sku"])` with **no**
    `ai_source` tie-breaker, while `by_ai_source` (via `_source_revenue_sort_key`) includes one
    — a total-ordering asymmetry between the two A2 lists.
- **Fix direction:** Route A1's source-group sort through `_source_revenue_sort_key` (drop the
  inline lambda). Add `ai_source` as the final tie-breaker to A2 `by_product.sort` so both A2
  lists share total ordering (keep descending revenue / sku order). Add determinism tests.

### 9. Missing unit tests for the measurement-policy config helpers

- **File:** `backend/tests/unit/test_measurement_policy.py:110+`
- **Verified state:** CONFIRMED absent. No tests for `frozen_policy_configuration` round-trip
  through `measurement_policy_from_configuration`, frozen-vs-live-mutation isolation,
  no-frozen-block mode-default fallback, or `max_run_seconds_from_configuration` precedence.
- **Fix direction:** Add tests: (a) frozen block round-trips unchanged; (b) mutating live
  settings after freezing doesn't change the frozen policy; (c) no frozen block → mode
  defaults; (d) `max_run_seconds_from_configuration` prefers a configured value else
  `audit_settings.max_run_seconds`.

---

## Priority 3 — Docs (accuracy; no runtime impact)

### 10. audits.py constants header block unsplit

- **File:** `backend/app/core/config/audits.py:96-129`
- **Verified state:** CONFIRMED. The `# --- Measurement modes ---` header (:96) sits above the
  audit-trigger vocabulary; the measurement-mode constants (:125-129) have no header of their
  own.
- **Fix direction:** Rename the header above the trigger vocabulary to identify triggers; add a
  separate "Measurement modes" header immediately before the mode constants. Keep each header's
  comments aligned with its constants.

### 11. backend-architecture.md blanket "workspace-scoped" claim vs billing exceptions

- **File:** `docs/backend-architecture.md:68` (+ billing row :75)
- **Verified state:** CONFIRMED. Line 68 states "All routes are under `/api/v1` and
  workspace-scoped" without flagging billing's exceptions; billing.py confirms
  `GET /billing/catalog` is public (no auth, no workspace) and the Razorpay webhook is
  HMAC-only (no auth/workspace). The billing row mentions these parenthetically but never as
  explicit exceptions to the §3 intro.
- **Fix direction:** Amend the billing API row and/or the §3 intro to explicitly note the
  route-scope exceptions (public `GET /billing/catalog`, HMAC-signed Razorpay webhook) while
  keeping the workspace-scoped description for authenticated billing routes. Cross-check
  against `backend/app/api/billing.py`.

### 12. backend-architecture.md TaskQueue protocol omits `mark_running()`

- **File:** `docs/backend-architecture.md:280-289`
- **Verified state:** CONFIRMED. Documented protocol list (:280-281) omits `mark_running()`,
  though the real `TaskQueue` protocol (`orchestration/task_queue.py:52`) and
  `PostgresTaskQueue` (:238) define it and five workers call it. Mentioned only in passing at
  :291.
- **Fix direction:** Add `mark_running()` to the documented protocol and to the
  PostgresTaskQueue implementation checklist.

### 13. backend-architecture.md Deploy section still describes a shared env

- **File:** `docs/backend-architecture.md:55-61`
- **Verified state:** CONFIRMED. Still says "Each worker is a separate Railway service **sharing
  the same env**" and only annotates which keys each worker uses; no least-privilege /
  per-service allowlist statement.
- **Fix direction:** Replace the shared-env wording with least-privilege, per-service allowlists
  (each worker gets only the config/secrets its command needs — e.g., `MISTRAL_API_KEY` only for
  content_worker; OAuth/integration secrets only for integration services; referral settings
  only where used).

### 14. Deleted-billing-route list out of sync between the two architecture docs

- **Files:** `docs/frontend-architecture.md:108` vs `docs/backend-architecture.md:75`
- **Verified state:** CONFIRMED. backend-architecture.md's deleted-legacy list omits
  `/billing/me` (and `/workspaces/{id}/entitlements`) that frontend-architecture.md lists as
  deleted/404.
- **Fix direction:** Add `/billing/me` (and reconcile `entitlements`) to
  backend-architecture.md's deleted list so both docs agree.

### 15. frontend-architecture.md over-claims request-side type strictness

- **File:** `docs/frontend-architecture.md:205-207`
- **Verified state:** CONFIRMED. Passage claims "a request-side drift fails at compile time"
  because outgoing payloads are built from typed TS DTOs; local DTOs are not generated/checked
  against the backend, so they cannot detect backend request-side drift — the contract-guard
  claim only holds for parsed responses.
- **Fix direction:** Reword so request DTOs are described as call-site value checks, not backend
  contract validation; keep the schema-drift-guard claim scoped to response fields.

### 16. products deep-link design traceability (see #2)

- Covered by item 2 — ensure the fix also updates the stale `frontend/lib/api/schemas.ts:1968`
  comment. (Folded into #2; no separate fix.)

---

## Notes for the next session

- **Issue #1 is the only behavioral regression** and the highest-impact fix; it surfaces to the
  user as "audit/onboarding returns no data," but the root cause is brand-evidence grounding,
  not a site-health crawl gate. Decide deliberately whether to reintroduce a model-knowledge
  fallback (product/security trade-off) or to keep hard-refusal only for truly ungrounded input.
- Items 2 and 3 are tied to the in-progress drawer refactor on this branch; fix them together.
- Removed as invalid/duplicates during this verification pass: the A2
  `by_ai_source`-via-`_source_revenue_sort_key` item (already fixed on this branch; superseded
  by #8's by_product tie-breaker item) and the backend-architecture "reconcile all verticals"
  scope item (#11-class entry that verified consistent — delivery table, ownership, and shipped
  sections already agree).
