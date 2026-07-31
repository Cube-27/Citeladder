# Context brief for v8 plan drafting (verified against HEAD f049823)

Repo: /code/abhij1306/Searchify (branch main). Frozen source plan:
docs/plans/v8-cost-latency-and-tier-pricing.md (READ IT FULLY — it is the frozen spec;
do not re-litigate its decisions, only make it executable).

## User decisions already made (binding)
1. DELIVERY: exactly TWO PRs. PR1 = backend (T1-T12, T16). PR2 = frontend (T13-T15).
2. NO LIVE PROVIDER KEYS. T1 harness is committed as a runnable script + recorded-fixture
   tests, but is NOT run against real providers. Anthropic numbers from plan section 2.1/11
   become config defaults. OpenAI/Google/per-search-fee values stay explicitly UNSET and
   FAIL CLOSED on the funded path (plan 8.1). Never fabricate a measured number.
3. SCHEMA: replace outright by EDITING migrations/versions/0001_initial.py in place
   (user override of the Agents.md "never edit 0001_initial" rule — greenfield, no data
   retention). No 0002 revision. `uv run alembic upgrade head` and `uv run alembic check`
   must both be green on a disposable DB. Delete AccountEntitlement + CapabilityProfile
   and the free/paid vocabulary entirely.

## Verified current state (do not re-derive; trust unless you find it wrong)

### Cost / latency (Slice 1)
- core/config/costs.py is 9 lines: only EXECUTION_COST_PROJECTION_VERSION="provider-usage-v1"
  and MICRO_USD_PER_USD. No pricing catalogue at all.
- core/config/provider_catalog.py: ACTIVE_TRANSPORTS frozenset{openai,anthropic,google};
  APPROVED_ROUTES flat map chatgpt->openai:gpt-5.4, claude->anthropic:claude-sonnet-4-6,
  gemini->google:gemini-flash-latest. max_output_tokens=4096 at line 154 (single global).
  request_timeout_seconds=60.0, test_timeout_seconds=20.0, anthropic_max_uses=3.
  NO mode awareness, NO reasoning_effort anywhere in the repo.
- models/audit.py: ExecutionCostProjection (line ~433) has input_tokens/output_tokens/
  total_tokens/provider_reported_cost_microusd/projection_version. NO cached-input,
  reasoning, or search-charge fields. Audit.benchmark_mode is a bare String(32) default ""
  with NO pulse/benchmark constants anywhere. Audit.configuration is JSONB, free-form.
  AuditTask.max_attempts Integer default 5 already exists. ProviderAttempt is append-only.
- domain/audits/cost_projection.py build_execution_cost_projection(): degrades missing/
  invalid usage to ZERO via _non_negative_int/_cost_microusd. Plan requires `unknown`.
  All three parsers hardcode provider_cost_usd=0.0.
- Parsers normalize only total_input_tokens/total_output_tokens/total_tokens
  (+ web_search_requests on anthropic). OpenAI DROPS reasoning items
  (_DROP_ITEM_TYPES={"reasoning"}) so reasoning_tokens are not captured. Gemini passes
  usage through raw, unnormalized.
- There is NO canonical finish_reason. Only anthropic_parser puts raw stop_reason into
  provider_metadata. OpenAI/Gemini only carry "status".
- workers/audit_worker.py (1164 lines) ALREADY has concurrency: AuditSettings.worker_concurrency=10,
  run_pipelined() with independent per-slot claim loops, _call_with_retries, max_call_seconds=90,
  lease/heartbeat. pace_provider_request() is an IN-MEMORY per-transport asyncio.Lock gated on
  min_request_interval_seconds=0.0 (off) — NOT cross-process. _warn_if_pool_undersized() only
  WARNS (plan wants a startup assert). NO per-(transport,connection) semaphore, NO funded/BYOK
  pool split, NO Postgres token bucket.
- orchestration/postgres_task_queue.py: generic PostgresTaskQueue[T] with PostgresQueueSpec[T],
  FOR UPDATE SKIP LOCKED, per-workspace round-robin fairness via QueueWorkspaceTurn,
  release_expired_detailed() sweeper. Keep as-is.
- DB pool: core/config/__init__.py db_pool_size=4, db_max_overflow=2 (capacity 6).
- NO harness script exists (backend/scripts/ has only backfill_billing.py, check_complexity.py,
  complexity_baseline.json, provision_razorpay_plans.py, set_site_health_entitlement.py).
  The section 2.1 Anthropic numbers have NO committed artifact.
- NO AuditSchedule / scheduling of any kind exists.
- Tests: tests/unit/test_cost_projection.py (6 lines), tests/unit/test_answer_engine_adapters.py
  (765), tests/component/test_audit_worker.py (845), tests/component/test_audit_queue.py (242).

### Billing / entitlements (Slices 2-3)
- models/billing.py: BillingAccount(owner_user_id unique), WorkspaceBillingLink(workspace_id
  unique), BillingCustomer, BillingSubscription(tier_key, provider_state_version, is_current
  + partial unique index uq_billing_subscription_one_current), AccountEntitlement
  (billing_account_id unique, tier_key, capability_revision — MUTATED IN PLACE, must be
  DELETED), BillingCheckoutAttempt(idempotency via uq per account+key — precedent for
  PendingActivation), BillingWebhookEvent(unique provider+external_event_id — the ONLY
  idempotency mechanism today).
- NONE of AccountGrant / ConsumableLedger / GrantRevocation / IdempotencyRecord /
  PendingActivation exist.
- core/config/billing.py (272 lines): TIER_FREE/TIER_PAID, CADENCE_MONTHLY only,
  CapabilityProfile dataclass + CAPABILITY_PROFILES (2 entries: free/paid) with only
  audit_web_search/audit_scheduling/site_health_capability, CATALOG_ENTRIES (3 presentational
  entries), quote_for_country() (IN->INR+18% GST else fixed USD), BillingSettings with
  paid_monthly_usd_minor=4900, razorpay creds, past_due_grace_days=3, checkout_expiry_minutes=60,
  reconciliation_list_count/lookback. RAZORPAY_EVENT_TYPES + RAZORPAY_STATUS_MAP live here.
- domain/entitlements/service.py (119 lines): resolve_workspace_entitlement joins
  AccountEntitlement via WorkspaceBillingLink, FAILS OPEN to TIER_FREE when no row.
  expire_account_entitlement_if_needed downgrades paid->free on grace/paid_through expiry.
  synchronize_sponsored_workspaces projects tier into the SEPARATE site-health entitlement
  subsystem (domain/site_health/entitlements) — that projection must be preserved/rewired.
- domain/billing/service.py (366 lines): catalog(), owned_account(), billing_summary(),
  update_country() (locks country once subscribed), create_checkout() (commits the attempt
  row BEFORE calling the provider — reuse this pattern for PendingActivation),
  apply_subscription_state() (the single lifecycle projector, stale-guards on
  provider_state_version — this is where subscription_lifecycle_version should be bumped),
  cancel_current_subscription(). webhooks.py: razorpay HMAC verify + on_conflict_do_nothing
  dedupe.
- connectors/billing/: base.py Protocol BillingProvider{create_subscription, fetch_subscription,
  cancel_subscription}; factory returns hardcoded RazorpayBillingProvider. Reuse as the rail;
  it needs new methods for add-on subscriptions and one-time top-up payments.
- api/billing.py routes today: GET /billing/catalog (public), GET /billing/me,
  PATCH /billing/profile, POST /billing/checkout (Idempotency-Key header 16-255),
  POST /billing/cancel, POST /billing/manage, GET /workspaces/{id}/entitlements,
  POST /billing/webhooks/razorpay. NONE of the six section 5.3 endpoints exist in the
  required shape; /billing/usage, /billing/addons, /billing/topups do not exist at all.
- api/usage_limits.py is NOT a router: single helper enforce_workspace_request(...) ->
  domain/abuse/service.enforce_and_commit -> 429. Callers pass flat abuse_settings constants.
- Enforcement today: domain/audits/planner.py:298 reserve_workspace_capacity with
  abuse_settings.active_audits_per_workspace / audit_tasks_per_workspace_daily (flat, not
  tier-derived) — this is where manual_runs_per_day belongs. enforce_workspace_request called
  from api/projects.py:432, prompts.py:304,377, products.py:246, provider_connections.py:148,
  brand_suggestions.py:113,158,205, site_health.py:159. Site Health monitored_url_limit
  (free=10/starter=50 in core/config/site_health.py) enforced via lock_entitlement() +
  COUNT in domain/site_health/{selection,planner}.py — this is the existing occupancy
  precedent to generalize. NO project_slots/prompt_slots cap exists anywhere.
  audit_web_search/audit_scheduling flags are returned by the API but read by NO call site.
- ProviderConnection (models/provider.py:25) has NO credential_source column.
- Tests: tests/unit/test_billing.py (315), tests/component/test_billing_api.py (277),
  tests/component/test_abuse_controls.py (225). No test_entitlements.py.
- No trial anything. SUBSCRIPTION_TRIALING constant exists but is dead (unmapped).

### Frontend (PR2)
- pnpm@11.9.0 ONLY. next 16.2.11, react 19.2.8, @tanstack/react-query ^5, zod ^4, motion ^12,
  gsap ^3.15 + @gsap/react, vitest ^4, msw ^2, Playwright, tailwind ^4.
- Scripts: dev/build/start/lint/format/test/test:watch/test:coverage/test:e2e/test:visual/
  check:policy (check-token-escapes, check-frontend-architecture, check-design-tokens,
  check-elevation, check-ads-scale). check-frontend-architecture.mjs enforces PER-FILE LINE
  BUDGETS — app/(marketing)/marketing-motion.css maxLines 300, marketing-theme.css 400,
  globals.css 700, ds-tokens.css 400, components/ui/theme-toggle.tsx 120 etc. Adding CSS may
  blow a budget; split the owner instead of raising it.
- API contract layer (4 layers, follow exactly): lib/api/client.ts (apiClient, same-origin
  API_BASE_URL='/api/v1' from lib/config/operational.ts, credentials:include, stamps
  X-Request-ID/Idempotency-Key/X-Workspace-Id) -> lib/api/schemas.ts (one z.strictObject per
  response + strictValidate<T>(schema,data,context) which THROWS on drift) ->
  lib/api/<domain>.ts (billingApi.catalog/entitlement/... each strictValidate'd) ->
  lib/api/query-keys/<domain>.ts (billingKeys) re-exported via lib/api/query-keys.ts ->
  useQuery in components, or a context provider (lib/billing/entitlement-context.tsx
  EntitlementProvider/useEntitlement with canStartPaidWork, fails closed while loading).
  Current billingCatalogPlanSchema.tier_key is z.enum(['free','paid','enterprise']) and
  workspaceEntitlementSchema.tier_key z.enum(['free','paid']) — both must be REPLACED.
- lib/marketing-content/pricing.ts: PricingTableRow{dimension,free,paid,enterprise},
  PricingTier{key,name,price,cadence,blurb,cta,features,highlighted,primaryCta},
  PRICING_NOTE, PRICING_TIERS (3 tiers: free $0 / paid $49 / enterprise Custom),
  PRICING_TABLE_ROWS (8 rows). Consumed ONLY by components/marketing/pages/pricing.tsx and
  asserted verbatim by app/(marketing)/pricing/page.test.tsx.
- app/(marketing)/pricing/page.tsx is a SYNC server component (must stay sync so the page test
  can render it directly) rendering PageHero+TrustStrip+PricingTiers+PricingTable+PricingCta
  from components/marketing/pages/pricing.tsx. TierCard exposes data-tier/data-price/
  data-highlighted test hooks. NO toggle exists.
- MOTION: components/marketing/motion-provider.tsx = MarketingMotionProvider wrapping
  <LazyMotion features={domAnimation} strict> mounted in app/(marketing)/layout.tsx.
  Three coexisting mechanisms: (a) motion/react m.* + AnimatePresence + useReducedMotion()
  (product-window.tsx, hero-atmosphere.tsx); (b) GSAP via lib/hooks/use-gsap-reveal.ts +
  components/marketing/primitives/reveal.tsx (Reveal/StaggerGroup/StaggerItem) AND the
  AnimatedNumber count-up inside components/marketing/scenes/product-window.tsx
  (gsap.to on a plain object + onUpdate setState, guarded by `if (isNaN(target)||reduceMotion)
  { setDisplayValue(value); return; }`) — THIS IS THE EXISTING NUMBER-TWEEN PRECEDENT the
  price tween must reuse (invariant 2, no second animation primitive);
  (c) app/(marketing)/marketing-motion.css keyframes + the canonical
  @media (prefers-reduced-motion: reduce) blanket rule scoped to .mkt-root.
- NO role="switch" component exists anywhere. Closest primitives: components/ui/
  segmented-control.tsx (role=radiogroup/radio, roving tabindex, arrow cycling) and
  components/ui/theme-toggle.tsx (plain Button, no aria-checked). A new accessible switch
  is needed.
- URL mirroring precedent: lib/visibility/use-visibility-dashboard.ts useVisibilityFilters()
  reads usePathname()/useSearchParams(), seeds useState from ?tab=, re-syncs via useEffect,
  and writes with window.history.replaceState(null,'',`${pathname}?${params}`) —
  DELIBERATELY NOT router.replace (RSC round-trip stutter). Copy this for ?byok=1.
  ARIA tablist precedent: components/visibility/visibility-tabs.tsx.
- rotating-engine-logos.tsx: pure-CSS 3D flip (mkt-logo-turn keyframes), role="img" with one
  combined aria-label naming SIX providers incl. Copilot unconditionally + /brand/grok.webp.
  This is the marketing gate violation in plan 6.1 — must be gated/labelled coming-soon.
- Provider settings: components/settings/provider-settings.tsx + components/providers/
  engine-card.tsx + lib/providers/catalog.ts (ENGINE_ORDER=['chatgpt','gemini','claude'],
  ENGINE_LABELS, TRANSPORT_LABELS, buildEngineCards) + lib/providers/use-engine-connection.ts
  (ConnectionTestState = {status:'ok'|'failed'}|null). ONLY configured/not-configured + ok/failed
  exist — the plan's claim that connected|missing|failed|unavailable "already renders" is
  WRONG; that four-state vocabulary is new work.
- Run view: app/(app)/runs/[runId]/page.tsx is POLLING-ONLY (POLL_INTERVAL_MS=3000, useQuery
  refetchInterval gated by shouldPollAudit). components/runs/executions-table.tsx re-renders
  the whole polled list. No SSE for runs. The only events-hook precedent is
  lib/site-health/use-crawl-events.ts.
- Existing billing UI: components/settings/billing-settings.tsx (plan card, country input,
  Razorpay checkout mutation, ?checkout=return polling via BILLING_CONFIRM_POLL_MS/
  BILLING_CONFIRM_MAX_POLLS), components/settings/grant-model.ts, settings-screen.tsx.
  NO trial banner, NO usage meter, NO upgrade banner component.
- Frontend config owner: lib/config/operational.ts (API_BASE_URL, poll cadences, limits);
  lib/config/env.ts (public env getters); lib/config/site-health.ts is the precedent for a
  per-domain config submodule. Invariant 1: no inline literals in components.
- Tests: vitest.config.ts jsdom + globals + setupFiles ./test/setup.ts, include
  **/*.{test,spec}.{ts,tsx} CO-LOCATED with source. test/setup.ts polyfills AbortController
  and stubs window.matchMedia to ALWAYS matches:false (so tests default to no-reduced-motion —
  a reduced-motion test must override matchMedia). test/render.tsx renderWithProviders.
  test/msw-server.ts MSW v2 setupServer. NO jest-axe/axe-core wired in — a11y is asserted via
  Testing Library role/name queries.

## Guardrails every plan section must respect
- Agents.md: grep before you add (duplication is a review failure); put code in the OWNING
  subsystem; minimal scoped change; run FOCUSED verify commands, not the whole suite.
- Invariant 1 zero-tolerance: every threshold/model id/timeout/limit/price in
  backend/app/core/config/* or frontend lib/config/*|process.env.
- Invariant 3: raw artifacts + executions immutable, single-writer. Repricing APPENDS a new
  projection row.
- Invariant 5: require_workspace_member on every project-scoped read/write; never scope by
  user_id. Billing-owner auth for billing mutations.
- Invariant 6: BYOK keys Fernet-encrypted, never in a DTO/log/snapshot/artifact/export;
  brand+competitor list never sent to a provider.
- Invariants 4/7: provenance (raw_response_artifact_id + analyzer/formula/pricing version) on
  every derived row; reports are projections, ZERO provider calls from any read path.
- Invariant 8: queue claim commits BEFORE any network I/O.
- Invariant 9: determinism — Audit.configuration frozen at creation, never re-read from live
  config; cooperative cancellation only, no mid-call kills.
- Invariant 12: browser hits /api/* relative (same-origin rewrite), never a cross-origin
  backend URL.
- backend/scripts/check_complexity.py is a RATCHET: any NEW or RENAMED function must have
  cyclomatic complexity <= NEW_FUNCTION_CC_CEILING = 15, and no existing function may exceed
  its recorded per-function budget in complexity_baseline.json. Plan for `python -m
  scripts.check_complexity` and note that --update requires a reviewed diff.
- Backend verify: `uv run pytest <focused files> -q`, `uv run ruff check .`,
  `uv run alembic upgrade head`, `uv run alembic check` (disposable DB; tests auto-create/drop
  searchify_tests_<runid> from the repo .env DATABASE_URL — no Docker, no env vars).
- Frontend verify: `pnpm test -- <file>`, `pnpm build`, `pnpm lint`, `pnpm check:policy`.
