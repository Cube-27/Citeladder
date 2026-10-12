# CiteLadder launch configuration

- Version: `launch-pricing-v1`
- Date: `2026-10-11`
- Repository: `Cube-27/Citeladder`

Sections 1–6 summarize the shipped commercial contract. Section 7 is the
provider rate card behind internal cost (B53).

The values below are configuration, and the configuration wins if they ever
disagree: plans, prices, allowances, add-ons and top-ups in
`frontend/services/api/src/config/billing-authoring.ts`; the entitlement
registry, trial and baseline in `frontend/services/api/src/config/entitlements.json`;
runtime settings in `frontend/services/api/src/config/billing.json`. At runtime
the published catalog revision authored from them is the commercial authority.
The [billing decision log](../billing-decisions.md) records why (B-numbers
below). The YAML is a summary, not an API payload.

Billing is operational but hidden (B0, B2): it runs in production with
Razorpay test keys, and checkout serves only allow-listed workspaces until the
enable change in section 6.

## 1. Catalog and pricing rules

```yaml
catalog:
  revision: launch-pricing-v1
  authority: persisted_BillingCatalogRevision
  publish_as_new_revision: true
  preserve_existing_paid_frozen_terms: true
  preserve_stable_plan_ids: true
  frontend_prices_and_limits_source: published_catalog
  entitlement_level_encoding: existing_registry_ordinals
  commercial_values_in_env: false
  credentials_and_operational_switches: existing_secure_deployment_config
  fail_closed_on_missing_price_or_entitlement: true

billing:
  cadence: monthly
  annual_enabled: false
  lifetime_enabled: false
  automatic_topups_enabled: false
  automatic_overage_charges_enabled: false
  stacked_launch_discounts_enabled: false
  funding_modes:              # both purchasable (B32); chosen by the pricing toggle
    funded:
      display_name: Managed
      platform_supplies_answer_engine_and_dataforseo_keys: true
      provider_settings_visible_to_customer: false
    byok:
      display_name: Bring Your Own Keys
      customer_pays_visibility_provider_directly: true
  modes_differ_only_in_price_and_who_supplies_keys: true   # B4
  workspace_mode_source: live_base_subscription           # never the request (B37)
  plan_change_keeps_funding_mode: true

pricing:
  amounts: integer_minor_units
  USD_minor_unit: cents
  INR_minor_unit: paise
  plan_prices_are_full_subscription_totals: true
  regional_price_policy: fixed_catalog_prices
  regions: {india: INR, international: USD}
  inr_rule: ceil(USD × authoring_rate / 100) × 100 − 1   # rate in billing-authoring.ts
  inr_prices_exclude_gst: true
  india_prices_require_gst_rate_and_approval_reference: true
  gst_rate_frozen_with_each_india_price: true             # B45
  derive_checkout_prices_from_live_fx: false
  unconfigured_regional_price: unavailable
  infer_export_tax_treatment_from_currency_alone: false
  provider_price_refs: one_razorpay_plan_per_plan_mode_region   # keyed plan:mode:region
  missing_or_unverified_provider_price_ref: checkout_unavailable

scope:
  pooled_per_billing_account:
    - project_slots
    - prompt_slots
    - market_slots
    - monitored_urls
    - api_keys
    - site_health_page_fetches_per_period
    - prompt_runs_per_period
    - ai_credits
    - manual_runs_per_day
  multiply_pooled_limits_by_project_count: false
  stack_free_primary_profile_with_paid_primary_profile: false
  missing_occupancy_grant: zero_allowance                 # B38
```

## 2. Plans

```yaml
common_paid_features:
  visibility_analytics: true
  mention_tracking: true
  citation_and_source_tracking: true
  trends: true
  competitor_comparison: true
  site_health: true
  aeo_readiness: true
  opportunity_detection: true
  evidence_based_recommendations: true
  commerce: true
  search_intelligence: true        # managed: platform DataForSEO, spends AI credits (B40)
  crawl_logs: true
  public_api_access: true
  api_keys: 10
  team_members: true
  project_deletion: true
  exports: true                    # not gated (B5)
  included_export_formats: [csv]
  mcp_access: true
  mobile_access: true
  billing_invoice_download: true
  billing_receipt_download: true
  billing_document_surfaces: [desktop, mobile]
  per_seat_surcharge_minor: 0
  advertise_unimplemented_collaboration: false
  self_serve_sla: false

common_paid_tracking:
  # Four measured surfaces: three answer engines that are ASKED a question,
  # and Google's AI Overview, which is OBSERVED on a results page through a
  # SERP provider. `surface_count` counts all four; `answer_engine_count`
  # counts only the ones a model answers, because the two numbers drive
  # different things (task quota multiplies by all four; model-provenance copy
  # is about the three).
  logical_engines: [chatgpt, claude, gemini, google_ai_overview]
  transports: [openai, anthropic, google, dataforseo]
  surface_count: 4
  answer_engine_count: 3
  audit_cadence_gated: false       # B5
  scheduled_samples_per_prompt_per_engine_per_day: 1
  site_health_full_refresh_cadence: weekly
  manual_rate_window_seconds: 86400
  provider_model_routes: existing_verified_route_catalog
  funded_and_byok_use_same_measurement_methodology: true
  claim_consumer_ui_equivalence: false
  unshipped_engines_excluded: [grok, perplexity, copilot]

plans:
  tier_1:
    name: Starter
    self_serve: true
    prices_minor:
      USD: {funded: 9900, byok: 4900}
      INR: {funded: 899900, byok: 449900}
    project_slots: 1
    prompt_slots: 10
    market_slots: 0                # each project's default market is free
    monitored_urls: 50
    site_health_page_fetches_per_period: 500
    history_window: 90d
    manual_runs_per_day: 3
    prompt_runs_per_period: 1000
    ai_credits_per_period: 5000
    agent: false

  tier_2:
    name: Growth
    self_serve: true
    prices_minor:
      USD: {funded: 24900, byok: 9900}
      INR: {funded: 2249900, byok: 899900}
    project_slots: 3
    prompt_slots: 30
    market_slots: 3
    monitored_urls: 150
    site_health_page_fetches_per_period: 1500
    history_window: 12mo
    manual_runs_per_day: 6
    prompt_runs_per_period: 3000
    ai_credits_per_period: 12500
    agent: true

  tier_3:
    name: Scale
    self_serve: true
    prices_minor:
      USD: {funded: 49900, byok: 19900}
      INR: {funded: 4499900, byok: 1799900}
    project_slots: 10
    prompt_slots: 60
    market_slots: 10
    monitored_urls: 400
    site_health_page_fetches_per_period: 4000
    history_window: 24mo
    manual_runs_per_day: 12
    prompt_runs_per_period: 6000
    ai_credits_per_period: 37500
    agent: true

  enterprise:
    name: Enterprise
    self_serve: false
    contact_only: true
    prices_minor: null
    automatic_grants: []
    terms: explicit_custom_contract
    automatically_include_unshipped_features: false
```

Every grant, prompt runs and AI credits included, is identical in the funded and BYOK
variants of a plan; only the price and who supplies the provider keys differ (B4, B32).
Fan-out and exports are available on every plan (B5). Do not restrict MCP or the Agent
more than specified above.

## 3. Usage and funding rules

```yaml
prompt_runs:                   # B8, B33, B34
  entitlement_key: prompt_runs_per_period
  unit: one_engine_or_search_surface_answer
  same_allowance_byok_and_managed: true
  counted_triggers: [manual, scheduled, mcp, public_api]
  hold_per_answer_at_admission: true
  spend_only_on_recorded_answer: true
  failed_answer_after_retries: release_hold
  answer_analysis_included: true        # perception, Commerce shelf, fact verification (B9)
  spend_timing: customer_choice         # all at once or spread across the period
  exhausted_allowance: refuse_launch    # 403 prompt_runs_exhausted
  manual_job_rate_limit_is_not_a_free_audit_allowance: true

ai_credits:                    # B12, B23, B31, B35
  entitlement_key: ai_credits
  charged_calls:
    - prompt_generation           # onboarding and the free trial included
    - onboarding_research_and_brand_discovery
    - commerce_buyer_prompts
    - agent
    - managed_search_intelligence # DataForSEO cost, converted like token cost (B40)
  charge_basis: tokens_at_serving_model_price   # prices in config/ai-credits.json
  credit_value: usd_0_001_after_30_percent_markup   # B14; ceil(cost x 1.3 / 0.001)
  internal_cost_basis: provider_published_rates     # B53; plan prices and credit amounts may change
  customer_sees: credits_only                   # conversion stays internal (B23)
  agent_model: platform_gateway_only            # no customer model route (B19)
  agent_sonnet_5_5: [tier_2, tier_3]            # B54; not yet built; not trial or Starter
  hold_before_call_and_settle_once: true
  model_without_configured_price: refused
  recorded_not_charged: [jev_judge, tavily, keenable]   # B13
  topup_unlocks_ineligible_features: false
  guarantee_articles_or_agent_sessions_per_credit: false

managed:                       # B20, B32, B36
  platform_keys: [openai, anthropic, google, dataforseo]
  monthly_platform_spend_ceiling: BILLING_FUNDED_MONTHLY_BUDGET_MINOR
  ceiling_rule: admit_while_recorded_month_spend_below_ceiling

byok:
  customer_keys: [openai, anthropic, google, dataforseo]
  search_intelligence_charge: none     # runs on the workspace's own DataForSEO key (B40)
  automatic_fallback_from_failed_byok_to_platform: false
  automatic_switch_from_managed_to_customer_keys: false
  opening_reports_triggers_provider_execution: false
  promise_total_provider_plus_platform_savings: false

site_health:
  occupancy_unit: monitored_owned_url
  consumption_unit: page_fetch
  scheduled_and_manual_fetches_share_period_allowance: true
  url_occupancy_and_fetch_budget_are_separate: true
  history_reads_and_cached_report_views_trigger_new_fetches: false

prompt_fanout:
  discovery_eligibility: every_plan     # B5
  activated_variation_consumes_prompt_slot: true
  executed_variation_consumes_prompt_runs: true
  free_unmetered_hidden_executions: false

recurring_allowances:
  reset_at: subscription_period_boundary
  issue_only_from_verified_paid_period_evidence: true
  duplicate_webhook_or_reconciliation_double_grant: false
  rollover: false
```

### Daily schedule against the prompt-run allowance

Every surface answer is one prompt run. At the configured allowances, a full
daily schedule of every prompt on all four surfaces needs more runs than any
plan includes in a 31-day month (Starter 1,240 against 1,000; Growth 3,720
against 3,000; Scale 7,440 against 6,000). This is not intended; plan
allowances are set after testing, sized with the rate card in section 7 (B55).

## 4. Add-ons and top-ups

Add-on and top-up prices, quantities per unit and purchase frequency are not
documented: they are set after testing (B55) and live only in
`billing-authoring.ts`. This section records what each can include.

```yaml
addons:                         # paid plans only; never the trial
  addon_extra_project: adds project slots
  addon_extra_prompts: adds prompt slots
  addon_extra_site_health: adds monitored URLs and Site Health page fetches

topups:
  topup_ai_credits: adds AI credits   # never the trial (B16)

expansion_policy:
  price_follows_base_subscription_mode: true   # B37; grants identical in both modes
  india_price_requires_gst_rate_and_approval_reference: true
  base_paid_subscription_required: true
  addon_grants_are_supplements_not_primary_plans: true
  expiry: 30_days_or_base_subscription_end_whichever_first
  expiry_anchor: successful_paid_purchase_time
  paid_outside_live_base_period: receipt_kept_no_grant_operator_refund   # B30
  topup_use_requires_active_paid_access: true
  topup_use_requires_feature_eligibility: true
  auto_purchase_or_auto_renew_topups: false
  topups_increase_project_prompt_or_url_occupancy: false
  quantity_must_scale_price_and_all_grants_together: true
```

## 5. Trial and access lifecycle

```yaml
trial:                         # entitlements.json public_trial (B16, B31, B34)
  duration_days: 7               # BILLING_TRIAL_DAYS
  access: public_registration_while_PUBLIC_SIGNUP_ENABLED
  payment_card_required: false
  automatic_charge: false
  project_slots: 1
  prompt_slots: 20
  monitored_urls: 20
  manual_runs_per_day: 100
  logical_engines: [chatgpt]
  prompt_runs_total: 20          # for the whole trial; nothing else limits answers
  ai_credits_total: 5000         # prompt generation in onboarding spends them too
  topups: false
  agent: false
  promise_seven_complete_daily_refreshes: false
  claim_limit_per_billing_account_lifetime: 1
  expiry_stops_new_paid_execution: true
  data_purged_days_after_end: 30 # BILLING_TRIAL_DATA_RETENTION_DAYS

access_lifecycle:
  plan_change:
    upgrade: immediate_with_prorated_charge_for_rest_of_period
    downgrade: at_renewal_no_refund
    over_limit_prompts_after_downgrade: kept_not_measured   # newest first (B27)
    keeps_funding_mode: true
  cancellation: end_of_period
  cancellation_held_until_lead_before_renewal: true        # resumable until sent (B46)
  missed_cancellation_send: renews_once_then_cancels; refund_is_manual_dashboard_refund
  ended_paid_access_state: subscription_lapsed              # never trial_expired (B26)
  ended_access_keeps_path_to_buy_a_plan: true               # B43
  halted_subscription: cancelled_at_provider_by_sweep       # B24
  full_refund: revokes_remaining_grants_no_clawback
  full_refund_of_current_period_payment: cancels_subscription_at_once   # B52; partial refunds change nothing
  payment_disputes: manual_in_razorpay_dashboard                        # B51
  prepaid_topups_do_not_extend_subscription_access: true
  new_terms_do_not_rewrite_historical_invoices_or_grants: true
  free_signup_profile_does_not_grant_permanent_funded_execution: true
```

## 6. Release requirements

```yaml
implementation:
  extend_existing_billing_and_entitlement_domains: true
  build_parallel_billing_system: false
  hardcode_prices_or_quotas_in_frontend: false
  preserve_existing_authorization_and_security: true
  preserve_existing_features_unless_explicitly_changed_above: true
  centralize_new_counter_and_feature_definitions: true
  enforce_limits_server_side_on_ui_api_scheduler_mcp_and_agent_paths: true
  prices_displayed_at_checkout_match_paid_and_frozen_terms: true
  invoice_receipt_currency_tax_and_paid_total_must_reconcile: true

checkout_release_requirements:
  all_modes:
    - published_catalog_revision
    - exact_region_currency_and_funding_mode_price
    - verified_provider_price_reference
    - verified_transaction_tax_configuration
    - successful_payment_and_renewal_issue_exactly_one_correct_grant_bundle
    - entitlement_enforcement_and_billing_failure_tests_pass
  funded:
    - platform_engine_and_dataforseo_connections_provisioned_with_matching_credential_refs
    - platform_keys_installed_as_deployment_secrets
    - token_prices_configured_for_every_serving_model
    - monthly_platform_spend_ceiling_set_deliberately   # BILLING_FUNDED_MONTHLY_BUDGET_MINOR
  ai_credits:
    - every_platform_call_metered_or_explicitly_recorded_not_charged
  expansions:
    - sku_exists_in_persisted_runtime_catalog
    - regional_price_configured
    - quantity_expiry_and_supplement_grants_verified
  public_trial:
    - eligibility_and_abuse_controls_verified

hidden_operation:              # B2, B42; deploy defaults keep even this closed
  razorpay_mode: test                   # with BILLING_RAZORPAY_TEST_READY and the region's TEST_*_READY flag
  checkout_enabled: true
  checkout_audience: allow_list
  allow_list_grant: billing_checkout    # billing:admin grant, per workspace
  public_catalog_offers_checkout: false
  test_mode_in_production_serves_allow_list_only: true

enable_change:                 # one small configuration change (B0, B2)
  - live Razorpay key: BILLING_RAZORPAY_MODE=live, BILLING_RAZORPAY_KEY_ID variable, BILLING_RAZORPAY_KEY_SECRET and BILLING_RAZORPAY_WEBHOOK_SECRET secrets
  - live webhook at https://citeladder.com/api/v1/billing/webhooks/razorpay
  - live plans created, bound and published as a new catalog revision
  - BILLING_RAZORPAY_LIVE_READY=true; BILLING_RAZORPAY_INTERNATIONAL_READY=true for USD checkout
  - India: BILLING_INDIA_GST_RATE, BILLING_INDIA_GST_APPROVAL_REFERENCE, BILLING_SELLER_SAC and BILLING_SELLER_LUT_REFERENCE set before the live catalog is authored
  - BILLING_CHECKOUT_ENABLED=true
  - BILLING_CHECKOUT_AUDIENCE=everyone

do_not_sell_without_verified_implementation_and_terms:
  - grok
  - perplexity
  - copilot
  - sso_saml
  - security_certifications
  - white_label_reports
  - dedicated_deployment
  - guaranteed_sla
  - unlimited_execution
```

## 7. Provider rate card (internal cost)

Internal cost is calculated at each provider's published rates (B53). This
card records those rates for the models and endpoints the product actually
calls, so sizing work does not need a fresh web search. Customer prices and
credit amounts are separate commercial settings (B53, B55).

**Verified 2026-10-12** from each provider's official pricing page. Re-verify
before using a figure for a pricing decision, and update the row and date here.
Runtime charging reads `config/ai-credits.json`, `config/dataforseo.json` and
`config/search-intelligence.json`, not this table; a mismatch is a config bug
to fix, not a reason to edit this card.

### Model tokens (USD per million tokens)

| Model | Used for | Input | 5-min cache write | Cache read | Output | Notes |
|---|---|---:|---:|---:|---:|---|
| Claude Haiku 5.5 (prompt ≤100K) | Agent default, gateway calls (prompt generation, research, commerce) | 0.10 | 0.125 | 0.01 | 0.50 | 1-hour cache write 0.20 |
| Claude Haiku 5.5 (prompt >100K) | — (the Agent stays below this tier) | 0.50 | 0.625 | 0.05 | 2.50 | 5× the lower tier |
| Claude Sonnet 5.5 | Claude answer engine (`claude-sonnet-5-5`); Agent option on Growth and Scale (B54) | 2.00 | 2.50 | 0.10 | 10.00 | 1-hour cache write 4.00; one rate across the full context |
| OpenAI gpt-6.1-sol (≤272K input) | ChatGPT answer engine | 2.00 | — | 0.10 | 10.00 | Automatic caching |
| OpenAI gpt-6.1-sol (>272K input) | — | 4.00 | — | 0.20 | 15.00 | |
| Google gemini-3.6-flash | Gemini answer engine | 0.75 | — | 0.075 | 3.75 | Through 2026-12-31; 1.50 / 0.15 / 7.50 from 2027-01-01. Output includes thinking. Cache storage 0.50 per million tokens per hour (1.00 from 2027) |

Thinking (reasoning) tokens are billed as output by every provider above.

### Search and grounding fees

| Provider | Fee | Notes |
|---|---|---|
| Anthropic web search | $10 per 1,000 searches | Plus search-result tokens as input, in later turns too |
| OpenAI web search | $10 per 1,000 calls | Plus search content tokens at model rates |
| Google grounding with Google Search | $14 per 1,000 requests | After 5,000 free requests a month, shared across Gemini 3 and newer models |

### DataForSEO (USD)

| Endpoint family | Used for | Published price | Configured in code |
|---|---|---|---|
| SERP Google Organic `task_post` (10 results) | Google AI Overview surface | Standard $0.0006, priority $0.0012, live $0.002 per SERP; async AI Overview loading adds one base price | `observed_standard_task_cost_microusd` 1,200 and `async_ai_overview_surcharge_microusd` 600 (`dataforseo.json`). The 1,200 matches the priority-queue price and was observed live; check which queue the task uses before relying on either figure |
| AI Optimization LLM Scraper (ChatGPT, Gemini) | ChatGPT Search and Gemini consumer surfaces | Standard $0.0012, priority $0.0024, live $0.004 per results page | Priority 1 (standard queue) in `dataforseo.json` |
| DataForSEO Labs live endpoints (ranked keywords, page and domain intersection, keyword suggestions, relevant pages, subdomains, domain rank overview) | Search Intelligence | $0.012 per task plus $0.00012 per returned item | `rates.labs_task` and `rates.labs_item` (`search-intelligence.json`) — match |
| Backlinks API | Search Intelligence | $0.024 per request plus $0.000036 per row | `rates.backlinks_request` and `rates.backlinks_row` — match |

The DataForSEO account needs a minimum $50 payment. Prices are per call
regardless of who supplies the key; on bring-your-own-key plans the customer's
account pays.

### Not modelled here

Keenable, Tavily and TypeSafe AI calls are recorded but not charged (B13);
their contract rates are not public list prices. Google Cloud hosting and
Cloudflare are fixed infrastructure costs, not per-call rates.

### Converting cost to credits

```text
call_cost_usd = Σ (tokens_in_class × class_rate / 1,000,000) + search_fees + provider_task_fees
credits       = ceil(call_cost_usd × 1.3 / 0.001)          # B14: 1 credit = $0.001 after 30% markup
```

Example at Haiku 5.5: 10,000 input and 2,000 output tokens cost $0.002 and are
charged 3 credits. One Claude answer on Sonnet 5.5 (2,000 input, 600 output,
one web search) costs about $0.020; a Gemini 3.6 Flash answer with one grounded
request after the free allowance costs about $0.018.

The superseded 2026-09-08 workbook economics (old token rates and margins) are
in git history.
