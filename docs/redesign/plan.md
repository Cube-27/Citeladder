# Searchify v2 Redesign — Detailed Implementation Plan

> Companion: `docs/redesign/plan-summary.md`.
> **Visual source of truth for the product app: the uploaded Figma design system**
> (`docs/redesign/figma/`). Marketing display scale/copy: per approved design
> mockups in `docs/redesign/designs/`. Repo: repository root. Frontend PM: **pnpm only**.
> Verify from `frontend/`: `pnpm test -- <file>`, `pnpm build`, `pnpm lint`, `pnpm check:policy`;
> backend from `backend/`: `uv run pytest <files> -q`, `uv run ruff check .`.

## 1. Product/spec layer

**Goals.** Port the Figma design system into the app: royal-blue (`#2756FF`) light theme ported
verbatim, a **newly authored lighter soft-charcoal dark theme** (Perplexity/Claude-style —
never near-black), Inter UI font, the Figma type scale verbatim, the existing grouped nav
restyled, elevated cards, vivid semantic colors — across shell, all app screens, and auth.
Rebuild marketing end to end as a **fully independent creative system** (own palette/type within
premium bounds — "marketing pages have no relation to the app"): new content architecture,
cinematic animated hero, scroll-driven storytelling, parallax/floating-card motion, redesigned
pricing. Route first-run users through a Figma-styled onboarding stepper with AI auto-discovery.

**Success criteria.** Light default, both themes pass a programmatic AA ≥ 4.5:1 guard; the dark
theme is a lighter soft charcoal (never near-black) with clearly lighter elevated surfaces; **no
raw hex in `.ts/.tsx` source — hex lives only in `globals.css` (app) and
`app/(marketing)/marketing.css` (marketing creative system)**; `docs/design.md` rewritten as the
written form of the design system (Figma light + authored dark + marketing creative system) and
kept in name-set sync by the guard; Inter + Geist Mono load via next/font; all e2e suites green
after in-phase selector updates; marketing tells a new story with extremely ambitious,
reduced-motion-gated animation; first-run users complete a Figma-styled onboarding (brand+URL →
AI discovery → editable review → confirm) before reaching the app, with a working manual
fallback when the agent is unconfigured.

**Non-goals.** No backend changes beyond one stateless prompt-suggestion endpoint. No new routes
beyond `/onboarding`. No data-contract changes; sentiment/avg-position stay `—`. No edits to
pricing **facts** (`lib/marketing-content/pricing.ts` stays the source of truth — presentation
only). No design mockups produced by build agents.

**Constraints.** Invariants 1, 2, 5, 6. Token names stable where mappable (§3). `motion` v12
(`motion/react`) is the only animation library. Playwright specs updated in the same phase as
each structural change. Figma reference TSX uses inline styles and a `.dark` class — port
**values and structure**, not the styling mechanism: our bridged-Tailwind-token rule and
`html[data-theme='dark']` selector stay.

## 2. Figma artifact inventory (read before each task)

| Artifact | Content | Consumed by |
|---|---|---|
| `docs/redesign/figma/tokens.css` | Full light+dark token CSS: blue ramp 50–900 (anchor `#2756FF`), neutral ramp, surfaces, text/border/accent, status, score bands (incl. ring colors), run states, citations, `--chart-1..8`, `--shadow-1..4`, radii, Inter + Geist Mono. **Light theme ported verbatim; the Figma midnight dark is NOT adopted** — the dark theme is authored fresh (user decision) | Task 1 (P1) |
| `docs/redesign/figma/DesignSystemSheet.tsx` DesignSystemSheet | Type scale (48/26/17/15/14/13/12/11 + mono 48/22/13/11), button variants (accent-fill primary, 8px radius), badges (pill, 11.5px), elevation levels, spacing | Tasks 1, 3 |
| `docs/redesign/figma/AppShell.tsx` AppShell | Shell geometry adopted: 220px sidebar, active nav = accent-50 bg + accent text + 3px left bar, 36px rows, logo row, project switcher, user card, 52px topbar with 15px page title + header slot. **Its flat ungrouped nav is NOT adopted** — the existing Analyze/Improve groups stay (user decision) | Task 2 |
| `docs/redesign/figma/ScoreRing.tsx` ScoreRing | Rounded linecap, 0.8s sweep transition, ring/track colors. Its 30/60/80 band thresholds are **NOT adopted** — 25/50/75 stay (user decision) | Tasks 1, 3 |
| `docs/redesign/figma/Sparkline.tsx` Sparkline | Trend-colored 1.5px polyline + end dot | Task 3 |
| `docs/redesign/figma/VisibilityDashboard.tsx` VisibilityDashboard | Hero metric card (ScoreRing 140 + 52px hero number + SOV/Mentions/Citations/Avg-Rank delta chips + run info), underline tabs in a filter bar, engine pill filters, competitors table w/ sparklines, SOV donut (hover-thicken), by-model card | Task 4 |
| `docs/redesign/figma/SiteHealthDetail.tsx` SiteHealthDetail | Crawl/page detail structure, score presentation | Task 6 |
| `docs/redesign/figma/OnboardingScreen.tsx` OnboardingScreen | Full-screen split: left = logo header + top progress stepper + step form + footer pager; right = live preview panel; pre-filled suggested competitors pattern | Task 11 |

## 3. Token port — Figma → Searchify mapping (task 1 implements this table)

Rule: **same name, new Figma value** wherever a semantic equivalent exists; **new token** only
for new concepts; where our set is finer-grained than Figma's, alias to the nearest Figma value
and document it. Hex lives only in the two theme blocks.

| Figma (`tokens.css`) | Searchify token | Notes |
|---|---|---|
| `--blue-50..900`, `--neutral-0..900` | NEW primitive ramps (same names) | globals.css-only layer; semantic tokens reference these |
| `--surface-page` | `--bg-base` | light `#F7F8FA` verbatim; **dark authored (§3a)** |
| `--surface-panel` | `--bg-panel`, `--bg-sidebar` | light `#FFFFFF` verbatim (Figma sidebar = panel bg); dark authored |
| `--surface-elevated` | `--bg-elevated` | light `#FFFFFF` verbatim; dark authored — clearly lighter than base (§3a) |
| `--surface-sunken` | `--bg-well` | light `#EFF1F6` verbatim; dark authored |
| `--neutral-100` | `--bg-alt` | light verbatim; dark authored |
| `--text-primary/-secondary` | same names | light `#0D1228` / `#454E6E` verbatim; dark authored (AA-gated) |
| `--text-tertiary` | `--text-muted` | captions/decorative only — excluded from body-contrast pairs |
| `--text-disabled` | `--text-subtle` | decorative only |
| `--text-inverse` | NEW | `#FFFFFF` light; authored dark |
| `--text-link` | alias of the existing `--accent-text` | do **not** create a separate `--text-accent` token |
| `--border-subtle/-default/-strong` | `--border-subtle` / `--border` / `--border-strong` | light Figma values verbatim; dark authored |
| `--accent` family | same names + NEW `--accent-active`; `--accent-foreground` → `--accent-fg` | light anchored `#2756FF` verbatim; dark accent authored within the same royal-blue family (brightened for AA, per approved mockups); `--accent-soft` kept, derived from `--accent-subtle` via color-mix (documented) |
| `--success/-warning/-danger/-info/-neutral-status` bg/border/text | same semantic names | light verbatim; dark authored (status hues may keep Figma's alpha-wash approach re-based on the new surfaces); solid `--success` etc. take Figma mid hues; `--neutral-bg` ← `--neutral-status-bg` |
| `--score-{low,mid,good,high}-bg/-border/-text/-ring` | `--score-*` (solid = ring), `--score-*-bg`, NEW `--score-*-text`, `--score-*-ring` | **band thresholds stay 25/50/75 — `score-band.ts` unchanged** (user decision); Figma band colors map onto the existing bands |
| `--run-{state}-bg/-text` | `--run-{state}-bg`, `--run-{state}` (solid = Figma text) | all 8 states; light verbatim, dark authored |
| `--citation-owned/-competitor/-third-*` | `--citation-owned/-competitor/-third-party-*` + NEW `*-border` | **owned becomes Figma blue** (confirmed user decision — the green identity is dropped) |
| `--chart-1..8` | NEW `--chart-1..8`; `--series-1..5` alias to `--chart-1..5`, `--series-other` ← `--neutral-200` | keeps the "fold into Other" rule in `series-palette.ts`; identical in both themes (re-validated on the authored dark surfaces) |
| `--shadow-1..4` | NEW `--shadow-1..4`; existing `--shadow-xs/sm/card/elevated/lg/modal` alias (xs,sm→1; card→2; elevated→3; lg,modal→4) | component names unchanged; dark shadow values authored for the lighter surfaces (softer, less crushed than Figma's near-black set) |
| `--r-xs..xl` (4/6/8/12/16) | `--radius-xs/sm/md/lg/xl` = 4/6/8/12/16; `--radius-2xl` = 16; `--radius-full` kept | **buttons become rounded-md, not pills** (1198 Btn) |
| Inter, Geist Mono | `--font-primary-family` = Inter stack; `--font-mono-family` = Geist Mono stack; `--font-display-family` → Inter | next/font in `app/layout.tsx`: Geist→Inter; keep variable name `--font-sans` |

### 3a. Authored dark theme (replaces the Figma midnight dark — user decision)

The Figma `.dark` values (`#09090F`/`#0D1228` near-black) are **not ported**. P1 authors a new
dark token set: a **lighter, softer dark** in the Perplexity/Claude family — cool slate-charcoal
(Perplexity-like, base ≈ `#1C1E22`) or warm charcoal (Claude-like, ≈ `#2A2926`); the exact
family and ramp come from the approved mockups. Hard constraints, machine-enforced in
`globals.test.ts`:

- **Never near-black**: `--bg-base` relative luminance above a floor that excludes
  near-black (asserted in the guard).
- **Clearly lighter elevation**: strict luminance ordering `--bg-base` < `--bg-panel` ≤
  `--bg-elevated` (asserted); `--bg-well` may go slightly darker than base for sunken wells.
- Every documented text/status/accent pair on the authored surfaces meets **AA ≥ 4.5:1**
  (same programmatic suite as light); accent and status hues are brightened variants of the
  light values, not the Figma dark set.
- Dark shadows are soft (low-opacity, larger blur) — no crushed near-black shadow stack.

**Type scale — Figma verbatim (user decision, overrides the earlier 15–16px body request).**
Existing names → Figma values from `docs/redesign/figma/DesignSystemSheet.tsx`: `--text-2xs` 11/500 (micro uppercase),
`--text-xs` 12, `--text-sm` 13, `--text-base` 14 (400/500), `--text-lg` 15/600 (card title),
`--text-xl` 17/600 (section), `--text-2xl` 26/600 (page title), NEW `--text-hero` 48/600 (hero
metric), NEW `--text-data-lg` 22/600 (mono large data). Marketing uses its own type/display
scale inside the **existing** independent marketing creative system in
`app/(marketing)/marketing.css` (the `.mkt`-scoped `--mkt-*` block, rewritten to the dusk
palette/type per approved marketing mockups) — the Figma app scale does not constrain it.

**Contrast guard pairs**: body = text-primary/secondary on bg-base/bg-panel; accent-fg on
accent; accent-text on bg-panel; each status/score/run/citation `*-text` on its `*-bg` — all
≥ 4.5:1 in **both** themes, computed programmatically (light pairs use the verbatim Figma
values; dark pairs gate the newly authored set). text-muted/subtle are decorative-only and
excluded (asserted present but not ratio-gated). The guard also asserts the §3a dark-theme
luminance floor and ordering.

## 4. File structure map (new + heavily touched)

| Path | Responsibility |
|---|---|
| `frontend/app/globals.css` | Figma light tokens verbatim + authored soft-charcoal dark set + ramps, `@theme inline` bridge, chart/score-ring additions, motion rules. **No `--mkt-*` scaffold** — marketing stays in marketing.css. Line budget raised in `scripts/check-frontend-architecture.mjs` (hard 800 today) |
| `frontend/app/(marketing)/marketing.css` | **Existing** marketing creative system (4,689 lines, `.mkt`-scoped `--mkt-*` block + plain CSS classes `hero`/`btn`/`grad-text`/`container`/`eyebrow`; CSS files are exempt from the no-raw-hex guard). Token section rewritten to the dusk palette/type in Task 7 |
| `frontend/app/layout.tsx` | Inter + Geist Mono via next/font (replaces Geist) |
| `frontend/lib/theme.ts` | Default flips `stored → light` |
| `docs/design.md` | Full rewrite = written design system: §3 mapping table, authored dark spec (§3a), marketing creative-system section, per-screen prose (incl. `/onboarding`) |
| `frontend/app/globals.test.ts` | New palette assertions (Figma `#2756FF` light family), name-set sync, programmatic AA suite + dark luminance floor/ordering assertions |
| `frontend/scripts/check-design-tokens.mjs` | Required vars += ramps, chart, score-ring/text, hero/data sizes, shadows 1–4; extended to scan **both** `app/globals.css` and `app/(marketing)/marketing.css` (the `--mkt-*` namespace) |
| `frontend/components/layout/*` | Grouped-nav shell restyled in the Figma shell visual language (1196 geometry; Analyze/Improve groups kept) |
| `frontend/components/ui/*` | Primitives per 1198/1194/1195; `score-band.ts` **unchanged** (thresholds 25/50/75 kept); new `empty-state.tsx` |
| `frontend/components/marketing/motion-primitives.tsx` | NEW — Reveal/Stagger/Parallax/Float/ScrollScene (motion v12, reduced-motion gated) |
| `frontend/lib/marketing-content/landing.ts` | NEW — landing narrative copy module (designer owns final copy; typed like `pricing.ts`) |
| `frontend/components/onboarding/*`, `frontend/app/(onboarding)/onboarding/{layout,page}.tsx` | NEW — Figma-styled onboarding (1200) with AI auto-discovery |
| `frontend/components/layout/onboarding-gate.tsx` | NEW — first-run redirect in `app/(app)/layout.tsx` |
| `frontend/lib/api/{projects.ts,schemas.ts,types.ts}` | `suggestPrompts` client + zod contract |
| `backend/app/api/brand_suggestions.py` + domain/schemas/config | NEW stateless `POST /brand-suggestions/prompts` |
| `docs/frontend-architecture.md` | Route map += `/onboarding`; nav description update |

## 5. Tasks

Execution order: **P1 (task 1) blocks all frontend work; task 9 is backend-only and can start
at t=0.** After P1: tasks 2, 3, 7, 8 in parallel. Tasks 4–6, 10 after task 3; task 11 after
3 + 9. Task 12 last.

---

### P1 — Token foundation

**Task 1 — Port the Figma token system, switch fonts, rewrite design.md, upgrade guards**
[blocks all]

Approach:
- `frontend/app/globals.css`: implement the §3 mapping — add `--blue-*`/`--neutral-*` ramps and
  `--chart-1..8`; assign **Figma light values verbatim** to every existing semantic token in
  `:root`; **author the new dark set** in `html[data-theme='dark']` per §3a (soft charcoal,
  never near-black, luminance ordering base < panel ≤ elevated, brightened accent/status hues —
  exact ramp per approved mockups); add `--text-inverse`, `--text-link` (alias of
  `--accent-text` — no `--text-accent` token), `--accent-active`, `--score-*-text/-ring`,
  `--shadow-1..4` (with the semantic shadow aliases), new radii, Figma type scale verbatim +
  `--text-hero`/`--text-data-lg`; update the `@theme inline` bridge for all additions; keep
  `prefers-reduced-motion`, `forced-colors`, `print`, and the theme-swap suppression rules;
  focus ring per Figma (2px accent outline, tokenized). **Do not scaffold marketing tokens
  here** — the creative system already lives in `app/(marketing)/marketing.css` (rewritten in
  Task 7). **Raise the globals.css line budget** in `scripts/check-frontend-architecture.mjs`:
  it hard-fails at 800 lines and the file is 720 today — ramps, the authored dark set, and the
  new tokens will exceed 800 even with marketing kept out, so bump the budget (with a comment
  citing this redesign) to fit the ported file.
- `frontend/app/layout.tsx`: replace Geist with **Inter** (`next/font/google`, weights 400/500/600,
  `variable: '--font-sans'`); Geist Mono stays (400/500). `--font-display-family` resolves to
  Inter — no separate display face in the app.
- `frontend/lib/theme.ts`: bootstrap fallback `'dark' → 'light'` (stored choice respected).
- `docs/design.md`: full rewrite — the design system in written form: aesthetic statement,
  ramps, the §3 mapping table (so future agents can trace Figma↔repo names), the **authored
  dark-theme spec (§3a)** with its constraints, light token values (Figma verbatim), Figma type
  scale verbatim, component-primitive inventory updated (rounded buttons, badge/elevation specs
  from 1198), revised per-screen prose (grouped-nav shell in the 1196 visual language,
  visibility per 1199, site-health per 1197, onboarding per 1200), a **marketing
  creative-system section** (the `marketing.css` `.mkt` contract: dusk palette/type/motion
  rules, documented `--mkt-*` text/surface pairs with their AA roles, values per approved
  marketing mockups), updated implementation checklist (light default).
- `frontend/app/globals.test.ts`: replace the legacy accent assertions with the Figma light
  palette (`--accent` = `#2756FF` in `:root`) plus authored-dark family assertions (accent stays
  in the royal-blue family); keep the design.md↔globals.css name-set sync; add the
  **programmatic contrast suite** (parse both theme blocks, compute WCAG ratios for the §3
  pairs, ≥ 4.5:1; muted/subtle decorative-exempt) and the **§3a dark assertions** (bg-base
  luminance floor excluding near-black; base < panel ≤ elevated ordering). The suite also
  reads `app/(marketing)/marketing.css`: documented `--mkt-*` text/surface pairs must hit body
  ≥ 4.5:1 on the `#1F1E1B` dusk canvas, with explicit large-text (≥ 3:1) and decorative-only
  carve-outs for the dim tones (measured: `#7B6CF6` 4.22:1, `#B34FE0` 4.06:1, `#7F7B70`
  3.94:1 — display/decorative roles only, as documented in design.md).
- `frontend/scripts/check-design-tokens.mjs`: add all new required vars, and extend the script
  to scan **both** `app/globals.css` (app tokens) and `app/(marketing)/marketing.css` (the
  `--mkt-*` namespace).

Files: `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/lib/theme.ts`,
`docs/design.md`, `frontend/app/globals.test.ts`, `frontend/scripts/check-design-tokens.mjs`.

Acceptance: light renders by default with no flash and matches the Figma light values; dark
renders as the authored soft charcoal (guard proves not-near-black + luminance ordering + AA);
Inter applies app-wide; guard trio green **including the raised globals.css line budget**;
`pnpm build` green; design.md declares exactly the token set globals.css declares.

Tests: `pnpm test -- app/globals.test.ts lib/theme components/ui/theme-toggle.test.tsx`,
`pnpm check:policy`, `pnpm build`.

---

### P2 — App shell + shared primitives

**Task 2 — Restyle the app shell in the Figma shell visual language (1196 geometry, grouped nav kept)** [after 1; parallel with 3, 7, 8, 9]

Approach: **keep the existing grouped `NAV_GROUPS` structure in `components/layout/nav-items.ts`
(Analyze / Improve — user decision; the Figma flat nav is not adopted)** and restyle the shell
with the 1196 geometry and states: 220px sidebar, 36px nav rows, active item =
`bg-accent-subtle` + `text-accent-text` + 3px left accent bar with icon-opacity treatment,
mono-uppercase group eyebrows retained, logo row + project switcher + bottom user card per
1196, 52px topbar with 15px/600 page title + header slot. Touch `sidebar-nav.tsx`,
`app-shell.tsx`, `page-header.tsx`, `project-switcher.tsx`, `user-menu.tsx`,
`getting-started-card.tsx`; `nav-items.ts` changes only if group membership is adjusted per
approved mockups. Update `e2e/shell.spec.ts` for the new visual states — and fix its **stale
group-label assertion**: line 49 expects `Optimize`, but the `nav-items.ts` groups are
`Analyze`/`Improve`; change the assertion to `Improve`. The Analyze/Improve labels themselves
stay — do **not** rename groups.

Files: `frontend/components/layout/{app-shell,sidebar-nav,nav-items,page-header,project-switcher,user-menu,getting-started-card}.tsx` (+ colocated tests), `frontend/e2e/shell.spec.ts`.

Acceptance: grouped nav renders with the Figma shell geometry/states; group labels unchanged;
active route indication correct on every route; no disabled items;
`pnpm test -- components/layout` + shell e2e green.

Tests: `pnpm test -- components/layout`, `pnpm build`, `playwright test e2e/shell.spec.ts`.

**Task 3 — Port Figma primitives into `components/ui/`** [after 1; parallel with 2, 7, 8, 9]

Approach: update CVA variants/styles per `docs/redesign/figma/DesignSystemSheet.tsx` + `docs/redesign/figma/ScoreRing.tsx` + `docs/redesign/figma/Sparkline.tsx`: `button`
(primary = accent fill + white text + accent-tinted shadow, `--radius-md`, 13.5px/500 — **pill
variants retired**), `badge` (pill 11.5px/500 with token bg/border/text; **owned-citation
variant becomes Figma blue** — confirmed user decision), `card`
(panel = bg-panel + shadow-2 + radius-lg; elevated = shadow-3), `input`/`field` (14px text,
accent focus border), `table` (14px cells, neutral-50 row hover), `dialog`/`dropdown`
(shadow-3/4), `tabs` (underline style per 1199), `score-ring.tsx` (Figma geometry: rounded
linecap, 0.8s sweep, ring colors from `--score-*-ring`), `score-band.ts` (**unchanged —
thresholds stay 25/50/75 per user decision; only the band colors change via tokens**),
`sparkline.tsx` (trend-color polyline + end dot), `donut.tsx`
(hover-thicken + mono center value per 1199), `series-palette.ts` (values now from `--chart-*`
aliases — class strings unchanged), `skeleton`, `tooltip`, `alert`, `typography.tsx` (new scale
classes incl. hero/data), `theme-toggle.tsx`. Add `empty-state.tsx` (shared icon + heading +
body + CTA slots).

Files: `frontend/components/ui/*` (+ colocated tests).

Acceptance: primitives match the Figma specs; every style uses bridged tokens (guards green);
score-band unit tests pass unchanged (boundaries still 25/50/75); citation badges render owned
in blue; `pnpm test -- components/ui` green.

Tests: `pnpm test -- components/ui`, `pnpm check:policy`, `pnpm build`.

---

### P3 — Core app screens

**Task 4 — Visibility dashboard per the Figma dashboard (1199)** [after 3; parallel with 5, 6]

Approach: restructure `components/visibility/` to the Figma layout: **hero metric card**
(ScoreRing 140 + 48px hero numeral via the `--text-hero` token — 1199's 52px usage is
normalized to it — + supporting-metric chips — SOV, Mentions, Citations,
Avg Rank — + run info) fed by the existing `GET /projects/{id}/visibility` projection; underline
tab bar + engine pill filters in the filter bar (toolbar restyle); competitors rankings table
with per-row sparklines (trends endpoint where available); SOV donut + by-model cards. Data
honesty: render delta chips/sparklines only where the API provides the series; Avg Rank and
Sentiment stay `—` (not computed — invariant-adjacent rule). Tabs, filter ownership, `?tab=`,
and ARIA tablist stay functionally identical. Migrate `empty-state.tsx` to the shared
primitive. Update `e2e/visibility.spec.ts`.

Files: `frontend/components/visibility/*`, `frontend/app/(app)/visibility/page.tsx`,
`frontend/e2e/visibility.spec.ts`.

Acceptance: hero card + restyled tabs/table render from the real projection with no invented
fields; all four tabs behave as today; e2e green.

Tests: `pnpm test -- components/visibility`, `playwright test e2e/visibility.spec.ts`, `pnpm build`.

**Task 5 — Measurement surfaces reskin** [after 3; parallel with 4, 6]

Approach: Figma-language reskin (tokens + new primitives, hierarchy/spacing, shared empty-state)
for `/prompts` + `/prompt-research`, `/products` (+detail), `/runs` (+run + execution detail),
`/analytics`, `/traffic`. No contract or data-flow changes. Update `e2e/runs.spec.ts`.

Files: `frontend/components/{prompts,products,runs,analytics,traffic}/*`,
`frontend/app/(app)/{prompts,prompt-research,products,runs,analytics,traffic}/**`,
`frontend/e2e/runs.spec.ts`.

Acceptance: screens render in the Figma language; polling/launch/export flows untouched; runs
e2e green.

Tests: `pnpm test -- components/prompts components/products components/runs components/analytics components/traffic`,
`playwright test e2e/runs.spec.ts`, `pnpm build`.

**Task 6 — Action + settings surfaces reskin (site-health detail per 1197)** [after 3; parallel with 4, 5]

Approach: same treatment for `/content`, `/issues`, `/knowledge-base`, `/settings` (incl.
providers/integrations tabs), setup edit form; restructure `/site-health` crawl/page detail per
`docs/redesign/figma/SiteHealthDetail.tsx` (score presentation, issue grouping layout). Update `e2e/providers.spec.ts`,
`e2e/content.spec.ts`.

Files: `frontend/components/{content,site-health,knowledge-base,settings,providers,setup}/*`,
matching `app/(app)/**` pages, `frontend/e2e/{providers,content}.spec.ts`.

Acceptance: site-health detail matches the Figma structure; forms/CSV flows unchanged;
providers + content e2e green.

Tests: `pnpm test -- components/content components/site-health components/knowledge-base components/settings components/providers components/setup`,
`playwright test e2e/providers.spec.ts e2e/content.spec.ts`, `pnpm build`.

---

### P4 — Marketing: complete content + animation refresh

**Task 7 — Landing content architecture, independent creative system, cinematic hero** [after 1; parallel with 2, 3, 8, 9]

Marketing is a **fully independent creative system** (user decision: "marketing pages have no
relation to the app") — its own palette, type, and display scale within premium bounds. The
system **already has a home**: `app/(marketing)/marketing.css` (4,689 lines) scopes styles
under `.mkt`, holds the existing `--mkt-*` token block, and defines plain CSS classes (`hero`,
`btn`, `grad-text`, `container`, `eyebrow`); its header documents that CSS files are exempt
from the no-raw-hex guard (`check-token-escapes.mjs` scans only `.ts/.tsx`). It is **not**
anchored to the Figma app tokens.

Approach:
- **Content architecture**: new `frontend/lib/marketing-content/landing.ts` — a typed copy
  module (same pattern as `pricing.ts`/`faq.ts`) defining the new narrative: hero
  headline/sub/CTA → proof strip (engines) → scroll-story scenes ("how visibility is measured"
  in 3 beats) → feature grid → BYOK trust → pricing teaser → CTA band. Designer owns final copy;
  the module is the single injection point.
- **Creative system**: **rewrite the `--mkt-*` token section of `marketing.css` to the dusk
  palette/type** per approved marketing mockups (gradients, display type scale,
  marketing-specific surfaces) and extend its plain-class inventory as the new sections
  require; components keep consuming the `.mkt`-scoped plain CSS classes — no Tailwind
  bridging, and hex stays inside the CSS file (components must remain hex-free).
  `marketing-theme-reset.tsx` is re-specified (and likely **deleted**): the `.mkt` system
  carries its own branded dusk canvas independent of `data-theme`, so the force-dark reset
  goes away; if any rewritten token still derives from app tokens, keep a minimal reset whose
  mount/unmount paths respect the new **light** global default.
- **Motion system**: `components/marketing/motion-primitives.tsx` — the single owner of
  `Reveal` (staggered entrance), `StaggerGroup`, `Parallax` (`useScroll`+`useTransform`
  translate/opacity), `Float` (idle floating-card drift), `ScrollScene` (scroll-driven
  pinned/progress storytelling wrapper), built on `motion/react` (v12, already a dependency)
  plus CSS. The motion scope is **extremely ambitious** (Superhuman/higoodie-class) — layered
  parallax scenes, scroll-scrubbed product storytelling, magnetic/hover micro-interactions —
  with hard guardrails: everything gated on `useReducedMotion()` + the CSS media query,
  transform/opacity only, below-fold scenes lazy-mounted (`whileInView`, once).
- **Cinematic hero** (`landing-hero.tsx`): display-scale headline (per approved mockups) + an
  **animated product scene** — a composited mock dashboard (score ring sweeping to value,
  sparkline drawing, floating KPI cards on parallax layers) built from the `--mkt-*` tokens;
  decorative scene is `aria-hidden` with a static poster under reduced motion.
- Rebuild the landing page sections (`features-grid`, `how-it-works` → scroll-story scenes,
  `product-visual`, `engine-strip`, `byok-trust`, `cta-band`, `landing-nav` (migrate its
  existing motion to the shared primitives), `landing-footer`) around the new copy module.

Files: `frontend/lib/marketing-content/landing.ts`,
`frontend/app/(marketing)/marketing.css` (token-section rewrite + class additions),
`frontend/app/(marketing)/{layout,page}.tsx`,
`frontend/components/marketing/{motion-primitives,landing-hero,features-grid,how-it-works,product-visual,engine-strip,byok-trust,cta-band,landing-nav,landing-footer,marketing-theme-reset}.tsx`,
`frontend/e2e/landing-nav.spec.ts`. (`e2e/marketing-pages.spec.ts` is owned solely by Task 8 —
this task does not touch it.)

Acceptance: new narrative renders from the copy module on the rewritten dusk tokens; hero scene
animates (transform/opacity only) and is fully static under `prefers-reduced-motion`;
decorative scenes `aria-hidden`; heading hierarchy valid; no layout-shift animation; components
stay hex-free; marketing unit tests + `landing-nav.spec.ts` green.

Tests: `pnpm test -- components/marketing`, `playwright test e2e/landing-nav.spec.ts`,
`pnpm build`.

**Task 8 — Pricing presentation redesign + secondary marketing pages** [after 1; parallel with 2, 3, 7, 9]

Approach: rebuild `pricing.tsx` presentation (tier cards + comparison table) in the marketing
creative system with motion accents — **facts unchanged**: tiers, prices, the BYOK note and
table rows keep rendering from `lib/marketing-content/pricing.ts` (edit only if the business
changes a term). Reskin `enterprise.tsx`, `solutions.tsx`, `faq.tsx`, `blog.tsx`/`blog-post.tsx`,
`compare.tsx`/`compare-detail.tsx` with the shared motion primitives and the marketing display
scale — ambitious within premium bounds (every page gets a crafted hero + scroll moment; taste
and AA legibility gate the ceiling, not a one-moment-per-page rule).

Files: `frontend/components/marketing/{pricing,enterprise,solutions,faq,blog,blog-post,compare,compare-detail}.tsx`,
`frontend/app/(marketing)/**`, `frontend/app/(marketing)/marketing.css` (shared class
additions), `frontend/e2e/marketing-pages.spec.ts` (**sole owner** — Task 7 does not touch it;
since the spec also covers the landing page, update it after Task 7's landing lands, i.e. as
the last step of P4).

Acceptance: pricing facts byte-identical in source; new presentation + reduced-motion-safe
animations; static generation + `notFound()` behavior kept; `marketing-pages.spec.ts` green.

Tests: `pnpm test -- components/marketing`, `playwright test e2e/marketing-pages.spec.ts`, `pnpm build`.

---

### P5 — Auth + onboarding

**Task 9 — Backend: stateless prompt-suggestion endpoint** [parallel; no frontend dependencies — can start at t=0, before P1 lands]

Unchanged from v1: add `POST /brand-suggestions/prompts` to
`backend/app/api/brand_suggestions.py`, mirroring the two existing endpoints exactly —
workspace auth via `require_active_workspace`, `confirm_send_evidence` enforced server-side,
guard order 422 → 503 (`agent_not_configured`) → 502, nothing persisted, no secrets returned.
DTOs in `app/domain/projects/schemas.py` (`{prompts: [{text, theme, intent}],
dropped_duplicates}`); suggestion logic reuses the agent prompt-construction half of prompt
generation (grep `app/domain/prompts/`; shared code lives in its owner — invariant 2); count
bounds/model knobs in `app/core/config` (invariant 1).

Files: `backend/app/api/brand_suggestions.py`, `backend/app/domain/projects/schemas.py`,
`backend/app/domain/projects/suggestions.py` and/or the prompts generation module,
`backend/app/core/config/*`, `backend/tests/unit/test_brand_suggestions_prompts.py`,
`backend/tests/component/test_brand_suggestions_prompts_api.py` (component tests follow the
`*_api.py` convention, e.g. `test_brand_suggestions_api.py`).

Acceptance: valid confirmed payload → validated suggestions; 422-before-503 ordering; 503 when
unconfigured; workspace auth enforced; tests mirror the sibling suites.

Tests: `uv run pytest tests/unit/test_brand_suggestions_prompts.py tests/component/test_brand_suggestions_prompts_api.py -q`,
`uv run ruff check .`.

**Task 10 — Auth screens redesign in the Figma language** [after 3; parallel with 4, 5, 6, 11]

Approach: restyle `app/(auth)/layout.tsx` split-screen (brand panel + form panel) with the
Figma tokens/type — brand panel layout per approved mockups (no Figma auth reference); larger
type, elevated form card; reskin login/register + `components/auth/oauth-buttons.tsx`. Keep 503
OAuth coming-soon behavior, single-h1 rule, theme toggle.

Files: `frontend/app/(auth)/{layout,login/page,register/page}.tsx`,
`frontend/components/auth/oauth-buttons.tsx`.

Acceptance: both screens in the Figma language at split + mobile layouts; flows unchanged;
auth tests green.

Tests: `pnpm test -- components/auth`, `pnpm build`, smoke via `e2e/smoke.spec.ts`.

**Task 11 — Figma-styled onboarding with AI auto-discovery + first-run gating** [after 3, 9]

Approach:
- **Route**: new `frontend/app/(onboarding)/onboarding/{layout,page}.tsx` — SessionGuard +
  ProjectProvider, **no** AppShell; layout redirects to `/visibility` when projects exist.
- **Layout per `docs/redesign/figma/OnboardingScreen.tsx`**: full-screen split — left panel (logo header + sign-out, top
  progress stepper, step content, footer pager with Back/Continue + "Step N of M"); right
  live-preview panel that summarizes the brand, then populates discovered competitors/domains/
  prompts as they arrive, then the review selection.
- **Flow (auto-discovery requirement unchanged)**: Step 1 Brand (name + website URL +
  derived-domain preview + explicit AI consent checkbox — backend enforces
  `confirm_send_evidence`) → Step 2 Discovery (fire `suggestCompetitors` +
  `suggestOwnedDomains` + new `suggestPrompts` in parallel; animated staged progress;
  per-section status + retry) → Step 3 Review (pre-filled **editable** competitor rows, domain
  chips, prompt rows with theme/intent — mirrors 1200's pre-filled-suggestions pattern;
  market defaults US/en with inline change) → Confirm: `POST /projects` → `POST /prompt-sets`
  → batched prompt creates → set active project → `router.replace('/visibility')`; post-create
  failure lands in the app with a notice pointing at `/prompt-research`.
- **Degradation**: 503/all-failed → manual-entry fallback with inline notice; onboarding never
  requires the agent.
- **Client**: add `suggestPrompts` to `frontend/lib/api/projects.ts` + zod in
  `lib/api/schemas.ts`/`types.ts`.
- **Gating**: `components/layout/onboarding-gate.tsx` in `app/(app)/layout.tsx`
  (ProjectProvider → gate → AppShell): zero projects → `router.replace('/onboarding')`.
  `app/(app)/setup/page.tsx` no-project branch redirects to `/onboarding`; `/setup/new` stays
  for additional projects. Login/register post-auth routing unchanged — the gate catches
  first-run users. Two race conditions are explicit requirements: **(a)** the gate waits for
  ProjectProvider's `isLoading` to settle before redirecting — no `/onboarding` flash for
  users who already have projects; **(b)** the confirm chain awaits invalidation/refetch of
  the projects query before `router.replace('/visibility')`, so the gate (still seeing a
  stale empty list) doesn't bounce the just-created user back to `/onboarding`.
- **Docs**: `/onboarding` row in `docs/frontend-architecture.md`.

Files: `frontend/app/(onboarding)/onboarding/{layout,page}.tsx`,
`frontend/components/onboarding/*`, `frontend/components/layout/onboarding-gate.tsx`,
`frontend/app/(app)/layout.tsx`, `frontend/app/(app)/setup/page.tsx`,
`frontend/lib/api/{projects.ts,schemas.ts,types.ts}`, `docs/frontend-architecture.md`,
`frontend/e2e/onboarding.spec.ts` (new).

Acceptance: zero-project users are gated into the Figma-styled stepper; users **with** projects
never see an `/onboarding` flash (gate waits for `isLoading`); discovery populates the
right panel live; review is fully editable; confirm creates project+set+prompts and lands on
`/visibility` without bouncing back (projects query refetched before navigation); manual
fallback completes end to end without agent keys; users with projects cannot re-enter
onboarding.

Tests: `pnpm test -- components/onboarding lib/api`, backend tests from task 9,
`playwright test e2e/onboarding.spec.ts` (fallback path runs without keys; happy path
intercepts suggestion routes), `pnpm build`.

---

### P6 — Polish + full verification

**Task 12 — Empty-state sweep, a11y/motion pass, full verification** [after 4, 5, 6, 7, 8, 10, 11]

Approach: sweep all screens onto the shared empty-state primitive; subtle in-app motion polish
(reduced-motion gated); verify `forced-colors`/`print`/focus against the Figma tokens; update
`docs/frontend-architecture.md` nav description and stale design.md cross-refs; run the full
gate.

Acceptance: `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm check:policy`, full `pnpm test:e2e`
all green; contrast guard green on both themes; no raw hex in `.ts/.tsx` source — hex only in
globals.css + marketing.css.

Tests: full suite.

## 6. Testing strategy by phase

| Phase | Unit/guard | Build/lint | e2e |
|---|---|---|---|
| P1 | `globals.test.ts` (name-set + Figma palette + contrast), theme tests | `pnpm build`, `pnpm check:policy` | — |
| P2 | `components/layout`, `components/ui` (incl. new score-band boundaries) | build + policy | `shell.spec.ts` |
| P3 | per-surface suites | build + lint | `visibility`, `runs`, `providers`, `content` |
| P4 | `components/marketing` | build | `landing-nav`, `marketing-pages` |
| P5 | onboarding + auth (msw); backend unit/component | `pnpm build`; `uv run ruff check .` | `onboarding.spec.ts` (new), `smoke` |
| P6 | full `pnpm test` | build + lint + policy | full `pnpm test:e2e` |

## 7. Risks and mitigations

1. **Token-name mapping gaps.** Figma has 4 surfaces vs our 6, 4 shadows vs our 6, tertiary vs
   muted, `.dark` class vs our attribute. → The §3 mapping table is written into design.md;
   aliases documented; guards updated in the same P1 commit; any call site referencing a renamed
   concept is caught by `check-design-tokens.mjs` + build.
2. **Guard tests fail on the new palette.** Hardcoded legacy hexes in `globals.test.ts`,
   hardcoded var list in `check-design-tokens.mjs`, new vivid pairs may fail AA — and the dark
   theme is newly authored, so its pairs are unproven. → P1 rewrites assertions to the Figma
   light palette, computes contrast programmatically for both themes, and adds the §3a
   luminance floor/ordering assertions so a too-dark or flat dark theme fails fast; failures get
   fixed in tokens before downstream phases consume them.
3. **Authored dark theme lands wrong.** It is new design work, not a port: risk of drifting
   near-black (user explicitly hates it), washed-out elevation, or sub-AA accent hues. → §3a
   hard constraints are machine-enforced in `globals.test.ts` (not-near-black floor, strict
   base < panel ≤ elevated ordering, AA pairs); exact ramp reviewed against the approved
   mockups before P1 closes.
4. **Confirmed visual changes still touch tests.** Owned citations green→blue (confirmed) and
   buttons pill→rounded change rendered output; score-band thresholds and nav grouping are
   explicitly **unchanged** (user decisions) — do not "fix" them to match Figma. → Badge/button
   snapshot and unit updates land in task 3; score-band and nav-group tests must pass
   unmodified.
5. **e2e selector breakage** (restyled shell, dashboard hero, new marketing sections,
   onboarding). → Spec updates land in the same phase as each structural change; role-based
   selectors; the nav group-label assertions survive (groups kept); P6 runs the full suite.
6. **Cinematic animation performance/a11y** (now a larger risk with the expanded marketing
   ambition). → `motion/react` + CSS only, transform/opacity only, `useReducedMotion` +
   media-query static fallback, decorative scenes `aria-hidden`, below-fold scenes lazy, one
   motion-primitives owner (invariant 2).
7. **Marketing creative system drifts into a second token mess.** Independent palette could
   bypass the token policy or leak app tokens. → All marketing values live in the existing
   `--mkt-*` block in `app/(marketing)/marketing.css` behind plain `.mkt`-scoped classes (CSS
   is exempt from the no-raw-hex guard, which scans `.ts/.tsx` only — components stay
   hex-free); the `.mkt` contract is documented as its own design.md section;
   check-design-tokens.mjs scans both CSS files and the contrast suite covers the documented
   `--mkt-*` pairs with the dim-tone carve-outs.
8. **Marketing copy dependency.** Designer owns final copy; build can't wait. → Copy module
   (`landing.ts`) isolates copy from structure; structure + motion built against the module's
   typed shape; final copy drops in without code churn.
9. **Font switch regressions.** Geist→Inter changes every metric; Figma macOS-style fallbacks
   differ from next/font self-hosting. → next/font `display: swap`, variable name `--font-sans`
   unchanged; visual check in P2 before screens land.
10. **Onboarding agent-not-configured / half-created state.** → 503 manual fallback;
    per-section 502 retry; confirm chain tolerant (lands in app with notice); e2e covers
    fallback without keys.
11. **Theme flip surprises existing users.** → Only unset choices flip dark→light; stored
    choices honored; `marketing-theme-reset` no longer forces dark on marketing exit; noted for
    release notes.

## 8. Dependency notes

- P1 first: every surface consumes tokens; the contrast guard must exist before values land.
- Primitives (3) before screens (4–6, 10, 11): screens compose the new variants; doing screens
  first doubles churn.
- Marketing (7–8) and backend (9) are file-disjoint from app work — maximal parallelism after
  P1. Marketing needs no primitives task because its components are self-contained + tokens.
  Task 9 has no frontend dependencies — it can start at t=0, before P1 lands.
- Cheat sheet: 9 ∥ everything from t=0; 1 → {2, 3, 7, 8} → {4, 5, 6, 10} (after 3), 11 (after
  3+9) → 12.

## 9. Acceptance criteria (whole initiative)

- Figma **light** tokens live verbatim in globals.css behind stable semantic names; the
  **authored soft-charcoal dark theme** (never near-black, clearly lighter elevation) passes the
  §3a guard assertions; design.md rewritten as the written form of both themes + the marketing
  creative system; guard trio green (name-set sync, palette, programmatic AA ≥ 4.5:1 both
  themes).
- Inter + Geist Mono via next/font; Figma type scale live **verbatim** (48 hero / 26 page /
  17 section / 15 card / 14 body); light default with no flash.
- Shell restyled in the 1196 visual language with the **Analyze/Improve groups kept**;
  visibility dashboard matches 1199 (hero metric card); site-health detail matches 1197;
  buttons rounded per 1198; **score bands still threshold at 25/50/75** in Figma band colors;
  owned citations render Figma blue.
- Marketing is a fully independent creative system (the existing `.mkt` system in
  `app/(marketing)/marketing.css`, its token section rewritten to the dusk palette): new
  content architecture from a typed copy module, extremely ambitious reduced-motion-gated
  animation (cinematic hero, scroll storytelling, parallax/floating cards), pricing
  presentation redesigned with facts unchanged; all marketing e2e green.
- Onboarding per 1200 (split layout + live preview) with the full AI auto-discovery flow and
  manual fallback; first-run gating in place with both race conditions covered (no flash for
  users with projects; no bounce-back after confirm); returning users never re-see it.

## 10. Resolved decisions + deferred items

**Resolved by the user (2026-07-25) — no longer open:**

1. **Type scale**: Figma 14px-based scale adopted verbatim; the earlier 15–16px body request is
   overridden.
2. **Score bands**: thresholds stay 25/50/75 (`score-band.ts` unchanged); Figma band colors map
   onto the existing bands.
3. **Owned citations**: switch to Figma blue; the green identity is dropped.
4. **Nav**: the grouped Analyze/Improve structure is kept and restyled; the Figma flat nav is
   not adopted.
5. **Dark theme**: the Figma midnight dark (`#09090F`/`#0D1228`) is rejected; P1 authors a new
   lighter soft-charcoal dark (Perplexity/Claude-style, never near-black) per §3a. Light theme
   ports Figma verbatim.
6. **Marketing**: fully independent creative system with extremely ambitious motion scope; not
   anchored to Figma app tokens. Pricing-facts constraint and the motion-primitives
   architecture stand.

**Deferred to approved mockups (non-blocking):** the dark family's exact ramp (cool
slate-charcoal ≈ `#1C1E22` vs warm charcoal ≈ `#2A2926` — either satisfies §3a); the marketing
palette/type/display scale and final copy; the auth brand-panel layout.
nstraint and the motion-primitives
   architecture stand.

**Deferred to approved mockups (non-blocking):** the dark family's exact ramp (cool
slate-charcoal ≈ `#1C1E22` vs warm charcoal ≈ `#2A2926` — either satisfies §3a); the marketing
palette/type/display scale and final copy; the auth brand-panel layout.
