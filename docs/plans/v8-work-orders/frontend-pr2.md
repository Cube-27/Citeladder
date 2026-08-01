# PR2 frontend work order — T13, T14, T15

## Contract lock and execution order

PR2 starts only after PR1 merges. The merged backend DTOs, tier literals, paths, provider provenance and export metadata are the sole authority. Do not merge frontend DTO guesses or make schemas permissive to straddle pre-merge and merged shapes. Before T13 starts, reconcile the exact six billing response/request shapes and audit/provider provenance fields from merged PR1, then encode those exact shapes as `z.strictObject` schemas. The frontend depends on:

1. `GET /api/v1/billing/catalog` — public, region-resolved catalog containing four ordered plans, generic recurring add-ons, generic top-up packs, provider availability/grant metadata, separate `base_price` and cadence-selected `credit_price`, and checkout catalog keys. It must return every display label, feature/comparison value, currency/minor-unit amount, cadence entitlement, availability state/reason, and top-up expiry copy needed to render without component-owned prices or limits. Trial purchase is unavailable in this release.
2. `GET /api/v1/billing/entitlement` — effective account/workspace capability fold, unresolved state, active grant provenance, and subscription lifecycle fields. Reconcile whether this replaces the current `/workspaces/{workspaceId}/entitlements` path; use only the merged PR1 path.
3. `GET /api/v1/billing/usage` — usage rows for `prompt_slots`, `project_slots`, `manual_runs_per_day`, and funded consumables (`benchmark_credits` and/or `pulse_credits`). Merged PR1 owns the exact allowance/remaining nullability; the frontend strict schema and unknown-versus-unlimited rendering must follow that final contract exactly rather than infer semantics from `null`.
4. `POST /api/v1/billing/addons` and `POST /api/v1/billing/topups` carry `Idempotency-Key` and use merged PR1’s activation response. `DELETE /api/v1/billing/addons/{key}` has its own deactivation response and status vocabulary; parse and render it separately, never through the activation state machine. Activation of unavailable provider keys returns backend `provider_unavailable` and never creates a grant.
5. Base-subscription checkout contract — merged PR1 owns the exact request and requires the plan catalog key, BYOK credential selection, `country_code`, and `trial_requested:false` for this release. Funded checkout is unavailable while `credit_price` is `null`. The server resolves amount and external identifiers. Merged PR1 will expose either safe quote identity on the activation response or a separate pre-checkout quote; the frontend test must assert the displayed BYOK `base_price` against whichever final quote contract lands. Never submit an amount, margin, provider-cost value, or external plan id.
6. Run/provider projection contract — audit, execution, execution evidence, Visibility overview, trend points, Visibility evidence, and CSV/Markdown exports carry canonical `measurement_mode: 'pulse' | 'benchmark'`, model identity where the row represents one model, and retrieval state. PR1 partitions trend series by measurement mode, model and retrieval; the frontend must preserve those partitions rather than merely add labels. Aggregates spanning several models do not pretend to have one exact model and render an explicit multi-model label/state from the merged DTO. Public provider catalog and authenticated connection projection are separate contracts as described in Task 1.

Use integer minor units throughout catalog/checkout contracts. Plan keys are locked now to `tier_1 | tier_2 | tier_3 | enterprise`. `base_price` is the available BYOK price. `credit_price` is nullable and remains `null` in this release because funded inputs are intentionally unset; never coerce it to zero or derive/fabricate a funded total. Replace all retired `free`/`paid` and Site Health `free`/`starter` commercial branches outright.

### HEAD assumptions that are wrong and required corrections

- `app/(marketing)/pricing/page.tsx` is a sync server component and its test directly calls `<Page />`; it cannot perform the new network read. Keep it sync and render a catalog-backed client island. The root layout already supplies `QueryProvider`, so this preserves server-rendered hero/chrome, the direct page-test pattern, URL responsiveness, and React Query/API-layer consistency. Trade-off: plan cards render a deterministic loading/error shell until hydration rather than arriving as catalog-filled HTML. Do not use a server-side absolute backend fetch or duplicate server transport/schema logic.
- `components/marketing/pages/pricing.tsx` and `lib/marketing-content/pricing.ts` currently own three static tiers and prices. They must become presentation metadata plus pure catalog selectors; enforceable values come only from the API catalog.
- No switch primitive exists. Add the reusable app-token `components/ui/switch.tsx`; do not hide switch behavior in the pricing page or misuse the radiogroup `SegmentedControl`.
- The frozen doc says Provider Settings already renders `connected | missing | failed | unavailable`; HEAD has only configured/not-configured plus transient `{status:'ok'|'failed'} | null`. Add the four-state view model and safe probe details.
- The frozen doc says the provider catalog already carries availability metadata; HEAD's strict catalog has only transports, engines and routes. Merged PR1 adds public `availability`, `unavailable_reason`, adapter/grant/`issuable`/route metadata plus a separate authenticated connection projection; replace the frontend schema wholesale.
- The run page is currently 3-second polling even though a backend audit SSE endpoint already exists. Use that real stream as an invalidation accelerator, with polling as the reliable fallback; do not invent a new stream endpoint and do not switch to stream-only progress.
- `rotating-engine-logos.tsx` already renders six providers in one `role="img"`, including Copilot and `/brand/grok.webp`. Preserve the six-logo board and combined image semantics, but add a visible coming-soon treatment and change its accessible name to distinguish shipped providers from Grok, Copilot and Perplexity as coming soon. These marks remain by explicit user decision; they must not imply working integrations or link to connection routes.
- `providersApi` defines its probe schema locally with non-strict `z.object` and free-string statuses. Move/replace it with strict shared schemas in `lib/api/schemas.ts`.
- `app/(app)/runs/[runId]/page.tsx` hardcodes `POLL_INTERVAL_MS = 3_000`; move run stream/poll tuning to config.
- Current `auditSchema.benchmark_mode` is a free string and reflects the old vocabulary. Replace it with canonical `measurement_mode: 'pulse' | 'benchmark'` and update every audit/execution/Visibility/evidence/export fixture and consumer.
- Marketing `ProductWindow` contains Perplexity and comparative/high-ROI claims. Preserve the provider language, but qualify Grok, Copilot and Perplexity as coming soon wherever the context could imply current support. Replace unsupported comparative/high-ROI outcomes with evidence-linked, non-comparative illustrative copy.

## Task 1 [after merged PR1] — lock strict billing/provider/run contracts and shared selectors

### Files

Modify:
- `frontend/lib/api/client.ts`
- `frontend/lib/api/schemas.ts`
- `frontend/lib/api/types.ts`
- `frontend/lib/api/billing.ts`
- `frontend/lib/api/providers.ts`
- `frontend/lib/api/runs.ts`
- `frontend/lib/api/query-keys/billing.ts`
- `frontend/lib/api/query-keys.ts`
- `frontend/lib/billing/entitlement-context.tsx`
- `frontend/lib/config/operational.ts`
- `frontend/lib/providers/catalog.ts`
- `frontend/lib/api/site-health.ts`
- `frontend/lib/api/site-health.test.ts`
- `frontend/lib/site-health/use-site-health-screen.ts`
- `frontend/lib/site-health/status.ts`
- `frontend/lib/site-health/selection.ts`
- `frontend/lib/site-health/use-monitored-selection.ts`
- `frontend/components/site-health/status-strip.tsx`
- `frontend/components/site-health/status-strip.test.tsx`
- `frontend/components/site-health/inventory-selection.tsx`
- `frontend/components/site-health/inventory-selection.test.tsx`
- `frontend/components/site-health/inventory-section.tsx`
- `frontend/components/site-health/dashboard-layout.tsx`
- `frontend/components/site-health/site-health-screen.test.tsx`

Create:
- `frontend/lib/billing/catalog.ts`
- `frontend/lib/billing/catalog.test.ts`
- `frontend/lib/config/billing.ts`
- `frontend/lib/config/runs.ts`
- `frontend/lib/api/run-events.ts`
- `frontend/lib/api/run-events.test.ts`

Update tests:
- `frontend/lib/api/billing.test.ts`
- add or extend provider API schema tests beside `frontend/lib/api/providers.ts`

### Concrete changes

- Keep `apiClient` as the JSON transport owner and `API_BASE_URL='/api/v1'`. Add no cross-origin URL. If the stream needs shared headers, export a narrowly scoped same-origin header builder or credential/workspace helper from `client.ts`; `run-events.ts` may use direct `fetch` only because `apiClient` rejects non-JSON bodies, matching `use-crawl-events.ts`.
- Replace `billingPriceSchema`, `billingCatalogPlanSchema`, `billingCatalogSchema`, `billingSummarySchema`, and `workspaceEntitlementSchema` wholesale with exact merged PR1 Pydantic DTOs. Lock plan keys to `z.enum(['tier_1','tier_2','tier_3','enterprise'])`. Add separate strict schemas for catalog entries, usage, grant provenance, activation, and add-on deactivation; do not reuse activation status vocabulary for DELETE. Follow merged allowance/remaining nullability exactly. Trial checkout returns `trial_unavailable`; send `trial_requested:false` and add no trial UI. Do not retain compatibility unions or optional aliases.
- Add `measurementModeSchema = z.enum(['pulse','benchmark'])` and canonical `measurement_mode` plus model/retrieval provenance to `auditSchema`, `executionSchema`, `executionEvidenceSchema`, `visibilitySchema`, `visibilityTrendPointSchema`, and `visibilityExecutionEvidenceSchema` exactly as merged PR1 supplies them. Reuse schema fragments, but model singular-model and multi-model aggregate DTOs honestly: an aggregate may have no singular exact model. Trend schemas and selectors retain backend partitions by `measurement_mode + model + retrieval` and never merge them client-side.
- Expand `logicalEngineSchema`/`transportProviderSchema` only to adapters merged PR1 actually ships. In this release Grok, Perplexity and Copilot remain catalog/provider presentation entries with `availability:'unavailable'`, safe coming-soon reasons, no route, and no transport/adapter enum entry.
- Define separate strict contracts: public `CatalogAvailability = 'available' | 'unavailable'` entries with canonical `unavailable_reason`, adapter-shipped flag, grant key, `issuable`, and route metadata; authenticated workspace `ProviderConnectionState = 'connected' | 'missing' | 'failed' | 'unavailable'` entries with safe probe metadata. Remove the local permissive probe schema from `providers.ts`. Fail closed: a configured key with no successful probe is `missing` with the authenticated projection’s safe “verification required” reason, never `connected`.
- Expand `billingApi` with strict-validated `usage`, `activateAddon`, `deactivateAddon`, and `purchaseTopup`. Base checkout uses merged PR1’s exact request including plan key, BYOK credential selection, `country_code`, and `trial_requested:false`; funded selection is rejected client-side while `credit_price` is `null`. Parse add-on DELETE through its dedicated deactivation schema/statuses. Every POST creates/passes an idempotency key. Add query keys only from merged endpoints; preserve public catalog country resolution.
- In `lib/billing/catalog.ts`, export typed pure selectors used by every surface: `catalogPlanByKey`, `headlinePrice(plan, credentialMode)` returning `base_price` only for available BYOK and an explicit unavailable result when funded `credit_price` is `null`, `checkoutSelection` that refuses unavailable funded selection, `comparisonRows`, `visibleAddons`, `visibleTopups`, and `providerMarketingState`. Currency formatting accepts catalog minor units and contains no price constants.
- `EntitlementProvider` continues returning `entitlement:null` and all capability checks false while loading/error/unresolved. Replace `canStartPaidWork`'s `tier_key === 'paid'` branch with capability/grant checks from the effective entitlement. Expose `hasCapability(key)`; never infer from a tier name.
- Add config modules rather than component literals: `PRICING_BYOK_DEFAULT_ON=true` for this release, `PRICING_PRICE_TWEEN_MS=275`, meter threshold bands (server status first; otherwise warning 0.8 and critical 0.95), billing activation/confirmation poll values, `RUN_ACTIVE_POLL_MS=3_000`, `RUN_STREAM_INVALIDATE_DEBOUNCE_MS=250`, `RUN_STREAM_RECONNECT_BASE_MS=1_000`, and `RUN_STREAM_RECONNECT_MAX_MS=15_000`. Re-export old config names only when needed to avoid unrelated churn.
- In `run-events.ts`, depend on merged PR1’s resumable SSE and published discriminated event envelope. Model the envelope/payload as a strict Zod discriminated union keyed by the backend discriminator, with one strict payload schema per event type. Resume by `Last-Event-ID` only after PR1 reads it and config-owns poll/grace values. Events invalidate audit/execution/Visibility queries; never treat a partial payload as a full DTO.
- Extend `ENGINE_ORDER`, `ENGINE_LABELS`, `TRANSPORT_LABELS`, `EngineCardModel`, and `buildEngineCards` to catalog order/availability. Do not use a static list as authority for capability. `buildEngineCards` includes catalog-listed Grok, Perplexity and Copilot as keyboard-reachable unavailable/coming-soon cards with `route:null`; it never creates a fallback route or key mutation for them.
- Replace the Site Health entitlement strict schema wholesale after merged PR1: remove `siteHealthPlanSchema`, `plan_key`, and `capability_revision`; encode only the neutral access mode, sample/monitored limits, count-disclosure policy and resolver provenance fields that Part B publishes. Update `SiteHealthEntitlement` and every consumer/fixture listed above. Do not patch the old `free|starter` shape.
- Make Site Health fail closed while entitlement is pending, missing or invalid. Remove `useSiteHealthScreen`’s `?? 'free'` fallback; do not resolve a crawl phase or enable selection/sample actions until the neutral entitlement is valid. In `status-strip.tsx`, replace `plan_key === 'free'`, Free/Starter labels and upgrade copy with access-mode/count-disclosure behavior from the new DTO. Update selection/status helpers to branch on neutral capabilities, not commercial plan names.

### Tests

- `frontend/lib/api/billing.test.ts`: relative `/api/v1/...`; base checkout uses merged fields including `country_code` and `trial_requested:false`, sends no amount, and funded checkout is blocked for `credit_price:null`; POSTs carry `Idempotency-Key`; add-on DELETE validates its distinct response/status vocabulary; strict validation rejects drift and retired tier keys; `provider_unavailable` remains an API error.
- Provider API tests: public catalog accepts only `available|unavailable` plus exact `unavailable_reason`, `issuable`, adapter/grant/route metadata; authenticated projection accepts only four connection states and safe probe fields; configured-unprobed maps to `missing`/“verification required”; leaked secrets and unexpected routes fail strict parsing.
- `frontend/lib/billing/catalog.test.ts`: BYOK headline resolves from `base_price`; `credit_price:null` returns funded-unavailable and never zero/fabricated total; plan keys are exactly `tier_1|tier_2|tier_3|enterprise`; arbitrary add-ons/top-ups/comparison rows remain generic; planned providers have no routes and project coming-soon states.
- `frontend/lib/api/run-events.test.ts` [dependent on merged PR1 SSE contract]: parses fragmented frames, validates each discriminated payload variant strictly, resumes from ids through backend-supported `Last-Event-ID`, rejects unknown discriminators/schema drift, and maps events to invalidation without trusting payloads as full DTOs. Do not write or enable the resume assertion against HEAD’s replay-from-`last_id=None` behavior.
- `frontend/lib/billing/entitlement-context.test.tsx` (create if absent): loading, strict-parse error and `entitlement_unresolved` all fail closed; active grants enable only their declared capabilities.
- Site Health API/component tests: old `plan_key`, `capability_revision`, `free` and `starter` fixtures fail strict parsing; merged neutral entitlement parses; pending/error/unresolved entitlement enables no crawl/selection action; sample/selection/count copy derives only from access mode and disclosure fields; no retired upgrade copy remains.

### Verify

From `frontend/`:
- `pnpm test -- lib/api/billing.test.ts`
- `pnpm test -- lib/billing/catalog.test.ts`
- `pnpm test -- lib/api/run-events.test.ts`
- `pnpm test -- lib/billing/entitlement-context.test.tsx`
- provider API focused test path created/updated by the implementation
- `pnpm test -- lib/api/site-health.test.ts`
- `pnpm test -- components/site-health/status-strip.test.tsx`
- `pnpm test -- components/site-health/inventory-selection.test.tsx`
- `pnpm test -- components/site-health/site-health-screen.test.tsx`
- focused `lib/site-health/status.ts`, `selection.ts`, and hook tests changed by the implementation
- `pnpm lint`
- `pnpm check:policy`

## Task 2 [after Task 1, merged PR1 T8] — catalog-driven pricing client island, resumable checkout/add-ons/top-ups, accessible tween

### Files

Modify:
- `frontend/app/(marketing)/pricing/page.tsx`
- `frontend/app/(marketing)/pricing/page.test.tsx`
- `frontend/lib/marketing-content/pricing.ts`
- `frontend/components/marketing/pages/pricing.tsx`
- `frontend/app/(auth)/login/page.tsx`
- `frontend/app/(auth)/login/page.test.tsx`
- `frontend/app/(auth)/register/page.tsx`
- `frontend/app/(auth)/register/page.test.tsx`
- `frontend/lib/auth/use-auth-mutation.ts`
- `frontend/lib/auth/use-auth-mutation.test.tsx`

Create:
- `frontend/components/marketing/pricing/pricing-catalog.tsx`
- `frontend/components/marketing/pricing/pricing-catalog.test.tsx`
- `frontend/components/marketing/pricing/pricing-tier-card.tsx`
- `frontend/components/marketing/pricing/pricing-comparison.tsx`
- `frontend/components/marketing/pricing/catalog-purchases.tsx`
- `frontend/components/marketing/pricing/animated-price.tsx`
- `frontend/components/marketing/pricing/use-byok-pricing.ts`
- `frontend/lib/billing/pending-pricing-intent.ts`
- `frontend/lib/billing/pending-pricing-intent.test.ts`
- `frontend/components/ui/switch.tsx`
- `frontend/components/ui/switch.test.tsx`

### Concrete changes

- Keep `PricingPage()` synchronous. Update metadata/hero copy to four paid/contact tiers and remove “Free/Paid at $49” and “Every plan runs on your own keys.” Render static `PageHero` and `TrustStrip`, then a `<PricingCatalog />` client island. Keep `PricingCta` server-safe.
- Change `page.test.tsx` to continue direct rendering without MSW. Assert one `h1`, current hero/non-free language, the client island's accessible loading shell, and final CTA. Move catalog/tier assertions out of this page test into `pricing-catalog.test.tsx` using `renderWithProviders` + MSW.
- In `pricing.ts`, delete `price`, free/paid/enterprise columns and hardcoded enforceable feature values. Export stable presentation copy keyed by the exact backend plan keys (blurb/paid CTA treatment only), BYOK disclosure text, and pure adapters that combine catalog data with presentation metadata. The catalog remains authoritative for names, prices, limits, capability comparison values, add-on/top-up labels and availability. Trial checkout and trial CTAs are absent because the backend returns `trial_unavailable` in this release.
- `PricingCatalog` owns one credential-mode state for every tier. This release defaults to BYOK (`PRICING_BYOK_DEFAULT_ON=true`) because `base_price` is the only measured/available price. `useByokPricing` honors `?byok=1`, re-syncs on URL changes, and writes with `window.history.replaceState`, preserving unrelated query/hash values. Selecting funded mode displays unavailable/not yet priced and cannot start checkout. Never use `router.replace`.
- Add `Switch` as a native `<button type="button" role="switch" aria-checked>` primitive with `label`, `describedBy`, `checked`, `onCheckedChange`, `disabled`, and `className`. Native button Space/Enter behavior provides keyboard activation; use app/marketing token classes only and a visible focus ring. The pricing label is exactly “Use your own API keys.”
- Place the switch above all four cards. Next to it render the full disclosure: BYOK customers pay providers directly, and report-ready latency is not guaranteed because their key rate limits apply.
- `AnimatedPrice` reuses the existing GSAP pattern for real numeric-to-numeric catalog changes (for example live catalog/cadence/base-price transitions): `useReducedMotion`, `useGSAP`, a plain `{value}` object, `gsap.to`, integer state and cleanup over `PRICING_PRICE_TWEEN_MS`. Moving between a number and funded-unavailable/Enterprise snaps to semantic text with no fabricated interpolation. Reduced motion always snaps. Do not add a second animation primitive.
- All three self-serve cards show numeric BYOK `base_price` by default. Funded selection changes all three to explicit “Not yet priced”/“Unavailable” copy and disables funded checkout; Enterprise remains “Contact us.” The live region announces one final semantic result. The frozen §7.1 behavior “default OFF shows funded; BYOK animates downward” is DEFERRED until measured funded catalog values are set. Never animate from or announce a fabricated funded total.
- Render four cards and the §4.4 axes via `comparisonRows(catalog)`. Preserve `data-tier`, `data-price`, and `data-highlighted` hooks. Use paid checkout CTAs for all self-serve tiers and “Contact us” for Enterprise; render no trial CTA or trial banner in this release. Do not invent plan limits.
- BYOK checkout buttons call the shared `checkoutSelection`; funded buttons remain disabled while `credit_price` is `null`. The request includes merged PR1’s plan key, BYOK credential selection, `country_code`, and `trial_requested:false`, never a numeric amount. The displayed-price gate compares `base_price` to merged PR1’s final safe quote identity or pre-checkout quote response.
- Anonymous visitors see real available controls, but clicking performs no billing request. Persist strict `PendingPricingIntentV1` in same-tab `sessionStorage` under `searchify.pendingPricingIntent.v1`. Exact shape: `{ version: 1, kind: 'checkout' | 'addon' | 'topup', catalog_key: string, quantity: number, byok: boolean, country_code: string | null, idempotency_key: string, return_path: '/pricing', created_at_ms: number }`. `country_code` is included only if merged PR1 makes checkout request-owned country selection; otherwise remove it wholesale and use the restored authenticated owner. Store no amount, external id, user/workspace id, role, or authorization claim; this is untrusted navigation state only.
- After capture, route to `/login` or `/register`; preserve the intent when users switch between those pages. Extend `useAuthMutation` so successful authentication detects a pending intent and routes to `/pricing?resumeActivation=1` instead of its normal onboarding/projects destination. Add no intent fields to the auth URL.
- On resume, strict-parse the stored record, fetch the live catalog, and match `kind` to the corresponding live plan/add-on/top-up collection. Require an exact catalog key, confirm the item is still purchasable for the selected credential mode, and validate quantity against the live item’s allowed integer bounds/options. Recompute checkout selection and every server request field from the live catalog; never replay stored prices or availability. Malformed, expired, stale, unknown, wrong-kind, unavailable, or invalid-quantity intents are discarded before mutation and produce a clear inline message such as “That pricing option is no longer available. Please choose again.”
- Resume through the same API methods and reuse the stored idempotency key. The server still requires billing-owner auth. Clear activation intents after accepted pending/activated results, terminal `provider_unavailable`, invalidation, or cancel; apply the merged deactivation lifecycle separately. Retain intent across auth/retryable network failures. No unauthenticated mutation is attempted.
- Render add-ons/top-ups generically. With BYOK selected, show only available catalog deltas; funded-dependent packs whose price/config is unset render unavailable and cannot mutate. Activation/top-up use activation states; deactivation uses its distinct merged response/status vocabulary. Keep expiry/forfeiture copy at purchase.
- Catalog loading: render four stable card skeletons plus a non-actionable comparison shell. Catalog error: show a retry control and no price/checkout CTA. Never fall back to `$99/$199/$299` in a component; placeholders live in backend catalog config only.

### Tests

- `frontend/components/ui/switch.test.tsx`: role/name/`aria-checked`, click, Space and Enter activation, focus visibility class, disabled behavior, and description wiring.
- `frontend/components/marketing/pricing/pricing-catalog.test.tsx` with strict MSW catalog fixtures:
  - four tiers render from the response; no Free/$49 language;
  - BYOK is the default and all self-serve headlines equal `base_price`; `credit_price:null` renders funded as unavailable/not yet priced, never `$0` or a fabricated total, and disables funded checkout;
  - BYOK checkout sends exact merged fields including country ownership and `trial_requested:false`, sends no amount, and the displayed `base_price` equals the safe quote identity/pre-checkout quote exposed by merged PR1;
  - the switch has role/name, is keyboard operable, writes/removes `?byok=1` through history while preserving other parameters, and emits one polite final-price announcement;
  - spy on `gsap.to` to assert a 275ms numeric tween only for a real numeric catalog transition; number-to-unavailable and reduced-motion transitions create no tween;
  - override `window.matchMedia` in this test to return `matches:true` for `(prefers-reduced-motion: reduce)` (global setup defaults false), then assert the number snaps immediately and `gsap.to` is not called;
  - generic add-on/top-up fixtures render without key-specific code; BYOK-available deltas follow catalog data, funded-dependent unset entries render unavailable, and top-up expiry/forfeiture copy is beside purchase;
  - paid CTAs render for self-serve plans; no trial CTA is rendered and a `trial_unavailable` response cannot expose dead trial UI;
  - an anonymous checkout/add-on/top-up click writes the exact versioned session-storage intent, issues no billing POST, and routes to auth;
  - the intent survives the login/register full-navigation round-trip, resumes at `/pricing?resumeActivation=1`, is revalidated against the live catalog, and only then issues the authenticated idempotent mutation;
  - stale/unknown/wrong-kind keys and invalid quantities are cleared without a billing POST and show the clear choose-again message; accepted or terminal intents clear according to the lifecycle above, while auth/retryable network failures retain them;
  - strict catalog failure renders no checkout action and no fallback price;
  - comparison cells equal catalog capability values, covering the pricing-page/catalog/enforced-limits agreement from the frontend side.
- `frontend/app/(marketing)/pricing/page.test.tsx`: sync direct render remains valid; no provider wrapper/MSW is required; it asserts only static shell and loading island behavior.
- `frontend/lib/billing/pending-pricing-intent.test.ts`, auth page tests and `frontend/lib/auth/use-auth-mutation.test.tsx`: strict storage parsing, auth-page link preservation, intent-aware post-auth redirect, no credential/amount leakage, and the full capture/resume/clear lifecycle above.

### Verify

- `pnpm test -- components/ui/switch.test.tsx`
- `pnpm test -- components/marketing/pricing/pricing-catalog.test.tsx`
- `pnpm test -- 'app/(marketing)/pricing/page.test.tsx'`
- `pnpm test -- lib/billing/pending-pricing-intent.test.ts`
- `pnpm test -- lib/auth/use-auth-mutation.test.tsx`
- `pnpm test -- 'app/(auth)/login/page.test.tsx' 'app/(auth)/register/page.test.tsx'`
- `pnpm build`
- `pnpm lint`
- `pnpm check:policy`

## Task 3 [parallel after Task 1, merged PR1 catalog/provider contracts] — honest landing artifact, measurement disclosure and labelled coming-soon logos

### Files

Modify:
- `frontend/app/(marketing)/page.tsx`
- `frontend/lib/marketing-content/landing.ts`
- `frontend/lib/marketing-content/faq.ts`
- `frontend/app/(marketing)/demo/page.tsx`
- `frontend/app/(marketing)/demo/page.test.tsx`
- `frontend/components/onboarding/onboarding-screen.tsx`
- `frontend/components/onboarding/onboarding-screen.test.tsx`
- `frontend/components/marketing/landing/hero.tsx`
- `frontend/components/marketing/landing/rotating-engine-logos.tsx`
- `frontend/components/marketing/landing/proof.tsx`
- `frontend/components/marketing/landing/see-it.tsx`
- `frontend/components/marketing/scenes/product-window.tsx`

Create:
- `frontend/components/marketing/landing/hero-evidence-panel.tsx`
- `frontend/components/marketing/landing/what-we-measure.tsx`
- `frontend/components/marketing/landing/landing-claims.test.tsx`

Update existing:
- `frontend/components/marketing/landing/rotating-engine-logos.test.tsx`

Review but do not change unless required:
- `frontend/components/marketing/landing/hero-atmosphere.tsx`
- `frontend/app/(marketing)/marketing-motion.css`

### Concrete changes

- Keep existing Proof tokens, section primitives and page order; insert `WhatWeMeasure` between the artifact/`SeeIt` beat and `Proof`. No mockups or new visual language.
- Replace the hero's abstract-only first screen with `HeroEvidencePanel`: an explicitly sample artifact showing prompt, exact model identity, `measurement_mode:'benchmark'`, retrieval on, observed excerpt, and example citations. It is semantic content with the existing honesty mark and no fabricated performance/cost numbers.
- `WhatWeMeasure` has concise items sourced from central landing content: `measurement_mode`, exact representative model when singular (or explicit multi-model aggregate), retrieval on/off, and benchmark cadence as an entitlement concept only. Explain pulse versus benchmark without mixing partitions. No comparative cost claim.
- Preserve the existing six-provider `RotatingEngineLogos` board, `/brand/grok.webp`, and combined `role="img"`. Use the catalog/provider presentation model to distinguish ChatGPT/Gemini/Claude as shipped and Grok/Copilot/Perplexity as coming soon. Add a visible “Coming soon” treatment on each planned face using existing design tokens and update the combined accessible name to state both groups explicitly, for example “Available: ChatGPT, Gemini and Claude. Coming soon: Grok, Copilot and Perplexity.” Do not convert the marks into routes or connection affordances.
- Keep the planned-provider logos present even without adapters. This is the approved marketing exception documented below, not evidence of capability. Provider settings and activation behavior remain availability-driven and non-connectable.
- Keep provider names in `ProductWindow`, qualifying planned providers. Replace unsupported outcome claims; figures gain `measurement_mode`, retrieval, and exact-model labels when singular, or an explicit multi-model label for aggregates.
- Audit `landing.ts`, `hero.tsx`, `proof.tsx`, `see-it.tsx`, and page metadata for “cheaper,” “save,” unsupported provider coverage, daily/weekly guarantees, or wording that makes coming-soon providers sound shipped. Preserve the approved provider names/logos, qualify planned providers, and remove unsupported outcome claims.
- Remove retired commercial facts outside the pricing page: rewrite FAQ `$49`/Paid/Free/no-card claims from catalog-backed or neutral current facts; replace both demo “Start free” CTAs with paid/compare-plan language; replace onboarding “free Site Health crawl” with neutral sample/access-mode copy. Do not replace one hardcoded price/plan promise with another.
- Do not add motion CSS. `marketing-motion.css` is already 261/300 lines and needs no new rule for this work; if implementation proves otherwise, create a dedicated motion owner rather than exceeding 300. `hero-atmosphere.tsx` already respects reduced motion and should stay unchanged.

### Tests

- `rotating-engine-logos.test.tsx`: all six existing marks remain present; ChatGPT/Gemini/Claude are identified as available; Grok/Copilot/Perplexity each have visible coming-soon treatment; the combined `role="img"` accessible name distinguishes the available and coming-soon groups; no planned mark is a route/link or connect action. This replaces the frozen “logo absent without adapter” test under the approved exception.
- `landing-claims.test.tsx`: semantic evidence panel includes citations, `measurement_mode`, model and retrieval; aggregate copy handles multi-model honestly; cadence is entitlement/measurement language only; planned providers remain visibly coming soon; no comparative-cost phrases.
- Update the existing landing page test, if present, to include the new required section while preserving sync direct render.
- Add pure `providerMarketingState` assertions in `catalog.test.ts` that Grok, Perplexity and Copilot project coming-soon marketing states while remaining unavailable and route-less.
- FAQ/demo/onboarding tests assert no `$49`, Paid, Free-plan, no-card, “Start free,” or “free Site Health crawl” claims remain; replacement copy does not imply trial or funded availability.

### Verify

- `pnpm test -- components/marketing/landing/rotating-engine-logos.test.tsx`
- `pnpm test -- components/marketing/landing/landing-claims.test.tsx`
- focused existing landing page test path
- `pnpm test -- 'app/(marketing)/demo/page.test.tsx'`
- `pnpm test -- components/onboarding/onboarding-screen.test.tsx`
- focused FAQ content test path created/updated by implementation
- `pnpm build`
- `pnpm lint`
- `pnpm check:policy`

## Task 4 [after Task 1, merged PR1 enforcement/mode contracts] — usage billing UI, four-state BYOK settings, streamed run invalidation and mode provenance

### Files

Modify:
- `frontend/components/settings/billing-settings.tsx`
- `frontend/components/settings/billing-settings.test.tsx`
- `frontend/components/settings/provider-settings.tsx`
- `frontend/components/settings/provider-settings.test.tsx`
- `frontend/components/providers/engine-card.tsx`
- `frontend/components/providers/engine-connection-fields.tsx`
- `frontend/lib/providers/use-engine-connection.ts`
- `frontend/app/(app)/runs/[runId]/page.tsx`
- `frontend/app/(app)/runs/[runId]/run-detail.test.tsx`
- `frontend/components/runs/executions-table.tsx`
- `frontend/components/runs/progress-panel.tsx`
- `frontend/components/runs/evidence-card.tsx`
- `frontend/app/(app)/runs/[runId]/executions/[executionId]/evidence-page.test.tsx`
- `frontend/components/visibility/visibility-dashboard.tsx`
- `frontend/components/visibility/visibility-overview.tsx`
- `frontend/components/visibility/visibility-trends.tsx`
- `frontend/components/visibility/mentions-citations.tsx`
- `frontend/components/visibility/fanout-evidence.tsx`
- `frontend/lib/visibility/use-visibility-dashboard.ts`
- relevant existing Visibility tests/fixtures beside those components

Create:
- `frontend/components/billing/usage-meters.tsx`
- `frontend/components/billing/usage-meters.test.tsx`
- `frontend/components/billing/usage-meter.tsx`
- `frontend/components/runs/measurement-context.tsx`
- `frontend/lib/runs/use-run-events.ts`
- `frontend/lib/runs/use-run-events.test.tsx`

### Concrete changes

- Split usage rendering out of the current 317-line `BillingSettings` owner. Leave plan/profile/cancellation orchestration there and render extracted `UsageMeters`. Do not touch or fold this work into the 406-line `SettingsScreen`; trial UI is deferred.
- `UsageMeters` fetches `billingApi.usage` with `queryKeys.billing.usage`. Map generic rows but require/order prompts, projects, manual runs and funded allowance when returned. `UsageMeter` shows `consumed / allowance`, remaining, reset/expiry and semantic progress only when merged PR1 marks values numeric. Render unknown versus unlimited solely from the final DTO semantics/nullability; never reinterpret `null` or display it as zero. Use server status first, config thresholds only for numeric values. Funded/top-up balances show expiry/forfeiture copy.
- Replace all billing free/paid branches, labels and `$49` copy. Current plan status derives from catalog/entitlement; checkout uses Task-1 selectors. Country ownership follows merged PR1 exactly: request-owned `country_code` or the restored authenticated owner, never the deleted profile path or component-local fallback.
- Add the latency notice at the top of Provider Settings: customer keys are billed by providers and report-ready latency is not guaranteed because customer rate limits apply.
- Consume authenticated `ProviderConnectionState = connected|missing|failed|unavailable` separately from public `CatalogAvailability`. Derive/render merged fields exactly. A configured key is connected only after a successful probe; configured but never successfully probed is `missing` with “verification required.” Cards show the authenticated DTO’s safe probe reason/model/time. Planned providers are keyboard-reachable unavailable cards using canonical `unavailable_reason` and `issuable:false`, with no actions.
- `useEngineConnection` refuses save/test when `model.availability !== 'available'` or no adapter route exists. Grok, Perplexity and Copilot therefore cannot construct connection mutations in this release. It never falls back to funded credentials after probe failure.
- Add `useRunEvents` only against merged PR1’s resumable `/audits/{id}/events?stream=true`: credentialed same-origin fetch, workspace header, backend-supported `Last-Event-ID`, abort cleanup, bounded reconnect and coalesced invalidation. Polling remains fallback. The strict discriminated envelope parser from Task 1 gates event handling.
- Do not use event payloads as execution rows. Invalidating `GET /audits/{id}/executions` preserves strict full-response validation and handles replay/out-of-order events safely.
- Change `ExecutionsTable` to incremental/stable rendering: sort by frozen `randomized_position`/prompt/repetition, keep rows keyed by execution id, wrap the row as a memoized `ExecutionRow`, and add `aria-live="polite"` summary text for newly succeeded/failed provider results. Existing queued/leased states stay visible. When PR1 supplies funded saturation, render an honest “Queued — funded provider capacity” label/reason rather than generic hanging/running text.
- Add `MeasurementContext` showing `measurement_mode`, retrieval, and exact model for singular-model rows. For aggregates spanning models, render “Multiple models”/backend-neutral aggregate label and never invent one model. Use it throughout Runs, evidence and Visibility. Preserve backend trend partitions by `measurement_mode`/model/retrieval. Schedules remain deferred.
- Preserve all four Visibility tabs, IDs, roving tabindex, Arrow/Home/End behavior, one active panel, query enablement and `?tab=` `window.history.replaceState` mirroring. Only thread provenance through existing data and rendering. No tab is removed/renamed/added.
- Exports are backend-generated downloads, not rendered by React. Merged PR1 adds `measurement_mode`, retrieval and model/aggregate metadata to CSV/Markdown; frontend keeps same-origin `runsApi.exportUrl`. Add a frontend link/contract test; content assertions belong to PR1.

### Tests

- `usage-meters.test.tsx`: fixtures match merged allowance/remaining semantics exactly; numeric rows render progress/reset/expiry, and explicit unknown/unlimited states remain distinct and never become zero; top-up forfeiture copy remains.
- `provider-settings.test.tsx`: separate public availability and authenticated connection fixtures; configured-unprobed renders missing/verification-required; successful probe is connected; failed probe reasons and catalog `unavailable_reason` render; planned providers use `unavailable_reason`, `issuable:false`, keyboard reachability and no actions; no funded fallback or secret exposure.
- `use-run-events.test.tsx` [after merged PR1 SSE]: discriminated events coalesce invalidations, reconnect sends backend-supported `Last-Event-ID`, headers/credentials/cleanup are correct, unknown variants fail strict parsing, and stream failure leaves polling intact.
- `run-detail.test.tsx`: stream-triggered invalidation exposes results; stable rows and queue copy remain; figures read `measurement_mode`, exact model when singular, retrieval, and multi-model aggregate labels where applicable; export URLs remain `/api/v1/...`.
- `evidence-page.test.tsx`: answer/evidence/score expose `measurement_mode`, exact model when singular, retrieval, and honest multi-model aggregate handling; no secrets.
- Update Visibility tests: explicit `measurement_mode`/retrieval/model or multi-model aggregate labels; series remain partitioned by measurement mode + model + retrieval and are never recombined; four-tab/URL/ARIA behavior remains; no schedule UI.
- `billing-settings.test.tsx`: replace free/paid fixtures; loading/unresolved stays fail-closed; BYOK checkout quote identity agrees with displayed `base_price`; `credit_price:null` disables funded checkout; no trial UI appears.

### Verify

- `pnpm test -- components/billing/usage-meters.test.tsx`
- `pnpm test -- components/settings/provider-settings.test.tsx`
- `pnpm test -- components/settings/billing-settings.test.tsx`
- `pnpm test -- lib/runs/use-run-events.test.tsx`
- `pnpm test -- 'app/(app)/runs/[runId]/run-detail.test.tsx'`
- `pnpm test -- 'app/(app)/runs/[runId]/executions/[executionId]/evidence-page.test.tsx'`
- focused existing Visibility dashboard/tabs/overview/trends/evidence test paths changed by the implementation
- `pnpm build`
- `pnpm lint`
- `pnpm check:policy`

## Task 5 [after Tasks 2–4 and merged PR1 unavailable-provider contracts] — coming-soon provider integration and approved policy exception

### Files

Modify only as needed after the prior slices:
- `frontend/lib/providers/catalog.ts`
- `frontend/components/providers/engine-card.tsx`
- `frontend/components/settings/provider-settings.tsx`
- `frontend/components/marketing/landing/rotating-engine-logos.tsx`
- `frontend/components/marketing/pricing/pricing-comparison.tsx`
- `frontend/components/marketing/pricing/catalog-purchases.tsx`
- `frontend/lib/providers/catalog.test.ts` (already exists; extend it)
- associated tests from Tasks 2–4

### Concrete changes

- Treat `provider.grok`, `provider.perplexity` and `provider.copilot` as catalog keys whose entries are visible but unavailable in this release. Pricing/catalog surfaces may expose their coming-soon activation controls; attempting activation calls the authenticated backend and surfaces its safe `provider_unavailable` response without optimistic grants or routes. Anonymous attempts first use Task 2’s capture-and-resume flow and never POST before authentication.
- `buildEngineCards` returns all three as keyboard-reachable unavailable presentation models with `route:null`; `useEngineConnection` cannot construct a mutation; discovery model options and launch/run engine controls exclude them. Never alias Copilot to OpenAI/Azure or either planned provider to another transport.
- Preserve the landing board’s Grok, Copilot and Perplexity logos under the approved exception. Marketing presentation uses explicit coming-soon labels; provider settings and runtime capability remain driven by unavailable/no-route contracts.

### Tests

- `catalog.test.ts`: exact order follows catalog; current three engines remain connectable; Grok, Perplexity and Copilot are visible coming-soon entries with no routes, are absent from discovery/launch choices, and cannot resolve to another transport.
- Extend pricing activation tests: attempting any of the three unavailable provider activations receives `provider_unavailable`, creates no optimistic capability, and exposes explicit unavailable copy; anonymous attempts first authenticate without issuing a billing POST.
- Extend provider settings tests: all three coming-soon cards are keyboard reachable but issue no adapter mutation and expose no key field.
- Extend logo tests: all three planned logos remain present with visible and accessible coming-soon qualification and no connect/link affordance.

### Verify

- `pnpm test -- lib/providers/catalog.test.ts`
- `pnpm test -- components/settings/provider-settings.test.tsx`
- `pnpm test -- components/marketing/landing/rotating-engine-logos.test.tsx`
- `pnpm test -- components/marketing/pricing/pricing-catalog.test.tsx`
- `pnpm build`
- `pnpm lint`
- `pnpm check:policy`

## Final PR2 verification and policy gates [after Tasks 1–5]

- Run the focused files above first, then `pnpm build`, `pnpm lint`, and `pnpm check:policy` from `frontend/`. Use pnpm only.
- Reconcile every strict fixture with the merged PR1 OpenAPI/DTO output. A `strictValidate` failure is a contract defect; do not loosen schemas or add passthrough.
- Confirm browser network requests are relative `/api/v1/*`, including catalog, usage, mutation and SSE requests.
- Confirm BYOK `base_price` drives headline and checkout quote identity; `credit_price:null` renders funded unavailable. One catalog fixture also drives comparison and available add-on deltas; no fabricated funded value appears.
- Confirm the tween runs only between real numeric catalog prices; funded-unavailable and reduced-motion branches create no GSAP tween. Default test setup remains `matches:false`.
- Confirm Grok, Perplexity and Copilot retain their approved marketing logos with explicit visible/accessibility coming-soon qualification, while having no adapter, route, key input, discovery/launch option, or connect action; activation fails safely with `provider_unavailable`.
- Confirm no provider capability claim is inferred from a logo: the three planned marks are the documented exception, and runtime/settings behavior remains unavailable.
- Confirm Runs/Visibility/evidence/exports use canonical `measurement_mode`, retrieval and exact model where singular; multi-model aggregates are labelled honestly; trend partitions by `measurement_mode`/model/retrieval are never combined.
- Confirm four Visibility tabs, URL mirroring and keyboard behavior are unchanged.
- Confirm Site Health uses the merged neutral entitlement, fails closed without it, and contains no `free|starter` plan fallback or upgrade copy; FAQ/demo/onboarding contain no retired Free/Paid/$49/no-card claims.

## Line-budget and owner-splitting constraints

- `frontend/app/(marketing)/marketing-motion.css` is 261/300 lines (39 lines spare). This plan requires no CSS addition there. Do not exceed 300; add a separate motion owner only if unavoidable.
- `frontend/components/marketing/scenes/product-window.tsx` is already 526 lines. Make only claim/provenance edits; extract new landing artifact/measurement components rather than growing it.
- `frontend/components/settings/billing-settings.tsx` is 317 lines. Extract `UsageMeters`/`UsageMeter` as specified rather than appending meter rendering. `settings-screen.tsx` is 406 lines but is no longer touched because trial UI is deferred.
- `frontend/lib/api/schemas.ts` is 2,269 lines and has no explicit guard entry, but keep one strict schema owner as required. Reuse schema fragments; do not duplicate DTO definitions in domain modules.
- `frontend/app/(app)/runs/[runId]/page.tsx` is 123 lines; put SSE lifecycle in `lib/runs/use-run-events.ts`.
- `frontend/components/marketing/pages/pricing.tsx` is 216 lines; reduce it to composition/CTA and put the client catalog slices in `components/marketing/pricing/*`.
- Added Site Health/copy files are not explicitly budgeted by the architecture script: `use-site-health-screen.ts` 226 lines, `status-strip.tsx` 333, `faq.ts` 218, demo page 110, onboarding screen 471. Keep Site Health schema/state changes narrow; put neutral entitlement projection helpers in existing `lib/site-health/status.ts`/`selection.ts` rather than growing `status-strip.tsx`, and make copy-only edits in FAQ/demo/onboarding. Do not add a new owner unless implementation introduces substantial new behavior.
- Rechecked `frontend/scripts/check-frontend-architecture.mjs`: its complete explicit budget set is `app/layout.tsx` 120, `app/ds-tokens.css` 400, `app/globals.css` 700, `app/ds-type.css` 200, `app/ds-space.css` 160, `app/app-chrome.css` 260, `app/(marketing)/marketing-theme.css` 400, `app/(marketing)/marketing-motion.css` 300, `components/ui/theme-toggle.tsx` 120, `lib/theme.ts` 160, `components/layout/app-shell.tsx` 100, and `app/(app)/layout.tsx` 100. Of the files this plan touches, only `marketing-motion.css` is explicitly budgeted, at 261/300; it remains unchanged. `marketing-theme.css` is 323/400 and is not touched because coming-soon states use existing tokens. No budget is raised. `switch.tsx` remains a small primitive; add a guard only if the team wants it protected, not to legitimize growth.
- Large touched files without an explicit architecture-script ceiling still need owner splits: `ProductWindow` 526 lines gets claim/provenance edits only; `BillingSettings` 317 extracts usage owners; `schemas.ts` 2,269 reuses shared strict fragments; run page 123 extracts stream lifecycle; pricing page owner 216 extracts catalog slices. `RotatingEngineLogos` is 116 lines, `ProviderSettings` 78 and `EngineCard` 88; coming-soon changes fit their existing ownership without a new CSS or page owner.

## Hard backend sequencing requirements

1. **Exact merged PR1 DTOs.** PR1 merges first. Its billing request/response models (including country ownership, quote identity, usage nullability and deactivation statuses), provider catalog/workspace projections, Site Health entitlement, SSE discriminated events, paths and fields are sole authority. Frontend strict objects match wholesale and are never loosened or made optional to straddle shapes. Plan literals are already fixed at `tier_1|tier_2|tier_3|enterprise`.
2. **Measurement export contract.** Merged PR1 defines/tests CSV/Markdown `measurement_mode`, model identity/aggregate semantics and retrieval metadata. PR2 owns same-origin links and contract tests only; do not complete the gate before those fields land.

## DELIBERATE USER-APPROVED DEVIATION — planned-provider marketing

This PR intentionally deviates from frozen §6.1’s marketing gate and §12’s “no provider logo or capability claim without a shipped adapter” gate. Keep the existing Grok, Copilot and Perplexity language and logos because those integrations are planned. The replacement gate is: each planned provider logo/name is visibly and accessibly labelled “Coming soon,” never presented as connectable or currently supported, never routed, and never available in discovery/launch controls. Provider settings expose keyboard-reachable unavailable cards, and activation attempts surface backend `provider_unavailable`. Tests assert logo present + coming-soon + not connectable, not logo absence.

## Release exclusions

- **Schedules:** no dispatcher ships in this release. `benchmark_cadence` may be shown as an entitlement value, but no UI may show a next-run time, imply automatic scheduled execution, or configure schedules.
- **Trial checkout and abuse controls:** checkout returns `trial_unavailable`; §8.2 controls and all trial UI move to PR3.
- **Dev-only test login:** backend seed credentials are usable through the ordinary login form only. Add no dev-login button, bypass, dev-only affordance, credential reference, or frontend config flag.
- **Design artifacts:** the user explicitly requested no mockups. Build entirely with existing tokens, primitives and page structure; do not dispatch or require a design/mockup artifact.

## DEFERRED TO PR3 (pending features)

- Frozen §7.1’s “default OFF shows funded; BYOK animates downward” pricing behavior is deferred until funded margin, provider/search costs, included credits and `credit_price` are measured and configured. PR2 defaults to numeric BYOK base pricing and renders funded as unavailable.

The following trial-UI specification is preserved verbatim for the follow-up PR and is not part of PR2:

- Render four cards and the §4.4 axes via `comparisonRows(catalog)`. Preserve `data-tier`, `data-price`, and `data-highlighted` hooks. Trial CTA copy comes from catalog term and selected funded headline: “7 days free, card required, then $X/month, cancel anytime.” Do not offer a trial on enterprise or invent plan limits.
- `TrialBanner` renders whenever the entitlement/billing DTO reports an active trial: calculate/display the backend-provided days remaining (prefer a server-provided integer; if only deadline exists, put the day-rounding rule in `config/billing.ts`), state pulse/no-search expectations, and provide one upgrade button using the catalog's post-trial plan/price. “One click” means a single button from the banner to the existing checkout mutation; payment-provider redirect remains authoritative.
- `trial-banner.test.tsx`: active trial shows days remaining, pulse/no-search disclosure and one upgrade button; the button submits the catalog key/credential selection without price; expired/non-trial state renders nothing.
