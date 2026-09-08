# CiteLadder Targeted Layout Consolidation

> **Revision:** 2026-09-08 / V2 — frozen visuals, preserved product behavior.
> **Status:** the owner has approved the refined HTML's visual design. Implementation status must
> be verified in the repository; no production implementation or repository audit was performed
> while preparing this revision.
> **Hard precondition retained from the supplied plan:** do not implement on the
> `vorflux/billing-consolidation-implementation` worktree. Verify that the branch has merged,
> local `main` is synchronized with its upstream, and `git status --short` is empty. Re-read the
> named owners because the supplied plan identifies billing/entitlement changes on that branch.
> Do not assume its current status from this document. Do not merge, reset, clean, stash, discard
> user changes, or delete saved design artifacts merely to satisfy this precondition. When it is
> unmet, report the exact blocker and finish only the read-only reconciliation.
> **Approved visual reference:** the refined HTML already saved in the project, delivered as
> `citeladder-refined.html` (the identical packaged file is `citeladder-reference.html`). Locate
> and record its actual repository-relative path in Phase 0. Its title is
> `CiteLadder — Stripe-informed UI Reference 1.0`; canonical styles are in
> `<style id="citeladder-styles">`, with the companion `DESIGN_CONTRACT` in the same file.
> Old Downloads paths and the original `preview.html` are NOT the current visual authority.
> **Prototype authority is VISUAL ONLY.** Its working demo buttons, modals, drawers, routes,
> workflows, validation, datasets, labels and lifecycle simulations are not implementation
> requirements. Section 2 explicitly separates approved presentation changes from protected behavior.
> **Companion authorities:** [`design.md`](../design.md),
> [`frontend-architecture.md`](../frontend-architecture.md),
> [`ui-component-system.md`](../ui-component-system.md),
> [`architecture.md`](../architecture.md), and [`invariants.md`](../invariants.md).
> This plan supersedes older visual values and shell-placement language only for the explicit
> changes below. It does not supersede production behavior, security, data or entitlement contracts.
> Update affected documentation in the owning implementation slice. Any older handoff instruction
> to copy prototype interactions, reorder these phases, or seek fresh visual approval is superseded:
> design approval is already given, but runtime parity and visual verification are still required.

**Revision basis:** the supplied consolidation plan and the already approved refined HTML/handoff.
The owner map below is carried forward from that plan, not newly verified repository evidence.
The added safeguards are implementation requirements, not claims about current live behavior.
Replace the existing plan with this revision at its current repository path; do not maintain two
competing active plans. Leave the approved HTML unchanged.

## 1. Outcome

Make the shipped product feel like one compact, evidence-led system by consolidating the few
structural owners that control every screen:

- one restrained blue-accent token system with semantic status colors;
- one Geist typography system with a 14px product baseline;
- one authenticated shell with a compact sidebar, desktop Search and Agent actions, no desktop
  global topbar, and a mobile topbar plus off-canvas navigation drawer;
- one explicit in-pane page header per authenticated route;
- four reusable composition patterns proven on Overview, Website, Issues, and Content;
- one focused-flow treatment for login, registration, and onboarding;
- a quieter public landing page with materially fewer decorative icons;
- a final migration and deletion sweep that removes the superseded paths instead of leaving
  parallel implementations.

This is a layout and presentation consolidation. It is not a product redesign, data migration,
routing rewrite, permission change, API change, or new component framework.

## 2. Locked boundaries

### 2A. Two authorities, with a narrow approved exception list

**Implement the approved look on the existing product. Do not implement the demo product.**

| Decision | Authority | Required result |
|---|---|---|
| Existing features, business copy, data, routes, permissions, state transitions, query/mutation behavior and user workflows | Re-baselined production owners plus their established contracts and behavior tests | Preserve. A same-looking control must retain its existing outcome, not merely the same API endpoint. |
| Exact typography, color, spacing, dimensions, control appearance, surface treatment and responsive visual recipes | Frozen refined HTML's canonical CSS and rendered reference; Section 5 summarizes it | Match in the existing production design-system owners. Do not redesign or browse Stripe again. |
| Deliberate shell, header, action-placement and presentation changes | Only the explicit allowlist in Section 2B and its bounded phase instructions | Apply the named presentation delta while preserving the downstream workflow. |
| Prototype-only interactions, extra controls, mock labels and missing real-product states | No authority | Exclude demo-only functionality; preserve real production functionality even when absent from the HTML. |
| Engineering sequence, code ownership, deletion and gates | This revised plan and applicable repository policy | Preserve the bounded consolidation approach; do not port the HTML architecture. |

A conflict between the prototype and established product behavior is resolved in favor of behavior.
A conflict about appearance is resolved against the frozen refined HTML, not the old plan's palette.
If source, tests and invariant documentation disagree about a real behavior, record that discrepancy;
do not invent an intended behavior or use this visual migration to repair an unrelated product bug.

**The distinction includes frontend behavior.** Preserve whether an action changes the current
route/mode, opens a dialog/drawer, opens an external browsing context, downloads a file, or submits
a form. Also preserve its selected project/entity, URL parameters, browser history, back/forward
behavior, defaults, draft state, filters, sorting, pagination, keyboard behavior, cancellation,
confirmation, loading/disabled conditions and user-visible result. Unchanged APIs alone do not prove
unchanged functionality. UI relocation must not reset or duplicate mounted stateful controllers.

### 2B. Explicitly approved presentation changes

These are the exceptions to preserving the old presentation. They do not authorize new product
features, action destinations, forms, state machines or information architecture.

| ID | Approved change | Boundary |
|---|---|---|
| V1 | Apply the exact approved palette, Geist type roles, density, spacing, radii, control states, table/metric/chart styling and surface hierarchy. | Preserve factual strings, metric definitions/units, data series, columns, form fields and states. No new behavior-bearing component from the demo. |
| V2 | Remove the desktop global topbar; use one in-pane page header; place desktop Search and Agent launchers below the project switcher in the sidebar. | Keep the current Command Palette and Agent controllers, capabilities, context and outcomes. Do not mount them inside an ephemeral navigation drawer or replace their implementations. |
| V3 | Use the approved compact topbar and off-canvas navigation at <=980px, replacing the existing fixed primary/secondary mobile navigation. | Preserve every current authorized destination and account access. Only the navigation presentation/open-close mechanics change; downstream routes and workflows do not. |
| V4 | Relocate existing page actions into the in-pane header and primary route tabs into their specified visual position. | Reuse the same handler/link, form association, query state and permissions. No new action, menu step, drawer, dialog or route. Do not move secondary dataset tabs away from the region they control. No new global action portal/context. |
| V5 | Replace redundant visual wrappers with the reference's open sections, related metric bands and meaningful containment; restyle the four archetypes. | Do not hide information, collapse currently exposed sections, remove controls, merge workflows, reorder product steps or substitute a diagram/mock chart for real evidence. Existing disclosure defaults stay unchanged. |
| V6 | Apply the specified Issues list/detail responsive presentation, retaining complete detail and evidence. | Selection, URLs, filters, cursors and data ownership remain unchanged. This is not permission to convert other production detail routes into prototype drawers. |
| V7 | Remove demonstrably duplicate presentation paths in their owning phase; remove Overview's duplicate project selector only after shell parity is proven. | Preserve unique destinations/actions and their authorization. Duplicate result actions are not automatically redundant: Content's current header/footer actions remain. Zero references alone are insufficient without migrated-consumer and behavioral proof. |
| V8 | Apply the existing plan's focused-flow/public visual cleanup, decorative-icon removal and semantic heading corrections. | Preserve auth/onboarding steps, labels, validation, payloads, marketing copy/order/URLs, real brand assets and product preview. Markdown heading demotion affects rendered headings only, never copied/exported Markdown. |

Do not interpret "make it match the HTML" as approval for any exception beyond this table. Sections
3–6 implement these deltas; they do not add independent permission to redesign a workflow. The
approved shell/header improvements should be implemented, not rejected because the old placement
was different.

### 2C. Mandatory production-to-reference behavior mapping

Before changing a feature, trace its current actionable controls through the production owner to
the actual outcome. Record this in one compact behavior-parity record in the existing task evidence
location (or one task-local Markdown file if none exists). Do not create a new framework or registry.
Use columns: **surface/action | production owner and current contract | reference appearance |
approved delta ID or excluded demo behavior | before/after test evidence**.

Every changed actionable control must be covered. Reused controls can share a row when both owner
and behavior are identical; do not create repetitive inventories for unchanged controls. Record
source path/symbol and a reproducible test/scenario, not "same as before". Expand phase-local rows
just before that phase rather than exhaustively documenting every internal hook in advance.

Minimum high-risk mappings:

| Surface/action | Required mapping and protection |
|---|---|
| **Manage prompts / prompt management modes** | Trace the current production handler, route or manage/read-mode transition, editor, gates and save/cancel behavior. Keep that exact workflow. The prototype's `managePrompts` modal is explicitly excluded. No new modal, drawer, browser tab/window, route or editor is authorized by the reference. |
| Page, run, prompt and evidence detail entry points | Preserve each existing route, drawer or dialog and its deep-link/back behavior. Do not replace a production entity page with a prototype detail drawer. |
| Export, report, copy and download | Preserve the current direct action or chooser, format, payload/content and permissions. Do not add the prototype's generic export chooser or replace a report with print/sample CSV. |
| Launch audit, Run/Stop crawl and scheduling | Preserve configuration steps, defaults, confirmations, async status, cancel/retry and entitlement rules; no simulated completion or prototype scheduling options. |
| Content generation, History and context handoffs | Preserve target alternatives, skills, validation, authorized context, draft continuity, polling, cancel/retry, result actions, provenance and history/deletion semantics. |
| Project/account, billing, providers and integrations | Preserve existing editors/menus, authorized actions and real connection state. Do not add a customer-facing payment integration or plan action because a mock Settings panel contains it. |
| Search and Agent launchers | V2/V3 may move triggers; shortcuts, results, selection, authorization, project/route/date/filter context and the single persistent controller remain. |
| Auth/onboarding and public CTAs | Preserve the actual route/step sequence, validation, fields, handoffs, redirects and destinations; never copy demo sign-in or workspace creation. |

**Specific Manage prompts regression:** establish its real production interaction before editing;
add or retain a behavior test for that outcome. After restyling, exercise the same entry points on
desktop and compact widths, verify the same destination/mode, permissions and editor actions, and
assert that the newly proposed prototype management overlay/browsing context was not introduced.
Do not ban unrelated existing confirmation dialogs. This plan intentionally does not guess whether
the real editor is inline, routed or otherwise: Codex must resolve that from the repository.

### 2D. Handling prototype differences without slowing the whole migration

A demo-only feature is excluded; it does not require a new approval request. A real feature missing
from the HTML is retained and styled with the approved existing primitives. Record any necessary
local geometry difference caused by preserved fields, copy, evidence or workflow; do not use it as
permission to relax typography, palette, density or the rest of the page.

When exact prototype structure would change behavior, preserve the current interaction surface and
apply its visual treatment there. Make the smallest necessary exception, document the concrete
reason/owner, and continue unaffected work. Do not substitute the demo, silently weaken the contract,
or redesign an entire route because one interaction differs. An unresolved behavior or environment
blocker must be reported honestly, not marked as passed. Broader product improvements remain out
of scope and require a separate task.

### Preserve exactly

- Current routes, deep links, browser-history behavior, and same-origin API use.
- Current interaction surfaces and action outcomes, except for the explicitly approved navigation
  presentation changes in Section 2B. Keep current prompt management modes/editor and every
  existing route/dialog/drawer distinction; no prototype interaction is implicitly approved.
- Project and workspace authorization; capability and entitlement gates.
- Project switching, add/edit project flows, account access, Settings, and sign-out behavior.
- Command Palette behavior: pointer launch, Ctrl/Cmd+K, filtering, keyboard selection, navigation,
  project switching, Escape, and focus restoration.
- Growth Agent behavior: capability gate, route/project/date/filter context, contextual launchers,
  project-change reset, one drawer owner, and no autonomous external mutation.
- Website's five tabs, server-phase default selection, progressive crawl states, crawl controls,
  export, persisted projections, filters, sorting, cursor pagination, evidence, and unavailable
  state vocabulary.
- Issues' Defect/Advisory distinction, URL state, server filters, group/detail queries, evidence,
  occurrence cursor, copy-fix action, and complete compact-screen detail.
- Content's handoff authorization, target alternatives, channel/format skills, generation
  lifecycle, polling, cancel/retry/regenerate, Markdown output, copy/export, feedback, history,
  deletion rules, and provenance.
- Login, registration, OAuth, demo/MCP handoffs, validation, onboarding gates, discovery,
  confirmation, payloads, billing/capacity states, and redirects.
- Public-site copy, factual claims, section order, URLs, session redirect, navigation, footer,
  platform marks, and product preview behavior.
- Semantic distinctions among unknown, unavailable, zero, historical, conflicting,
  not-applicable, and excluded.

### Do not introduce

- No new UI library, icon package, CSS-in-JS system, layout framework, or dependency.
- No universal `Page`, `Screen`, `Toolbar`, `Metric`, `Panel`, or `Form` component with a large
  option surface.
- No route-local token namespace or stylesheet.
- No copied prototype fixture state, fake interactions, sample project picker, Design system
  destination, hash router, or string-template rendering.
- No compatibility wrapper, alias, deprecated path, duplicated controller, or second navigation
  registry.
- No backend, schema, API-contract, provider, queue, billing, scheduling, or permission changes.
- No new modal, drawer, window/tab, route, extra click, confirmation step, filter option, field,
  command or feature inferred from a working demo button. Do not remove a production action or
  state because the HTML does not demonstrate it.
- No changing tests, fixtures, expected destinations or validation to make an unintended workflow
  change look approved. Do not overwrite the frozen visual reference or its export values.
- No copy rewrite. Existing explanatory text may move into a page header, but its factual wording
  must not change in this visual cutover.
- No indiscriminate flattening. Cards, hairline bands, ledgers, tables, wells, drawers, and
  dialogs retain distinct semantics.

## 3. Evidence map

This is the **supplied audit map**, retained for Phase 0 verification. Reconcile every affected
path and claim with the current clean baseline before implementing or deleting it. The reference
controls presentation only; interpret every row under the Section 2B allowlist.

| Surface | Current owner | Demonstrated structural debt | Approved decision |
|---|---|---|---|
| Authenticated shell | `components/layout/app-shell.tsx` | Desktop sidebar and global topbar split primary shell actions; mobile has separate primary and secondary nav renderers | Remove desktop topbar. Put Search and Agent between project switcher and nav in the sidebar. Use a 56px mobile topbar and the same sidebar/navigation content in an off-canvas drawer at 980px and below. |
| Page title | `components/layout/page-header.tsx`, `page-titles.ts` | The shell owns a detached title while route actions and tabs live inside the page | Make `PageHeader` an explicit in-pane route composition with title, optional existing description, and optional route-owned actions. Migrate every authenticated route atomically so exactly one H1 remains. |
| Search | `components/ui/command-palette.tsx` | One mature controller is coupled to its topbar trigger; Settings routes are duplicated outside the shared nav model | Keep one dialog/controller. Render its desktop trigger in the sidebar and open that owner from a lightweight mobile launcher event. Derive route commands from the shared navigation source with the same capability filtering as visible navigation. |
| Growth Agent | `components/layout/agent-sheet.tsx` | One mature controller is coupled to topbar placement | Keep one drawer/controller and the existing contextual event contract. Render its main desktop trigger in the sidebar and add only a compact mobile launcher for the same owner. Do not mount two `AgentSheet` instances. |
| Navigation | `nav-items.ts`, `sidebar-nav.tsx` | Desktop, mobile-primary, mobile-secondary, and Command Palette presentations have drifted; active Settings state can fall through to Overview | Keep one route/station registry and one capability resolver. Reuse the full sidebar navigation in the mobile drawer. Delete the fixed mobile primary/secondary implementations after the drawer is proven. Preserve every current destination. |
| Project/account access | `ProjectSwitcher`, `UserMenu`, Overview `ProjectControls` | Overview repeats shell-level project enumeration and selection | Keep `ProjectSwitcher` and `UserMenu` as the shell owners. Retain Overview edit/facts/report actions, but remove its duplicate project picker after project switching is proven through the shell. |
| Layout tokens | `app/globals.css` | Current 220px/52px shell geometry and green-ground palette conflict with the approved blue compact prototype; some feature layouts bypass shared split and spacing tokens | Replace values through existing semantic variables. Do not create a parallel prototype token set. Add only missing shell geometry variables with multiple real consumers. |
| Typography | `app/layout.tsx`, `globals.css`, `website-type.css`, `ui/typography.tsx` | Product uses Geist while public/focused display uses Barlow; call sites override named roles with local weight/tracking/leading | Use Geist for product, public, and focused flows. Keep named semantic role ladders for product versus public scale, but remove font-family mixing and call-site overrides. Remove Barlow loading/assets only after all consumers migrate. |
| Shared composition | `ui/workspace.tsx`, `ui/layout.tsx`, `ui/card.tsx`, `ui/tabs.tsx`, `ui/table.tsx` | Existing useful hairline, ledger, section-header, stack, card, tab, and table primitives coexist with repeated local wrappers | Reuse and tighten these owners. Add no new abstraction unless at least two production consumers have the same semantic shape. |
| Overview | `components/projects/dashboard-*.tsx` | Nearly every region is boxed; project switching is duplicated | Keep semantic cards for project identity, Next action, and Track. Convert Movement, ranked actions, report proof, facts, and metrics to open or ruled sections where the prototype demonstrates hierarchy without containment. |
| Website | `components/site-health/**` | Correct domain composition is visually split across many boxed regions; route adds a redundant `TooltipProvider` | Preserve every panel and query owner. Use open section hierarchy, shared metric strips, tabs, and existing table/record strategies. Remove only the redundant provider and visual wrapper duplication. |
| Issues | `components/issues/issues-catalog.tsx` and presenters | The split ratio is hard-coded despite `--pane-list-detail`; list and detail read as unrelated boxes | Use the shared split token and one feature-owned master-detail boundary. Desktop keeps a sticky bounded detail region; compact widths use a horizontally reachable master list above the complete detail. |
| Content | `components/content/**` | The composer and generated state are wrapped as separate cards despite being one creation flow; route adds a redundant provider | Use one open, readable creation column with shared fields and a quiet context/action boundary. Keep semantic result/error/generating regions and the History drawer. |
| Auth/onboarding | `components/auth/flow-shell.tsx`, `auth-form.tsx`, `components/onboarding/**`, `website-type.css` | Optional `FlowGroup.icon` adds five decorative heading tiles; repeated stage headers and mixed typography roles add noise | Keep `FlowShell`. Remove decorative group icons, consolidate the repeated stage heading locally, use Geist flow roles, and retain every functional/status icon and interaction. |
| Public landing | `components/marketing/landing/**`, `lib/marketing-content/landing.ts` | Seventeen content records force decorative icon/tile metadata; four section owners render the full icon wall; typography is locally overridden | Remove the 13 decorative reveal/industry/trust icons. Retain at most four workflow-stage wayfinding icons, all in one blue treatment, plus functional arrows and platform/product-preview marks. Normalize typography in existing section and button owners. |
| Route wrappers | authenticated route entries | Multiple routes add `TooltipProvider` beneath the shell; several add no-op one-child grid wrappers | Remove duplicates only after confirming the route remains under `AppShell`; retain real Suspense and provider boundaries. |

## 4. Intentional differences from the prototype

The prototype is deliberately sparse and uses fixtures. Production must differ where real product
semantics require it:

1. **Real information architecture stays.** Production keeps all current routes and destinations;
   the prototype's `Design system` and `Sample: Populated` controls are omitted.
2. **Real states stay.** Loading, empty, first-crawl, progressive, blocked, stale, error,
   unavailable, permission, capacity, and destructive-confirmation states remain even when the
   prototype shows only a populated example.
3. **Website stays evidence-complete.** All five tabs and their persisted projections remain; no
   prototype labels, scores, mock rows, or alternate crawl lifecycle are copied.
4. **Issues stays query-complete.** Compact presentation must not replace URL-backed filters,
   cursors, selected-group detail, evidence, or Defect/Advisory semantics.
5. **Content stays production-complete.** Both target inputs, skill selection, authorized handoffs,
   output provenance, duplicate header/footer result actions, and History drawer remain.
6. **Public marketing stays factual.** The seven production landing sections, real copy, platform
   marks, session redirect, navigation, footer, and product illustration remain. The prototype
   supplies rhythm, type, color, and restraint—not replacement marketing content.
7. **Semantic objects may remain cards.** Project identity, next action, Track state, result/error
   regions, remediation wells, dialogs, and drawers retain boundaries where containment carries
   meaning.
8. **Dense datasets keep the suitable compact strategy.** Existing labelled-record conversions
   remain for Website Architecture/AEO. Other tables keep horizontal containment where reducing
   columns would remove evidence.
9. **URL detail keeps the entity as the sole H1.** Omit the generic route `PageHeader` heading on
   that screen; the compact mobile shell title remains non-heading text.

10. **Working demo interactions are not approved workflows.** Keep the production Manage prompts
    workflow, detail destinations, export behavior, confirmation and form flows. A reference dialog
    or drawer is a styling specimen only unless that interaction already exists in production.
11. **The real feature set is not reduced to the demo.** Preserve every existing tab, column, field,
    choice, action, state and factual label. Conversely, do not add demo-only actions, mock billing
    integrations, generated outlines or settings options that the product does not already have.
12. **Disclosures and data remain truthful.** Do not move existing content behind a new collapsed
    disclosure to imitate the sparse demo. Keep chart series, units, comparison logic, definitions,
    defaults and evidence access. Restyle their owners rather than replacing their contents.
13. **Real brand assets remain authoritative.** Do not replace the existing approved logo or platform
    marks with the HTML's illustrative SVGs. This cutover changes layout and UI typography, not brand
    asset design.

## 5. Approved visual foundation

**This section replaces the older prototype values, not the approved design.** The approved refined
HTML is immutable during implementation. The source plan's `#78869b` subtle text, negative body
tracking, old radii/spacing ladder and old drawer width are superseded, not alternatives to choose.

### Frozen reference identity and use

- Delivered file: `citeladder-refined.html`; identical archive alias: `citeladder-reference.html`.
- Delivered file SHA-256: `eb766454cb5c4fe87d1b753bbfac6825f37a62144a09706f146b8a46968b6b3a`.
- Actual repository-relative reference path: **record in Phase 0; not known from the attachment**.
- Canonical stylesheet: the HTML's `#citeladder-styles`; optional exports in the existing handoff
  are `citeladder-reference.css`, `citeladder-tokens.css` and `citeladder-design-system.json`.
- The single HTML is sufficient. Exports are derivative references, not production dependencies.
  Never ship its Design system route, export/copy-handoff actions, manifest UI, fixtures or scripts.

Resolve by content, not by whichever file was modified most recently. A rename does not change the
reference; line-ending-only edits may change the byte hash. Reconcile those against the embedded
stylesheet and contract before accepting a different hash. A genuinely different design is not
silently approved. Do not change the HTML to make implementation screenshots pass. Its embedded
"proposed" approval note is historical; the owner's approval is recorded in this revision.

For appearance, use the frozen HTML/rendered components and canonical CSS, then their verified
exports, then explanatory prose. If the summary below and canonical CSS disagree, use the frozen
CSS for presentation and correct the summary; do not invent a third value. Section 2 remains the
higher authority for behavior in every case. No fresh Stripe crawl or creative redesign is needed.

Map recipes into existing semantic production variables and primitive owners. Map spacing by role,
not by coincidentally matching variable suffixes: the old `--space-6` and refined `--space-6`, for
example, need not mean the same value. Inspect all consumers before rebinding a shared token.
Do not import this CSS wholesale, append an override theme, copy prototype class names into route
files, add a new namespace, or make a second component system.

### Typography

Geist is the only interface family. The working baseline is **14px**, with normal tracking. Do not make the product dense by shrinking navigation, controls, labels or table data.

| Role | Size / line height | Weight | Tracking |
| --- | --- | --- | --- |
| Page title | 26 / 32px | 600 | −0.65px |
| Compact page title, at ≤700px | 24 / 30px | 600 | −0.65px |
| Section title | 16 / 24px | 600 | −0.2px |
| Detail title | 18 / 26px | 600 | −0.35px |
| Working body / table data | 14 / 20px | 400 | 0 |
| Explanatory body | 14 / 22px | 400 | 0 |
| Button | 14 / 20px | 550 | 0 |
| Form label / emphasized row title | 14 / 20px | 500 | 0 |
| Supporting copy | 13 / 18px | 400 | 0 |
| Metadata / badge | 12 / 16px | 500 | 0 |
| Main metric | 28 / 36px | 600 | −0.65px |
| Compact metric, at ≤700px | 26 / 34px | 600 | −0.65px |
| Focused-flow title | 30 / 36px | 600 | −0.65px |
| Compact focused-flow title | 28 / 34px | 600 | −0.65px |

The overview trend's secondary inline value is intentionally smaller, at 22/28px. Main metrics are tabular, not monospace. Use 12px metadata only for genuinely peripheral information. Remove automatic uppercase treatment from routine section/category labels. Preserve actual proper nouns and factual copy.

Keep public display typography separate from product roles even though both use Geist. The reference marketing hero uses `clamp(46px, 4.6vw, 64px)` with 1.06 leading; it becomes `clamp(38px, 10vw, 52px)` below 700px. These display values must not leak into application headings.

### Palette and meaning

| Role | Exact value |
| --- | --- |
| Strong text | `#1a1f36` |
| Body text | `#30313d` |
| Secondary text | `#596579` |
| Subtle readable text | `#667085` |
| Main workspace | `#ffffff` |
| Outer canvas / sidebar | `#f6f8fa` |
| Quiet surface | `#f7f9fc` |
| Stronger quiet surface | `#eef1f5` |
| Hairline | `#e4e7ec` |
| Secondary-control boundary | `#cbd2dc` |
| Input boundary | `#8793a3` |
| Primary action | `#175cd3` |
| Primary hover / pressed | `#134dab` / `#10419d` |
| Selection fill / line | `#edf4ff` / `#c4d7f5` |
| Recommendation background | `#f7faff` |
| Success text / fill | `#166534` / `#edf7ed` |
| Warning text / fill | `#8a4600` / `#fff5db` |
| Error text / fill | `#b42332` / `#fff0f1` |
| Comparison chart series | `#6975b8` plus a dashed stroke |

Blue signals interaction, selection, focus or the primary chart series. Only explicitly designated main visibility metrics use blue. Never apply blue to a metric just because it is the first child of a group. All status colors retain text labels; color alone is not the status.

The manifest records nine contrast checks, including subtle text on the outer canvas and the input boundary on white. Passing those pairs is not a claim that the whole application has passed an accessibility audit.

### Geometry and density

Use 2/4/8/12/16/20/24/32/40/48px content increments. The existing 28px desktop gutter is a deliberate geometry value, not a general section-spacing alternative.

Desktop sidebar: 232px above 1200px, 210px from 981–1200px. At 980px and below, replace desktop navigation with a 272px off-canvas drawer and a 56px mobile topbar. Retain sidebar Search and Agent on desktop; do not restore a second desktop header.

The white workspace has a 1392px content cap and 28px gutters, becoming 22px at ≤1200px and 16px at ≤700px. Desktop left corners are 12px; the mobile workspace is square. Main content scrolls normally. Never conceal document overflow with `overflow-x:hidden` to make a test pass.

Page header: 24px top, 20px bottom, 20px gap between heading and actions. At ≤700px it stacks with a 12px gap, 20px top and 16px bottom. Main sections are separated by 24px; section headers have 12px before their content; toolbars have 16px before results.

Widths: composer 840px, article 740px, settings form 680px, sign-in 440px, onboarding 720px. Desktop settings require a note column at least 200px wide and a 32px gap; let the form shrink first. Stack at ≤980px. This prevents the note from overflowing just above the shell breakpoint.

### Component specifications

**Buttons:** 34px default, 30px compact, 40px large. Their horizontal padding is 12px, 10px and 16px respectively; radius 6px. Normal working labels remain 14px even in compact buttons. Primary, secondary, quiet, selected and destructive are the only illustrated treatments. Directional arrows follow the label; object/action icons precede it. At ≤700px or with a coarse pointer, primary control targets are at least 44px.

**Fields:** 36px desktop and 44px compact. Horizontal padding 10px, radius 6px, boundary 1px `#8793a3`. Label gap 8px. Error/help copy stays adjacent. Textareas use 14/22px, have a 112px minimum, and use a 144px minimum in the composer. Do not infer validation behavior from the prototype.

**Focus:** General 2px blue outline with 3px offset. Fields have a 2px blue outline inset by 1px and the exact 3px/16% halo. Keep existing robust keyboard behavior and accessible names.

**Tabs:** 40px desktop, 44px compact; gap 24px desktop, 20px compact; 2px blue active underline. Hover must not look identical to selection. Keep production URL-backed state and browser-history behavior.

**Segmented controls:** 2px container padding; 28px segments on desktop and 38px on touch. A white active segment with a neutral keyline sits on a quiet neutral container. It is not another large blue button.

**Badges:** 12/16px, weight 500, 22px minimum height, 2px vertical/6px horizontal padding, 4px radius. Quiet semantic fills replace long rounded pills. Do not add colored icons merely to decorate every badge.

**Tables:** 14/20px data; 13/18px, weight 500 headers. Headers are at least 36px; rows at least 44px and grow for sublines/evidence. Cell padding is 10px 12px; header padding 8px 12px. Neutral header background, hairline row boundaries, no zebra striping. Hover is neutral; real selection has a pale blue fill. Numeric columns align right and use tabular figures. Horizontal overflow stays inside the table; no lost evidence columns.

**Metrics:** Labels 14/20px, weight 500; values 28/36px; detail 13/18px. Group padding is 14px top/16px bottom; 20px between column content and separators. Group only genuinely related measurements. At ≤700px, use two columns with appropriate row separators. Preserve unavailable, unknown, not applicable and zero as different facts.

**Charts:** Label text stays 12 CSS pixels as the chart changes width. Use a 2px blue main series, a 2px dashed comparison series, and neutral gridlines. Do not invent observations or add decorative smoothing/gradient area fills. Retain the production
chart type, data transformations, axis units/ranges, series, tooltip content and legend interaction;
apply the reference's presentation without changing analytical meaning. In this compact reference, recent movement is 96px, referrals 145px, and full performance/visibility charts 220px. Reuse production chart owners and their correct semantic units. The sample performance chart's existing two scales are now explicitly labeled; do not copy those fixture-specific scale limits into production.

**Surfaces:** 8px module/menu radius, 10px dialog/form radius, 12px outer workspace radius. No ordinary card shadows. The tiny control shadow is `0 1px 2px rgba(26,31,54,.06)`; menus/dialogs/drawers use the exported `--shadow-menu`. Recommendations have content-led height. Meaningful master/detail boundaries and workflow/result regions remain bounded.

**Overlays (only for existing production overlays):** Dialog maximum 480px or wide 680px; 20px viewport inset and internally scrolling content. Drawer maximum 520px, full viewport height. Header/body/footer horizontal padding 24px desktop and 16px compact. Menu width 290px, 4px outer padding, 8px 10px item padding. Preserve focus trapping, Escape and return focus through the existing production controllers. Do not copy the simplified prototype controller implementation.


### Composition and adaptation rules

One truthful in-pane page H1, optional existing factual description, and current page actions form
the approved header. Primary route tabs use the reference's header-adjacent treatment where shown;
secondary dataset tabs stay associated with their existing controlled region. The URL entity page
retains its entity H1, not an extra hidden generic H1.

Use related metric bands, open sections, rules and the semantic cards/wells retained in this plan.
Match the approved treatment without deleting fields/evidence, adding collapsed sections, changing
empty-state actions or making all pages the same template. Dialog/drawer recipes style only the
production overlays identified by the behavior map. Apply the same fields/tables/controls to an
existing inline editor or routed page instead of creating the HTML's substitute overlay.

Preserve every approved shell/header change, every production workflow and every real data state.
Unrepresented production content may require a longer page, additional rows or a retained panel;
that is not permission for arbitrary new colors, typography, wrappers or component variants.

**Font verification:** use the repository's existing Geist loading mechanism. The earlier handoff's
screenshots were explicitly fallback-font layout checks. They are not typography goldens. Render
the frozen reference and actual app with Geist genuinely loaded, using the same browser/viewport
and comparable state. If the font or a required environment is unavailable, record that check as
blocked, not passed; do not substitute a different font as an approved design decision.

## 6. Delivery sequence

Each phase begins from the result of the preceding phase and ends with its own actual-surface
smoke plus focused lint, type, and affected behavior tests. Extend the phase's behavior map before
editing its owners. Prove both exact visual treatment and preserved workflows; one is not a
substitute for the other. Repository-wide `check.ps1` and `test.ps1` run after the full planned
implementation, in the required order, with prescribed retries after fixes. Do not begin a later
phase with a known failure or open parallel implementations of the same shared owner. Follow
Phase 1A -> 1B -> 1C below rather than a conflicting older handoff sequence.

### Phase 0 — clean-main re-baseline

**Precondition, not optional implementation work**

1. Verify the retained branch precondition against current repository state. Do not infer that the
   named branch is still active or already merged. Do not perform an unrequested merge or discard
   work to force readiness.
2. Verify synchronized local `main` and an empty working tree; preserve all user changes and saved
   reference files. Record the baseline commit SHA. Follow repository policy for the implementation
   branch/worktree after the precondition is satisfied. If readiness is blocked, report it without
   modifying application code.
3. Re-read the named shell, entitlement, billing/settings, route, CSS, test, and documentation
   owners. The current unmerged branch changes billing/entitlement frontend files, so this plan's
   file map must be reconciled rather than applied blindly.
4. Re-run structural searches for every `PageHeader`, `TooltipProvider`, Barlow variable,
   legacy typography alias, navigation registry, topbar-height consumer, mobile navigation
   renderer, landing icon field, and route-local no-op layout wrapper.
5. Launch the clean-main product with deterministic fixtures and capture before images at
   1440x900, 1280x720, 768x1024, 767x1024, and 390x844. Record horizontal overflow, shell mode,
   scroll owner, one-H1 count, and reachable actions.
6. Locate the approved refined HTML in the repository by its title, canonical stylesheet and
   Section 5 identity. Record the actual path/hash and baseline commit. Keep the reference intact;
   verify optional CSS/JSON exports agree. The old `preview.html` is not a fallback authority.
7. Create the concise Section 2C behavior-parity record. Establish the shell and high-risk workflows,
   especially Manage prompts, detail destinations, export, and auth/billing paths, from current
   production code/tests and safe browser scenarios. Add missing high-value characterization tests
   before modifying those behaviors' presentation. Record any pre-existing discrepancy separately.
8. Map reference type/token/control roles to existing production owners. Identify prototype-only
   actions to exclude, real features the HTML omits, and any unavoidable presentation exceptions.
   Do not turn this into a new design proposal or rewrite of the plan.
9. If clean main has materially changed an owner or contract, reconcile this plan's path/evidence
   details before editing. Preserve the approved visual decisions and Section 2 boundaries; do not
   silently re-approve product changes or resurrect the old branch implementation.

**Exit:** synchronized clean baseline with commit identity, frozen reference path/hash, current
owner/deletion inventory, reproducible before surfaces, and behavior evidence for the first slice.
Unknown workflows are not considered verified. Extend route-level mapping before each later slice.
Use existing test fixtures or an isolated test account for mutations; do not run paid/live audits,
alter billing, delete live data or invoke external writes merely to obtain migration evidence.

### Phase 1 — shared contracts, atomic shell cutover, and visual foundation

**Primary owners**

- `frontend/app/globals.css`
- `frontend/app/website-type.css`
- `frontend/app/layout.tsx`
- `frontend/components/ui/typography.tsx`
- `frontend/components/layout/app-shell.tsx`
- `frontend/components/layout/page-header.tsx`
- `frontend/components/layout/page-titles.ts`
- `frontend/components/layout/nav-items.ts`
- `frontend/components/layout/sidebar-nav.tsx`
- `frontend/components/ui/command-palette.tsx`
- `frontend/components/layout/agent-sheet.tsx`
- `frontend/components/layout/project-switcher.tsx`
- `frontend/components/layout/user-menu.tsx`
- all authenticated route/screen coordinators that must acquire the explicit `PageHeader`
- associated component tests, `frontend/e2e/shell.spec.ts`, source-policy checks, and
  `scripts/validation.json`
- `docs/design.md`, `docs/frontend-architecture.md`, `docs/ui-component-system.md`, and the
  Growth Agent placement sentence in `docs/architecture.md`

**Slice 1A — shared behavior seams under the existing shell**

1. Create one shared destination/capability resolver consumed by sidebar navigation, compact
   navigation, and Command Palette results. Preserve every current destination and capability
   gate, then delete the Command Palette's parallel Settings list and duplicated filtering.
2. Reuse existing trigger/controller seams where they exist; extract a small trigger-only presenter
   only where needed. Keep one stably mounted Command Palette dialog and one Agent drawer under the
   authenticated shell, independent of compact navigation mount/open/close. Sidebar and compact
   launchers open those same owners through the existing contract (or the minimal explicit launch
   seam needed for relocation), preserving actual-trigger focus restoration and contextual Agent
   events. Do not introduce a general event bus or recreate their state machines.
3. Split `UserMenu` into one menu/logout controller and explicit desktop-sidebar and
   compact-topbar trigger presenters. The compact drawer must exclude the sidebar account block
   because account remains in the mobile topbar. Do not mount a second logout mutation.
4. Prove the refactor under the current shell before changing geometry. Delete superseded
   command/account controller paths in this slice after all callers migrate.

**Slice 1B — atomic shell and page-header cutover**

1. Convert `PageHeader` from a shell-topbar title into a small explicit route primitive with only
   three responsibilities: resolved title, optional existing description, and optional actions.
   Migrate all authenticated page coordinators in one cutover. Move existing page actions into the
   header only where their owning state is already available; do not create a context/portal system
   to force an action upward.
2. On URL detail, omit the generic route heading entirely and let the visible entity heading be
   the sole H1. Error and not-found routes also keep one truthful heading.
3. Remove the desktop topbar. Build the compact sidebar in this order: brand,
   `ProjectSwitcher`, Search, Agent, grouped navigation, Settings/supporting access, and desktop
   account at the bottom.
4. At 980px and below, render a 56px sticky topbar with menu, compact non-heading title, Search, Agent,
   and the sole compact account trigger. The menu opens the existing sidebar brand/project/tools/nav
   content in the approved 272px focus-managed off-canvas drawer with a scrim. On Escape/dismissal,
   return focus to the actual visible opener; on route selection, preserve the application's
   destination-focus convention rather than focusing a removed element. Launching Search/Agent
   from the navigation drawer must not leave competing focus traps or stale body scroll locks.
   Follow existing overlay ownership and preserve the launched feature's state and context.
5. In the same cutover, delete the old desktop topbar, fixed mobile primary navigation, mobile
   secondary strip, stale topbar-height geometry, and obsolete safe-bottom reservation. Do not
   carry hidden duplicate trees into later phases.
6. Keep shell providers and the authenticated shell mounted across instant route navigation.
7. Update active documentation in this slice so no active document still mandates a desktop
   topbar, topbar Agent, screen-reader-only duplicate route H1, or fixed five-slot mobile bar.

**Slice 1C — visual token and typography foundation**

1. Rebind the existing semantic palette, type, radius, spacing, content-width, and shell geometry
   variables to the approved foundation. Preserve semantic variable names used by current
   components.
2. Make Geist the only loaded family. Move public/flow named roles onto Geist; migrate every
   Barlow family consumer before deleting the Barlow loader, CSS variable, bundled font files,
   license file, and stale two-font comments in this slice. Preserve separate semantic type scales
   even though they share a family.
3. Add explicit validation mappings for global CSS/website CSS and changed shell owners so the
   final repository diff selector includes source-policy checks and relevant shell/public browser
   coverage. Do not broaden ordinary component changes to all E2E tests.
4. Update `docs/design.md`, `docs/frontend-architecture.md`, `docs/ui-component-system.md`, and
   the Growth Agent placement sentence in `docs/architecture.md` with the shipped owners and
   values.

**Slice-wide behavior gate:** run the previously recorded shell action scenarios against the
new presentation. Check that moved actions still have their original handler/destination/form
association, capability/disabled conditions and outcome. Confirm the shell cutover does not change
Manage prompts, exports, detail destinations or other downstream workflows on untouched pages.

**Acceptance**

- Every authenticated route has exactly one truthful H1.
- Desktop has no global topbar; Search and Agent are reachable in the sidebar.
- Compact widths have one mobile topbar and one off-canvas navigation tree; no fixed bottom nav or
  duplicated secondary tree remains.
- Ctrl/Cmd+K, pointer Search, Agent, project switch, account access, navigation prefetch/active
  state, capability filtering, route context, and focus restoration still work.
- A document-width check passes at all target widths and final content is not hidden behind fixed
  chrome or safe-area padding.
- Shared rendered controls and shell match the frozen reference; their real interaction outcomes
  match the baseline. All changed launchers have behavior-map evidence. No demo-only control or
  alternative feature workflow enters production.

**Focused checks after each Phase 1 slice**

- Exercise the affected shell behavior in actual Chromium. For the completed shell cutover,
  include 1200/1201, 980/981, 700/701 and existing 767/768 boundary checks.
- Run `pnpm --dir frontend lint` and `pnpm --dir frontend exec tsc --noEmit`.
- Run the affected shell, PageHeader, Command Palette, Agent, and UserMenu Vitest files; run the
  focused shell Playwright scenario after Slice 1B. These are iteration checks, not substitutes
  for the final repository selector.

### Phase 2 — four representative product archetypes

Apply the shared foundation to one representative of each recurring page pattern. Do not migrate
remaining route bodies until these four match the approved reference and pass their recorded
production behavior scenarios. The visual direction is already approved; do not ask the agent to
invent or propose another design. Preserve existing interactions where the demo differs.

#### 2A. Overview — `/projects`

**Owners:** `components/projects/projects-screen.tsx`, `dashboard-screen.tsx`,
`dashboard-sections.tsx`, `dashboard-primitives.tsx`, and `dashboard-controls.tsx`.

- Keep current query/mutation owners and reading order.
- Put Manage project, Edit facts, and conditional Executive PDF actions in the page header when
  their state permits.
- Keep project identity, Next action, and Track as bounded semantic objects.
- Convert company facts, project-state metrics, Movement, ranked actions, and report proof to open
  or ruled sections using existing `EditorialSectionHeader`, `MetricGroup`/`MetricItem`, ledger,
  and stack owners where their semantics match.
- Preserve unavailable versus zero, stale/error notices, keyboard reordering, report state, and
  pre-audit usefulness.
- Remove the duplicate Overview project selector only after the shell `ProjectSwitcher` is proven
  with two projects; keep edit/add actions and all capability gates.

#### 2B. Analytical workspace — `/site`

**Owners:** `components/site-health/site-health-screen.tsx`, `dashboard-layout.tsx`,
`status-strip.tsx`, score/overview/inventory/page-kind/facts presenters, all five tab panels, and
`app/(app)/site/page.tsx`.

- Put the title, any existing factual description, Export, and the one contextual Run/Stop action
  in the page header; keep the five-tab list directly below it.
- Preserve server-phase tab defaults, URL state, prefetch, crawl lifecycle, progressive inventory,
  separate projections, evidence, query order, and contextual Agent launcher.
- Normalize score/overview facts through shared hairline bands without forcing score rings or
  coverage semantics into a universal metric API.
- Keep Architecture/AEO compact labelled-record behavior and ordinary dense-table horizontal
  containment.
- Remove the route-level `TooltipProvider` only after confirming `AppShell` ownership.

#### 2C. Collection/master-detail — `/issues`

**Owners:** `components/issues/issues-screen.tsx`, `issues-catalog.tsx`, summary, list, detail,
occurrence, evidence, and filter presenters.

- Keep the compact issue summary and server-backed toolbar.
- Replace the hard-coded desktop split with `--pane-list-detail`.
- Compose list and detail inside one Issues-owned hairline boundary; do not create a global
  master-detail component.
- Keep the selected list row obvious through blue accent, not an extra card.
- Preserve sticky, viewport-bounded detail and independently scrollable evidence on desktop.
- Below the compact breakpoint, present the list as a horizontally reachable master strip above
  the complete detail; selection must not hide or discard evidence.
- Keep no-crawl, no-match, loading, and error states semantically explicit.

#### 2D. Creation workspace — `/content`

**Owners:** `app/(app)/content/page.tsx`, `components/content/content-screen.tsx`, composer,
result/state, target/skill, and history owners, plus `frontend/lib/content/markdown.tsx`.

- Move History into the page header while retaining its current drawer and state rules.
- Remove the outer composer card and use one open creation column capped at a readable measure
  around the prototype's 840px, while allowing generated output/table content to own its necessary
  width.
- Preserve the two target alternatives, instruction, channel/format skills, quiet context summary,
  and one primary Generate action.
- Keep generating, error, and successful results as distinct semantic states. Preserve bounded
  output, provenance, truncation, feedback, and both header/footer output actions.
- In the rendered Content surface, demote generated Markdown headings one semantic level
  (`h1`→`h2` through `h5`→`h6`, clamping `h6` at `h6`) so the page header remains the sole H1.
  Preserve the raw Markdown byte-for-byte for copy and export.
- Remove the route-level `TooltipProvider`; retain Suspense and handoff parsing.

**Acceptance for Phase 2**

- The four routes match the approved page-header, type, spacing, button, tab, metric, rule, and table
  recipes without becoming the same screen. Inspect side-by-side browser captures of frozen
  reference and production at matching viewports with Geist loaded; compare equivalent regions
  and states, not fixture-specific text, scores or row counts. Verify control dimensions, typography,
  gutters, alignment, containment and responsive changes. Record necessary behavior-preserving
  differences explicitly. "Looks consistent" or a whole-page similarity score alone is insufficient.
- No route changes a query key, mutation, payload, URL-state rule, capability check, or factual
  label.
- All four retain loading, empty, populated, error, unavailable, and compact-width paths.
- No route adds a second component hierarchy or local stylesheet.
- Every migrated action retains its recorded production workflow, including its destination or
  interaction surface, state continuity and result. Controls/states missing from the HTML are not
  deleted; demo-only controls and dialogs are not added. Re-run the Manage prompts guard where
  shared-owner edits affect it.

**Focused checks**

- Browser-check all four routes at 1440x900, 1280x720, 768x1024, and 390x844 with actual production
  states. Compare the frozen reference at those same dimensions and spot-check 700/701 and
  980/981 mode boundaries; retain established feature breakpoints unless this plan names a change.
- Exercise Website tabs/crawl actions/table, Issues filters/selection/evidence/pagination, Content
  target/skill/generate/cancel/history/output actions, and Overview project/report/facts actions.
- Confirm exactly one H1 even when generated Content begins with `#`, no document-level horizontal
  overflow, intended local table scrolling, reachable actions, sticky/scroll behavior, and visible
  focus.
- Run `pnpm --dir frontend lint` and `pnpm --dir frontend exec tsc --noEmit`.
- Run the affected Projects, Site Health, Issues, Content, and Markdown-renderer Vitest files plus
  the focused route Playwright scenarios. Leave repository-wide selection to the final gate.

### Phase 3 — focused flows and public landing

**Primary owners**

- `components/auth/flow-shell.tsx`, `auth-form.tsx`, login/register routes
- `components/onboarding/onboarding-screen.tsx`, `onboarding-stages.tsx`, `review-step.tsx`,
  `icp-confirmation.tsx`, and focused choice controls
- `app/website-type.css`
- `components/marketing/landing/{shift,workflow,packs,trust}.tsx`
- `components/marketing/primitives/button.tsx`
- `lib/marketing-content/landing.ts`
- shared marketing/flow tests, browser specs, and design-source policies

**Focused-flow changes**

1. Keep `FlowShell` as the single auth/onboarding geometry owner and retain its scroll/action/footer
   ownership.
2. Apply the approved compact card measures, short-laptop height rules, and all-Geist focused-flow
   ladder centrally in `website-type.css`.
3. Replace mixed product/public type calls in `AuthFormShell` with named focused-flow roles.
4. Add only a small local onboarding stage-header owner for the three identical stage heading
   assemblies; do not turn it into a universal page header.
5. Delete `FlowGroup.icon` and the five decorative icon-tile uses in review/confirmation. Retain
   Google identity, password visibility, progress, status, selection, add, and edit icons because
   they communicate state or action.
6. Preserve form labels, errors, `aria-invalid`, browser autocomplete, OAuth, submission, loading,
   back/exit, discovery, confirmation, capacity, and sticky action behavior.

**Landing changes**

1. Keep all seven production sections and every factual string.
2. Remove decorative icon/tile metadata and rendering from Shift (three), Packs (six), and Trust
   (four): 13 decorative icons removed.
3. Retain no more than the four workflow-stage wayfinding icons, normalize them to one blue accent
   treatment, and colocate their small mapping with the one consumer. Delete the broad
   `landing-icons.ts` registry if it has no remaining consumer. Functional CTA arrows, platform
   logos, and product-preview glyphs remain.
4. Replace icon-tile grids with numbered/open editorial rows and hairline separation in the
   existing section owners. Do not add a replacement card component.
5. Remove heading/body weight, tracking, leading, mono, and size overrides that restate named
   website roles. Move shared action type into the marketing button primitive.
6. Keep the real product-preview type inside `.app-type-scale`; its compact product UI is
   intentionally distinct from surrounding marketing copy.
7. Apply compact gutter/section rhythm through shared variables and `Section`; inspect every public
   route that consumes those owners for regressions without redesigning the route.
8. Correct only stale comments made false by the cutover. Do not rewrite marketing claims.

**Acceptance**

- Login, registration, and onboarding are compact, coherent, keyboard reachable, and fit short
  laptop and mobile heights without losing actions.
- Landing icon density falls from 17 repeated decorative tiles to at most four lifecycle
  wayfinding icons; all content and factual claims remain.
- Product, public, and focused-flow typography use Geist and named roles with no Barlow or local
  role-restating overrides.
- Shared public CSS changes do not regress pricing, enterprise, solutions, blog, compare, FAQ,
  MCP docs, or legal routes.

**Focused checks**

- Exercise `/login`, `/register`, and every onboarding stage at 1440x900, 1280x650, 768x1024,
  640x900, and 390x844, including validation, password control, back/edit, progress, sticky actions,
  and completion/capacity paths.
- Inspect `/` and one representative shared `PageHero` route at desktop/tablet/mobile; verify one
  H1, section order, menu behavior, real product preview, CTA destinations, and no document-level
  overflow.
- Run `pnpm --dir frontend lint` and `pnpm --dir frontend exec tsc --noEmit`.
- Run the affected flow, auth, onboarding, landing, and marketing-primitives Vitest files plus the
  focused auth/onboarding and marketing Playwright scenarios.

### Phase 4 — migrate remaining authenticated routes

Migrate bodies only after the four representative patterns pass. The Phase 1 header/shell cutover
already guarantees one H1 and current navigation for these routes.

| Pattern | Routes | Application rule |
|---|---|---|
| Analytical workspace | `/demand`, `/performance`, `/products`, `/visibility`, `/ai-referrals` | Reuse page header, tabs/toolbars, open sections, metrics, and existing table/record primitives. Preserve date/filter/query semantics and presentation-specific charts. |
| Collection/detail | `/opportunities`, `/runs`, `/runs/[runId]`, `/prompts` manage/read modes | Reuse the proven rhythm only where the current screen has that semantics. Preserve exact production route/mode/drawer behavior, URLs, evidence, schedules, pagination and gates. Prompt management retains its current editor and entry/exit behavior: do not implement the reference's Manage prompts modal. |
| Focused settings | `/settings` and its current tabs | Use the compact page header, fields, sections, and responsive stack. Preserve provider/integration/billing behavior from clean main and do not absorb settings into a generic auth form. |
| Entity detail | `/site/crawls/[crawlId]/pages/[siteUrlId]` | Omit the generic route heading so the entity heading is the sole H1. Preserve evidence, drawers, and back/deep-link behavior; apply only shared type, spacing, rule, and action treatment. |
| Shell states | `(app)/loading`, error, and not-found surfaces | Keep truthful status/error semantics and current destinations; use the same page geometry without pretending these are full analytical workspaces. Only update a stale presentation reference caused by this cutover. Record unrelated wrong destinations as separate product defects, not silent behavior fixes. |

For each owner:

1. Re-read the owner and extend its Section 2C behavior mapping before edits. Classify existing
   regions against the four proven patterns without changing the workflow's interaction surface.
2. Move existing actions into the in-pane header where state ownership permits, retaining the same
   handler/destination, form association, state, visibility, disabled conditions and outcome.
3. Replace only demonstrated duplicate wrapper/spacing composition.
4. Retain domain-specific control and presenter owners.
5. Remove route-level `TooltipProvider` and no-op one-child layout wrappers only when shell/screen
   ownership is confirmed.
6. Do not make a route visually identical to a representative at the cost of its information
   hierarchy.

**Acceptance**

- Every authenticated route uses the approved shell, one page header, compact role ladder, and
  sanctioned composition primitives.
- Filters, tables, drawers, scheduling, page actions, URL/deep-link state, and API behavior are
  unchanged. Manage prompts still enters its recorded production workflow; production page/run
  details do not become prototype drawers; exports do not become the demo's generic chooser.
- No route has a local fork of shell, header, toolbar, metric, button, or token behavior.

**Focused checks**

- Exercise every route at desktop and one compact width; use the full four-width matrix for routes
  with tables, drawers, schedules, fixed/sticky controls, or master/detail regions.
- Explicitly exercise Demand filters, Performance ranges, Commerce Suite tables/actions,
  Opportunities filters/handoff, Visibility tabs, Runs evidence and scheduling, AI Referrals,
  Prompts modes, Settings integrations/providers/billing, and URL detail evidence.
- Run `pnpm --dir frontend lint` and `pnpm --dir frontend exec tsc --noEmit`.
- Run the affected route-owner Vitest files and focused Playwright scenarios for each migrated
  behavior. Leave full diff selection to final `test.ps1`.

### Phase 5 — runtime proof and final zero-reference cleanup

Every known replacement is a clean cutover: migrate all callers and delete its superseded path in
the owning phase above. Phase 5 does not postpone the old topbar, mobile navigation, duplicate
controllers, Barlow assets, decorative icon APIs, route providers, or feature-local geometry. It
begins only after the migrated actual product passes its full-surface smoke and removes only
unplanned zero-reference leftovers exposed by the completed cutovers.

**Full runtime proof before final cleanup**

- Use real Chromium against the actual application, not static source assertions. Keep visual
  reference comparisons separate from behavior comparisons against the pre-migration baseline.
- Verify 1440x900 desktop, 1280x720 short laptop, 768x1024 tablet, 767x1024 breakpoint edge,
  390x844 mobile, plus 360px mobile and 1200/1201, 980/981, 700/701 boundary spot checks.
- Traverse Overview → Website → Issues → Content → remaining routes through navigation and browser
  history while confirming the shell remains mounted.
- Exercise Search/Ctrl+K, Agent/context launch, project switch, account/Settings, form validation,
  drawers, tables, filters, pagination, scheduling, page actions, and public navigation.
- For every representative route, check `documentElement.scrollWidth <= clientWidth + 1`, exactly
  one H1, local overflow ownership, safe-area clearance, action reachability, and visible focus.
- Use keyboard-only passes for menus, Command Palette, tabs, radio/choice controls, dialogs,
  drawers, and Escape/focus return. Check reduced-motion and forced-color modes on the shared shell
  and one focused flow.

**Behavior-parity and visual evidence review**

- Replay each migrated unique workflow in the Section 2C record. Compare the same preconditions,
  relevant URL/history or mode transition, selected project/entity, gate, result and error/cancel
  behavior. For affected mutations/downloads, use existing test instrumentation to verify the
  relevant method, payload/content and outcome; do not require a new network-audit framework or
  compare incidental request timing/order where the production contract does not.
- Explicitly verify Manage prompts from every migrated entry point and the absence of the new demo
  management overlay/window, while retaining any pre-existing editor confirmations. Verify detail
  destinations, direct/chooser exports, audit/crawl/schedule lifecycles, Content history/output,
  auth/onboarding and billing/integration paths identified in the record.
- Audit the full diff for changed routes/hrefs/targets, click handlers, form submission ownership,
  validation/defaults, state initialization/reset, effect lifecycle, query keys, mutation calls,
  gating and new/removed controls. These are review targets, not regex-based proof. Each intentional
  behavior-adjacent edit must trace to V1–V8 and retained tests. Pure presentation must not silently
  reinitialize a feature, submit twice or change native link behavior.
- Compare approved and implemented visual regions at matching dimensions with real Geist. Retain
  screenshots/evidence in the existing task-artifact location. Do not fabricate fixtures in the
  product, alter factual copy, remove rows/fields or hide overflow to force a pixel match.
- Record each unavoidable prototype difference with its production owner, preserved behavior and
  narrow visual consequence. Do not label arbitrary visual deviation as a behavior exception.
- List untested/blocked states separately. Earlier prototype QA numbers are not proof that the live
  app or this implementation passed. No broad claim of unchanged functionality without the actual
  app's behavior evidence.

**Cutover deletion record and final cleanup**

Confirm the known deletions already happened in their owning phases:

- Phase 1A: duplicate Command Palette Settings/filter logic and duplicate account/controller paths.
- Phase 1B: desktop topbar, fixed mobile primary/secondary navigation, stale topbar-height/safe-area
  geometry, and superseded page-title override paths/tests.
- Phase 1C: Barlow loader, variable, font files, license, and stale two-font comments.
- Phase 2: representative-route duplicate providers/wrappers, Overview project picker plumbing,
  and hard-coded Issues split geometry.
- Phase 3: `FlowGroup.icon`, its decorative imports, and obsolete landing icon/tile metadata or
  registries.
- Phase 4: remaining authenticated route provider/no-op wrappers and legacy typography aliases
  after their final callers migrate.

After runtime proof, search again and delete any additional truly unused primitive or stale comment
exposed by the cutover, but only with zero-reference proof, migrated-consumer proof and no active
documentation contract. Change a link only to preserve its recorded destination after this cutover;
record unrelated incorrect canonical destinations as separate defects, not an implied scope expansion. Do not delete domain coordinators, Website tab panels, evidence
presenters, Content history/result owners, project edit/facts owners, query hooks, or behavior
tests merely because their visual wrappers changed.


**Review and final gates**

1. Perform a scope/simplification review of the full diff: behavior preservation, duplicated
   owners, prop-heavy abstractions, obsolete code, accessibility, responsive overflow, and active
   documentation contradictions.
2. Apply review findings, repeat the affected actual-surface scenarios, and record every file
   changed while fixing a failed `test.ps1` retry.
3. From repository root, run once in required order:

   ```powershell
   .\scripts\check.ps1
   .\scripts\test.ps1
   ```

4. Fix every failure without weakening lint, complexity, duplication, architecture, design,
   validation mapping, type, or test policy. Re-run `test.ps1 -ChangedFiles ...` only after an
   earlier failing `test.ps1` in this task and include the complete retry delta.

**Done means** the real application matches the approved visual reference in the intended regions;
its migrated workflows retain the pre-migration contracts except for V1–V8 presentation deltas;
Manage prompts retains its real editor/entry flow; both root gates pass; active docs describe the
shipped shell/type system; superseded paths in the deletion ledger are gone; and no mock/prototype
feature or workflow has entered production. Provide the frozen reference path/hash, baseline commit,
completed phase summary, action-parity evidence, visual captures, deletion summary and exact test
results. State any blocked checks or unresolved differences instead of declaring full completion.

## 7. Test strategy

### Characterize before editing; do not bless drift afterwards

Reuse current behavior tests. Where a changed high-risk workflow lacks coverage, capture its
production behavior before replacing its presentation. A changed button's styling, location or DOM
structure may require a locator update; its expected route/mode, interaction surface, permission,
validation, confirmation and result must not change to fit the demo. Keep behavior assertions
independent of exact layout, while covering approved responsive navigation with focused browser
checks. Do not add snapshots of fixture HTML as product behavior tests.

Visual verification uses the rendered frozen reference and computed style/geometry where useful,
not class-string assertions in component tests. Test only meaningful contracts and affected states;
this plan does not ask for thousands of new tests or full suites after every small edit.

### Keep and update behavior tests

- Shell/navigation: canonical destinations, active state, drawer open/close/focus, capability
  visibility, route prefetch, instant navigation, mobile account access, and one H1.
- Command Palette: shortcut, pointer/mobile launcher, filtering, arrow/Enter, Escape, focus return,
  project switching, shared destination/capability parity, and no results.
- Agent: entitlement states, route/date/filter/project context, contextual launcher, project reset,
  close/focus, and one drawer owner.
- Overview: onboarding handoff, pre-audit state, facts, zero/unavailable distinction, next action,
  Track, report, editing, notices, and keyboard reordering.
- Website: tab URL/default rules, one Run/Stop action, export, first crawl, progressive state,
  terminal transitions, sorting, filters, cursors, evidence, labelled records, and detail links.
- Issues: filter/cursor/history state, Defect/Advisory vocabulary, selection/detail query,
  remediation/evidence, copy prompt, affected page kinds, and occurrence pagination.
- Content: authorized handoffs, target alternatives, skills, empty instruction, lifecycle,
  cancel/retry/regenerate, rendered heading demotion with one page H1, byte-for-byte raw Markdown
  copy/export, truncation, feedback, History, and active-row deletion protection.
- Prompts: Manage prompts entry/exit and manage/read modes, current editor surface, existing
  fields/actions, capability gates, validation/save/cancel behavior and preserved draft/selection
  rules. Verify that the reference's new management modal/window is not introduced.
- Detail/export parity: current page/run/prompt/evidence destinations and browser history;
  existing report/export/copy/download interaction and exact relevant output semantics.
- Auth/onboarding: provider/email paths, validation/API errors, handoffs, redirects, stage gates,
  discovery, confirmation, caps, payload, capacity, and completion.
- Landing/public: one H1, exact section order/anchors, factual claim guards, anonymous content,
  CTA routes, navigation, real product preview, and shared page/footer behavior.

### Do not add low-value tests

- No snapshots of prototype HTML.
- No Tailwind class-string or token-value assertions in component tests.
- No tests that merely count cards, icons, wrappers, or DOM children.
- No source-text tests for visual recipes beyond the repository's existing architectural/design
  policy owners.
- No duplicate jsdom viewport cases for geometry that only a browser can prove.

Responsive clipping, sticky/fixed overlap, drawer double-scroll, table/record transformation,
short-height action reachability, and visible focus belong in the real-browser smoke above. Add a
permanent Playwright assertion only when it protects stable behavior or reproduces a plausible
regression discovered during implementation.

## 8. Risks and controls

| Risk | Control |
|---|---|
| Current branch changes entitlement/billing owners before this work starts | Hard clean-main precondition and Phase 0 re-baseline; never apply this plan to the dirty branch. |
| Removing the topbar creates missing or duplicate H1s | Atomic explicit `PageHeader` migration across every authenticated route; one-H1 browser check. |
| Desktop/mobile launchers mount duplicate dialogs or drawers | One controller owner per feature; mobile uses explicit launch events, never a second component instance. |
| Responsive account access duplicates state or logout mutations | One `UserMenu` controller and menu content owner with trigger-only desktop/mobile presenters; omit the account block from the compact drawer. |
| Mobile drawer reduces route discoverability | Reuse the same complete navigation registry and sidebar renderer; test every group/destination and active state. |
| Navigation and Command Palette capability rules diverge | One shared destination/capability resolver; delete parallel Settings commands and duplicated filters. |
| New 980px shell breakpoint conflicts with feature breakpoints | Keep feature-local responsive modes unless visually broken; test 980/981 plus 767/768 and tablet widths. |
| Removing cards changes sticky or overflow ancestors | Prove Issues, tables, output, and drawers before cleanup; preserve the intended scroll owner explicitly. |
| Global token/type changes regress public or focused routes | Named role migration, explicit public-route sweep, and validation mappings for both CSS owners. |
| All-Geist cutover leaves dead font payload or mixed roles | Zero-reference search before deleting Barlow; final search for `--font-barlow`, Barlow files, and call-site role overrides. |
| Icon reduction removes meaning | Delete only decorative repeated tiles; retain action, status, provider, platform, selection, and compact workflow wayfinding icons. |
| Agent treats a working prototype control as a feature requirement | Visual-only authority, V1–V8 allowlist, production-to-reference action mapping and explicit Manage prompts exclusion. |
| New layout looks correct but changes routes, modal/mode transitions, defaults or form behavior | Characterize before editing; replay behavior tests and inspect behavior-adjacent diff separately from visual comparisons. |
| Old `preview.html` or Section 5 values override the approved refinement | Freeze actual repository reference path/hash; this revision replaces Section 5 with the refined specification. |
| Sparse demo removes real features or adds mock Settings/billing actions | Preserve production controls/states and exclude demo-only functionality; record narrow layout differences without weakening visual tokens. |
| Agent changes reference/screenshots/tests to declare success | Keep approved HTML immutable; keep behavioral expectations; distinguish reference visual evidence from pre-migration behavior evidence. |
| Visual consolidation mutates product behavior | Keep coordinators/hooks/contracts intact; tests assert consumer-observable behavior, not new markup. |
| The change grows a generic wrapper hierarchy | Require two semantically identical production consumers; otherwise keep composition in the existing feature owner. |

## 9. Initial implementation map

The intended first implementation session, after the clean-main precondition, is deliberately
narrow:

1. Re-baseline clean main, record its commit and owner/deletion inventory, freeze the refined HTML
   path/hash, and establish Section 2C behavior evidence, including Manage prompts. Do not replan
   the visual design or substitute the old preview.
2. Implement Phase 1A only: unify destinations/capabilities and extract trigger presenters for the
   single Command Palette, Agent, and account controllers under the existing shell.
3. Prove 1A with focused shell interaction, lint, type, and affected behavior tests; delete its
   superseded parallel lists/controllers.
4. Implement Phase 1B as one atomic shell/header cutover, update its active docs, delete the old
   topbar/mobile navigation paths, and prove every route still has exactly one H1.
5. Implement Phase 1C visual tokens and all-Geist family cutover, delete Barlow in that slice, and
   prove shared public/focused surfaces before changing representative route bodies.
6. Stop adding shared foundation. If a representative page needs a one-off structure, compose it
   locally first; promote it only after the second real consumer is known.
7. Implement Phase 2 in the fixed order Overview → Website → Issues → Content, with behavior and
   responsive proof after each route and one consolidated focused-check pass.
8. Continue to flows/landing and remaining routes only after the four archetypes match the frozen
   reference and pass behavioral parity. Extend the same concise record before each new route;
   preserve current Prompts management and all other production interaction surfaces.
9. Run the final zero-reference cleanup and reviewer pass only after the migrated actual product is
   proven, then run the repository-wide gates once in their required order.

This order keeps the highest-leverage owners first, makes the four representative pages the design
proof instead of inventing abstractions in advance, and leaves product functionality untouched.

## 10. Revision record and source provenance

This revision keeps the supplied plan's numbered structure, named owners, route coverage, Phase 1
slices, representative-page order, focused checks and final `check.ps1` -> `test.ps1` gates. It adds
no production functionality and makes no new repository findings. Its changes are limited to:

- Freezing the already approved refined HTML and replacing stale Section 5 visual values.
- Making demo interactions non-authoritative and enumerating approved presentation deltas.
- Adding production-behavior mapping, the explicit Manage prompts guard, two-track verification
  and narrow behavior-preserving exceptions.
- Removing ambiguous permission for unrelated route/link bug fixes during visual cleanup, and
  making branch/ref artifact handling safe.

Inputs reviewed:

| Input | Use |
|---|---|
| `citeladder-targeted-layout-consolidation.md` supplied with the request | Original scope, invariants, owner map, phase sequence, checks and deletion policy. |
| `citeladder-refined.html` / identical `citeladder-reference.html` | Owner-approved appearance and exact CSS; demo interactions deliberately excluded. |
| `citeladder-implementation.md` / package `IMPLEMENTATION.md` | Extracted visual-role specifications and existing font-loading caveat, reconciled with this plan's delivery sequence. |
| Owner's current instruction | Exact approved design, no functionality/feature changes; preserve production Manage prompts while adopting shell/header improvements. |

Input plan SHA-256: `46c95eba3ec81914a33598de8f173200735426eb8772a6dbadab235ed1a972ad`.
The production repository was not inspected in this revision. Current implementation details,
including the exact prompt-management interaction and branch status, remain Phase 0 verification
items. The saved project HTML's actual location is deliberately not guessed.
