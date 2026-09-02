# CiteLadder frontend / design-system final debt audit

> Snapshot of the **current tree** after the completed marketing, auth,
> onboarding, authenticated-app, and shared-primitive migration.
> Shipped code is authoritative. This document is an audit, not a redesign
> brief.

## 1. Executive Summary

The migration is **real and largely complete**. There is one token owner
(`frontend/app/globals.css` plus scoped type in `website-type.css`), one
authenticated primitive directory (`frontend/components/ui/`), Radix imported
only from those wrappers, marketing CTAs composed on the shared `Button`, and
auth/onboarding sharing `FlowShell` + `Field`/`Input`. Static policy
(`frontend/scripts/check-design-system.mjs`) already forbids raw hex, stray
`@theme`, feature-level Radix, retired `text-2xs`/`font-semibold`/`font-bold`,
and nested Cards. Complexity policy has **zero** module/function exceptions.

The design system is **genuinely consolidated**. Remaining debt is residue,
not a second system: a few unused modules, query keys that never joined the
factory, spinner glyph drift, stale documentation that still describes the
pre-cutover world, unused warm gray palette rungs, incomplete table-to-record
mobile treatment, and small labeled-control inconsistencies.

Another major migration is **not justified**. A bounded cleanup pass (delete
dead owners, fold query keys, archive stale plans, fix token/glyph leftovers)
is the right next step.

### Verdict: B — Mostly consolidated

Some meaningful but bounded debt remains. Competing *visual systems* do not.
The leftover “old vs new” signals are comments, an implemented plan still
sitting in `docs/plans/`, unused palette rungs, and a handful of feature
patterns the cutover never fully homogenized (table mobile, in-ledger empty
copy, ad-hoc query keys).

Largest remaining categories, in order of cleanup value:

1. Dead / unused production modules (`LayerTabs`, unused icon map keys, unused dark lockup).
2. Query-key factory bypasses (`brand-discovery*`, `audit-estimate`).
3. Documentation drift (`visual-redesign-plan.md` still framed as a current
   production audit; comments pointing at a deleted website design-system doc).
4. Small token/glyph leftovers (`border-purple-200`, `Loader2` vs `LoaderCircle`).
5. Table mobile: design contract says labelled records; most tables still
   horizontally scroll.

Recommended cleanup scope: **delete-first**, then fold query keys and docs,
then optional table-mobile homogenization only if product still wants that
contract. Do not introduce new primitives.

---

## 2. Current Frontend Architecture

### Surfaces

| Surface | Route group | Chrome owner |
| --- | --- | --- |
| Marketing | `frontend/app/(marketing)/` | `MarketingNav` / `MarketingFooter` / `MarketingMotion` |
| Auth | `frontend/app/(auth)/` | `FlowShell` (`data-flow-surface`) |
| Onboarding | `frontend/app/(onboarding)/` | Same `FlowShell`; `SessionGuard` + `ProjectProvider`, no app chrome |
| Authenticated app | `frontend/app/(app)/` | `AppShell` (`product-app` class): sidebar, top bar `PageHeader`, command palette, Agent drawer, mobile station bar |

Root `frontend/app/layout.tsx` loads Geist + Plus Jakarta Sans, skip link,
and `QueryProvider`. Authenticated layout stacks `SessionGuard` →
`ProjectProvider` → `ProductTourProvider` → `EntitlementProvider` →
`ToastProvider` → `OnboardingGate` → `AppShell`.

App routes are thin pages that render feature screens under `frontend/components/{domain}/`.

### Component hierarchy

```text
app/(group)/layout + page
  → screen coordinator (query, URL state, mutations)
    → feature owners (tables, drawers, catalogs)
      → components/ui/* primitives
      → components/marketing/* (public only)
```

Design-system ownership: `globals.css` (tokens, geometry, interaction),
`website-type.css` (public/flow type + flow geometry), `ui-motion.css`
(overlay motion). Product UI consumes semantic Tailwind utilities.

### State / data

- TanStack Query: `frontend/lib/api/query-client.ts` +
  `frontend/lib/providers/query-provider.tsx`.
- Query keys: `frontend/lib/api/query-keys.ts` facade over `query-keys/*`.
- Shareable UI state: `frontend/lib/navigation/url-state.ts`.
- Transport: `frontend/lib/api/client.ts` (`fetch` lives here only).
- SSE: `frontend/lib/sse/use-event-stream.ts`; domain hooks own invalidation.

### Major production libraries (UI/architecture)

| Library | Role |
| --- | --- |
| Next.js 16 App Router | Routing, layouts, fonts |
| TanStack Query | Server state |
| Zod | Response/form schemas |
| React Hook Form | Auth, onboarding, prompt form |
| Radix (checkbox, dialog, dropdown, radio, select, slot, tabs, toast, tooltip) | Primitive behavior, wrapped in `components/ui` |
| class-variance-authority + clsx + tailwind-merge | Variant/class composition (`cn`) |
| lucide-react | Icons; nav concepts via `lib/icons.ts` |
| motion | Product/marketing React motion |
| gsap + @gsap/react | Marketing scroll reveal + price animation |
| driver.js | Product tour |
| country-flag-icons | `MarketSelect` only |
| react-markdown + remark-gfm | Content result rendering |

No HeroUI, no second table kit, no second state library.

---

## 3. Current Design-System Map

### Foundations (canonical: `frontend/app/globals.css`)

| Concern | Status |
| --- | --- |
| Semantic surfaces (`background`, `sidebar`/`well`, `panel-tonal`, `active`, `panel`) | Tokenized; cool-blue ladder as in `docs/design.md` |
| Palette layer (`gray-*` warm rungs, `indigo-*`, evidence families) | Tokenized; **warm `gray-*` rungs are unused by components** |
| Text roles (`foreground`, `secondary`, `muted`, `subtle`, `disabled`) | Tokenized; policy-enforced contrast |
| Action navy / accent indigo / focus | Tokenized |
| Spacing / gutters / control heights | Tokenized (`--content-gutter` 24px, `--control-height` 32px, etc.) |
| Radii (`--radius-control` 10px, card/overlay 16px, flow 12px) | Tokenized; flow scoped in `website-type.css` |
| Shadows | Overlay-only (`shadow-elevated`, `shadow-modal-value`); Card is flat |
| Typography | Two ladders: Geist product (`@theme` `--font-display` = Geist); Plus Jakarta on `[data-public-surface]` / `[data-flow-surface]` |
| Motion | `ui-motion.css` + `--ease-*` / `--transition-*`; reduced-motion in `globals.css` |
| Focus | Shared `focus-ring` / `--color-focus` |

### Primitive components (canonical under `frontend/components/ui/`)

| Capability | Canonical | Notes |
| --- | --- | --- |
| Button | `button.tsx` + `button-variants.ts` | Marketing `primitives/button.tsx` wraps this (`ButtonLink` / `TextLink`) |
| Input / Textarea / Search | `input.tsx`, `textarea.tsx`, `search-field.tsx` | Search composes Input |
| Select | `select.tsx` (Radix) | Page-kind filter uses Dropdown + `inputClasses` (intentional; design.md) |
| Checkbox / Radio / Switch | `checkbox.tsx`, `radio-group.tsx`, `switch.tsx` | Switch is native `role="switch"`, not Radix (no switch package) |
| Field | `field.tsx` | Label + hint + error; not every labeled input uses it |
| Badge | `badge.tsx` + `badge-variants.ts` | Domain wrappers (`PageKindBadge`, opportunity badges) are thin maps |
| Tooltip / Dropdown / Dialog / Drawer | matching modules | Command palette uses Radix Dialog **directly** (documented exception) |
| Tabs | `tabs.tsx` | URL-driven layer tabs were a second owner; **unused** (`layer-tabs.tsx`) |
| Table | `table.tsx` | Semantic ledger; default wrapper `overflow-auto` |
| Pagination | `cursor-pager.tsx` (server cursor) and `table-pagination.tsx` (client window) | Two jobs; not duplicates |
| Alert / MutationNotice | `alert.tsx`, `mutation-notice.tsx` | |
| Skeleton / EmptyState / UnavailableValue | matching modules | Feature empty-state files mostly wrap `EmptyState` with copy |
| Card / workspace / typography recipes | `card.tsx`, `workspace.tsx`, `typography.tsx`, `eyebrow.tsx` | |
| Charts | `trend-chart.tsx`, `sparkline.tsx`, `score-ring.tsx`, `score-bar.tsx` | Complementary, not competing |
| Toast | `toast.tsx` | Transient success |
| Pressable / CopyButton / CSV import / MarketSelect / Command palette | specialized | Multiple consumers except Sparkline (one) |

No Accordion primitive by design (`docs/ui-component-system.md`): native
`<details>` / `<summary>` for FAQ, provenance, agent history, commerce
corrections.

### Patterns / composites

- App chrome: `components/layout/*` (`app-shell`, `sidebar-nav`, `page-header`,
  `command-palette` in ui, `agent-sheet`).
- Marketing: `components/marketing/{chrome,primitives,pages,landing,scenes,pricing}`.
- Insight object: `components/intelligence/insight.tsx` (Overview consumer).

---

## 4. Findings

### Design-System Debt

**DS-01 — Unused warm gray palette rungs beside the cool semantic ladder**

- Severity: P2
- Confidence: High
- Files: `frontend/app/globals.css` (`--color-gray-50` … `--color-gray-400` warm hexes at lines 14–18)
- Evidence: Grep of `bg-gray-` / `text-gray-` / `border-gray-` in production TS/CSS hits **only** `globals.css` declarations. Semantic canvas is `--color-background: #f6f8fc`. `--color-citation-third-party-border` still uses `#e7e5de` (gray-300).
- Problem: Palette layer documents a superseded warm paper system.
- Impact: Future authors can pick `gray-50` and silently leave the Prism canvas.
- Recommended resolution: Keep semantic aliases; either retarget unused `gray-*` rungs to the cool ladder or stop exposing unused rungs if policy/tests allow. Do not introduce a second marketing palette.

**DS-02 — Run-status “analyzing” uses default Tailwind `purple-200`**

- Severity: P2
- Confidence: High
- Files: `frontend/components/ui/badge-variants.ts` line 40
- Evidence: `analyzing: '… border border-purple-200'` while sibling statuses use `border-accent-border` / semantic run tokens. Comment above the file claims “No raw hex; all classes resolve to the semantic Tailwind declarations in globals.css.”
- Problem: Canonical badge map bypasses the token contract for one state.
- Impact: Visual drift vs indigo analyzing wash (`--color-run-analyzing-*`).
- Recommended resolution: Replace with `border-accent-border` (or a run-analyzing border token if one exists).

**DS-03 — Spinner glyph is not canonical**

- Severity: P2
- Confidence: High
- Files: `frontend/lib/icons.ts` (documents `LoaderCircle` only); `frontend/components/ui/button.tsx`, `search-field.tsx` (LoaderCircle); `frontend/components/ui/analytics-toolbar.tsx`, `traffic/traffic-toolbar.tsx`, `traffic/traffic-screen.tsx`, `demand/demand-projection.tsx`, `settings/property-picker.tsx`, `settings/integration-connection-row.tsx` (`Loader2`)
- Problem: Two Lucide aliases for the same concept after `lib/icons.ts` existed to prevent this.
- Impact: Inconsistent motion/weight of pending indicators.
- Recommended resolution: Use `ICONS.spinner` (or `LoaderCircle`) at the listed call sites. Do not add a Spinner component.

### Styling Debt

**ST-01 — Stale “warm canvas” copy in shipped chrome comments**

- Severity: P2
- Confidence: High
- Files: `frontend/app/layout.tsx` `DIRECTION_CONTRACT` (“warm neutral ground”); `frontend/app/(marketing)/layout.tsx` comment (“The warm canvas…”)
- Evidence: Semantic tokens and `docs/design.md` specify cool `#F6F8FC`. The root layout injects the direction contract into the document as hidden HTML.
- Problem: Implementation comments/contract text describe the rejected warm thesis.
- Impact: Agents and humans re-introduce warm rungs.
- Recommended resolution: Rewrite those strings to match `docs/design.md`. No visual change.

**ST-02 — `product-app` class has no CSS owner**

- Severity: Advisory
- Confidence: High
- Files: `frontend/components/layout/app-shell.tsx` line 26; `frontend/scripts/design-system-source-checks.mjs` only forbids palette overrides *if* a `.product-app {` block appears
- Problem: Class name looks like a type/palette scope but `website-type.css` uses `.app-type-scale` for preview reset; product type is the default `@theme`.
- Recommended resolution: Leave as a harmless marker, or delete the class if unused by tests/tours. Do not add a new CSS namespace.

Arbitrary hex in feature TSX was **not** found; policy owns that. Inline `style` usages inspected are geometry (widths, GSAP/nav lens, progress), not palette. `!important` exists only in `globals.css` (focus, reduced-motion, print).

### Component Duplication

**DUP-01 — `LayerTabs` is a second tab owner with zero production consumers**

- Severity: P1
- Confidence: High
- Files: `frontend/components/layout/layer-tabs.tsx`, `frontend/components/layout/layer-tabs.test.tsx`
- Evidence: Repository search for `LayerTabs` / `@/components/layout/layer-tabs` returns only those two files. Site Health, Settings, Visibility, Traffic, Prompts use `components/ui/tabs.tsx` plus `useUrlState` for `?tab=`.
- Problem: URL-link tabs were rebuilt on Radix `Tabs` + codecs; `LayerTabs` was not deleted.
- Impact: Next feature may copy the dead owner.
- Recommended resolution: Delete the component and its test. Do not merge APIs.

**DUP-02 — Feature empty-state modules vs in-ledger empty copy**

- Severity: P2
- Confidence: High
- Files (wrappers of canonical `EmptyState` — keep): `visibility/empty-state.tsx`, `traffic/empty-state.tsx`, `ai-referrals/empty-state.tsx`, `prompts/prompt-empty-state.tsx`, `settings/integrations-empty-state.tsx`
- Files (inline muted centered paragraphs / custom wells, not `EmptyState`): `site-health/inventory-section.tsx`, `issues-catalog.tsx`, `prompts/your-prompts.tsx`, `prompts/prompt-library.tsx`, `demand/demand-projection.tsx`, `visibility/visibility-trends.tsx` (`TrendEmptyState`), `content/content-screen-history.tsx` (explicit comment: rail must not use the card EmptyState), `app/(app)/runs/page.tsx`, `projects/dashboard-sections.tsx`
- Problem: Page-level empty is consolidated; **in-table / in-panel** empty is still copy-pasted `text-secondary … py-[var(--empty-state-padding)]`.
- Impact: Maintenance only; visual language is close (same padding token).
- Recommended resolution: Do **not** force `EmptyState` into rails/tables (comment in `content-screen-history.tsx` is correct). Optional: one `LedgerEmpty` one-liner helper **only if** you count ≥3 identical blocks you will actually migrate. Otherwise leave.

**DUP-03 — Domain badge wrappers**

- Severity: Advisory
- Confidence: High
- Files: `site-health/page-kind-badge.tsx`, `opportunities/opportunity-status-badge.tsx`, `opportunity-type-badge.tsx`
- Evidence: All render `Badge` / `UnavailableValue`. Not a second status system.
- Recommended resolution: Keep. They own domain labels, not styling.

**DUP-04 — `Wordmark` is a pass-through around `LogoMark`**

- Severity: P2
- Confidence: High
- Files: `frontend/components/marketing/primitives/wordmark.tsx` (LogoMark size 24); consumers `marketing/chrome/nav.tsx`, `footer.tsx`. `AuthWordmark` (`auth/brand-panel.tsx`) is a home `Link` + LogoMark — keep.
- Recommended resolution: Inline `LogoMark` at nav/footer and delete `Wordmark`, or keep if you want a marketing-named export. Low value either way.

Pagination (`CursorPager` vs `TablePagination`), Radio chip vs `FilterChip`, `TrendChart` vs `Sparkline`, `ScoreRing` vs `ScoreBar`, marketing `ButtonLink` vs `Button` are **legitimate specializations**.

### Abstraction / Complexity Debt

**AB-01 — Unused `ICONS` keys**

- Severity: P2
- Confidence: High
- Files: `frontend/lib/icons.ts` — `knowledgeBase`, `ai` have **no** `ICONS.*` call sites. `reports` is used (`overview-metrics.tsx`). `setup` used in command palette.
- Recommended resolution: Delete unused keys and their lucide imports.

**AB-02 — `LogoMark` dark surface + asset unused**

- Severity: P2
- Confidence: High
- Files: `frontend/components/ui/logo-mark.tsx` (`LOGOS.dark` → `/citeladder-dark-logo.webp`); grep finds no `surface="dark"` and no other references to the webp.
- Evidence: Product is light-only (`docs/design.md`).
- Recommended resolution: Remove the dark variant and the unused asset if nothing else references it. Verify `frontend/public/` once at implementation time.

**AB-03 — Query-keys comment lists a nonexistent `products.ts`**

- Severity: P2
- Confidence: High
- Files: `frontend/lib/api/query-keys.ts` lines 13–16 (`products.ts` vs actual `commerce.ts`; billing/agent omitted from the comment list)
- Recommended resolution: Fix the comment. Do not add a products key module.

Variant `*-variants.ts` files are healthy CVA splits, not wrapper-on-wrapper.

### React Architecture Debt

No P0/P1 React architecture defects verified. Coordinators vs views match `docs/frontend-architecture.md`. Complexity policy exceptions are empty. `use client` on primitives that need Radix/hooks is expected.

**RA-01 — `knowledge-base/` directory name vs Facts product language**

- Severity: Advisory
- Confidence: High
- Files: `frontend/components/knowledge-base/brand-profile-panel.tsx` (Overview Facts editor)
- Problem: Naming leftover from retired knowledge workspace; behavior is the current Facts owner.
- Recommended resolution: Do not rename in the cleanup pass unless you are already touching imports. Rename is churn.

### Data / TanStack Query Debt

**QK-01 — Ad-hoc query keys outside the factory**

- Severity: P1
- Confidence: High
- Files:
  - `frontend/lib/onboarding/use-brand-discovery.ts` line 47: `['brand-discovery', discoveryId]`
  - `frontend/components/onboarding/onboarding-flow.ts` lines 113, 221: `['brand-discovery-catalog']` / `['brand-discovery']`
  - `frontend/components/projects/project-edit-panel.tsx` line 64: `['brand-discovery-catalog']`
  - `frontend/components/runs/launch-dialog.tsx` line 156: `['audit-estimate', selection]`
- Problem: `queryKeys` is the documented single owner. These strings cannot be invalidated by namespace helpers.
- Impact: Stale cache / missed invalidation risk across onboarding and project edit.
- Recommended resolution: Add `query-keys` entries (onboarding/brand-discovery + runs estimate) and replace literals. Keep API modules as they are.

**QK-02 — Visibility project key appends `cohort` outside the factory filters object**

- Severity: P2
- Confidence: High
- Files: `frontend/lib/visibility/use-visibility-dashboard.ts` ~250; `frontend/lib/api/query-keys/runs.ts` `visibilityKeys.project(..., filters)`
- Evidence: `queryKey: [...queryKeys.visibility.project(...), cohort]` instead of passing `{ cohort }` as `filters`.
- Problem: Two shapes for the same resource.
- Recommended resolution: Pass cohort in `filters`. Confirm no duplicate cache entries in tests.

Direct `fetch` in feature components was not found; `lib/api/client.ts` and SSE own transport. Healthy.

### Forms

**FM-01 — Labeled inputs that reimplement `Field` anatomy**

- Severity: P2
- Confidence: High
- Files: `frontend/components/prompts/generate-prompts-dialog-view.tsx` (span label + `Input`/`Select` with `aria-label`, lines 131–157); `frontend/components/settings/billing-settings.tsx` `CountryInput` (manual `label htmlFor` + hint, lines 277–297)
- Contrast: Auth (`auth-form.tsx`), prompt dialog (`prompt-form-dialog.tsx`), onboarding stages, brand profile, launch dialog, provider connect use `Field`.
- Problem: Spacing (`gap-1.5` vs Field `gap-2`) and error wiring differ; generate-prompts has no Field error slot (uses Alert instead — OK).
- Impact: Small visual/a11y inconsistency, not unlabeled controls (billing associates `htmlFor`; generate uses `aria-label`).
- Recommended resolution: Swap those two to `Field` if the pass is already in forms. Do **not** migrate billing/schedules/filters to React Hook Form (`docs/ui-component-system.md` already allows local state).

Auth + onboarding + prompt form on RHF+Zod is consistent and should stay.

### Tables / Data UI

**TB-01 — Mobile “labelled records” is not the shared table behavior**

- Severity: P1
- Confidence: High
- Files implementing `block md:table` + hidden header: `site-health/architecture-panel.tsx` (~224), `site-health/aeo-readiness-panel.tsx` (~118)
- Files using default `Table` (`overflow-auto` in `ui/table.tsx`): includes `pages-table.tsx`, `runs-table.tsx`, `opportunities-catalog.tsx`, `traffic/metric-table.tsx`, prompt/runs executions, ranking rows, etc.
- Contract: `docs/design.md` — “Tables become labelled records”
- Problem: Two Site Health ledgers got the compact stacked treatment; the rest remain wide scrollers.
- Impact: Mobile usability on dense product tables.
- Recommended resolution: Either (a) encode the stacked record pattern **once** on `Table` via an explicit `layout="records-on-compact"` used by those two (and migrate others incrementally), or (b) if horizontal scroll is the accepted shipped behavior, **update `docs/design.md`** so the next agent does not rebuild tables. Do not add a virtualized table library.

`CursorPager` vs `TablePagination`: keep both (server cursor vs client slice of a full list).

### Accessibility

No P0 defects verified from component semantics.

Command palette, Dialog, Drawer, Tabs, Checkbox, Radio, Switch, skip link, and `Field` association are in good shape. Native `<details>` is used deliberately (FAQ ships without a client island).

**A11Y-01 — Icon-only / pending buttons generally have names; no verified unlabeled icon-only product control in this pass.**

Do not open an a11y rewrite.

### Responsive / Mobile

Station navigation is systematic: `NAV_GROUPS` + `MOBILE_NAV_ITEMS` in `nav-items.ts`, desktop sidebar vs `md:hidden` secondary strip + five-slot bar in `sidebar-nav.tsx`. This is **not** duplicated feature trees; it is one owner with compact presentation.

Remaining mobile debt is **TB-01** (tables) plus ordinary `overflow-x-auto` on tablists (intentional).

### Cross-Surface Consistency

Marketing, auth, onboarding, and app share tokens, Button, Alert, and logo lockup. Differences that remain are **intentional type/geometry scopes** (`website-type.css`), not a second palette.

Residual “old frontend” signals are comments (`warm canvas`, `docs/website-design-system.md`, “Midnight empty-state”, slice/F-number comments) rather than parallel component kits.

### Dead Code / Migration Residue

See §6. Stale comments in empty-state wrappers still say “Midnight empty-state pattern” / mockup HTML filenames (`prompt-empty-state.tsx`, `integrations-empty-state.tsx`) after the shared `EmptyState` already exists.

### Dependencies

All listed UI dependencies have production owners. Overlap of **gsap vs motion** is documented and intentional (scroll/price vs product overlay). Do not remove either.

`country-flag-icons` is heavy for one `MarketSelect`; keep unless you replace flags with emoji/SVG in that component (out of scope unless deleting the dep is required).

`driver.js` CSS is imported in `product-tour-provider.tsx` only — global side effect of the library, accepted for the tour.

### Documentation Drift

**DOC-01 — `docs/plans/visual-redesign-plan.md` still leads with pre-cutover metrics**

- Severity: P1 (docs)
- Confidence: High
- Evidence: Opening “Current production audit” still cites 111 `font-semibold`, 95 `text-2xs`, Card always bordered/shadowed. Production grep of `font-semibold`/`text-2xs` in app TSX is empty (only policy tests). Card is flat (`card-variants.ts`). Later section says public/flow redesign is implemented.
- Recommended resolution: **Archive** to `docs/archive/` (or delete if archive policy prefers). Do not treat it as implementation authority. `docs/README.md` already says one active plan owns future work; this file contradicts shipped `docs/design.md`.

**DOC-02 — Comments reference a nonexistent `docs/website-design-system.md`**

- Severity: P2
- Confidence: High
- Files: `frontend/components/marketing/primitives/label.tsx`, `section.tsx`
- Recommended resolution: Point comments at `docs/design.md`. Do not recreate the old doc.

**DOC-03 — `docs/ui-component-system.md` and `docs/design.md`**

- Severity: Advisory
- Confidence: High
- Recommended resolution: **Leave as active owners.** Optional one-line updates after QK-01 / LayerTabs deletion. HeroUI-as-reference language is accurate and must not become an install.

**DOC-04 — Commerce retirement/rebuild plans**

- Severity: Advisory (product, not DS)
- Files: `docs/plans/commerce-suite-retirement-manifest.md` vs shipped `/products` Commerce Suite
- Recommended resolution: Out of this cleanup unless product asks. Do not delete frontend commerce UI based on that manifest.

---

## 5. Duplicate / Consolidation Matrix

| Current implementations | Canonical owner | Action | Expected deletions |
| --- | --- | --- | --- |
| `ui/tabs` + `useUrlState`; `layout/layer-tabs` | `components/ui/tabs.tsx` | Delete unused URL-tab component | `layer-tabs.tsx`, `layer-tabs.test.tsx` |
| Feature `*-empty-state.tsx` wrapping `EmptyState` | `components/ui/empty-state.tsx` | Keep wrappers (copy/actions) | None |
| In-ledger empty `<p className="text-secondary…">` | none (local) | Leave; optional later helper | None now |
| `PageKindBadge` / opportunity badges | `components/ui/badge.tsx` | Keep domain maps | None |
| `CursorPager` / `TablePagination` | both | Keep | None |
| `FilterChip` / `RadioGroup variant="chip"` | both | Keep (toggle vs exclusive) | None |
| `Wordmark` / `LogoMark` / `AuthWordmark` | `logo-mark.tsx` | Optional inline Wordmark | `wordmark.tsx` if inlined |
| Marketing `ButtonLink` / `ui/Button` | `ui/button.tsx` | Keep wrapper | None |
| `Loader2` / `LoaderCircle` | `lib/icons.ts` `spinner` | Use one glyph | None (imports only) |
| Native `<details>` / no Accordion | native HTML | Keep | Do not add Accordion |
| Command palette Radix Dialog vs `ui/dialog` | palette owns chrome-less dialog | Keep exception | None |
| Ad-hoc query key arrays | `lib/api/query-keys.ts` | Fold in | Literal keys |

---

## 6. Dead-Code Candidates

### Verified dead

| Item | Evidence | Action |
| --- | --- | --- |
| `frontend/components/layout/layer-tabs.tsx` + test | Zero production imports | Delete |
| `ICONS.knowledgeBase`, `ICONS.ai` | No call sites | Delete keys |
| `LogoMark` `dark` variant | No `surface="dark"`; webp only referenced there | Delete variant; delete asset after public-folder confirm |

### Likely dead (verify once)

| Item | Why | Verify |
| --- | --- | --- |
| `frontend/public/citeladder-dark-logo.webp` | Only referenced from unused dark LogoMark | Search public HTML/PWA/manifest |
| `Wordmark` | Pure LogoMark wrapper | Confirm no tests/snapshots keyed on export name |
| Warm `--color-gray-50`–`400` as *consumed utilities* | No class usage | Confirm no CSS `var(--color-gray-50)` outside palette block |

Do not knip-delete marketing GSAP, driver.js, or flag icons without running `pnpm check:dead-code` in the implementation pass.

---

## 7. Design Token Drift

| Category | Value/pattern | Locations | Canonical replacement |
| --- | --- | --- | --- |
| Color | `border-purple-200` | `badge-variants.ts` analyzing | `border-accent-border` (or run-analyzing border token) |
| Color | Warm `--color-gray-50` `#faf9f6` (and 100–400) | `globals.css` palette layer only | Cool semantic surfaces; retarget or stop using |
| Color | `--color-citation-third-party-border: #e7e5de` | `globals.css` | Cool border token (`border-subtle` family) if you retarget grays |
| Icon | `Loader2` | analytics/traffic/demand/settings toolbars | `LoaderCircle` / `ICONS.spinner` |
| Type comments | “warm canvas” | root + marketing layouts | Cool Prism copy |

Harmless arbitrary values (progress widths, `w-130` dialog, `min-h-dvh`) are not listed.

---

## 8. Cross-Surface Consistency Matrix

| Area | Marketing | Auth | Onboarding | App | Debt |
| --- | --- | --- | --- | --- | --- |
| Typography | `website-*` roles, Plus Jakarta headings | `flow-*` roles, same type scope | Same `FlowShell` type | Geist product ladder | Intentional dual ladder; healthy |
| Buttons | `ButtonLink` → shared `Button` | shared `Button` | shared `Button` | shared `Button` | None |
| Forms | Pricing switch + catalog | RHF + `Field` | RHF + `Field` / chips | Mix of `Field` and local labeled inputs | FM-01 |
| Spacing | `--section-y-*` | flow tokens | flow tokens | `--content-gutter` / workspace gap | Intentional |
| Surfaces | Shared semantic canvas | Shared | Shared | Shared; Card flat | ST-01 comments only |
| Feedback | Alerts on pricing errors | Alert in auth form | Alert on complete/catalog | Alert / MutationNotice / EmptyState | Healthy |
| Iconography | lucide + engine logos | LogoMark | LogoMark + BrandLogo | lucide + ICONS + BrandLogo | Spinner split (DS-03) |
| Navigation | Marketing nav/footer | Wordmark home link | Flow bar + exit | Station sidebar + mobile bar | Healthy shared station owner |
| Focus | Shared `focus-ring` | Shared | Shared | Shared | None verified |
| Mobile | Editorial + overflow tables on compare/pricing | Full-height flow + 44px actions | Same | Station bar; tables mostly scroll | TB-01 |

No remaining separate marketing colour namespace (policy forbids `--mkt-` / `--ds-`).

---

## 9. Canonical Ownership Map

| Concern | Canonical owner | Known bypasses / duplicates |
| --- | --- | --- |
| Buttons | `components/ui/button.tsx` | Marketing `ButtonLink` (keep) |
| Form fields | `components/ui/field.tsx` + `input`/`textarea`/`select` | Generate-prompts + billing country (FM-01) |
| Dialogs | `components/ui/dialog.tsx` | Command palette Radix Dialog (keep) |
| Drawers | `components/ui/drawer.tsx` | None |
| Tables | `components/ui/table.tsx` | Per-screen stacked compact classNames (TB-01) |
| Pagination | `cursor-pager.tsx` **and** `table-pagination.tsx` | None (two contracts) |
| Feedback | `alert.tsx`, `toast.tsx`, `mutation-notice.tsx` | None |
| Typography | `globals.css` + `website-type.css` + `ui/typography.tsx` / `eyebrow.tsx` | Marketing `Meta`/`Eyebrow` for public roles (keep) |
| Tokens | `app/globals.css` | Unused gray rungs; `purple-200` |
| Navigation | `layout/nav-items.ts` + `sidebar-nav.tsx` | Dead `LayerTabs` |
| Data fetching | `lib/api/*` + TanStack Query | None for `fetch` |
| Query keys | `lib/api/query-keys.ts` | QK-01, QK-02 |
| Loading | `ui/skeleton.tsx` + Button `pending` | `Loader2` vs `LoaderCircle` |
| Empty states | `ui/empty-state.tsx` | In-ledger local copy; wrappers OK |
| Unavailable values | `ui/unavailable-value.tsx` | Widely used; keep |
| Icons (product concepts) | `lib/icons.ts` | Many direct lucide imports (OK for local glyphs); spinner not followed |
| Motion | Authenticated CSS rules / `MarketingMotion` + GSAP initializer | Keep route ownership split |
| URL/tab state | `lib/navigation/url-state.ts` | Dead LayerTabs |

---

## 10. Cleanup Backlog

Prefer deletion. Stop after P1 unless the pass is still cheap.

| Order | Finding | Action | Files affected | Delete/Modify | Risk |
| ----: | --- | --- | ---: | --- | --- |
| 1 | DUP-01 | Delete `LayerTabs` | 2 | Delete | Low |
| 2 | QK-01 | Add factory keys; replace literals | ~5 | Modify | Medium (cache identity) |
| 3 | DOC-01 | Archive `visual-redesign-plan.md` | 1 + README pointer if any | Move | Low |
| 4 | AB-01 / AB-02 | Remove unused ICONS + dark LogoMark/asset | 2–3 | Delete | Low |
| 5 | DS-02 | Semantic border on analyzing badge | 1 | Modify | Low |
| 6 | DS-03 | `LoaderCircle` at Loader2 sites | ~6 | Modify | Low |
| 7 | DOC-02 / ST-01 / AB-03 | Fix comments and direction contract | ~5 | Modify | Low |
| 8 | QK-02 | Cohort via filters object | 1–2 | Modify | Medium |
| 9 | FM-01 | Optional `Field` on two labeled inputs | 2 | Modify | Low |
| 10 | DS-01 | Retarget or stop exposing unused gray rungs | 1 | Modify | Medium (token tests) |
| 11 | TB-01 | Decide: shared compact table **or** doc correction | design.md and/or `table.tsx` + consumers | Modify | High if you restyle every table |
| 12 | DUP-04 | Optional delete `Wordmark` | 3 | Delete | Low |

Items 9–12 are optional in the same PR. Item 11 should be a **product/doc decision**, not a silent restyle.

---

## 11. What NOT to Change

Inspected and healthy — do not rewrite in the cleanup pass:

- Token ownership in `globals.css` semantic aliases (cool canvas, navy action, indigo accent).
- Radix confined to `components/ui/*` (including command-palette’s documented Dialog exception).
- Flat `Card`, overlay-only shadows, `UnavailableValue` vocabulary.
- Dual type ladders (website/flow vs product) and `app-type-scale` preview reset.
- Marketing `ButtonLink` wrapping shared `Button`.
- `FlowShell` shared by auth and onboarding.
- TanStack Query + `url-state` + local drafts split.
- React Hook Form limited to auth, onboarding, prompt form.
- Two pagination primitives (`CursorPager` vs `TablePagination`).
- `FilterChip` vs chip `RadioGroup`.
- Native `<details>` instead of a generic Accordion.
- Feature empty-state wrappers that only supply copy/CTAs.
- Domain badge wrappers.
- GSAP (marketing) + Motion (product) together.
- `driver.js` product tour.
- `MarketSelect` + `country-flag-icons`.
- `react-markdown` for content.
- Insight component in `components/intelligence/`.
- Station navigation model (`nav-items.ts`).
- Complexity ceilings and design-system policy (do not weaken gates).
- Do **not** install HeroUI, React Aria, a table virtualizer, or another query library.
- Do **not** build a generic Disclosure, Popover, Spinner, or Form primitive without new multi-consumer demand.
- Do **not** restyle the product toward warm gray or add dark theme (`LogoMark` dark is residue, not a theme).
- Do **not** merge marketing type roles into `text-sm` product utilities.
- Do **not** force `EmptyState` into table cells or history rails.

Rejected “improvements”: new design-system package, replacing Radix, replacing TanStack Query, one mega-Field that also does toolbars, unifying cursor and offset pagination, replacing lucide.

---

## 12. Final Simplification Recommendation

### Keep

One token file, one `components/ui` kit, surface-scoped type, shared `Button`/`Field`/`Table`/`Dialog`/`Drawer`/`Tabs`, Query factory, station nav, FlowShell, policy scripts.

### Consolidate

Ad-hoc query keys into `queryKeys`. Spinner glyph to `LoaderCircle`. Optional `Field` on the two labeled outliers. Analyzing badge border onto semantic tokens.

### Delete

`LayerTabs` (+ test). Unused `ICONS` keys. Unused dark lockup path. Archive `visual-redesign-plan.md`. Optional `Wordmark`.

### Fix

Documentation/comments that still describe warm canvas, bordered Cards, `text-2xs`, and `website-design-system.md`. Query-key comment (`products.ts`). Decide table-mobile contract vs implementation (TB-01) explicitly.

### Leave Alone

Healthy primitives, marketing motion stack, command palette, dual pagination, chip vs filter semantics, in-ledger empty copy, commerce UI, intelligence Insight, and any “genericize this one-off” urge.

The implementation agent should finish with **less production LOC**, not a larger system.
