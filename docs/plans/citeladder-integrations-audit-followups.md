# Integrations and AI-visibility audit — remaining work

Companion to the branch `fix/integration-import-revision-and-frozen-target`, which
closed every **correctness** finding from the 11 September 2026 audit. What is
listed here is the work that branch deliberately did not do, with enough context
to pick up cold.

Source audit: `CiteLadder-Integration-and-AI-Visibility-Audit-Plan-2026-09-11.md`
(ChatGPT-generated; every code claim in it was verified before acting, and two
were wrong — see *Corrections* below).

## Shipped on that branch

| Finding | What changed |
|---|---|
| INT-01 | `resync_seq` allocated per CONNECTION, not per window, so overlapping windows produce comparable revisions and the late-data pass actually supersedes |
| INT-02 | A sync run FREEZES `mapping_id` / `property_ref` / `project_id` at enqueue; derivation reads those, never the mutable `connection.account_ref` |
| INT-03 | Mapping retirement scoped by project; dispatcher and project fan-out iterate mappings, so one consent serves several projects |
| INT-04 | Connection test refreshes the token and probes the connection's OWN provider; distinguishes unusable grant from inaccessible property |
| INT-05 | Backfill resumed rather than re-imported, failed chunks retried, coverage stops at the first gap, readiness scoped to the target |
| AI-01 | `brand_absent_high_value_prompt` requires genuine absence; mentioned-but-uncited falls to `owned_page_not_cited` |
| AI-02 | Fanout totals and search come from the server's full-selection aggregation |
| AI-03 | Source tiles relabelled to what they count |
| AI-04 | Fabricated `0.85` confidence deleted; method limits recorded; position claim narrowed |
| DATA-01 | One shared current-snapshot selector ordered by observation window; observed query, metrics and period now reach the generator |
| — | 30-day free / plan-scoped history via the previously unread `history_window` capability |
| — | Bing scope narrowed to `webmaster.read`; `BING_OAUTH_*` secret alias; production guard on a loopback `FRONTEND_URL` |

## Not done, in the order worth doing

### 1. Addition D — make Mentions & Citations actionable

Surface the four observed states (mentioned+cited / mentioned only / cited only /
neither), the engines that produced no observation, and the competitor evidence
beside each — then link the applicable source/page/prompt to its existing
Opportunity or Content handoff.

Cheapest real value left, because the data is already wired: `AnalysisEvidence`
now carries `brand_mentioned`, and gap hits record `observed_engines` and
`repetitions`. Reuse `domain/opportunities/content_handoff.py`
(`project_content_handoff`) rather than inventing a second handoff shape.
Preserve the user's skill choice; never auto-publish.

### 2. Addition A — search-backed prompt generation

An explicit "Generate prompts from selected search queries" action in the
Performance/Demand flow, reusing the existing classification → generation →
validation → editing path.

**Already scoped as Slice 6 of `docs/plans/citeladder-data-pipeline-rebuild.md` —
extend that plan, do not write a parallel one.** Half the groundwork landed with
DATA-01: the generator now receives observed query text, metrics and the
observation period. What remains is the selection UI and carrying
`QueryEvidenceRow` provenance onto the generated prompts.

Never auto-replace the tracked portfolio, and never equate GSC impressions with
AI prompt volume.

### 3. Additions B, C, E

- **B — evidence-backed opportunity prioritisation.** Prefer a "search-backed"
  badge and useful sorting over another blended score.
- **C — a "what changed / what to do" summary in Trends.**
- **E — expose the measurement loop.** The backend is already built:
  `domain/opportunities/verification_result.py` returns three legs (visibility,
  AI-referral traffic, branded search demand) plus `gap_changes`,
  `overlapping_action_ids` and an explicit causality notice. Only the UI is thin
  — a status footer in `components/opportunities/opportunity-status-footer.tsx`.
  Cheap for what it shows.

### 4. Connect-flow polish (design, not correctness)

The structure is fine; the visual treatment is what wants work. Worth a pass with
`/impeccable` over `frontend/components/settings/`. Two specific items:

- **Preselect the property matching the project's site URL** in the existing
  picker. Reuse the page-equivalence helpers in `domain/demand/page_equivalence.py`.
  The single biggest reduction in real effort still available.
- **Move the history backfill enqueue out of the HTTP request.**
  `domain/integrations/mappings.py::create_mapping` awaits
  `enqueue_history_backfill` inline, and each chunk takes a `FOR UPDATE` plus its
  own commit. This is far less painful than it was — a free workspace imports 30
  days, so two chunks — but a `history_window` of 12mo/24mo is 13–26 commits
  inside the request the user is watching. Wants an analytics task kind that fans
  out.

### 5. First-party AI reports — still gated

Google's generative-AI reporting and Bing's AI Performance postdate the audit's
sources, and neither provider SDK nor our dataset registry exposes an endpoint
for them. **Unverified, not disproven.**

Gate before any work: a documented endpoint, supported authentication, and one
authorized successful response. Until then do not promise automatic sync, do not
scrape an authenticated dashboard, and do not substitute ordinary search traffic.

Store first-party AI observations separately from ordinary web search and from
CiteLadder prompt experiments, preserving export type, property, date interval,
grain, source, metric meaning and import identity.

**One live inaccuracy to fix regardless:**
`frontend/lib/marketing-content/blog-posts/` already tells readers we read
"Generative AI in Search Console performance reporting". We do not. Correct the
copy or move it to a roadmap framing.

## Corrections to the audit, for whoever reads it next

- **INT-01 was understated.** The dispatcher enqueues a 28-day trailing window
  and a 3-day late-data window every tick. Different window pairs, so both got
  revision 0, so the three days they share collided and the correction was
  dropped. `test_integration_dispatcher.py` asserted that collision as correct
  behaviour.
- **INT-06 is not a defect.** `core/config/integrations_datasets.py` documents
  why `gsc_search_appearance_daily` is excluded and what collecting it needs.
  Leave it.
- **INT-02 and INT-03 are one bug** — "the sync run's target is a mutable
  connection pointer" — and one fix resolved both.
- **AI-02 had a complication the audit missed.** The fanout tab groups by prompt
  and by topic; the server aggregation returns a flat query list. The totals are
  now server-owned while the grouped table stays client-side. Moving grouping
  server-side is the remaining half, if anyone wants one scope instead of two.
