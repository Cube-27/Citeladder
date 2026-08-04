# CiteLadder AI Visibility: Backend Implementation Plan

**Repository:** `abhij1306/Citeladder`  
**Scope:** URL onboarding through project creation, AI Visibility measurement, trend detection, reruns, opportunities, scheduling, and the Phase 2 content handoff  
**Priority:** Correctness and reliability before pricing integration or further UI work

## 1. Objective

For every valid, existing website, onboarding must create a complete and trustworthy CiteLadder project containing:

- A correctly normalized brand identity.
- Industry selection, defaulting to `General`.
- An optional subindustry when the user selects a non-General industry.
- Ten editable, brand-neutral, high-value prompts.
- Zero to five evidence-backed competitor suggestions.
- A project capable of immediately running an AI Visibility audit.
- Explicit evidence, provenance, and confidence when information is uncertain.

The system must never fabricate brand visibility, competitors, citations, rankings, or website information.

### Blocking failures

Only the following conditions should block onboarding:

1. The URL is invalid or the website does not exist.
2. Required API credentials are invalid or unavailable.

Website bot protection, Firecrawl failure, malformed LLM output, incomplete research, and lack of discoverable competitors must be handled internally or represented as non-blocking degraded confidence.

## 2. Product Decisions Incorporated

- Brand and URL are the essential onboarding inputs.
- Industry defaults to `General`.
- Subindustry is optional and appears only for a non-General industry.
- Onboarding generates ten prompts once; users manage the portfolio afterward.
- Prompts are brand-neutral market questions based on the industry and the brand's actual products, services, customers, and use cases.
- Prompt generation uses a repository industry library plus LLM personalization. Pure static JSON generation is not sufficient.
- Firecrawl is optional rather than a universal dependency.
- Competitors must satisfy product substitutability, customer/use-case overlap, geographic relevance, and visibility for the same market questions.
- Up to five competitors may be selected; zero competitors is valid.
- Default audit repetitions remain one and are adjustable.
- Successful responses are retained when another prompt or provider fails.
- Users can rerun only failed prompts, engines, or providers.
- Prompts are reordered strongest-to-weakest after each run.
- Prompt performance combines brand visibility, competitive position, and owned citations, led by brand visibility.
- A decline requires cross-engine and repeated evidence and must occur in three of the last four comparable runs.
- Confirmed declines create content-improvement opportunities.
- Development mode exposes all capabilities; pricing restrictions are integrated later.

## 3. Foundational Measurement Principles

### 3.1 Neutral prompts remain neutral

The system must not insert a startup's name into market prompts merely to produce data. A neutral prompt measures whether the brand appears organically.

### 3.2 Zero is different from no data

| Situation | Meaning |
| --- | --- |
| Provider completed and brand was absent | Valid zero visibility |
| Competitors appeared but brand was absent | Valid competitive visibility gap |
| Brand appeared only in branded diagnostics | Brand is understood but organically absent |
| Brand was absent even in branded diagnostics | Entity/indexing/knowledge problem |
| Provider or prompt execution failed | No data for that execution |

### 3.3 Prompt cohorts

- `market_visibility`: neutral prompts used for headline scoring.
- `brand_diagnostic`: branded questions used to test entity understanding; excluded from organic scoring.
- `comparison_diagnostic`: named comparisons used for diagnosis; excluded from organic scoring.

## 4. Implementation Workstreams

### 4.1 Reliability contract and error taxonomy

Create stable backend status and error codes:

- `invalid_url`
- `site_not_found`
- `api_key_invalid`
- `research_degraded`
- `competitors_not_found`
- `project_ready`

`research_degraded` and `competitors_not_found` are informational and cannot block project creation.

Clarify the provider privacy boundary:

- Measurement providers receive neutral prompts and do not receive a hidden competitor list.
- The onboarding research provider may receive the brand, URL, selected industry, and scoped research context.
- Research and measurement remain distinct, versioned operations.

### 4.2 Split the onboarding monolith

Refactor the current project discovery service into:

```text
backend/app/domain/projects/onboarding/
  normalization.py
  site_resolution.py
  research.py
  industry_library.py
  prompt_generation.py
  prompt_validation.py
  competitor_discovery.py
  completion.py
  schemas.py
```

The orchestration layer should advance workflow state and persist results without containing crawling, prompt, scoring, and transaction logic itself.

### 4.3 URL and site resolution

Implement a deterministic resolution pipeline:

1. Trim and parse input.
2. Add `https://` when the scheme is missing.
3. Normalize hostname casing, IDN/punycode, default ports, fragments, and paths.
4. Follow safe redirects and retain both the entered and canonical URLs.
5. Extract the registrable domain.
6. Prevent private, loopback, link-local, and internal network access.
7. Confirm existence with DNS and safe HTTP resolution.
8. Treat `401`, `403`, and bot-protected responses as evidence that the website exists.

Brand identity should persist:

- Canonical brand name and domain.
- Brand aliases.
- Owned domains.
- Product/service summary.
- Geography/market.
- Evidence URLs.
- Per-field confidence.

Low confidence must produce an editable review state, not onboarding failure.

### 4.4 Research cascade without mandatory Firecrawl

Use the following order:

1. Fast direct fetch of the homepage and common descriptive pages.
2. One structured LLM call with native web search for brand, product, market, and entity research.
3. Firecrawl only when rendered extraction or deeper crawling is necessary.
4. Industry-library fallback when external research remains incomplete.

Every model response must use a strict schema, validation, bounded internal retries, and versioned provenance.

Persist a `BrandResearchSnapshot` containing:

- Evidence and source URLs.
- Research provider and model version.
- Research method.
- Extracted fields.
- Confidence per field.
- Warnings and fallback path.

### 4.5 Repository industry library

Create a versioned JSON library containing:

- Major industries and optional subindustries.
- Customer types and use cases.
- Product/service categories.
- High-value topics.
- Intent classes.
- Prompt archetypes.
- Competitor qualification hints.
- Geographic or locale variations.

Generation flow:

```text
industry archetypes
+ researched products and services
+ selected geography
+ intent coverage rules
+ one LLM personalization pass
= ten onboarding prompts
```

Prompt validation must enforce:

- No brand or competitor names in market-visibility prompts.
- Natural language that resembles genuine buyer questions.
- Relevance to actual products/services and use cases.
- Coverage of discovery, comparison, problem/solution, evaluation, and purchase intent.
- Semantic deduplication.
- No filler or vague prompts.
- Exactly ten accepted onboarding prompts.

### 4.6 Competitor discovery from the measurement universe

Competitor discovery must originate from the same questions that will be measured:

```text
brand research
→ product and use-case intents
→ candidate neutral prompts
→ web calibration
→ organizations appearing for those prompts
→ qualification
→ user confirmation
```

Score candidates using all four agreed dimensions:

1. Substitutable products or services.
2. Same customers and use cases.
3. Same country or market.
4. Appearance for the same industry questions.

Suggest up to five competitors with evidence and reasoning. Zero is valid. Never auto-add a company.

### 4.7 Atomic, idempotent project creation

After review, create the following in one transaction:

- Project and brand identity.
- Industry and optional subindustry.
- Brand aliases and owned domains.
- Confirmed competitors and their aliases/domains.
- Prompt portfolio version 1.
- Ten selected prompts.
- Research and calibration provenance.

Use an idempotency key so repeated completion requests return the same project.

Site Health crawling starts asynchronously after the project exists and cannot roll back onboarding.

### 4.8 Freeze the complete audit universe

Every audit must snapshot:

- Prompt portfolio version.
- Prompt text, topic, intent, cohort, industry, and subindustry.
- Brand aliases and domains.
- Competitor aliases and domains.
- Engine and provider configuration.
- Repetitions.
- Scoring-rule and analyzer versions.

Historical audits must never change when live prompts, aliases, or competitors are edited.

### 4.9 Prompt-level scoring

Initial versioned weighting:

- Brand visibility: **60%**.
- Competitive position/share: **25%**.
- Qualified owned citations: **15%**.

When no competitors are selected, omit the unavailable competitive component and proportionally normalize the remaining weights.

Rules:

- Unordered mentions are not rankings.
- An explicit rank exists only when the response contains a genuinely ordered recommendation, list, or table.
- Otherwise, competitive position uses deterministic share of voice.
- Persist every citation, but award scoring credit only to contextually relevant owned citations connected to a brand, product, service, or recommendation claim.
- Store per-engine and combined scores.
- Show cross-engine consistency as a separate confidence signal.
- Sort prompts strongest-to-weakest after each completed run.

### 4.10 Immediate and long-term trends

Persist for each prompt:

- Current composite score.
- Previous comparable-run score.
- Immediate delta.
- Rolling four-run trend.
- Engine agreement.
- Repetition agreement.
- Evidence coverage.
- Trend confidence.

A decline is confirmed only when:

1. Negative movement exceeds a configurable materiality threshold.
2. The decline appears in three of the last four comparable runs.
3. At least two engines agree.
4. If repetitions exceed one, repetition-level evidence also confirms it.

Comparable runs use the same prompt identity/version and overlapping engine set.

### 4.11 Partial audits and targeted reruns

Add:

```http
POST /api/v1/audits/{audit_id}/rerun-failures
```

Allow filtering by provider, engine, prompt, or individual failed task.

Rerun invariants:

- Never rerun or overwrite successful slots.
- Append a provider attempt to the failed slot.
- Preserve earlier failure evidence and all successful raw artifacts.
- Re-analyse only newly successful slots.
- Produce a new immutable metric-snapshot generation.
- Mark an otherwise usable run `completed_with_failures` while failed slots remain.
- Prevent duplicate counting through stable slot identity and idempotency.

### 4.12 Untracked competitor suggestions

Extract organizations found in completed answers and citations. Suggest an untracked competitor only when it:

- Appears across multiple approved prompts.
- Appears on at least two AI engines.
- Matches product, industry, use-case, and geography evidence.
- Is not an alias of the brand or an existing competitor.

Suggestions require user confirmation and never alter historical scores.

### 4.13 Confirmed decline opportunities

Extend the existing opportunity engine with a rule such as `confirmed_prompt_decline` containing:

- Prompt and topic.
- Three-of-four-run evidence.
- Engines and repetitions confirming the decline.
- Visibility, competitive, and citation components.
- Recommended content goal.
- Link into Content generation.

Reuse the current immutable and superseding opportunity model instead of building another recommendation system.

### 4.14 Development scheduling

Add an unrestricted development `AuditSchedule` with:

- Manual, daily, or configurable cadence.
- Timezone.
- Prompt portfolio.
- Engines.
- Repetitions, defaulting to one.
- Enabled/disabled state.
- Next-run and last-run timestamps.

Scheduled and manual runs must call the same audit planner. Pricing-tier enforcement remains a later integration.

### 4.15 Phase 2 content-agent foundation

After measurement and decline detection are stable, extend Content generation with:

- `skill_id`: `youtube`, `reddit`, `blog`, or `article`.
- Natural-language instructions.
- Optional source opportunity.
- Prompt/topic evidence context.
- Save-to-Brand-Knowledge action.
- User acceptance and rejection feedback.

Generated content must not enter Brand Knowledge without explicit user confirmation.

## 5. Data Model Changes

Recommended additions or extensions:

- `BrandResearchSnapshot`
- `PromptPortfolioVersion`
- `AuditEntitySnapshot`
- Expanded `AuditPromptSnapshot`
- `PromptMetricSnapshot`
- Versioned/superseding `MetricSnapshot`
- `ObservedEntityCandidate`
- `AuditSchedule`
- Content `skill_id`, `opportunity_id`, and Brand Knowledge acceptance metadata

All records remain UUID-based and workspace-scoped. Raw execution artifacts remain immutable. Derived rows carry analyzer, rule, configuration, and source-evidence provenance.

Under the repository's greenfield migration policy, update `migrations/versions/0001_initial.py` rather than creating incremental migration files.

## 6. Recommended Pull Request Order

1. Reliability contracts, status taxonomy, and architecture decision.
2. URL resolution and extraction of onboarding modules.
3. Industry JSON library and research cascade.
4. Prompt validation and prompt-coupled competitor discovery.
5. Atomic project completion and audit entity snapshots.
6. Prompt-level scoring, trends, and versioned metric snapshots.
7. Partial-audit states and targeted reruns.
8. Untracked competitor suggestions and confirmed-decline opportunities.
9. Development scheduling.
10. Content skill handoff and deletion of legacy paths.

Each pull request must leave the application runnable and independently testable.

## 7. Testing Strategy

### Unit tests

- URL normalization, redirect handling, IDN domains, bot blocks, and SSRF protection.
- Prompt validation, semantic deduplication, and identity neutrality.
- Competitor qualification scoring.
- Zero visibility versus no-data semantics.
- Composite-score weighting and missing-component normalization.
- Ordered versus unordered response handling.
- Three-of-four trend detection.
- Cross-engine and repetition confirmation.
- Targeted-rerun idempotency and duplicate-count prevention.

### Integration tests

- Established brands, small startups, local businesses, service companies, ecommerce, and B2B sites.
- Static, JavaScript-rendered, bot-protected, redirecting, and sparse sites.
- LLM malformed output and timeout injection.
- Firecrawl disabled or unavailable.
- One provider failing while others succeed.
- Failed prompt/provider rerun followed by metric recomputation.
- Zero competitors and later competitor addition.

### Golden evaluation corpus

Maintain a reviewed fixture set containing:

- Expected brand identity.
- Industry/subindustry.
- Product/service coverage.
- Acceptable competitor candidates.
- High-value prompt requirements.
- Explicit invalid or unacceptable output examples.

Use this corpus to prevent prompt-generation and discovery regressions.

## 8. Technical Debt to Remove

- The 1,400+ line onboarding discovery service.
- Firecrawl as the mandatory discovery path.
- Conflicting `needs_input` and automatic-retry states.
- Prompt-quality validation based mainly on identity checks or ratios.
- Site Health work inside the project-creation transaction.
- One mutable/unique aggregate metric snapshot per audit.
- Any inferred ranking based only on mention order.
- Hard-coded thresholds, weights, models, and retry behavior.
- Duplicate opportunity/recommendation logic outside the existing opportunity engine.
- Documentation that conflates onboarding research with neutral measurement-provider inputs.

## 9. Definition of Done

The implementation is complete when:

- A representative corpus of valid sites always reaches onboarding review.
- Firecrawl can be disabled without breaking onboarding.
- Ten prompts are created and pass deterministic quality validation.
- Zero competitors can be confirmed without blocking completion.
- Competitor suggestions include evidence for the four qualification dimensions.
- Project creation is atomic and idempotent.
- A completed answer with no brand mention records zero visibility.
- Provider failures record no data without discarding successful executions.
- Failed prompts/providers can be rerun independently.
- Reruns never double-count or overwrite successful evidence.
- Prompts are ranked strongest-to-weakest using the versioned composite score.
- Immediate movement and rolling trends are available per prompt.
- Decline opportunities require cross-engine and three-of-four-run confirmation.
- Every metric and opportunity traces to immutable raw evidence.
- All operational thresholds and weights live in configuration.
- Legacy onboarding and scoring paths are removed after migration.

## 10. Explicit Assumptions

The following previously unanswered details are resolved for the first implementation:

1. **Unordered responses:** Mention order does not imply rank. Only explicitly ordered recommendations produce a rank.
2. **Owned citations:** All citations are persisted, but only contextually relevant owned citations earn scoring credit.
3. **Untracked competitors:** A company must appear across multiple prompts and at least two engines before being suggested. Suggestions always require confirmation.
4. **Initial score weights:** Visibility 60%, competitive position/share 25%, and qualified owned citations 15%. These are versioned and can be recalibrated through evaluations.
5. **Architecture priority:** Reuse the existing deterministic scoring, immutable evidence, audit planner, opportunity engine, and content queue where correct; replace the weak discovery and prompt-level intelligence layers.
