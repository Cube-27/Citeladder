# Frontend architecture

The Next.js App Router frontend projects workspace-authorized backend
contracts. It owns navigation, ephemeral state, accessible interactions and
presentation; the backend owns authorization, measurement and lifecycle truth.
[Design](design.md) is the sole visual contract. Feature behavior is routed
through [the documentation index](README.md).

## Routes and shared shell

| Surface | Browser location | Feature owner |
|---|---|---|
| Overview and company facts | /projects | [Onboarding](onboarding.md) |
| Website and issues | /site, /issues | [Site Health](site-health.md) |
| Search Demand, Performance, AI Referrals | /demand, /performance, /ai-referrals | [Connected data](integrations-traffic-analytics.md) |
| Opportunities and Content | /opportunities, /content | [Opportunities](opportunities.md), [Content](content-generation.md) |
| Prompts, Visibility and runs | /prompts, /visibility, /runs | [Visibility](visibility-prompt.md) |
| Commerce | /products | [Commerce](commerce-intelligence.md) |
| Settings and account management | /settings and account routes | [Workspace access](workspace-access.md), [Billing](billing-entitlements.md) |
| Growth Agent drawer | Shell-owned sheet | [Growth Agent](growth-agent.md) |
| Public MCP setup | /docs/mcp | [MCP](mcp.md) |

One authenticated layout retains the session, query client, workspace/project
context and entitlement providers across app and onboarding navigation.
[Workspace access](workspace-access.md) owns selection precedence and identity
transitions. Navigation, compact navigation and Command Palette share the
route/capability owner; UI visibility never replaces backend authorization.

Cache Components and Partial Prefetching preserve the shell while route content
resolves. The app segment has no separate loading boundary. PageLoading owns
first-load presentation; shell-fallback handles session/workspace/entitlement
waits. In-place refresh retains data with scoped progress rather than collapsing
the surface. Intent prefetching reuses the destination's exact query key.

## Server, URL and local state

Browser APIs use relative /api/v1 through server-only BACKEND_ORIGIN rewriting.
TanStack Query owns server records; shared Zod schemas validate their contract.
Each domain has one API module and query-key owner. Workspace/project identity
belongs in both requests and cache keys. Retained placeholder data may survive
filter/pagination changes only within the same owning project/crawl.

Typed shareable tabs, filters, cursors and selected IDs belong to
lib/navigation/url-state.ts, with explicit push/replace semantics. Component
state owns ephemeral drafts and interactions. Read-mostly queries use the
configured freshness/retention policy; explicit polling remains authoritative
for active operations. Events accelerate projection invalidation, never replace
persisted truth. No screen substitutes mock data or computes a backend metric.

## Component capability and technical ownership

Shared UI capabilities have one owner under `frontend/components/ui/`. Their
technical contracts and state responsibilities live here; visual values and
interaction recipes live only in [`design.md`](design.md).

| Capability | Owner |
|---|---|
| Button, Card, Input, Textarea, Field | `frontend/components/ui/` |
| Dropdown Menu, Dialog, Drawer, Tooltip | `frontend/components/ui/` Radix wrappers |
| Table, Badge, Alert, Skeleton, progress, empty state, pagination, segmented control | `frontend/components/ui/` |
| Select, Search field, Tabs | `frontend/components/ui/select.tsx`, `frontend/components/ui/search-field.tsx`, `frontend/components/ui/tabs.tsx` |
| Checkbox and radio group | `frontend/components/ui/checkbox.tsx`, `frontend/components/ui/radio-group.tsx` |
| Toast, Pressable, Clipboard action | `toast.tsx`, `pressable.tsx`, `copy-button.tsx` |
| Text roles (`textRole`) | `frontend/components/ui/typography.tsx` |
| Stack | `frontend/components/ui/layout.tsx` |
| Panel (`panelClasses`) and flush card content | `frontend/components/ui/panel.tsx`, `frontend/components/ui/card.tsx` |
| Menu separator | `frontend/components/ui/dropdown.tsx` |
| Command palette, Market Select, CSV import | Existing shared and feature owners |
| Cursor/table pagination, resizable workspaces | Existing feature owners |
| Color controls, OTP, sliders, calendars/date pickers, avatars | No current product use |
| Generic disclosure and donut | No production consumers |

Shared primitives own geometry, accessibility, interaction states, and motion.
Domain wrappers own business logic, factual copy, data translation, and
conditional behavior. A new shared module needs two production consumers unless
it replaces an existing owner. Feature call sites do not import Radix directly,
choose size-named radius tokens, add child margins for shared rhythm, or replace
semantic control states with cosmetic overrides.

## Frontend owner boundaries and shared mechanics

A screen entry point coordinates route context, server-state hooks, mutations, and
transient UI state. It delegates cohesive visual regions, domain-specific
formatting, and interaction mechanics to focused sibling owners. A split must
preserve one public entry point for callers; consumers must not compose a
screen from its internal presentation files.

| Surface | Coordinator boundary | Focused owners |
|---|---|---|
| Growth Agent | `components/agent/growth-agent-workspace.tsx` owns workspace state and actions | `growth-agent-workspace-view.tsx` owns run detail, task form, and task history presentation |
| AI Referrals | `components/ai-referrals/ai-referrals-screen.tsx` owns project/range queries and toolbar selection | content and dashboard owners render the query states and measurements |
| Content | `components/content/content-screen.tsx` owns project transitions and generation orchestration | data hooks, generation history, and composer/result panels own their respective concerns |
| Onboarding | `components/onboarding/onboarding-screen.tsx` selects the active stage and actions | `onboarding-flow.ts` owns transaction state, stage owners render domain UI, and `components/auth/flow-shell.tsx` owns shared auth/onboarding chrome |
| Projects dashboard | `components/projects/dashboard-screen.tsx` owns query gates and project context | dashboard controls, primitives, sections, and command-center action hook own reusable UI and mutations |
| Performance | `components/performance/performance-screen.tsx` owns project/range/compare selection and the range-projection hand-off | date-range dialog, metric cards, chart, dimension table, and synchronization hook own their scoped behavior |
| Site Health URL detail | `components/site-health/url-detail.tsx` owns query/rerun control and polling | `url-detail-view.tsx` owns the persisted-detail presentation; `internal-links-card.tsx` owns the link-metric section |
| Site Health architecture | `components/site-health/architecture-panel.tsx` owns the projection query, page-kind rows, and persisted link/depth summaries | — |
| Commerce, prompts, providers, and marketing previews | Existing public panels and dialogs remain their caller-facing owners | small view, cell, topic, preview, and message-bus modules own discrete presentation or local interaction regions |

### Site Health API schemas

`frontend/lib/api/schemas/site-health.ts` is the stable Site Health schema
facade. The public `lib/api/schemas` barrel re-exports that facade, so API
consumers retain their existing import boundary and inferred Zod schema names.
Focused modules under `lib/api/schemas/site-health/` own crawl lifecycle,
dashboard/change/readiness, observed architecture, inventory, issues, page
detail, pagination, and shared schema primitives. Do not import a focused file from a feature solely to
avoid the facade; move a genuinely shared primitive into the focused schema
folder and re-export it through the facade.

### CSV import mechanics

`components/ui/csv-import.tsx` owns the reusable import trigger and dialog
shell, accessible file input, same-file reset/reselection, pending state,
preview framing, and `useCsvImportFile` lifecycle. File text loading,
including the browser and test-environment fallback, belongs to
`lib/csv/read-file-text.ts`. Prompt and product modules retain ownership of
their own CSV grammar, validation, preview columns, and import mutations. The
shared layer must not make domain validity decisions or post a domain payload.

### Event-stream mechanics

`lib/sse/frames.ts` owns raw Server-Sent Event frame splitting and parsing.
`lib/sse/use-event-stream.ts` owns the credentialed browser transport:
workspace and resumption headers, chunk decoding, cancellation, reconnect
backoff, and debounced invalidation delivery. Domain hooks retain event
classification and query invalidation ownership:

- `lib/runs/use-run-events.ts` validates audit frames and chooses run and
  visibility query families.
- `lib/site-health/use-crawl-events.ts` distinguishes lifecycle changes from
  per-page progress and refreshes the applicable crawl views.
- `lib/api/run-events.ts` retains the audit-event contract and compatibility
  exports for framing helpers; it does not own a second stream transport.

Streams accelerate polling-backed projections only. They never become a
client-side source of truth or construct rows from partial, replayed, or
unknown event payloads.

### Complexity boundary

The frontend complexity guard covers `app`, `components`, and `lib` with a
maximum cyclomatic complexity of 12 per function, 500 LOC per production
module, and 800 LOC per test module. The guard rejects relaxed defaults and
new or increased policy exceptions. New and refactored owners must meet those
defaults by decomposition; an exception is not an intended delivery outcome.

## Verification

Use the affected-owner workflow in [Development](DEVELOPMENT.md#repository-validation-harness).
Preserve the feature's meaningful authorization, API, loading/error,
accessibility and navigation coverage. Shared visual rules remain in
[Design](design.md), not class/font/pixel snapshots.
