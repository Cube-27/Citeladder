# Earned sources improvement plan

**Status:** implemented 2026-10-09 in one PR (phases 1-2, 3, 4 as commits).
Shipped behaviour is owned by [Earned sources](../earned-sources.md).

Feature 9 of the [feature review tracker](feature-review-tracker.md): inspection
of third-party pages that answer engines cite, the earned Actions derived from
them, and the Source URL detail page. Shipped behaviour is owned by
[Earned sources](../earned-sources.md), not by this plan. Constraints:
[invariants](../invariants.md), especially commit-before-network-I/O, distinct
unknown / absent / not-read states and the single migration baseline.

## Context

The Domains and URLs tables under AI Visibility → Sources work and stay as they
are. Clicking a URL opens a detail page that shows six counters, an engines
card, the brands named in the answers that cited the page, and the prompts.
It says nothing about the page itself and offers nothing to do.

Behind it sits an inspection pipeline that was first built around a
domain-keyed rule, then rebuilt as four page-keyed rules with their own
placement-check machinery. It has no screen. Locally it read 25 of 84 cited
pages and has never produced an Action. Some of that is real (most cited pages
in both local projects are other businesses' own sites), and some is defects.

Peec ([URLs](https://docs.peec.ai/urls.md),
[sources](https://docs.peec.ai/understanding-sources.md),
[Actions](https://docs.peec.ai/actions.md)) frames the same idea simply: a URL
detail page with usage over time, the brands mentioned on the page, the
prompts and chats that used it, and a gap view of sources where competitors
appear and the brand does not. Results are judged on prompt performance over
time, with no claim of attribution. Searchable's cited-URL detail
([API](https://docs.searchable.com/api-reference/sources/get-a-cited-urls-detail.md))
returns the same core: whether the brand is mentioned, each brand, competitor
or third party mentioned on the page with quoted excerpts, and the prompts
citing it. Its [citation-gap recipe](https://docs.searchable.com/recipes/citation-gap.md)
routes "cited sources don't mention you" to outreach rather than on-site work,
and notes that winnability is not knowable from the page.

## Owner direction (2026-10-09)

1. Keep the Domains and URLs tables. The problem is the URL detail page, which
   conveys nothing useful.
2. The useful addition is the earned opportunity: competitors are on this page
   and we are not, with an Agent handoff to act on it.
3. After a listing, success is read from the same prompts' mentions and
   citations over time. That is prompt change measurement, the same for owned
   and earned work; attribution is not possible and is not claimed.
4. Expect debt from the domain-keyed → page-keyed rewrite.

## Findings (verified)

File references are to `frontend/services/api/src/` unless noted.

**Logic and correctness**

- F1. Listicles with Article or BlogPosting schema are classified `article`,
  because structured data outranks a "Top 10 / Best" heading
  (`source-pages/assessment.ts:41-53`, `config/source-pages.ts:33-42`).
  `article` is not an includable format, so the commonest earned page can never
  raise an Action. `profile` (directory entries) and `alternative` are also
  excluded (`config/earned-actions.ts:45`).
- F2. Competitors' own pages are admitted, inspected and can raise "get listed"
  on a competitor's site (`source-pages/sync.ts:125-140`, `admission.ts`,
  `analysis/opportunities/earned-pages.ts:75-80`).
- F3. All entities on a page share one eight-passage cap, assessed brand first.
  A page that names the brand eight times leaves every competitor `ambiguous`,
  which is not presence (`source-pages/assessment.ts:55-71`).
- F4. On-page matching ignores the per-project mention rules introduced in
  feature 3. A spaced spelling of a joined brand ("The Asian School" for
  `theasianschool`) or a dense-script brand can only be `ambiguous`, never
  present (`assessment.ts:139-185`); the roster fingerprint omits the rules
  (`source-pages/reading.ts:40-56`).
- F5. One failed read sets the page `failed` and drops its Action, though the
  previous reading is still valid (`persistence.ts:130`, `earned-pages.ts:16`).
  Failed pages are re-claimed every run with no backoff; blocked pages are
  never re-read (`admission.ts:93`).
- F6. A redirect token that fails once is charged and never retried, so its
  publisher page never enters the inventory (`admission.ts:59-61`,
  `inspector.ts:121-130`).
- F7. Uncited organic search results are inspected first, ahead of stale pages
  (`sync.ts:185-236`, `admission.ts:107-108`).
- F8. An earned Action's verification never measures visibility: earned
  members freeze only a placement check (`opportunities/declaration-checks.ts:173`),
  so the visibility leg reports "not run" forever.
- F9. Rule and placement defects in machinery this plan retires: a defend
  check satisfied without any publisher change, `owned_domain_missing` firing
  on nearly every page, research checks that can never settle, settlement
  before the grace period, and stale or roster changes flipping every Action to
  research.

**Performance and cost**

- F10. Inspection syncs cited and organic pages twice per run, one upsert per
  row, under the project lock shared with prompt writers and the Opportunity
  refresh (`inspector.ts:118,138`, `sync.ts`).
- F11. `resolveCitation` scans every citation in the workspace per redirect
  (`sync.ts:249-270`). `refreshDifferentiation` loads every snapshot of every
  candidate page (`differentiation.ts:212-226`). The maintenance backstop
  anti-joins every completed audit on an unindexed JSON field
  (`audits/maintenance.ts:309-325`). The MCP sources read queries
  `source_pages` once per row (`mcp/evidence.ts:652-679`).

**Usability**

- F12. The URL detail page never reads `source_pages`
  (`visibility/source-url.ts`): no read state, page type basis, on-page
  presence, passages or Action link. The sources read loads
  `inspection_state` and `opportunity_id` for every row and no component uses
  them (`visibility/sources.ts:322-371`).
- F13. The only trace of inspection is a mouse-only tooltip on the URL type
  badge (`components/visibility/source-rows.tsx:156-169`). `unresolved` reads
  "Other" in Sources and "Format unresolved" in the Action drawer, from two
  vocabularies that disagree on six formats (`lib/visibility/source-pages.ts`,
  `lib/visibility/vocabulary.ts`).
- F14. The earned brief sends prompt indices rather than prompt text, names no
  ask, and suggests owned-content skills (`about_us`, `case_study`) instead of
  the outreach skill (`analysis/opportunities/earned-page-brief.ts`,
  `config/earned-actions.ts:50-59`).
- F15. The Agent's differentiation tool returns raw rows, including workspace
  and task IDs (`source-pages/differentiation-reads.ts:8-16`).

**Debt**

- F16. Still wired: the retired `earned_source_recurs_beside_gap` rule and its
  thresholds (`config/opportunity.ts`, `config/actions.ts`,
  `config/earned-actions.ts:7-30`, `e2e/action-loop.spec.ts`); domain rollups
  written to `opportunity_snapshots` that nothing reads
  (`analysis/opportunities/source-mix.ts:63-106`); `inspection_requested_at`
  and the "explicit request" branch, which nothing writes; the Python-format
  roster digest; unused config constants; two `citationIdentity`
  implementations; three definitions of sufficient coverage; redundant
  `placement_checks` indexes.
- F17. The documentation promises an "explicit authorized command" for
  inspection and a status carry-forward from the retired rule; neither exists.

## Phase 1: one earned opportunity, measured on prompts

| # | Change | Where |
|---|---|---|
| 1.1 | One earned rule: **competitors are on this page and you are not** (`earned_page_acquire_listing`). It fires when the page was read with sufficient coverage, its format admits a new entrant, at least one tracked competitor is present on it and the brand is not detected. The correct, defend and research rules are retired. | `analysis/opportunities/earned-pages.ts`, `config/earned-actions.ts`, `config/opportunity.ts`, `config/actions.ts` |
| 1.2 | Declaring an earned Action freezes prompt-scoped visibility checks for the tracked prompts whose answers cited the page, the same checks owned work uses. No placement check. | `opportunities/declaration-checks.ts`, `verification*.ts`, `measurement-legs.ts` |
| 1.3 | Retire the placement machinery: `placement_checks` (table, indexes, writers), settlement, `placement-outcome.ts`, `config/placement.ts`, the placement leg and its UI. Whether the brand is now listed is shown on the URL page from the latest reading. | `source-pages/placement-settlement.ts`, `opportunities/placement-declaration.ts`, `migrations/versions/0001_initial.py`, `components/opportunities/verification-observations.tsx` |
| 1.4 | Retire the domain-keyed rule and its constants, the unread domain rollups and action-path mix, `inspection_requested_at` and the request branch, the Python roster digest and the dead config. | F16 files |
| 1.5 | The brief carries prompt text, the competitors listed with their quoted passages, the page's format and the ask (an entry like theirs, linking our page), and suggests the `earned_authority` skill. | `earned-page-brief.ts`, `config/earned-actions.ts` |

## Phase 2: inspection that reads the right pages correctly

| # | Change | Where |
|---|---|---|
| 2.1 | Admission skips brand-owned and competitor-owned pages. Order: pages cited in answers before organic-only results; stale before untouched organic. | `source-pages/sync.ts`, `admission.ts` |
| 2.2 | A list-shaped heading outranks generic Article schema; `profile` and `alternative` become includable formats. | `assessment.ts`, `config/source-pages.ts`, `config/earned-actions.ts` |
| 2.3 | Each entity gets its own passage allowance. | `assessment.ts` |
| 2.4 | On-page matching uses the project's mention rules through the visibility matcher, and the roster fingerprint includes them. | `assessment.ts`, `reading.ts`, `analysis/scoring.ts` |
| 2.5 | Qualification uses the latest successful reading, not the page's current state; a failed read backs off; blocked pages are re-read after the stale window. | `persistence.ts`, `admission.ts`, `opportunities/earned-page-hits.ts` |
| 2.6 | A failed redirect token can be retried within its budget. | `admission.ts`, `inspector.ts` |
| 2.7 | Sync once per run with multi-row upserts; redirect resolution scoped to the audit; the maintenance check uses the task's idempotency key; differentiation loads only each page's latest qualifying snapshot; the MCP read joins once; one citation identity and one coverage definition. | F10, F11, F16 files |
| 2.8 | The differentiation tool returns the report without internal IDs. | `differentiation-reads.ts` |

## Phase 3: a useful URL detail page (UX addition)

The page answers, in this order: is there something to do here, what is on
the page, and how engines use it.

| # | Change | Where |
|---|---|---|
| 3.1 | **Opportunity card.** When the page qualifies: "Listed here: Competitor A, Competitor B. You aren't." with each competitor's quoted passage, and two actions: open the Action, or start it in the Agent with the brief. When the brand is listed: "You're listed", with the passage. When the page belongs to a competitor or to you, it says so and offers nothing. | `components/visibility/source-url-detail.tsx`, new `source-url-page-card.tsx`, `visibility/source-url.ts`, contracts |
| 3.2 | **What's on this page.** Read state in words ("Read 3 days ago", "Not read yet", "The publisher blocks automated access"), the page type with how it was established, and on-page presence for the brand and each competitor, kept distinct from the answer co-occurrence brands card. | same; `lib/visibility/source-pages.ts` |
| 3.3 | **Use over time.** Retrievals per day for the selection, by engine, so a reader can see whether engines still lean on the page. | `visibility/source-url.ts`, `source-url-cards.tsx`, reuse `source-charts.tsx` |
| 3.4 | One page-type vocabulary with one label for `unresolved`; the basis is visible text, not a hover tooltip; dead labels and their tests go. | `lib/visibility/vocabulary.ts`, `source-pages.ts`, `source-rows.tsx` |
| 3.5 | The detail read joins the page's latest reading and its open Action in one bounded query by URL hash; it never fetches or enqueues. | `visibility/source-url.ts` |

## Phase 4: tests and documents

Tests for credible regressions: an Article-schema listicle raises the Action;
a competitor's own page is not admitted; a brand named often leaves
competitors present; a spaced brand spelling is present under the mention
rules; a failed read keeps the Action; cited pages are inspected before
organic-only ones; an earned declaration freezes prompt visibility checks; the
URL page renders the opportunity, listed, competitor-owned and not-read
states. Tests for the retired rules, placement settlement, the request branch,
the Python digest and dead labels are deleted with them; tests restating
config arithmetic are rewritten with literals.
[Earned sources](../earned-sources.md) is rewritten from the shipped
behaviour; [Opportunities](../opportunities.md) drops the placement leg.

## Not in this feature

- Per-prompt mention and citation history over time, with Action markers, is
  prompt change measurement for all work, owned or earned. It belongs to the
  Visibility owner (feature 3) and goes to the backlog if it is not already
  served there.
- A "gap" filter on the URL table (pages where competitors are listed and you
  are not) and an authorized "read this page now" command: backlog.
- Production keeps an orphaned `placement_checks` table until its next
  authorized reset; nothing reads or writes it.
