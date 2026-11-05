# Design system rollout

Status: complete. Approved on 5 November 2026 with decisions D1–D4 as
recommended. All eight PRs and the owner's review rounds (D5–D25) shipped the
same day. The owner asked on
4 November 2026 for a new CiteLadder design system that replaces the current
design on every surface at once, with one consolidated reference that every
implementer follows.

## The reference

The design system is the CiteLadder Design System artifact:
<https://claude.ai/artifact/G73m4PDH6bowXxNpPFMcLU> (private to the owner).
Read it with the Artifact tool (`action: "read"`, `path` for one file).

| File | What it holds |
| --- | --- |
| `project/README.md` | The brand book: principles, surfaces, layout and grid, website chrome, product images, colour, typography, shape, motion, focus and states, component catalogue, "Never" list |
| `project/tokens.json` | Every token, light and dark: colour, type, spacing, radius, shadow, control, layout |
| `project/components/bundle.css` | The reference CSS for every component |
| `project/components/bundle.js` | The reference React for every component |
| `project/components/<Name>/README.md`, `preview.html` | Each component's contract and its states |

The page previews (`App*`, `Docs*`, `Auth*`, `Onboarding*`, `Web*`) show
components composed into pages. They are a check, not code to port: pages are
built in the repo from the ported components, with the real copy.

**The system wins over the current code and over earlier design memories.**
Where the old design and the system disagree, the system is right; where the
system lacks something a page needs, add it to the system first (one
component, both themes), then use it.

## Rules every PR follows

1. **Replace, never keep.** When a surface moves onto the system, its old
   styles, wrappers, scenes and one-off components are deleted in the same PR,
   following the [replacement gate](../invariants.md#replacement-and-retirement):
   inventory the old paths before coding, verify the removals afterwards.
2. **Port, don't redesign.** Component CSS comes from `bundle.css`, mapped onto
   Tailwind and `globals.css` tokens; behaviour comes from `bundle.js` and the
   component README. Atoms keep one form (no size or padding props).
3. **Copy is unchanged.** Marketing, docs and app copy stay as they are
   except where a heading ends in "." (repo policy). Template copy in the
   artifact is illustrative.
4. **Both themes everywhere.** Every surface has a ThemeSwitch (light, dark,
   system) and every screen is checked in both.
5. **Owner geometry rules.** Website H1 44px (36 tablet, 30 phone); section h2
   36 (28 phone); containers 1320 website, 1440 app, 720 prose; nothing shifts
   on interaction; three metrics never wrap 2 + 1. Check at 1440, 982 and 390.
6. **Gates are replaced, not weakened.** `pnpm check:policy` rules that encode
   the retired design (flat website without shadows, the green palette, the old
   faces and type ladders) are replaced by rules that enforce the new one. Each
   retired rule gets a stricter or equal successor, and the ratchet baseline
   still only falls.

## Pull requests

Sequential where they share files; the four after PR 2 touch disjoint trees
and run as parallel sessions, merged in the order they turn green.

| PR | Scope | Depends on |
| --- | --- | --- |
| 1. Foundation | Tokens, fonts, logo accent, theme, policy, `docs/design.md` | — |
| 2. App primitives | `frontend/components/ui/` ported to the system | 1 |
| 3. App shell and pages | Sidebar, header, filter strip, every app route | 2 |
| 4. Login and onboarding | Auth screens, mailbox, workspace chooser, onboarding steps | 2 |
| 5. Docs | Docs top bar, sidebar, prose, API and MCP reference, search | 2 |
| 6. Website foundation | Site chrome, sections, ProductFrame, product screens, home page | 2 |
| 7. Website product pages | Platform (12), solutions, enterprise, pricing, compare, contact, 404 | 6 |
| 8. Website content pages | Research (18 + index), blog, legal (8), tools, AI reference, FAQ, commercial | 6 |

PRs 7 and 8 run in parallel. If PR 3 passes ~4000 changed lines it splits by
route group (Track and Analyze, then Act, Agent and Settings).

### PR 1: Foundation

- **Tokens:** replace the colour, type, spacing, radius, shadow and layout
  tokens in `frontend/apps/app/src/globals.css` (`@theme` and both themes)
  with the system's values and names. Retire the green palette, the grain
  ground, the selection pill and every token the system does not have.
  `website-type.css` keeps only what PR 6 still needs, and PR 6 deletes it.
- **Fonts:** Cal Sans (display, weight 400 only), Geist (text) and Geist Mono
  (figures and code) replace TASA Orbiter, Switzer and JetBrains Mono in
  `frontend/lib/config/brand-fonts.json`, with new metric-matched fallbacks.
  See decision D1 for where the files live.
- **Logo:** the drawing in `packages/contracts/src/brand-logo.ts` is
  unchanged; its `accent` tone becomes Flare (`#e8501a` light, `#ff6a33` dark)
  everywhere the logo is drawn: app, website, docs, favicon, OG images and the
  API's PDFs (`services/api/src/billing/pdf-brand.ts`).
- **Theme:** `frontend/lib/theme/theme.ts` becomes the one ThemeSwitch store
  used by the app, website and docs (decision D2).
- **Policy:** rewrite `frontend/scripts/check-design-system.mjs` and its
  modules for the new system (rule 6), including: Cal Sans only at weight 400
  and never under 18px, `accent` never as a button, background or heading
  fill, website H1 never over 44px.
- **Docs:** rewrite `docs/design.md` as the repo's short owner of the system:
  it links the artifact, lists the token contract and the ownership table, and
  drops every retired rule.

### PR 2: App primitives

Port the system's atoms and molecules into `frontend/components/ui/`: Button,
IconButton, ArrowLink, TextLink, Input, Textarea, SearchField, Select,
Checkbox, RadioGroup, Switch, ChipInput, FormRow, Badge, Tag, Tabs, Card, Stat,
Delta, Meter, ScoreRing, ScoreBar (retired by D8), Citation, Rungs, Kbd, Tooltip, Popover,
Menu, Dialog, Drawer, CommandPalette, Toast, Callout, EmptyState, Skeleton,
Spinner, ProgressBar, ThemeSwitch, Table, Pager, Avatar, BrandMark,
EngineMark, StepList, Passage, FactList, ListDetail and the charts (TrendChart,
DonutChart, BarList, StackedBar, Sparkline, ChartCard). Existing primitives
with the same job are rewritten in place; the rest of the 116 are merged into
these or deleted. Callers keep compiling: where a prop changes, update every
caller in the same PR.

### PR 3: App shell and pages

AppShell, AppSidebar (the real navigation from
`frontend/components/layout/nav-items.ts`, unchanged), PageHeader, FilterBar,
AppGrid, KpiRow, TableCard, AgentThread, AgentComposer, SettingsSection and
BillingPlan, then every app route recomposed from them. Below 1280px the
sidebar becomes a 61px icon rail (decision D3).

### PR 4: Login and onboarding

AuthShell, AuthCard (Google, email, reserved Turnstile slot, legal line),
MailboxScreen, WorkspaceChooser, OnboardingShell, OnboardingStep and
ChecklistField, applied to `/login`, `/register`, the mailbox screens, the
workspace chooser and every onboarding step. ThemeSwitch top-right.

### PR 5: Docs

DocsShell, DocsTopBar, DocsSidebar, DocLayout, Prose (`docs` variant), Toc,
CodeBlock, ApiOperation, McpToolRef, DocsSearchDialog and ArticlePager in
`frontend/apps/docs`. Old docs CSS and components are deleted.

### PR 6: Website foundation

- **Chrome:** SiteNav (floating navbar, mega menu, ThemeSwitch), SiteFooter,
  AnnouncementPill, CookieBanner and Breadcrumbs in
  `frontend/apps/marketing/src/layouts/`, with the navigation and footer data in
  one place.
- **Sections:** PageSection, SectionHeader, PageHero, LandingHero,
  FeatureCard, FeatureSplit, Bento, Steps, FaqList, CtaBand, RelatedCards,
  EngineStrip, PageHighlight, PageForm, PricingCard, PagePlans, PricingTable,
  CompareTable, QuestionCards, LogoTile and ToolPanel.
- **Product images:** ProductFrame and the 18 `Screen*` components, built from
  the PR 2 components and rendered to static HTML by Astro's React
  integration (no hydration), with the system's shared demo dataset as one
  typed module. They replace all 32 scenes in
  `frontend/apps/marketing/src/components/scenes` and `product-views.css`.
- **Home page** recomposed from them, keeping its copy.

### PRs 7 and 8: Website pages

Every remaining marketing page recomposed from PR 6's components, following
the matching `Web*` template and the WebPlatform README's screen-per-slug
table. PR 8 adds ContentArticle, ContentFigure and ContentIndex, and moves
research, blog and legal Markdown onto Prose. When PR 8 merges, no file under
`frontend/apps/marketing/src/styles` or the old `components/marketing` tree
remains unless the system owns it.

## Orchestration

- I orchestrate; each PR is one implementor session that owns its PR from
  open to `READY <sha7>` (green CI, bot threads triaged once).
- Each brief names the PR's scope, the artifact paths to read, the files to
  delete and the decisions below.
- Merge order: 1 → 2 → {3, 4, 5, 6} → {7, 8}; rebase only the next green PR.
- Nothing is deployed until all eight are merged and the owner runs the
  deploy.

## Owner decisions

The owner approved all four recommendations on 5 November 2026, in the
session that produced this plan.

| ID | Question | Decision |
| --- | --- | --- |
| D1 | Where do Cal Sans, Geist and Geist Mono come from? All three are OFL. | Add them to the private `Cube-27/cube27-fonts` repo so `pnpm fonts:pull` stays the one font pipeline (the owner pushes to it) |
| D2 | Does the theme choice follow a person between the website, app and docs? | Yes: one cookie on the parent domain, defaulting to system |
| D3 | At the owner's 982px desktop, does the app sidebar keep its labels? | No: a 61px icon rail below 1280px, so tables keep their width |
| D4 | Do PDFs and emails move to Geist? | PDFs keep Inter for now; only the logo accent changes |

On 5 November 2026 the owner reviewed the shipped app and docs and decided
D5–D9 (source: the owner's review in the orchestration session). Their
`check:policy` rules were deleted with the other style bans in D34
([design.md](../design.md#decisions)).

| ID | Question | Decision |
| --- | --- | --- |
| D5 | What edge do fields, composers and cards wear? | A soft 1px `line` edge with the faint `shadow-edge` smudge under it (the sidebar's "Search… Ctrl K" look), stepping to `line-strong` on hover, never the dark `line-control` hairline. Select, Input, SearchField, Textarea, ChipInput, the Agent composer, the docs search trigger and checkbox and radio boxes all follow; dashed slots take `line-strong`. `line-control` stays only for marks that are not borders (the switch's off track, the link underline, the pending step ring, chart rules). Focus stays clearly visible |
| D6 | How heavy can Geist be? | Never above 500: the `heading` token is 500, and no `font-semibold`, `font-bold`, 600 or 700 remains in the app, docs or `components/ui`; Agent Markdown `strong` is 500 |
| D7 | Where does the app use Cal Sans? | Only in the PageHeader title. Score and stat numbers, ScoreRing and donut centres, dialog, drawer and card titles and the sign-in shell are Geist. The website and docs keep their display use |
| D8 | How does a score card draw a score? | Its number, with a bare 48px ScoreRing on the right, as before PR 3; a table cell shows the number only. No segmented bars: `ScoreBar` is deleted from `components/ui` with its tests and exports, and the policy rejects its name |
| D9 | How do metric cards lay out at app widths? | In one row: 4 across at every app width, 982px included; never 2 × 2 and never 2 + 1 |

Later the same day the owner added D10 and D11 ("the rounded edges in
components are too much … we want a compact technical design like claude
code/github/etc not airy feeling"; source: the orchestration session). The same
script enforces both.

| ID | Question | Decision |
| --- | --- | --- |
| D10 | How rounded are corners? | Only slightly, system-wide (app, docs and website share the tokens): `radius-2xs` 2, `radius-xs` 2, `radius-sm` 4, `radius-md` 6, `radius-lg` 8, `radius-xl` 8. `radius-full` stays only for avatars, status dots, switch tracks and count pills; no hard-coded radius above 8px |
| D11 | How dense is the app? | Compact and technical, GitHub / Claude Code density, app only. The sidebar has no logo: the project switcher is its first row, on the PageHeader's line, and the Dashboard/Agent switch sits on the page's tabs/filter line. The PageHeader title is 24/32 Cal Sans 400 in a tight band with its actions centred on the title row. The header is one 64px band (a 40px title row, then a reserved 20px meta line). Band gaps are about half (header → 16 → tabs → 8 → filters → 8 → content), card and dialog padding 16, controls 32 (on every surface), table rows 40 (`row-app`), card gaps 12. The docs and website keep their spacing |

After #587 and #588 merged, the owner reviewed the app again (owner,
5 November 2026; source: the orchestration session, screenshots 11–15). D12
supersedes D11's 64px header band and its 16px top inset.

| ID | Question | Decision |
| --- | --- | --- |
| D12 | What frames the top of an app page? | One sticky top bar with no blank gap above or below the title: the sidebar's project switcher cell and the PageHeader row are one 56px bar (the 40px title row, 8 above and below) ruled underneath with a 1px `line`, the switcher level with the title. Content scrolls under it |
| D13 | Where are links underlined? | Links that stand in lists, tables, rows and cards (Site Health affected pages, page URLs, "Ask agent about this page", ranked action titles and the same pattern on every app page) show no underline at rest, only on hover and keyboard focus. Links inside a sentence keep theirs |
| D14 | What does a ranked action row show? | Its title and severity badge, with no numeric score: the High/Medium/Low badge carries it, everywhere the ranked list renders. The badge stays on the title's line; a long title truncates |
| D15 | How big is a metric's number? | 28px (`stat`, Geist 500, 28/36), the cards still in one row. The website's stat and highlight figures use the same 28px token; there is no larger website size (owner, 5 November 2026) |
| D16 | How do tabs and filter chips show a count? | In Geist sans, in brackets after the label: "All signals (107)", "CTR gaps · Partial (50)". Never mono |
| D17 | How do the Agent's workflow cards read? | Card titles at the card-title size (`heading`, 16/24, 500) under the "Or start from a workflow" section heading, and one fill on every card: hover no longer tints a card |

The repository follows the design-system artifact's version 13 for D5–D11:
`frontend/scripts/design-system-tokens.json` is its `tokens.json` verbatim
(`line-strong`, `shadow-edge`, `heading-lg`, `row-app`, `control-md` 32 and
`stat` at Geist 500).

The owner then reviewed the public website and decided D18–D23 and D25
(source: the owner's review in the orchestration session, 5 November 2026).

| ID | Question | Decision |
| --- | --- | --- |
| D18 | How do landing pages align? | Centred: on home, platform and product pages, solutions, enterprise, pricing and compare, the opening heading, section headings and intro copy sit centred within the 960 display and 720 reading measures. Section headers stack (title, lead, action); there is no split header. Long-form reading (blog, docs, legal) and the utility pages (contact, tools, 404) stay left-aligned |
| D19 | How wide is the floating top nav? | Slightly wider than the page column: the bar overhangs the content edges by 16px on each side (12px on phones) instead of matching them |
| D20 | Where do the social links go? | Out of the footer's Company column, into one row of icon-only links (each with an accessible name) directly below the launch-directory badges |
| D21 | How is content placed? | A heading and its copy sit together with no dead space: no empty column beside copy, no heading stranded at the bottom of a tall column, no oversized gap. Every website page was swept for the fault |
| D22 | How do the nav dropdowns open? | As one shared Radix NavigationMenu popup that stays open and morphs between menus. The popup is sized to the open menu: its width and height follow it (Solutions narrow, Platform wide), anchored under the left edge of the trigger row, never stretched to the full bar. The content crossfades, a hover pill slides between triggers, and a hover bridge keeps it open on the way down. It closes in about 100ms, opens over 200ms, and reduced motion drops the slide, blur and stagger. Rows set the title at 14px (500) over a 12px description; an external row's arrow sits inline after its label without wrapping; Solutions is one column. Below the desktop breakpoint the mobile menu is unchanged |
| D23 | How large is the page H1 on the owner's 982px desktop? | 42px. The opening-heading ladder is 44 from 1024px, 42 from 768 to 1023px and 30 on phones; pages never set their own size |
| D25 | What does the home page's first product view show? | The real app, as before the 6b screens: the app chrome (sidebar with the project switcher and navigation, page header, tabs, metric cards and a table) with the same screen content, restyled to the app as shipped (current tokens, soft edges, radius ≤8, 24px Cal Sans page title, Geist ≤500, no sidebar logo, score rings, one-row metrics, 40px rows, 32px controls, no underlines at rest, 28px stat, counts in brackets, no score beside a priority badge) |


The owner decided D24 on the same day, after the shipped sign-in page ("the
earlier sign in page was actually good … only differnce would be there will no
green color in right panel just black and white with grains"; source: the
orchestration session).

| ID | Question | Decision |
| --- | --- | --- |
| D24 | What does account access look like? | The pre-redesign layout returns for sign-in, sign-up and the mailbox screens (`AuthSplitShell`): the card in a column on `paper` with the ThemeSwitch above it and the copyright and legal line under it, and from `desktop:` the product showcase beside it, now black and white with a fine grain (grayscale captures on a grained `surface-sunken` field, no colour). The logo sits inside the card, centred, over a centred heading; the column is 480px, narrower than `container-narrow`; buttons and fields inside the card are 44px (the old auth size), an exception to D11's 32 scoped to that card. The workspace chooser, setup and onboarding keep AuthShell, as before the redesign they kept their own flow shell |

## Known gaps in the system

- Long prompt and action names in ScreenPrompts and ScreenActions end in "…" at
  natural width.
- App pages are not designed for phones.
- Pricing figures in the templates are samples; production reads
  `GET /billing/catalog`.
