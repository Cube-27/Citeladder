# AI visibility gaps

The AI visibility capabilities CiteLadder lacks, measured against a leading AI-visibility
reference product's public documentation (chats, performance, brand insights, sources,
setup, competitors, and brand perception: brand, market, objections, fact-checking).
We describe capabilities only, never the reference's names, branding or UI.

Written 2026-11-17 from main at `5932440ba`. Paths are under `frontend/` unless they start
with `docs/`. `M:` means `services/api/migrations/0001_baseline.sql`. Line numbers will
drift, so re-locate them before editing.

**Mockups (approved 2026-11-18, AV-2).** Build each screen as the owner's local mockups
draw it: `~/citeladder-design-climb/reports/ai-visibility-gaps.html` for the Phase 1 and
Phase 2 screens, `~/citeladder-design-climb/reports/navigation-proposal.html` for the
navigation, the Prompt builder page and the Sources and Competitors pages. Where they
differ from this plan, the plan wins.

## Owner decisions (2026-11-17)

Recorded from the owner's answer in chat on 2026-11-17: "put W12 and W13 as phase 2 of the
plan and for your questions record all recommended answers as my decision".

- **AV-1, phases.** W12 and W13 (the probes that collect new data) are Phase 2. Every
  other workstream is Phase 1.
- **AV-2, mockups first.** No workstream is built until the owner approves an HTML mockup
  of Phase 1 and one of Phase 2.
- **AV-3, fact-check views reopen.** BL10 removed the fact-checking follow-ups. W2 brings
  back only the views of persisted fact-check data. W15 stays behind the pilot review
  (backlog F8).
- **AV-4, no strongest or weakest engine.** On 2026-11-18 the owner dropped the feature:
  "i dont want strongest and weakest engine feature so remove that".
- **AV-5, topic grouping.** Answers group by the topic their prompt had when the run
  froze it, so refiling a prompt never rewrites history. The UI shows topic renames.
- **AV-6, competitor themes.** Theme counts appear for competitors. Quotes stay
  brand-only. W8 updates
  [Answer perception](../visibility-prompt.md#answer-perception) to say so.
- **AV-7, win rate roster.** Position and win rate count only the tracked roster,
  never untracked names found in the answer.
- **AV-8, fanout queries.** "i think query fanout was alrady correct just the columns
  needed to be added" (2026-11-18): no separate word or phrase card. The existing Query
  fanouts table counts the queries exactly as engines returned them and gains Share,
  Change (against the previous comparable run) and Brands matched, with Top, Rising and
  Falling, under the tab's filters.
- **AV-9, market probes (W12).** Funded from customer audit credits like a normal run.
  The first version uses the closed theme list, not open clusters. Probes run on demand,
  with an optional schedule.
- **AV-10, objection probes (W13).** Funded the same way as W12. W13 ships after W12 is
  calibrated.
- **AV-11, competitor discovery (W14).** The existing perception template is extended to
  extract untracked business names. It is already platform-funded, so this adds no call.
- **AV-12, fact-check workflow (W15).** Verdict overrides count in accuracy, with an
  "N edited" disclosure. Brand facts stay typed by people, as
  [onboarding](../onboarding.md#brand-facts) says; models never draft them.

Recorded from the owner's answers in chat on 2026-11-18, while reviewing the first mockup:

- **AV-13, no Answers tab.** Asked whether the cross-run Answers list should fold into the
  prompt page, the owner answered "yes". W7 is a section on the prompt page.
- **AV-14, a Brand group.** "instead of putting everything inside ai visibility we can make
  two new options in sidebar": a Brand sidebar group with Insights and Perception. "fact
  checking goes inside perception": Perception has Brand, Market, Objections and
  Fact-checking tabs, and AI Visibility loses its Perception and Accuracy tabs.
- **AV-15, only what we have.** "dont try to copy what we dont have": a screen shows only
  data CiteLadder stores or a workstream here adds. Reference features without that data
  (tags, social channels, per-quote source lists) are not built.
- **AV-16, navigation.** The owner approved the navigation proposal ("yes looks good
  now") and asked for "a lable as "home" for overview and actions". The Dashboard
  sidebar is Home (Overview, Actions), Brand (Insights, Perception, Competitors),
  Tracking (Prompts, Sources, Runs), Website (Site health, Issues, AI traffic), Search
  (Performance, Keywords) and Commerce (Shopping, Products), with Integrations in the
  foot. Sources is today's AI Visibility page without Trends, Perception and Accuracy;
  Search demand becomes the Keywords page's Demand tab.
- **AV-17, Prompt builder page.** "we should also have a separate prompt builder page
  instead of sidebar": the builder leaves its side drawer for a page of its own, opened
  from Build prompts rather than listed in the sidebar.
- **AV-18, ship the frame first.** "ship the new layout options (include all options its
  ok to keep them blank for now as next agent will build them)": the sidebar and empty
  Insights, Perception and Competitors pages ship before their content.
- **AV-19, docs and changelog.** "phase 3 of the plan should include updating docs
  subdomain and changelog".
- **AV-20, API reference.** "add phase 4 as building API refernce in docs subdomain, i
  believe we already have rest api endpoints but there is no documentation for that"
  (2026-11-18, with two reference products' API docs): a full API reference section on
  the docs site, with a page per endpoint and request and response examples. Shipped in
  #967.
- **AV-21, one migration for this plan.** "dont add more migrations since nothing is
  deployed yet so all changes of this session in terms of migration should go into 0002
  itself" (2026-11-18): every schema change of this plan goes into
  `0002_ai_visibility_gaps.sql`, one header comment per part. Production is still on
  `0001_baseline` only (verified 2026-11-18).

## Where it lives

The sidebar, the renames and the empty Brand pages shipped with this plan's PR (AV-18).
The `N` workstreams below fill them.

- **Home:** Overview and Actions, unchanged.
- **Brand → Insights:** today's Trends tab (N1) plus W3, W4, W6 and W10, with W5 as a
  filter and matrix axis.
- **Brand → Perception:** tabs Brand (today's Perception tab plus W1 and the W8 theme
  map), Fact-checking (today's Accuracy tab plus W2 and W15), Market (W12) and
  Objections (W13).
- **Brand → Competitors:** the brand ranking table with W3 and W10 columns, the W14
  suggestions, and a page per competitor (W8).
- **Tracking → Prompts:** W3 columns, W9, the prompt page with W7, and Build prompts
  opening the Prompt builder page (N6).
- **Tracking → Sources:** tabs Domains, URLs, Read not cited, Query fanouts (W11 terms)
  and Ads. Answer formats show in the existing evidence drawer.
- **Search → Keywords:** tabs Demand (today's Search demand page), Keywords, Organic
  competitors and Backlinks (N5).

## Gap summary

| Area | Status | Evidence |
|---|---|---|
| Brand ranking (visibility, share of voice, rank, change); competitor trends; previous-period change; market filter | Have | `components/visibility/ranking-rows.tsx`, `lib/visibility/trends.ts`, `components/visibility/visibility-toolbar.tsx` |
| Average position, net sentiment per brand | Partial: `avg_position` is served but shown only as a tooltip; sentiment is on the Perception tab only | `services/api/src/visibility/metrics.ts`, `components/visibility/visibility-perception.tsx` |
| Win rate (named first) | Missing; first offsets are persisted | `response_analyses.brand_first_offset` (M) |
| Position and sentiment trend lines | Missing; the perception `trend` is served but not drawn | `lib/config/visibility.ts` |
| Topic dimension, cross-dimension matrix, leader per segment | Missing | `components/visibility/engine-comparison.tsx` |
| Competitor focus | Partial: focuses the trend chart only | `components/visibility/visibility-trends.tsx` |
| Trend event markers | Partial: prompt detail only | `components/prompts/prompt-detail-screen.tsx` |
| Prompt table share of voice, sentiment, web-search share | Missing; the data is persisted | `packages/contracts/src/visibility-perception.ts`, `response_analyses.search_used` |
| Bulk prompt actions | Partial: the API exists, there is no UI | `services/api/src/routes/prompts.ts` (bulk-status) |
| Answer list across runs | Missing; there is only a per-run executions table | `components/runs/executions-table.tsx` |
| Answer format flags, in-text links | Partial: ads, `search_used` and AI Overviews only | `components/runs/surface-evidence.tsx` |
| Sources used when a given competitor is named | Missing | Today the URL brand list shows only which brands appear together |
| Perception by topic, engine and prompt, plus trend | Missing in the UI; all of it is served | `perceptionResponseSchema` |
| Minimum sample before a percentage shows | Partial: "N of M classified" with no suppression | `components/visibility/visibility-perception.tsx` |
| Theme association by brand | Missing; competitor aspects are persisted | `entity_sentiments.aspects` (M) |
| Market positioning and objection probes | Missing | – |
| Fact-check trend, view by fact, claims CSV, verdict override, facts CSV import | Missing; the trend and the verdict and model-verdict columns exist | `packages/contracts/src/fact-checking.ts`, `claim_verdicts` (M) |
| Fanout terms | Partial: an exact-query table only | `components/runs/fanout-evidence.tsx` |
| Competitor suggestions | Partial: by domain, accept only | `services/api/src/analysis/observed-competitors.ts` |
| Sources, gap analysis, movers, near misses, markets, baselines, ads, fact-check extraction | Have, at or above the reference | [Read and UI surface](../visibility-prompt.md#read-and-ui-surface) |

What applies to every workstream:
- Reads stay persisted projections.
- Unknown, pending, unavailable, not-applicable and zero stay distinct.
- Models label. Code computes every share, rank and score.
- No version bumps and no backfills. New derivations apply from the next audit.

## Phase 1

### Navigation: fill the new pages (first)

Each moves existing views without changing what they read. Old tabs are removed in the
same PR that moves them, with no redirects (owner preference: no back-compat).

**N1 Insights (M).** Move the Trends tab's key figures, trend chart and brand ranking from
`components/visibility/` onto `/insights`, with the headline drawn in the mockup.
Engine comparison, surface rates, prompt insights and visibility by market move with it.

**N2 Perception (M).** Move the Perception tab onto `/perception` as its Brand tab and the
pilot's Accuracy tab as its Fact-checking tab. The Brand tab takes the mockup's headline,
theme list and sentiment ring, all from data the perception read already serves.

**N3 Competitors (S–M).** The brand ranking table and competitor suggestions on
`/competitors`; a row opens `/competitors/:name` (W8). Context keeps owning the roster;
"Edit competitors" links to it.

**N4 Sources (S).** `/visibility` keeps Sources, Ads and Query fanouts once N1 and N2 have
moved the rest; Sources' views become tabs: Domains, URLs, Read not cited.

**N5 Keywords (S–M).** Search demand becomes the Keywords page's Demand tab, and the
page's Competitors tab is renamed Organic competitors. `/demand` and its sidebar row go.

**N6 Prompt builder page (M, AV-17).** The builder drawer becomes `/prompts/build`: the
same four steps and the same generation pipeline, a step list on the left and Back and
Next in a fixed footer. Prompts, Overview and the empty states open it.

**N7 Copy (S).** In-page copy still names the old pages ("AI Visibility", "AI Traffic",
"Keyword Research"): loading labels, empty states, agent vocabulary, prompt-source
labels. Rename them to the sidebar's words.

### Display only, on data we already have

**W1 Perception breakdowns and trend (S).**
- Render the served `topics`, `engines`, `prompts` and `trend` on the Perception tab.
- A point that isn't comparable breaks the line.
- A config-owned minimum count makes a share read "too few classified", never zero.

**W2 Fact-check views (S–M, pilot-gated, AV-3).**
- A claims-over-time chart.
- A "By fact" view grouping `claim_verdicts` by frozen fact revision. A fact with no
  claims reads "not raised".
- A claims CSV export.

**W3 Position and sentiment in competitive tables (S–M).**
- Ranking table: Avg position and Net sentiment columns. Sentiment shows "N of M
  classified".
- Position becomes a selectable trend metric.
- Prompt table: share of voice, sentiment and web-search share. Web-search share counts
  only engines that report search use. Other engines read "not available".

**W4 Trend markers (S).**
- Trend markers for prompt-panel changes, engine or model identity changes, and Actions
  that went live.
- No strongest or weakest engine callout (AV-4).

**W5 Topic dimension (M, AV-5).**
- An optional `topic` parameter on ranking, trend and source reads.
- A "By topic" table.
- The grouping joins frozen prompt snapshots through `audit_answer_aggregates`. It is not
  a classification.

**W6 Performance matrix and top rankings (L; may split into an API PR and a UI PR).**
- Any two of engine, topic, market and brand as the axes, at most 10 items each.
- Cell metric: mention rate, share of voice, avg position or net sentiment, with answer
  counts.
- Who is #1 in each segment, and a CSV export.
- Empty cells read "not run" or "not measured".
- Needs an index review. Depends on W3 and W5.

**W7 Past answers on the prompt page (M, AV-13).**
- A "Past answers" section on the prompt page: every successful answer the prompt got
  across runs, newest first, paged by keyset.
- Filters in the page's control strip: run range, engine, market, brand named, cited,
  search used.
- Each row opens the existing evidence drawer.
- Pages that link to a prompt's answers (competitor focus, perception quotes) open the
  prompt page.

**W8 Competitor focus and theme association (M, AV-6).**
- Picking a competitor shows:
  - its KPIs and its trend
  - the domains cited in answers that name it
  - the prompts where it is named and you are not
- A brand-by-theme heat map from `entity_sentiments.aspects`, showing your
  most-associated theme and your largest gap to each theme's leader.
- Depends on W3.

**W9 Bulk prompt actions (M).**
- Row selection, including range select.
- Actions:
  - archive and activate, through the existing bulk-status endpoint
  - assign topic, through a new owner function under the project lock
  - delete, with a confirmation that states the effect
- Capacity locks apply to activate.

### New deterministic derivations

**W10 Win rate (M, AV-7).**
- At finalization, persist which tracked entity is named first in each answer.
- Serve win rate per brand, prompt, engine and topic.
- The denominator is answers that name at least one tracked business. When none is named,
  the answer is not applicable.

**W11 Answer formats and fanout query columns (M, AV-8).**
- At analysis, parse stored scraper artifacts for shopping, map, product-comparison and
  image elements:
  - API engines are not applicable.
  - Artifacts without markers are unavailable.
- In-text links versus citations, where the artifact tells them apart.
- Per-query counts and brand matches, persisted at finalization; the Query fanouts
  table adds Share, Change and Brands matched, with top, rising and falling queries.

### Collection that adds no provider call

**W14 Name-based competitor discovery (S first, then L; AV-11).**
- The S part: a Reject action on every competitor suggestion.
- The L part:
  - Extract untracked business names inside the existing perception call.
  - Code dedupes them against the roster and aliases, and suggests a name once it passes
    the configured prompt and engine counts.
- Suggestions never enter the roster on their own.

**W15 Fact-check workflow (M, pilot, AV-12).**
- Verdict overrides as an append-only override record. Metrics read the newest override
  and mark it "edited".
- Facts CSV import, as drafts, through the brand-facts owner.
- A "discuss with Agent" hand-off for a claim. The Agent stays read-only.

## Phase 2: new collection that costs provider money

**W12 Market positioning probes (L, two PRs, AV-9).**
- A probe cohort through the existing audit pipeline (admission, funding, leases,
  commit-before-I/O). It asks each engine what the brand is known for and which brands
  lead each theme.
- The model maps phrases to the closed theme list.
- Code computes association and prominence from mention order with a configured position
  decay, plus rank and the biggest gap.

**W13 Objection probes (L, AV-10).**
- Reuses the W12 machinery and asks why a buyer might not choose the brand.
- The model groups objections into reviewed groups.
- Code scores position as 100 minus 10 per rank step, floored at 0 and averaged over
  completed runs. A non-mention counts as 0.
- Each objection shows its sources, and the Agent can draft rebuttal content.

## Phase 3: docs site and changelog (AV-19)

**D1 Docs site (M).** Update the public docs at `apps/docs/src/content/` to the new
navigation and pages: page names and paths, the Brand pages, Sources, Keywords and the
Prompt builder page. Retire pages that describe removed tabs rather than leaving
corrections beside them.

**D2 Changelog (S).** Add entries to `apps/docs/src/content/changelog.md` for the new
navigation and for each shipped workstream, in the changelog's existing style.

Each Phase 1 or Phase 2 PR that renames or moves a screen notes the docs page it
affects, so D1 has a list to work from.

## Not planned

- Prompt search volume: demand is never AI prompt volume.
- Saved filter sets: URL state is shareable, and the owner prefers no remembered screens.
- Social-channel tracking.
- Free-form prompt tags: topics, intent, stage and persona already cover them.
- Choosing which prompts get fact-checked.
- Claim grouping: revisit after W15.
- Industry or language reruns: markets own these.
