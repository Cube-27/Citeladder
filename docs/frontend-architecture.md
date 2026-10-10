# Frontend architecture

The frontend has three runtime owners: the marketing Worker serves Astro SSR and
public routes at `citeladder.com`; the product Worker serves the Vite/React
Router SPA at `app.citeladder.com`; the static documentation Worker serves Astro
pages at `docs.citeladder.com`. Local Compose runs the same three Workers under
`wrangler dev` on ports 3000, 3001 and 4322 for development and clean-clone smoke.
Together they project workspace-authorized
backend contracts. The frontend owns navigation, ephemeral state, accessible
interactions and presentation; the backend owns authorization, measurement and
lifecycle truth. [Design](design.md) is the sole visual contract. Feature
behavior is routed through [the documentation index](README.md).

The isolated `frontend/packages/mcp-app` entry reuses the product design primitives
and shared contracts inside an MCP host sandbox. Its single static HTML bundle is
packaged by the API image and served as an authenticated MCP resource; it does not
load the SPA shell or call browser API routes. Evidence reads use the host bridge,
with only ephemeral selection/context state. [MCP](mcp.md) owns its tools, switches
and client acceptance requirements.

The product Worker at `frontend/apps/app/worker.ts` serves Vite assets,
app-host API, browser MCP consent and guarded navigation. The marketing
Worker uses Astro SSR at `frontend/apps/marketing`, proxies only exact apex
protocol/webhook paths and reads the public catalog through protected origin
transport without visitor credentials. Production delivery and acceptance remain
operator gated. The first release retains captured prior VM artifacts for a
bounded rollback; later frontend releases use accepted Worker versions.

The marketing Worker owns public `/contact` and its same-origin
`POST /api/v1/contact` intake. It validates bounded JSON, checks Origin and a
honeypot, applies native Cloudflare limits by trusted client IP and aggregate
contact traffic, and sends escaped HTML and plain text through Resend to
`contact@citeladder.com`, with the visitor email as Reply-To. It stores no
enquiries in the application database. The Resend key is a runtime Worker
secret; no mail service enters the browser bundle. Demo CTAs use `/contact`;
legacy Cube27 contact URLs from published billing catalogs resolve to this
intake without altering persisted catalogs. Cube27 product and legal identity
remain in the public chrome and policies. Successful submission analytics
require existing cookie consent and contain only the source page.

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
The documentation Worker serves assets only, with no Worker script, so Astro emits its policy as a
`<meta>` element with the same script hashing; `X-Frame-Options` in its
`_headers` file denies framing because browsers ignore `frame-ancestors` there.

## Routes and shared shell

### Public platform pages

The marketing content registry in `frontend/lib/marketing-content/nav.ts` owns
the published Platform labels, destinations and groups for desktop/mobile
navigation, footer, overview cards and sitemap. The Astro `/platform/[...slug]`
route admits only those published destinations; substantive narratives live in
`platform-pages.ts` and render on the server with the existing marketing primitives.
Product pages have their own metadata and WebPage/breadcrumb relationships to
the single CiteLadder software identity. Unknown or held capability paths return
404. The `/mcp` protocol endpoint and blocked former app roots remain unchanged.

Illustrative product excerpts are coded views in
`frontend/components/marketing/scenes/product-views.tsx`; they use synthetic
records, import no app runtime and label their scope.
Editorial publication never grants access: Agent/content workflows use demo
CTAs, Commerce is project-dependent, and crawler analytics remains unpublished.
Signup CTAs continue to use the existing public-signup switch and app URL helper.

### Public research guides

Reviewed SEO articles live as Markdown under
`frontend/lib/marketing-content/blog-posts/research/`. The marketing
`research-articles.ts` catalog reads their frontmatter for titles, descriptions,
intent, canonical destinations, the resource listing and sitemap. The existing
React Markdown/GFM stack renders the complete bodies on the server without
hydration. `research-markdown.tsx` owns source-number anchors and focusable
table overflow; the public shell and type roles remain shared.

Canonical article paths use the site's no-trailing-slash convention:

| Reader need | Canonical destination |
| --- | --- |
| GEO introduction | `/generative-engine-optimization` |
| Check AI visibility | `/blog/verify-improve-ai-search-visibility` |
| Citation tracking | `/ai-citation-tracking` |
| Improve visibility | `/blog/how-to-improve-ai-visibility` |
| Platform shortlist | `/best-ai-visibility-platforms` |
| GEO versus SEO | `/blog/geo-vs-seo` |
| Citation reliability | `/blog/how-accurate-are-ai-citations` |
| AI and SEO outlook | `/blog/will-ai-replace-seo` |
| Reference discovery | `/blog/can-chatgpt-find-citations` |

The citation destination retains its research body and a compact contextual link
to `/platform/citation-intelligence`; it no longer appends a full commercial page.
The guide and product page self-canonicalize separately. The existing measurement
destination retains the distinct share-of-appearances worked example. The older
`/blog/tracking-brand-visibility-ai-search` and `/check-ai-visibility` redirect
permanently to the measurement destination; `/blog/track-optimize-ai-citations`
redirects to citation tracking. The middleware also redirects article slash
variants, preserving query parameters after the existing host/protocol gate.
Named competitor comparisons keep their separate product-versus-product intent.

Only the four linked public JSON inputs/templates are served from
`/research/citeladder-2026-10/` in `frontend/public`. Editorial handoff files and
local research notes are not public assets. Source review dates are visible
research metadata, never publication dates or sitemap `lastmod` values.
Authorship and actual publication metadata must be approved before publication;
new Article markup is deferred while those details are absent. Breadcrumbs
describe the visible navigation using the existing JSON-LD owner.

### Public browser tools

The marketing `/tools` hub links to six server-rendered `/tools/:slug` pages:
crawler rules testing, robots.txt generation, meta/directive inspection,
structured data generation, sitemap comparison and social previews. These are
browser-only utilities over bounded pasted inputs and local files; they do not
fetch sites, call providers, persist results or put submissions in URLs.
The existing crawler catalog supplies public bot metadata and rules use the same
`robots-parser` dependency as acquisition. Tool metadata lives in
`lib/marketing-content/tools.ts`, browser admission in `lib/config/free-tools.ts`,
and local transformations in `lib/free-tools/`. These reports are not persisted
Site Health evidence or claims of live access, indexability or citation eligibility.
Social previews read local raster images; published image URLs only enter exported
markup. Sitemap indexes compare declared child sitemap addresses without recursion.

| Surface | Browser location | Feature owner |
|---|---|---|
| Overview and company facts | /projects | [Onboarding](onboarding.md) |
| Website and issues | /site, /issues | [Site Health](site-health.md) |
| Search Demand, Search Intelligence, Performance | /demand, /search-intelligence, /performance | [Connected data](integrations-traffic-analytics.md) |
| AI Traffic: Overview, Crawlers, Referrals, Activity | /ai-traffic | [AI Traffic](ai-traffic.md) |
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
transitions. Navigation, compact navigation and Command Palette share one
destination registry (`components/layout/nav-items.ts`); UI visibility never
replaces backend authorization. The shell has two route-derived modes, Dashboard
and Agent. Dashboard navigation follows the product loop: Overview, Analyze,
Act (Actions with its open and in-progress count), Track, then Integrations. A
destination is current on its path and every path below it, whatever tab the
screen shows; a destination that names a query parameter (a settings tab) also
needs it. The mode switch returns to the last route used in each mode for the
project during the browser session; the Agent mode's navigation and its API
modules load only in that mode.

Navigation names the document `Screen · Project · CiteLadder` from
`page-titles.ts`, moves focus to the main region when the path changes (not
when a tab or filter changes), restores scroll per path and closes the compact
drawer. A project switch keeps the view parameters that mean the same thing in
every project (tab, range, engine, status and the Site Health catalog filters)
and drops the rest, because they can name the outgoing project's records.
Opening the app makes no external fetch: brand and competitor logos are looked
up after onboarding creates a project and after a project edit.

The Vite SPA preserves the authenticated shell while route content resolves.
`shell-fallback` is the neutral pre-session structure only; after
authentication, PageLoading and recoverable gate notices render in the shell's
content pane. In-place refresh retains data with scoped progress rather than
collapsing the surface. Pointer or keyboard intent on a destination starts its
route chunk and warms its primary read under the destination's exact query key.

Route matching starts code downloads alongside session bootstrap. Pre-session
loading uses the neutral shell; authenticated route loading uses PageLoading
inside the persistent shell. A screen that fails to render, including a replaced
build chunk, shows Reload and Go to Overview inside the shell; an unknown app
address shows a not-found screen there. Failures before the shell mounts offer a
document reload. Once a project is authorized, its screen reads start without waiting for
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
fields. Application documents use `no-store` and missing fingerprinted
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
| Pagination (`Pager`) | `frontend/components/ui/pager.tsx` |
| Date field and calendar | `frontend/components/ui/date-field.tsx`, `frontend/components/ui/calendar.tsx` |
| Avatar, Disclosure, Donut chart | `avatar.tsx`, `disclosure.tsx`, `donut-chart.tsx` |
| Command palette, Market Select, CSV import | Existing shared and feature owners |
| Resizable workspaces | Existing feature owners |
| Color controls, OTP, sliders | No current product use |

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
| AI Traffic | `components/ai-traffic/ai-traffic-screen.tsx` owns URL tabs, scoped queries, verification filters and cursor tables | `crawl-log-connections.tsx` owns source setup and local streaming uploads; `referrals-screen.tsx` preserves referral controls and measurements |
| Onboarding | `components/onboarding/onboarding-screen.tsx` selects the active stage and actions | `onboarding-flow.ts` owns transaction state, stage owners render domain UI, and `components/auth/flow-shell.tsx` owns shared auth/onboarding chrome |
| Projects dashboard | `components/projects/dashboard-screen.tsx` owns query gates and project context | dashboard controls, primitives, sections, and command-center action hook own reusable UI and mutations |
| Performance | `components/performance/performance-screen.tsx` owns project/range/compare selection and the range-projection hand-off | date-range dialog, metric cards, chart, dimension table, and synchronization hook own their scoped behavior |
| Site Health URL detail | `components/site-health/url-detail.tsx` owns query/rerun control and polling | `url-detail-view.tsx` owns the persisted-detail presentation; `internal-links-card.tsx` owns the link-metric section |
| Site Health architecture | `components/site-health/architecture-panel.tsx` owns the projection query, page-kind rows, and persisted link/depth summaries | — |
| Commerce, prompts, providers, and marketing previews | Existing public panels and dialogs remain their caller-facing owners | small view, cell, topic, preview, and message-bus modules own discrete presentation or local interaction regions |

### API response schemas

The zod response contracts are the `@citeladder/contracts` workspace package
(`frontend/packages/contracts`), shared with the TypeScript API service. Import
the package entry or a subpath (`@citeladder/contracts/project`); API client
modules never declare response objects themselves.

`packages/contracts/src/site-health.ts` is the stable Site Health schema
facade. The package entry re-exports that facade, so API
consumers retain their existing import boundary and inferred Zod schema names.
Focused modules under `src/site-health/` own crawl lifecycle,
dashboard/change/readiness, observed architecture, inventory, issues, page
detail, pagination, and shared schema primitives. Do not import a focused file from a feature solely to
avoid the facade; move a genuinely shared primitive into the focused schema
folder and re-export it through the facade.

Demand Intelligence and Search Intelligence response schemas
likewise live in the package and are re-exported by its entry. API clients validate through `strictValidate`; the contract
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
