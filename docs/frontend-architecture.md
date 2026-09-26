# Frontend architecture

The frontend has three runtime owners: the marketing Worker serves Astro SSR and
public routes at `citeladder.com`; the product Worker serves the Vite/React
Router SPA at `app.citeladder.com`; the static documentation Worker serves Astro
pages at `docs.citeladder.com`. Local Compose retains frontend containers
and a Caddy ingress on browser port 3000 for development and clean-clone smoke.
Together they project workspace-authorized
backend contracts. The frontend owns navigation, ephemeral state, accessible
interactions and presentation; the backend owns authorization, measurement and
lifecycle truth. [Design](design.md) is the sole visual contract. Feature
behavior is routed through [the documentation index](README.md).

The product Worker at `frontend/apps/app/worker.ts` serves Vite assets,
app-host API, browser MCP consent and guarded navigation. The marketing
Worker uses Astro SSR at `frontend/apps/marketing`, proxies only exact apex
protocol/webhook paths and reads the public catalog through protected origin
transport without visitor credentials. Production delivery and acceptance remain
operator gated. The first release retains captured prior VM artifacts for a
bounded rollback; later frontend releases use accepted Worker versions.

The product Worker runs before asset matching, so root, deep-link and direct
HTML responses all carry the same enforced Content Security Policy and no-store
policy. Fingerprinted resources retain immutable caching. Marketing static
resources use Cloudflare asset delivery; unmatched routes reach Astro SSR.
Astro emits a CSP header with hashes for compiled hydration scripts, and the
marketing middleware preserves it or supplies a restrictive fallback for proxy
and error responses. Browser destinations live in
`frontend/lib/config/content-security-policy.ts`; inline script and eval are
not enabled. Inline styles support React layout, charts and consent pages.
The app's pre-paint theme bootstrap is an external same-origin script. Upstream
policies, including sandboxed logos and MCP consent, remain authoritative.
The observed Cloudflare-injected Web Analytics beacon is allowed by its script
path and reporting endpoint, following the
[Cloudflare CSP requirements](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/).
Google Analytics destinations are included only in a marketing build with a
configured measurement ID, and loading still requires cookie consent.

## Routes and shared shell

| Surface | Browser location | Feature owner |
|---|---|---|
| Overview and company facts | /projects | [Onboarding](onboarding.md) |
| Website and issues | /site, /issues | [Site Health](site-health.md) |
| Search Demand, Search Intelligence, Performance, AI Referrals | /demand, /search-intelligence, /performance, /ai-referrals | [Connected data](integrations-traffic-analytics.md) |
| Agent: chats, Actions, Skills and Context | /agent, /agent/chats/:chatId, /agent/actions, /agent/actions/:actionId, /agent/skills, /agent/context | [Agent](agents.md), [Actions](opportunities.md#actions) |
| Prompts, Visibility and runs | /prompts, /visibility, /runs | [Visibility](visibility-prompt.md) |
| Commerce | /products | [Commerce](commerce-intelligence.md) |
| Settings and account management | /settings and account routes | [Workspace access](workspace-access.md), [Billing](billing-entitlements.md) |
| Public guides, Agent documentation, MCP setup and changelog | docs.citeladder.com | Static Astro app in `frontend/apps/docs` |

Documentation content lives in `frontend/apps/docs/src/content` as Markdown.
Its validated metadata drives navigation, static routes, search and the sitemap.
The final navigation group is Updates, containing the changelog. Search runs
locally over a static index; it has no backend, session or provider dependency.
The MCP reference consumes the existing generated tool catalog. The former
marketing `/docs/mcp` page is removed; all owned links use the public docs origin.

One authenticated layout retains the session, query client, workspace/project
context and entitlement providers across app and onboarding navigation.
[Workspace access](workspace-access.md) owns selection precedence and identity
transitions. Navigation, compact navigation and Command Palette share the
route/capability owner; UI visibility never replaces backend authorization.
The shell has two route-derived modes, Dashboard and Agent. The mode switch
returns to the last route used in each mode for the project during the browser
session; the Agent mode's navigation and its API modules load only in that mode.

The Vite SPA preserves the authenticated shell while route content resolves.
`shell-fallback` is the neutral pre-session structure only; after
authentication, PageLoading and recoverable gate notices render in the shell's
content pane. In-place refresh retains data with scoped progress rather than
collapsing the surface. Intent prefetching reuses the destination's exact query
key.

Route matching starts code downloads alongside session bootstrap. Pre-session
loading uses the neutral shell; authenticated route loading uses PageLoading
inside the persistent shell. Route failures offer a document reload, including
recovery from replaced build chunks. Once a project is authorized, its screen reads start without waiting for
entitlement. Empty-workspace onboarding still waits for the allowance decision,
and capability-specific controls retain their own entitlement gates.
The session, membership, selected-project and entitlement reads use a shorter
configurable browser timeout so stalled bootstrap requests reach the existing
retry notices. `NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS` is baked into the Vite
app build and defaults to 8 seconds per request attempt.

## Server, URL and local state

Browser APIs use relative `/api/v1`. After cutover, the product Worker sends
these requests through the shared authenticated origin transport. Marketing
navigation uses direct app-origin links; the public pricing HTML is rendered
from a validated catalog response and selection links carry only bounded public
fields. Local Compose still exercises the legacy Caddy route table during the
rollback window. Application documents use `no-store` and missing fingerprinted
assets return 404.
Each domain has one API module and query-key owner. Workspace/project identity
belongs in both requests and cache keys. Retained placeholder data may survive
filter/pagination changes only within the same owning project/crawl.

Typed shareable tabs, filters, cursors and selected IDs belong to
lib/navigation/url-state.ts, with explicit push/replace semantics. Component
state owns ephemeral drafts and interactions. Read-mostly queries use the
configured freshness/retention policy; explicit polling remains authoritative
for active operations. Events accelerate projection invalidation, never replace
persisted truth. No screen substitutes mock data or computes a backend metric.

User-facing timestamps use a resolved display timezone passed to the shared
formatter in `frontend/lib/format.ts`; API values remain UTC, and date-only
measurement buckets retain their calendar day. Account settings store a
device-local choice (Auto, UTC, or a named IANA zone) in a same-origin preference
cookie. Auto resolves the browser zone once per app load and falls back to UTC
when unavailable. Server rendering uses UTC unless an explicit cookie zone is
available; it never infers a browser zone.
The Actions list owns its `status` and `target` URL filters. New chat reads
typed evidence handoffs from its URL through `lib/agent/handoff.ts`; the URL
carries identifiers and an optional prompt, never evidence content.

## Component capability and technical ownership

Shared UI capabilities have one owner under `frontend/components/ui/`. Their
technical contracts and state responsibilities live here; visual values and
interaction recipes live only in [`design.md`](design.md).

| Capability | Owner |
|---|---|
| Button, Card, Input, Textarea, Field | `frontend/components/ui/` |
| Dropdown Menu, Dialog, Drawer, Tooltip | `frontend/components/ui/` Radix wrappers |
| Table, Badge, Alert, Skeleton, progress, empty state, pagination, segmented control | `frontend/components/ui/` |
| Recoverable persisted-read failure | `frontend/components/ui/read-error.tsx`; domain owners supply the exact read and decide whether cached content remains usable |
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

An initial read failure replaces only its affected data region and exposes an
exact retry. A transient same-scope refresh failure may retain persisted data
with an inline notice; an access failure must remove protected evidence and
mutation controls.

Initial Runs list/schedule reads settle before their working surface appears.
Performance starts readiness alongside its dashboard,
then presents one first-use guidance state rather than stacking connection and
missing-range notices. The page loader's reveal and rotation animate on separate
elements so its delay cannot replace the spinning animation.

## Frontend owner boundaries and shared mechanics

A screen entry point coordinates route context, server-state hooks, mutations, and
transient UI state. It delegates cohesive visual regions, domain-specific
formatting, and interaction mechanics to focused sibling owners. A split must
preserve one public entry point for callers; consumers must not compose a
screen from its internal presentation files.

| Surface | Coordinator boundary | Focused owners |
|---|---|---|
| AI Referrals | `components/ai-referrals/ai-referrals-screen.tsx` owns project/range queries and toolbar selection | content and dashboard owners render the query states and measurements |
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

Demand Intelligence and Search Intelligence response schemas
likewise live under `frontend/lib/api/schemas/` and are re-exported by the
public facade. API clients validate through `strictValidate`; the contract
drift map covers their declared response objects. The frontend architecture
guard rejects response object declarations in API client modules.

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

The frontend complexity guard covers `apps/app`, `components`, and `lib` with a
maximum cyclomatic complexity of 12 per function, 500 LOC per production
module, and 800 LOC per test module. The guard rejects relaxed defaults and
new or increased policy exceptions. New and refactored owners must meet those
defaults by decomposition; an exception is not an intended delivery outcome.

## Verification

Use the affected-owner workflow in [Development](DEVELOPMENT.md#repository-validation-harness).
Preserve the feature's meaningful authorization, API, loading/error,
accessibility and navigation coverage. Shared visual rules remain in
[Design](design.md), not class/font/pixel snapshots.
