# CiteLadder launch configuration

- Version: `launch-pricing-v1`
- Date: `2026-10-11`
- Repository: `Cube-27/Citeladder`

Sections 1–6 summarize the shipped commercial contract. Section 7 is reference-only economics.

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
  customer_sees: credits_only                   # conversion stays internal (B23)
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

| Plan | Prompts | Surfaces | Days | Daily-schedule answers | Prompt runs | Remaining |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 10 | 4 | 31 | 1,240 | 1,000 | -240 |
| Growth | 30 | 4 | 31 | 3,720 | 3,000 | -720 |
| Scale | 60 | 4 | 31 | 7,440 | 6,000 | -1,440 |

Every surface answer is one prompt run, so a full daily schedule on all four
surfaces needs more runs than any plan includes in a 31-day month. Nothing is
reserved for schedules: scheduled and manual audits spend the same allowance in
whatever order the customer runs them, and a launch is refused once it is
spent. Raising `promptRuns` in `billing-authoring.ts` (and publishing a new
revision) is the lever if plans should cover a full daily schedule.

## 4. Add-ons and top-ups

INR prices follow the plan rule in section 1 and exist only when the GST rate
and approval reference were set at authoring; without them an item is
unavailable in India, not zero-priced. The price follows the base
subscription's mode (B37); grants are the same in both modes.

```yaml
addons:
  addon_extra_project:
    name: Extra project
    cadence: one_time
    eligible_plans: [tier_1, tier_2, tier_3]
    eligible_modes: [byok, funded]
    prices_minor:
      USD: {byok: 1900, funded: 1900}
    grants_per_unit:
      project_slots: 1

  addon_extra_prompts:
    name: Extra 10 prompts
    cadence: one_time
    eligible_plans: [tier_1, tier_2, tier_3]
    eligible_modes: [byok, funded]
    prices_minor:
      USD: {byok: 1500, funded: 9900}   # funded price kept as configured (B37)
    grants_per_unit:
      prompt_slots: 10

  addon_extra_site_health:
    name: Site Health pack
    cadence: one_time
    eligible_plans: [tier_1, tier_2, tier_3]
    eligible_modes: [byok, funded]
    prices_minor:
      USD: {byok: 1900, funded: 1900}
    grants_per_unit:
      monitored_urls: 250
      site_health_page_fetches_per_period: 2500

topups:
  topup_ai_credits:
    name: AI credit top-up
    cadence: one_time
    eligible_plans: [tier_1, tier_2, tier_3]   # never the trial (B16)
    eligible_modes: [byok, funded]
    prices_minor: {USD: 2500}
    grants_per_unit:
      ai_credits: 25000

expansion_policy:
  amounts_above_are_per_unit: true
  quantity_bounds: [1, 20]
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

## 7. Economics — reference only

Source: `CiteLadder_Launch_Pricing_and_Cost_Model.xlsx`, sheets `Provider inputs`, `Unit economics`, and `Read me`, dated 2026-09-08.

Planning assumptions, not measured production costs or an execution rate card. Do not copy these estimates into runtime provider pricing. All revenue below excludes customer taxes.

### Cost inputs

| Input | Value |
|---|---:|
| Billed input tokens/answer, including retrieval context | 2,000 |
| Billed output tokens/answer | 600 |
| Retry/variable-use reserve | 15% |
| Rounded managed budget/answer | $0.04 |
| Higher-cost scenario/answer; not a maximum | $0.07 |
| Payment/collection reserve | 5% of subscription revenue |
| Other delivery reserve, Starter / Growth / Scale | $10 / $20 / $35 per month |
| Included workflow model-cost budgets | $0 / $5 / $15 per month |
| Illustrative cost-model FX only | ₹90/USD |
| Illustrative India GST only; actual treatment is transaction-specific | 18% |

The other-delivery reserve already includes the workflow budgets. Do not add them twice.
Shared hosting, storage, crawling, internal AI, and delivery overhead are estimates. Acquisition costs and founder salaries are excluded. Low account counts can increase per-account shared costs.

### Per-answer model assumptions

These reproduce the prior workbook's budgeting inputs, not a fresh verification of provider prices.

| Route | Input $/million | Output $/million | Search $/query | Queries/answer | Estimated $/answer |
|---|---:|---:|---:|---:|---:|
| OpenAI route | 5.00 | 30.00 | 0.010 | 1 | 0.0380 |
| Anthropic route | 2.00 | 10.00 | 0.010 | 3 | 0.0400 |
| Google route | 1.50 | 7.50 | 0.014 | 1 | 0.0215 |
| Equal-weight mean | — | — | — | — | 0.0331667 |
| Mean plus 15% reserve | — | — | — | — | 0.0381417 |

```text
answer_cost =
  (billed_input_tokens × input_rate_per_million / 1,000,000)
  + (billed_output_tokens × output_rate_per_million / 1,000,000)
  + (search_queries × fee_per_query)

managed_contribution =
  managed_revenue
  - (included_answer_allowance × modeled_answer_cost)
  - other_delivery_reserve
  - (managed_revenue × 0.05)

byok_contribution =
  byok_revenue
  - other_delivery_reserve
  - (byok_revenue × 0.05)

contribution_margin = contribution / subscription_revenue
```

### Monthly economics at full allowance use

| Metric | Starter | Growth | Scale |
|---|---:|---:|---:|
| Managed revenue | $99.00 | $249.00 | $499.00 |
| BYOK revenue | $49.00 | $99.00 | $199.00 |
| Managed answer allowance | 1,000 | 3,000 | 6,000 |
| AI budget at $0.04/answer | $40.00 | $120.00 | $240.00 |
| Other delivery reserve | $10.00 | $20.00 | $35.00 |
| Managed collection reserve | $4.95 | $12.45 | $24.95 |
| Managed contribution | $44.05 | $96.55 | $199.05 |
| Managed contribution margin | 44.5% | 38.8% | 39.9% |
| Managed contribution at $0.07/answer | $14.05 | $6.55 | $19.05 |
| Managed margin at $0.07/answer | 14.2% | 2.6% | 3.8% |
| BYOK contribution | $36.55 | $74.05 | $154.05 |
| BYOK contribution margin | 74.6% | 74.8% | 77.4% |

### BYOK buyer: scheduled tracking only, 31 days

Uses the buffered estimate of $0.0381417/answer, not the rounded $0.04 internal budget.
Extra manual usage and provider-specific taxes or fees are excluded.

Scheduled answers here count the three ANSWER ENGINES only (10/30/60 prompts x 3 x 31
days), deliberately unlike the section 3 fixtures. The per-answer cost model above is
built from LLM token and search-query rates, and an observed SERP task is neither; its
cost belongs to a SERP rate card that is not modeled here.

| Metric | Starter | Growth | Scale |
|---|---:|---:|---:|
| Scheduled answers | 930 | 2,790 | 5,580 |
| CiteLadder subscription | $49.00 | $99.00 | $199.00 |
| Estimated provider bill | $35.47 | $106.42 | $212.83 |
| Estimated combined spending | $84.47 | $205.42 | $411.83 |
| Managed subscription | $99.00 | $249.00 | $499.00 |
| Estimated net saving | $14.53 | $43.58 | $87.17 |

Operational reference: revalidate new managed sales when representative measured blended cost exceeds $0.04 per delivered answer. Do not silently cut scheduled coverage already sold.
