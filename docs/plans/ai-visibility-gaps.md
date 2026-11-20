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
- **AV-9, market probes.** Replaced on 2026-11-20 by AV-27 and AV-29 to AV-36.
- **AV-10, objection probes.** Replaced on 2026-11-20 by AV-28 to AV-37.
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
  (Performance, Keyword research; AV-22) and Commerce (Shopping, Products), with
  Integrations in the foot. Sources is today's AI Visibility page without Trends,
  Perception and Accuracy; Search demand becomes the Keyword research page's Demand tab.
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
- **AV-21, migrations for this plan.** The plan's schema is in `0001_baseline.sql` after
  the 2026-11-19 refold. Phase 2 schema changes go into `0001_baseline.sql` while the
  owner maintains a single baseline (owner, 2026-11-20).
- **AV-22, Keyword research.** "it should be keyword research so change the sidebar
  option to keyword researach not keywords" (2026-11-18): the page at
  `/search-intelligence` is named Keyword research in the sidebar, its title, the
  palette and app copy. Its Keywords tab keeps its name.
- **AV-23, palette deep links.** "Add the three" (2026-11-18): the command palette lists
  Fact-checking, Query fanouts and Prompt builder under their sidebar groups, opening
  that tab or page.

## Owner decisions (2026-11-20)

Recorded from the owner's answers in chat on 2026-11-20, after a feasibility study on the
real Kerry snapshot (`services/api/local/snapshots/kerry-2026-11-18/`) and a live test of
open themes and objections on six brands in six industries (Claude Sonnet with web
search, three repeats each; open themes repeated 46–70% between runs, top objections
repeated 3 of 3).

- **AV-24, fix detection first.** Before any probe, brand detection is fixed and the
  branded answers every audit already collects are shown on Perception. Today 8 of 20
  branded answers in the snapshot read the brand as absent (answers write "Best&Less" or
  "it"), and Perception reads only unbranded answers.
- **AV-25, aliases.** Context › Brand facts gains an Aliases section: identified
  spellings are suggested, and the user adds, edits and deletes them inline. Matching
  also normalises case, "&"/"and", spaces and punctuation, on whole words.
- **AV-26, whole answer for brand-named prompts.** For prompts that name the brand
  (branded prompts and probe prompts) the brand counts as mentioned and perception reads
  the whole answer. Unbranded prompts keep sentence matching.
- **AV-27, project themes.** Onboarding research identifies and saves 5 to 8
  high-confidence, buyer-facing themes (never company facts such as funding, ownership
  or history), never more than 8. They are not shown during onboarding. The user adds,
  renames and deletes themes like prompt topics, in Context and on the Market tab, with
  no upper limit. Probe answers map onto the project's themes.
- **AV-28, objections fixed after the first probe.** The first probe groups objections by
  meaning; later probes map onto those groups and add a group only for something
  genuinely new. The user can rename, merge or delete groups.
- **AV-29, one probe, both kinds.** Market (W12) and Objections (W13) ship together; one
  probe run asks both kinds of question. This replaces "W13 after W12 is calibrated".
- **AV-30, three asks.** Each probe question is asked three times per engine per run.
- **AV-31, engines.** Only search-capable engines run probes, and only those with saved
  keys; with none, Run probe offers key entry as the Launch a run dialog does.
  Managed-mode workspaces probe on CiteLadder's keys.
- **AV-32, you only.** Direct questions ("What is X known for?", "Why might someone not
  choose X?") are asked about the project's brand only. Competitor positions come from
  the theme questions ("Which [category] brands are best known for [theme]?"), asked for
  every approved theme.
- **AV-33, cadence.** Probes run on demand (Run probe, cost shown first) with an optional
  schedule.
- **AV-34, funding.** Probes are charged in AI credits, shown before running. Managed
  mode: credits cover the engine answers and CiteLadder's model calls.
  Bring-your-own-key: engine answers bill the customer's keys; credits cover only
  CiteLadder's classification and grouping calls.
- **AV-35, score.** Market and Objections tables lead with the position score only: 100
  when named first, minus 10 per later place, 0 when not raised, averaged over the runs'
  answers.
- **AV-36, UI.** Market and Objections are built as the approved mockup draws them, with
  "audit credits" read as AI credits. There is no objection detail page (sources already
  show on the Objections tab) and no "Draft rebuttal" button.
- **AV-37, Ask agent.** An objection's "Ask agent" opens Agent chat with that objection.
  The Agent lists the objection's sources (external, sometimes the project's own pages)
  and asks which to work on; for each chosen source it reads the page and suggests edits
  to the user's own pages, outreach to the author (it may draft the email), or, when the
  cause is outside the site (product review ratings, a missing feature), advice only. It
  never acts on its own; the user chooses each step.
- **AV-38, proof before merge.** Before a probe PR merges, its builder runs the finished
  probe on three real brands with the Claude key and reports themes, objections, ranks
  and run-to-run steadiness in the PR for the owner.
- **AV-39, Perception uses the project's themes (owner, 2026-11-20).** Perception ›
  Brand classifies every answer's aspects against the project's own themes (AV-27)
  plus the `Other` fallback. The fixed global theme list and everything that
  depended on it are deleted, not kept as a fallback. Applies from the next audit;
  no backfill.

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
- **Search → Keyword research:** tabs Demand (today's Search demand page), Keywords, Organic
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

**N5 Keyword research (S–M, AV-22).** Search demand becomes the Keyword research
page's Demand tab, and the
page's Competitors tab is renamed Organic competitors. `/demand` and its sidebar row go.

**N6 Prompt builder page (M, AV-17).** The builder drawer becomes `/prompts/build`: the
same four steps and the same generation pipeline, a step list on the left and Back and
Next in a fixed footer. Prompts, Overview and the empty states open it.

**N7 Copy (S).** In-page copy still names the old pages ("AI Visibility", "AI Traffic",
"Keyword Research" for Keyword research): loading labels, empty states, agent vocabulary, prompt-source
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

Order: P2-1 → P2-2 → P2-3 → P2-4. Each is one PR.

**P2-1 Detection and branded answers (M; AV-24–26).** Aliases in Context › Brand facts
with suggestions and inline editing; normalised whole-word matching; whole-answer reading
for brand-named prompts; Perception reads serve the branded cohort (the selection's cohort
mapping includes it, labelled). Applies from the next audit, no backfill. Ships this plan
update.

**P2-2 Project themes (M; AV-27, AV-39).** Onboarding research saves 5–8 high-confidence
buyer-facing themes (hidden in onboarding). Theme editing in Context, like prompt
topics; Perception classifies against them. Market-tab editing ships with P2-3.

**P2-3 Probe run and the Market and Objections tabs (L, may split API and UI;
AV-28–36, AV-38).** A probe cohort through the existing audit pipeline (admission,
leases, commit-before-I/O): per search-capable engine with a key, three asks each of
"What is [brand] known for?", "Why might someone not choose [brand]?" and, per approved
theme, "Which [category] brands are best known for [theme]?". The model maps known-for
phrases to the project's themes (buyer-facing only) and groups objections into the
project's fixed groups. Code computes the position scores, ranks, leader and gap.
Sources per objection come from the answers' citations; "no sources" is a real state.
AI-credit cost shown before running; optional schedule. The Market and Objections tabs
as the mockup draws them. Real-brand check in the PR.

**P2-4 Ask agent on an objection (M; AV-37).** The Ask agent hand-off and the Agent
workflow above, read-only, every step chosen by the user.

## Phase 3: docs site and changelog (AV-19)

**D1 Docs site (M).** Update the public docs at `apps/docs/src/content/` to the new
navigation and pages: page names and paths, the Brand pages, Sources, Keyword research and the
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
