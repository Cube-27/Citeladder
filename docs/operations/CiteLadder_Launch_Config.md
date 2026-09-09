# CiteLadder launch configuration

- Version: `launch-pricing-v1`
- Date: `2026-09-08`
- Repository: `Cube-27/Citeladder`

Sections 1–6 are the implementation contract. Section 7 is reference-only economics.
These are target settings, not a claim that the current deployment already supports them.
Map these settings to the existing schemas and entitlement registry; the YAML is not an existing API payload.
Preserve existing functionality except for the pricing, entitlements, metering, and billing behavior explicitly specified here.

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
  funding_modes:
    funded:
      display_name: Managed AI
      customer_provider_keys_required: false
    byok:
      display_name: Bring Your Own Keys
      customer_pays_visibility_provider_directly: true
  funding_mode_change_effective: next_renewal
  funding_mode_change_midperiod_refund: false

pricing:
  amounts: integer_minor_units
  USD_minor_unit: cents
  INR_minor_unit: paise
  plan_prices_are_full_subscription_totals: true
  funded_execution_component: funded_total_minus_byok_total
  add_byok_price_to_funded_total: false
  regional_price_policy: fixed_catalog_prices
  derive_checkout_prices_from_live_fx: false
  unconfigured_regional_price: unavailable
  displayed_prices_exclude_applicable_customer_tax: true
  tax_calculation: existing_verified_transaction_tax_logic
  infer_export_tax_treatment_from_currency_alone: false
  provider_price_refs: provision_per_sku_region_mode_and_revision
  missing_or_unverified_provider_price_ref: checkout_unavailable

scope:
  pooled_per_billing_account:
    - project_slots
    - prompt_slots
    - monitored_urls
    - site_health_page_fetches_per_period
    - audit_credits
    - ai_credits
    - manual_runs_per_day
  per_project:
    - competitors
    - gsc_properties
    - ga4_properties
  multiply_pooled_limits_by_project_count: false
  stack_free_primary_profile_with_paid_primary_profile: false
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
  gsc_properties_per_project: 1
  ga4_properties_per_project: 1
  exports: true
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
  logical_engines: [chatgpt, claude, gemini]
  transports: [openai, anthropic, google]
  engine_count: 3
  audit_cadence: daily
  scheduled_samples_per_prompt_per_engine_per_day: 1
  site_health_full_refresh_cadence: weekly
  competitors_per_project: 5
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
    monitored_urls: 50
    site_health_page_fetches_per_period: 500
    history_window: 90d
    manual_runs_per_day: 3
    audit_credits_per_period: {funded: 1000, byok: 0}
    ai_credits_per_period: 0
    fanout: false
    content_creation: false
    growth_agent: false
    support_tier: standard
    support_channel: email

  tier_2:
    name: Growth
    self_serve: true
    prices_minor:
      USD: {funded: 24900, byok: 9900}
      INR: {funded: 2249900, byok: 899900}
    project_slots: 3
    prompt_slots: 30
    monitored_urls: 150
    site_health_page_fetches_per_period: 1500
    history_window: 12mo
    manual_runs_per_day: 6
    audit_credits_per_period: {funded: 3000, byok: 0}
    ai_credits_per_period: 500
    fanout: true
    content_creation: true
    growth_agent: true
    support_tier: standard
    support_channel: email

  tier_3:
    name: Scale
    self_serve: true
    prices_minor:
      USD: {funded: 49900, byok: 19900}
      INR: {funded: 4499900, byok: 1799900}
    project_slots: 10
    prompt_slots: 60
    monitored_urls: 400
    site_health_page_fetches_per_period: 4000
    history_window: 24mo
    manual_runs_per_day: 12
    audit_credits_per_period: {funded: 6000, byok: 0}
    ai_credits_per_period: 1500
    fanout: true
    content_creation: true
    growth_agent: true
    support_tier: priority
    support_channel: email

  enterprise:
    name: Enterprise
    self_serve: false
    contact_only: true
    prices_minor: null
    automatic_grants: []
    terms: explicit_custom_contract
    automatically_include_unshipped_features: false
```

`ai_credits_per_period` and all non-visibility-inference features are identical in funded and BYOK variants.
Do not restrict MCP or Growth Agent more than specified above.

## 3. Usage and funding rules

```yaml
visibility_answers:
  entitlement_key: audit_credits
  unit: one_successful_prompt_engine_sample
  debit_per_successful_funded_answer: 1
  full_audit_units: prompt_count_times_engine_count_times_repetitions
  failed_answer_credit_debit: 0
  system_duplicate_credit_debit: 0
  account_for_provider_attempt_costs_separately: true
  reserve_before_execution: true
  settle_successes_and_release_failed_reservations: true
  settlement_idempotent: true
  automatic_retries_do_not_create_extra_customer_answer_debits: true
  ordinary_new_manual_rerun_consumes_new_answers: true
  competitor_analysis_of_existing_answers_consumes_extra_answers: false
  ui_mcp_and_agent_calls_share_same_ledger: true
  manual_job_rate_limit_is_not_a_free_audit_allowance: true

scheduled_coverage:
  reserve_remaining_scheduled_answers_before_optional_manual_work: true
  reserve_formula: remaining_scheduled_prompt_engine_samples_in_current_paid_period
  use_actual_billing_period_and_schedule: true
  hardcode_31_days_in_runtime: false
  optional_manual_sources:
    - unreserved_included_answer_balance
    - explicitly_purchased_answer_topups
    - explicitly_selected_byok
  block_optional_manual_work_that_would_consume_scheduled_reserve: true
  recalculate_reserve_when_prompts_or_schedules_change: true
  silently_reduce_scheduled_service_already_sold: false

byok:
  included_managed_visibility_answers: 0
  own_key_visibility_runs_debit_audit_credits: false
  project_prompt_cadence_and_manual_rate_limits_still_apply: true
  can_purchase_managed_answer_topups: true
  managed_execution_requires_explicit_routing_and_available_credits: true
  automatic_fallback_from_failed_byok_to_platform: false
  automatic_switch_from_managed_to_customer_keys: false
  require_confirmed_billable_job_or_authorized_saved_schedule: true
  opening_reports_triggers_provider_execution: false
  remaining_platform_funded_services:
    - crawling_within_included_limits
    - basic_platform_analysis
    - included_content_and_growth_agent_ai_credits
  discount_applies_to: visibility_inference_funding_only
  promise_total_provider_plus_platform_savings: false

workflow_ai:
  entitlement_key: ai_credits
  features: [content_creation, growth_agent]
  separate_from_visibility_answer_credits: true
  model_cost_budget_usd_per_credit: 0.01
  model_cost_budget_microusd_per_credit: 10000
  debit_rule: ceil_verified_billable_model_cost_microusd_divided_by_10000
  disclose_rounding: true
  runtime_rates_source: verified_published_route_specific_ai_credit_policy
  missing_verified_rate_or_execution_cap: block_new_billable_execution
  unknown_usage_is_zero: false
  reserve_before_execution_and_reconcile_actual_usage: true
  tool_calls_use_their_own_applicable_answer_or_crawl_allowances: true
  topup_unlocks_ineligible_features: false
  guarantee_articles_or_agent_sessions_per_credit: false

site_health:
  occupancy_unit: monitored_owned_url
  consumption_unit: page_fetch
  scheduled_and_manual_fetches_share_period_allowance: true
  url_occupancy_and_fetch_budget_are_separate: true
  history_reads_and_cached_report_views_trigger_new_fetches: false

prompt_fanout:
  discovery_eligibility: [tier_2, tier_3]
  activated_variation_consumes_prompt_slot: true
  executed_variation_consumes_normal_answer_units: true
  free_unmetered_hidden_executions: false

recurring_allowances:
  reset_at: subscription_period_boundary
  issue_only_from_verified_paid_period_evidence: true
  duplicate_webhook_or_reconciliation_double_grant: false
  rollover: false
```

### Scheduled-coverage validation fixtures

| Plan | Prompts | Engines | Days | Scheduled answers | Included answers | Optional remaining |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 10 | 3 | 31 | 930 | 1,000 | 70 |
| Growth | 30 | 3 | 31 | 2,790 | 3,000 | 210 |
| Scale | 60 | 3 | 31 | 5,580 | 6,000 | 420 |

## 4. Add-ons and top-ups

INR add-on/top-up prices were not specified in the agreed catalog. `null` means unavailable in that region, not zero-priced. Do not infer these prices from the economics FX assumption.

```yaml
addons:
  addon_extra_project:
    name: Extra project
    cadence: one_time
    eligible_plans: [tier_1, tier_2, tier_3]
    eligible_modes: [byok, funded]
    prices_minor:
      USD: {byok: 1900, funded: 1900}
      INR: null
    grants_per_unit:
      project_slots: 1
    additional_prompt_url_answer_or_workflow_grants: false

  addon_extra_prompts:
    name: Extra 10 prompts
    cadence: one_time
    eligible_plans: [tier_1, tier_2, tier_3]
    eligible_modes: [byok, funded]
    prices_minor:
      USD: {byok: 1500, funded: 9900}
      INR: null
    grants_per_unit:
      byok:
        prompt_slots: 10
        audit_credits_per_period: 0
      funded:
        prompt_slots: 10
        audit_credits_per_period: 1000

  addon_extra_site_health:
    name: Site Health pack
    cadence: one_time
    eligible_plans: [tier_1, tier_2, tier_3]
    eligible_modes: [byok, funded]
    prices_minor:
      USD: {byok: 1900, funded: 1900}
      INR: null
    grants_per_unit:
      monitored_urls: 250
      site_health_page_fetches_per_period: 2500

topups:
  topup_audit_credits:
    name: Managed answer top-up
    cadence: one_time
    eligible_plans: [tier_1, tier_2, tier_3]
    eligible_modes: [byok, funded]
    prices_minor: {USD: 9900, INR: null}
    grants_per_unit:
      audit_credits: 1000

  topup_ai_credits:
    name: Workflow AI top-up
    cadence: one_time
    eligible_plans: [tier_2, tier_3]
    eligible_modes: [byok, funded]
    prices_minor: {USD: 2500, INR: null}
    grants_per_unit:
      ai_credits: 1000

expansion_policy:
  amounts_above_are_per_unit: true
  base_paid_subscription_required: true
  addon_grants_are_supplements_not_primary_plans: true
  topup_expiry_days: 30
  topup_expiry_anchor: successful_paid_purchase_time
  topup_expiry_preserved_after_subscription_cancellation: false
  topup_use_requires_active_paid_access: true
  topup_use_requires_feature_eligibility: true
  auto_purchase_or_auto_renew_topups: false
  topups_increase_project_prompt_or_url_occupancy: false
  supported_quantity_bounds: preserve_existing_validated_bounds
  quantity_must_scale_price_and_all_grants_together: true
```

## 5. Trial and access lifecycle

```yaml
trial:
  duration_days: 7
  access: invite_based_until_abuse_controls_verified
  payment_card_required: false
  automatic_charge: false
  project_slots: 1
  prompt_slots: 20
  monitored_urls: 20
  logical_engines: [chatgpt]
  successful_runs_per_prompt: 1
  successful_answers_total: 20
  promise_seven_complete_daily_refreshes: false
  daily_credit_reset: false
  claim_limit_per_billing_account_lifetime: 1
  content_creation: false
  growth_agent: false
  ai_credits_total: 0
  expiry_stops_new_paid_execution: true

access_lifecycle:
  cancellation_preserves_verified_paid_period_access: true
  prepaid_topups_do_not_extend_subscription_access: true
  new_terms_do_not_rewrite_historical_invoices_or_grants: true
  free_signup_profile_does_not_grant_permanent_funded_execution: true
  plan_and_addon_transitions: existing_verified_lifecycle
  funding_mode_transitions: renewal_only
  data_deletion_policy: preserve_existing_verified_policy
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
    - platform_routes_and_credentials_provisioned
    - actual_grounded_execution_usage_and_costs_calibrated
    - verified_runtime_token_search_and_reasoning_rate_cards
    - route_capacity_configured_and_tested
    - answer_reservations_scheduled_coverage_and_settlement_verified
  content_and_growth_agent:
    - verified_published_ai_credit_policy
    - model_call_caps_and_credit_enforcement_verified
  expansions:
    - sku_exists_in_persisted_runtime_catalog
    - regional_price_configured
    - quantity_expiry_and_supplement_grants_verified
  public_trial:
    - eligibility_and_abuse_controls_verified

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

| Metric | Starter | Growth | Scale |
|---|---:|---:|---:|
| Scheduled answers | 930 | 2,790 | 5,580 |
| CiteLadder subscription | $49.00 | $99.00 | $199.00 |
| Estimated provider bill | $35.47 | $106.42 | $212.83 |
| Estimated combined spending | $84.47 | $205.42 | $411.83 |
| Managed subscription | $99.00 | $249.00 | $499.00 |
| Estimated net saving | $14.53 | $43.58 | $87.17 |

Operational reference: revalidate new managed sales when representative measured blended cost exceeds $0.04 per delivered answer. Do not silently cut scheduled coverage already sold.
