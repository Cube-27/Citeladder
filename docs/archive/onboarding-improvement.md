# Onboarding improvement plan

Feature 2 of the [feature review tracker](feature-review-tracker.md); this is its
audit-derived plan. **Status: complete (2026-10-08), shipped in one PR.** Shipped behaviour is
owned by [Onboarding](../onboarding.md), not by this plan. Constraints:
[invariants](../invariants.md), especially workspace authorization,
persisted-projection reads, commit-before-network-I/O and distinct
unknown / unreviewed / reviewed states.

## Why

A read-only audit of the discovery API, worker, research owners, onboarding UI
and their tests (2026-10-08) found one stall, avoidable per-request database
work, a contract still shaped by retired prompt generation, a retired completion
drain that was still live, and review UX that discards or hides user intent.
No discovery rows exist in any local database, so timings below are code bounds,
not production measurements. File references are to
`frontend/services/api/src/` or `frontend/` as noted.

## Owner decisions (2026-10-08)

1. **UX addition: edit identity facts after onboarding.** Category, buyer type
   and market scope are set only during onboarding today; the Agent context
   panel edits description, positioning, audience, products and the business
   map but not these three, although prompt generation and Site Health archetypes
   read them. They become editable in that existing panel, with reviewed
   provenance.
2. **Preselect discovered competitors up to the cap (5).** The user still
   reviews before creation and can deselect any of them.
3. **Retire the legacy completion drain.** The owner confirms production holds
   no `completing` discoveries or `brand_completion` tasks before deploying.
4. **One PR**, built as dependency-ordered commit slices.

## Phase 1: runtime correctness and cost

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | **Stall.** A transient failure puts the task in `retry_wait` for 30 s, but the discovery runner lane has no `nextDue`, so the runner exits idle and the retry waits for the 10-minute tick while the user watches a spinner. | Add `DiscoveryQueue.nextDue` and register it on the runner lane. | `workers/runner.ts`, `queue/discovery-queue.ts` |
| 1.2 | Every first-party fetch and every Keenable call runs `requireWorkspaceAccess` (4 queries); one discovery runs about 30. | Reuse Site Health's `cachedWorkspaceAccess` with a short TTL; revocation still applies within it. | `workers/discovery-worker.ts`, `entitlements/access.ts` |
| 1.3 | Up to 5 attempts of up to 180 s each, each paying model calls, for an interactive flow. | Default `maximum_attempts` 5 → 3. | `config/discovery.json` |
| 1.4 | Progress reports `pages_read: 1` for every running phase, whether or not the homepage was readable. | Report the homepage only when it was read. | `workers/discovery-worker.ts` |

## Phase 2: debt removal

| # | Finding | Change |
|---|---|---|
| 2.1 | Retired completion drain still live in the worker, queue claim, lease recovery, completion route, contract enum and UI. | Remove (decision 3) with its tests. |
| 2.2 | Contract fields with no producer since onboarding stopped generating prompts: discovery `topics`, `prompt_suggestions`, `gaps`, `progress.prompts_prepared`; completion `crawl_id`, `activation_state`, `page_limit`; catalog `required_fields`, `optional_fields`, `capture_methods`, `prompt_cohorts`, `price_tiers`, `business_types`. Only the app consumes this API. | Remove from the contract, server views and fixtures. Database columns stay (no production reset). |
| 2.3 | Unused config: settings `poll_seconds`, `reaper_interval_seconds`, `reaper_batch_size`; constants `discovery_statuses`, `service_business_models`, `brand_discovery_prompt_generator_version`, `brand_discovery_prompt_validation_version`; the `KEEBNABLE_API_KEY` typo alias. | Remove. |
| 2.4 | `DiscoveryProfile` is hand-copied from the contract schema in the web client. | Derive from the contract. |

## Phase 3: review UX

| # | Finding | Change |
|---|---|---|
| 3.1 | Decision 1. | Category, buyer type and market scope editable in the Agent context panel; the brand-profile update writes them to `business_context` and marks their field source `reviewed`. |
| 3.2 | Decision 2: competitors start unselected. | Preselect suggestions up to the cap. |
| 3.3 | Editing a discovered competitor replaces all its domains with one. | Edit the primary domain, keep the rest. |
| 3.4 | Project editor looks aliases up by the *edited* name, so renaming a competitor clears its aliases. | Match the competitor being edited, not its new name. |
| 3.5 | Project editor reuses onboarding's error copy, so a 403 on save reads "project limit reached". | Use the generic API error message there. |
| 3.6 | The progress list still says "Preparing your questions"; onboarding prepares no questions. | Describe the review being prepared. |

Declined during implementation: a proposed 1.5 (suggest competitors from the
input category when the identity model fails) would never fire, because the
form does not collect a category before research; the review warns instead.

Declined for this PR, moved to the backlog: persisting in-progress review edits
across refresh, showing evidence sources on the review step, and focus
management on step change.

## Phase 4: tests and documents

Shipped as listed. The test-file queue isolation now also settles discovery
tasks, so an earlier file's claimable discovery cannot be taken by a later
file's unscoped claim.

- Add: discovery `nextDue` drives the runner lane; server rejects a sixth
  competitor; cross-workspace discovery read over HTTP is 404; viewer cannot
  create or complete; completing a non-ready discovery conflicts; identity facets
  update with reviewed provenance and workspace isolation.
- Remove: the legacy drain tests, duplicated claim/replay paths, and UI
  assertions of copy, heading tags or element nesting identified by the audit.
- Rewrite [onboarding.md](../onboarding.md) from the shipped behaviour; update
  the tracker row and log.
