# Layout consolidation behavior parity

> **Status:** historical visual and behavior evidence. This record preserves
> baseline provenance and stated evidence limits; it is not an active design
> authority or repository validation gate.

This record separates the captured pre-cutover baseline from the current
implementation. It records the preserved production contracts and the
presentation/deletion work visible in the working tree. The final verification results and remaining evidence limits are recorded below.

## Baseline and reference

- Clean-main baseline: `f27819c2b57c354823a3aed781566949e9075d4f` (PR39,
  merged; required checks: 15).
- Implementation branch: `feat/targeted-layout-consolidation` at
  `cce97c4530789223a272ace959486d0b3edff9b6`.
- Clean-main precondition was verified before the implementation branch and frozen-input commit; no
  application behavior was changed during reconciliation.
- Frozen visual reference: `citeladder-refined.html` (historical artifact unavailable in this checkout),
  SHA-256 `EB766454CB5C4FE87D1B753BBFAC6825F37A62144A09706F146B8A46968B6B3A`.
  Identity: title `CiteLadder — Stripe-informed UI Reference 1.0`, canonical
  stylesheet `#citeladder-styles`, Geist stylesheet request, and the
  in-file `DESIGN_CONTRACT`.

## Baseline inventory (historical, before the cutover)

The following Phase 1A observations are retained as baseline history. They are
not a description of the current owners:

- `PageHeader` was shell-mounted, with route coordinators lacking explicit
  header composition.
- `--topbar-height` and its scroll-margin consumers mixed desktop and compact
  shell geometry.
- Public and focused-flow surfaces still loaded or referenced Barlow, with four
  Barlow font files and a license file in the asset tree.
- Structural search found 29 TSX files using `PageHeader`, `TooltipProvider`,
  or legacy type aliases; this was an inventory, not permission to add wrappers.
- The supplied audit map used a stale `components/issues` path; Issues lived
  under `frontend/components/site-health/`.

## Current implementation and deletions

- `PageHeader` is an explicit route-owned in-pane primitive across the
  authenticated routes. Entity detail keeps its own heading as the sole H1.
- The desktop topbar, fixed mobile navigation, and obsolete app-shell
  safe-bottom reservation are gone. `--compact-topbar-height` remains as the
  shared 56px compact topbar/shell geometry; safe-area handling remains only
  where a sticky focused-flow or marketing mobile control needs it. The
  compact drawer reuses the desktop destination tree.
- `NAV_GROUPS` and capability filtering resolve through one shared navigation
  owner for Sidebar, compact navigation, and Command Palette. The current
  registry is `Overview`, `Analyze`, `Act`, and `Track`, with Prompts in Track.
- One persistent Command Palette, one Agent controller, one
  `UserMenuController` with named presenters, and one shell `TooltipProvider`
  own their respective cross-surface seams.
- Geist is the sole loaded product/public/flow family. The Barlow loader,
  variable, font files, license, decorative landing icon registry, and other
  superseded prototype presentation paths are deleted in the working diff.

The implementation preserves the production route/mode, URL/history, form,
mutation, entitlement, export, crawl, detail, integration, auth/onboarding,
Content, and Growth Agent contracts mapped below. The HTML reference contributes
appearance only; its demo data and alternate workflows are not production
requirements.

## Browser baseline

`artifacts/layout-consolidation/before/` contains the deterministic captures
and `artifacts/layout-consolidation/before/baseline.json` (historical artifact unavailable in this checkout).
The shell baseline run passed **2 tests** in `frontend/e2e/shell.spec.ts`; the
capture run passed **1 test** (45.5s). Captures cover `/projects`, `/site`,
`/issues`, `/content`, and `/prompts` at `1440x900`, `1280x720`, `768x1024`,
`767x1024`, and `390x844` where specified by the fixture. Each captured app
surface reports one H1 and no document horizontal overflow. Geist was loaded
from the local production font in the fixture. The source-data-missing error
state was not captured and remains unverified.

The Manage prompts browser scenario records the production link
`/prompts?mode=manage`, the in-page toolbar with no extra modal, and `Done`
returning to `/prompts`. The temporary capture spec was removed after capture;
the README in the artifact directory records the commands and scope.

## Baseline regression coverage

The pre-cutover characterization covered the split shell seams: `AgentSheet` reopens from
the default trigger with the last contextual task/objective, the shared
navigation resolver gives Sidebar and Command Palette the same capability
result, and split UserMenu presenters share one logout controller while
returning focus to the actual opener. The focused shell run passed **6 files /
48 tests** (`sidebar-nav`, `page-header`, `user-menu`, `agent-sheet`,
`command-palette`, and `growth-agent-workspace`). This is baseline evidence;
post-cutover regression and browser results are recorded in the final verification section.

The baseline focused Oxlint and `pnpm exec tsc --noEmit` checks passed after the
UserMenu controller narrowed its logout mutation type. Shell consumers now use
`UserMenuController` plus named presenters; there is no standalone `UserMenu`
compatibility export. These focused results do not stand in for the final
post-cutover checks below.

## Section 2C behavior map

| Surface/action | Production owner and current contract | Reference appearance / approved delta or exclusion | Before/after evidence |
|---|---|---|---|
| Manage prompts entry, mode transition, editor, save/cancel | `frontend/app/(app)/prompts/page.tsx` (`PromptsScreen`): read view is default; `/prompts?mode=manage` enters the in-page `PromptLibrary`; exit clears the query with `window.history.replaceState`. `PromptLibrary` owns prompt/topic filters, CRUD, import, generation, and dialog state. `PromptFormDialog` owns RHF/Zod validation and Add/Edit save/cancel. | Apply in-pane header styling and approved shell placement. Preserve the route/mode workflow. The prototype `managePrompts` modal/window is explicitly excluded. | `frontend/app/(app)/prompts/page.test.tsx` (deep link, enter/exit, replace-state) and `page.manage.test.tsx` (generate, add, edit, delete, import, filters, status, errors). The route-specific run passed **2 files / 26 tests**; post-cutover coverage passed in the repository-selected frontend run. |
| Prompt generation, import, CRUD, status/toggle | `frontend/components/prompts/prompt-library.tsx` owns mutations and query invalidation; `prompt-library-dialogs.tsx`, `prompt-form-dialog.tsx`, `csv-import-dialog.tsx`, and `generate-prompts-dialog.tsx` own the existing dialogs and validation. | Retain real management dialogs and all fields/states; do not copy demo fixtures or add an export chooser/modal. V1/V4 styling only. | `page.manage.test.tsx`, `components/prompts/csv-import-dialog.test.tsx`, `components/prompts/prompt-table.test.tsx`, `components/prompts/resizable-prompt-workspace.test.tsx`, `components/prompts/topic-rail.test.tsx`, `components/prompts/topic-groups.test.ts`, `lib/prompts/csv.test.ts`, `lib/prompts/filter.test.ts`, `lib/prompts/forms.test.ts`. The pre-change `pnpm exec vitest run prompts` baseline passed **10 files / 60 tests**; post-cutover coverage passed in the repository-selected frontend run. |
| Page/run/prompt/evidence detail entry | Site Health `pages-table.tsx`/`url-detail.tsx`, Issues `issues-catalog-url-state.tsx`, Runs `runs-table.tsx` and `runs/[runId]/page.tsx`; selection and URL state remain owner-controlled. | Preserve every route, drawer/dialog distinction, deep link, and back behavior. V6 applies only to Issues list/detail presentation; prototype detail drawers are excluded elsewhere. | `frontend/app/(app)/runs/[runId]/run-detail.test.tsx`, Site Health/Issues route tests and existing URL-state tests. Source/test expectations were inspected before migration; affected post-cutover coverage passed in the repository-selected frontend run. |
| Export/report/copy/download | Site Health screen export action (`components/site-health/site-health-screen.tsx`); run exports are direct CSV/Markdown links from `components/runs/progress-panel.tsx` and `app/(app)/runs/[runId]/run-detail.test.tsx`. Copy actions remain their owning UI/domain components. | Restyle existing direct actions; exclude the prototype generic export chooser and sample files. | `app/(app)/runs/[runId]/run-detail.test.tsx` asserts `/api/v1/audits/{id}/export.csv` and `.export.md`; `components/site-health/site-health-screen.test.tsx` covers the Site Health export action. Source/test expectations were inspected before migration; affected post-cutover coverage passed in the repository-selected frontend run. |
| Launch audit, Run/Stop crawl, scheduling | `components/runs/launch-dialog.tsx`/`launch-dialog-view.tsx` and `app/(app)/runs/page.tsx` own prompt/engine selection, entitlement/provider gates, launch redirect, and lifecycle. Site Health crawl controls own run/stop/scheduling state. | Preserve configuration, defaults, confirmations, polling, cancellation/retry, and entitlement rules. No simulated completion or prototype scheduling options. | `components/runs/launch-dialog.test.tsx`, `app/(app)/runs/[runId]/run-detail.test.tsx`, and Site Health screen tests. Source/test expectations were inspected before migration; affected post-cutover coverage passed in the repository-selected frontend run. |
| Content generation, history, context handoffs | `components/content/content-screen.tsx` coordinates project transitions/generation; content panels, generation history, and API/context owners preserve polling, cancel/retry, provenance, and result actions. | Apply V1/V4/V5 presentation only; retain production-only evidence, history, handoffs, and actions absent from the HTML. | `frontend/components/content/content-screen.test.tsx`, `frontend/components/content/skill-picker.test.tsx`, `frontend/lib/content/markdown.test.tsx`, `frontend/lib/content/use-content-generations.test.tsx`, and `frontend/lib/api/content.test.ts`. Source/test expectations were inspected before migration; affected post-cutover coverage passed in the repository-selected frontend run. |
| Project/account, billing, providers, integrations | `components/layout/project-switcher.tsx` and `components/layout/user-menu.tsx`, `components/settings/settings-screen.tsx`, `billing-settings.tsx`, `provider-settings.tsx`, and integration owners retain workspace authorization, billing/entitlement gates, OAuth, and sign-out. | Shell relocation only; preserve editors/menus and connection state. Exclude mock Settings/payment behavior from the prototype. | `components/projects/projects-screen.test.tsx`, `components/projects/project-edit-panel.test.tsx`, `components/settings/settings-screen.test.tsx`, `billing-settings.test.tsx`, `provider-settings.test.tsx`, `integration-settings.test.tsx`, and `components/layout/user-menu.test.tsx`. UserMenu tests assert MCP remains a target-blank `/docs/mcp` link and that logout failure leaves the authenticated UI/session active with retry. Source/test expectations were inspected before migration; affected post-cutover coverage passed in the repository-selected frontend run. |
| Search and Growth Agent launchers | `components/ui/command-palette.tsx` owns one command dialog/controller; `components/layout/agent-sheet.tsx` owns one contextual drawer/controller and event contract. The default Agent trigger preserves the last task/objective; typed launcher events replace that preset. Sidebar, compact navigation, and Command Palette now consume the shared `NAV_GROUPS` resolver, including the Content entitlement gate and Settings access. | V2/V3 place triggers in the desktop sidebar and compact topbar/drawer while preserving keyboard shortcuts, context, capability filtering, focus return, and single owners. Controllers remain mounted under the shell, outside the drawer. | `components/ui/command-palette.test.tsx`, `components/layout/agent-sheet.test.tsx`, `components/agent/growth-agent-workspace.test.tsx`, `components/layout/sidebar-nav.test.tsx`, and `user-menu.test.tsx`. Baseline browser and focused shell results are recorded above; post-cutover browser and repository-gate results are recorded below. |
| Auth/onboarding and public CTAs | Auth pages/components own validation, OAuth/MCP handoff, redirects; `components/onboarding/onboarding-screen.tsx` and `onboarding-flow.ts` own staged submission and entitlement gates; marketing pages own copy, URLs, and session redirects. | V8 focused-flow/public cleanup only. Preserve steps, payloads, redirects, copy/order, and real assets; exclude demo sign-in/workspace creation. | `app/(auth)/login/page.test.tsx`, `app/(auth)/register/page.test.tsx`, `components/onboarding/onboarding-screen.test.tsx`, `app/(onboarding)/onboarding/onboarding-page-client.test.tsx`, and `components/marketing/chrome/nav.test.tsx`. Source/test expectations were inspected before migration; affected post-cutover coverage passed in the repository-selected frontend run. |

## Reproducible baseline checks

Run from `frontend` with pnpm (not npm/yarn):

```powershell
pnpm exec vitest run prompts
pnpm exec vitest run components/layout/sidebar-nav.test.tsx components/layout/page-header.test.tsx components/layout/user-menu.test.tsx components/layout/agent-sheet.test.tsx components/ui/command-palette.test.tsx components/agent/growth-agent-workspace.test.tsx
```

The pre-change prompt command ran successfully: **10 files passed, 60 tests
passed**. The baseline Phase 1A shell characterization command ran
successfully: **6 files passed, 48 tests passed**. The prompt page command must
be run through Node directly on Windows because the
pnpm shim's generated cmd file treats the `(app)` route-group parentheses as
syntax; the equivalent command was:

```powershell
node node_modules/vitest/vitest.mjs run 'app/(app)/prompts/page.test.tsx' 'app/(app)/prompts/page.manage.test.tsx'
```

It ran successfully: **2 files passed, 26 tests passed**. The repository
`scripts/test.ps1` selector remains authoritative for completion. Post-cutover
results are recorded below.

## Intermediate visual capture (historical)

The temporary isolated Playwright harness completed **1 test passed (1.3m)**
against port 3101, producing 39 app observations, 39 reference observations,
and 80 screenshots in `artifacts/layout-consolidation/after/`. At every
captured app/reference viewport it observed one visible H1 and a loaded Geist
font. Its document overflow check was insufficient while global clipping was present; the app also passed the
approved 981px desktop / 980px compact shell breakpoint checks. Inner overflow
was retained in `observations.json` for review instead of being hidden: the
981px sidebar Search/Agent region measures wider than its 210px rail, and the
390px Website surface exposes content clipping. These captures used the
generic shell 404 catchall and are limited to those rendered states. Subsequent
production-shaped fixture captures in `after-populated/` cover Overview, Website,
Issues and Content at 1440px and 390px. Final corrections and their recapture are
recorded below; intermediate screenshots are not evidence of the final geometry.


## Final consolidation and authority

[`docs/design.md`](../../design.md) owns the final semantic visual recipes, with the
unchanged frozen HTML as their visual source. Tests enforce shared-owner consistency,
accessibility, data semantics and product outcomes. Removed checks asserted exact
fonts, class lists, pixel coordinates, decorative variants or incidental placement.
Permissions, save/cancel, route transitions, exports and mutation assertions remain.
No lint/type/complexity/architecture thresholds or test timeouts were weakened.

Deleted superseded owners include the unused `WorkspacePane`, legacy typography
aliases, desktop topbar variable, old mobile station navigation, Barlow assets and
landing icon registry. Shared Button/Card/type owners now supply the repeated recipes.
Global horizontal clipping was removed; compact Issues fields and Website tabs now
contain their own layout without concealing document overflow. Shell controllers
stay mounted when navigation closes; Drawer completion restores focus before opening
Search or Agent, without timers.

Necessary differences from the demo remain narrow: production branding/navigation,
score rings and evidence states, inline prompt management and existing CRUD dialogs,
real detail surfaces, direct exports, audit/crawl/scheduling controls, Content actions,
authentication and billing workflows remain owned by their production components.
The reference JavaScript and fixtures were not copied into production. Generated
Content markdown is unchanged; rendered heading levels fit the route's single H1.


## Final verification — 2026-09-08

- `scripts/check.ps1`: **passed**, including backend/frontend static, type,
  architecture, dead-code and API-contract checks. Log:
  `artifacts/layout-consolidation/check-final.log`.
- `scripts/test.ps1`: **passed** from the full working diff (112 paths), selecting
  2 backend files, 160 frontend files and 11 E2E files: **42 backend tests,
  1,344 frontend tests and 37 browser tests passed**. Log:
  `artifacts/layout-consolidation/test-final.log`. The final command used
  `VITEST_MAX_WORKERS=4` to avoid local scheduling contention; assertions, scope
  and timeouts stayed unchanged. Earlier failures from obsolete placement
  expectations/missing router mocks were corrected; isolated scheduling timeouts
  passed in this full selected run.
- `node artifacts/layout-consolidation/final-capture.mts`: **passed**. Six final
  screenshots and `observations.json` are in `artifacts/layout-consolidation/final/`:
  Issues at 1440/390, Website at 390/981, Content at 390 and Overview at 981.
  Each has one H1 and loaded Geist. Both body and document scroll widths fit the
  viewport with global overflow visible. The compact Navigation → Search/Agent
  handoff, Escape focus return, and Manage prompts → inline management → Done
  round-trip also passed. The temporary capture's first Done locator used visible
  text instead of its existing accessible name, `Done managing`; correcting that
  harness locator required no product or behavior-expectation change.
- Final Website 981px and populated Issues 390px screenshots were visually
  inspected after the last changes. The sidebar is contained, Website retains all
  five tabs and score semantics, and Issues shows the full selected detail and
  evidence without document clipping. Reference comparison uses the unchanged
  HTML captures with Geist loaded; no pixel snapshot is promoted to design authority.
- `git diff --check`: **passed**. Frozen HTML SHA-256 was rechecked and is unchanged.

Evidence limits: the generic route captures include error/empty fixture states,
not every populated state. The final Website fixture supplies crawl/score data but
not the persisted Overview projection, so its honest load-error state is visible.
No claim is made that every loading, unavailable, billing-provider or authenticated
live-data state was visually captured. Browser fixtures exercise production
components and workflows; they do not prove live provider integration. The browser
suite passed while Next development output reported existing URL-data/Suspense
warnings on blog/compare dynamic routes. No functional rewrite was made for those
warnings. Full release build, remote CI and deployment were not run for this
uncommitted implementation branch.
