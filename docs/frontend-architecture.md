# Frontend architecture

The frontend has three runtime owners: the marketing Worker serves prerendered
Astro pages and a few on-demand routes at `citeladder.com`; the product Worker serves the Vite/React
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

The marketing Worker builds every page at deploy time (`output: 'static'`) and
serves it as a free static asset, so search engines and AI crawlers read full
HTML without a Worker invocation per visit. Only routes that read the request
opt out with `prerender = false`: `/pricing`, the contact intake and `/health`.
The 404 page is prerendered so scanner traffic never renders on demand (the
free Workers plan stops a request past 10 ms of CPU). Astro serves that page
without running middleware, so the Worker entry (`apps/marketing/src/edge.ts`)
runs first; the middleware only adds headers to on-demand pages. `/pricing`
reads the public catalog through protected origin transport without visitor
credentials. It serves a per-country copy from the edge cache for ten minutes
and the last good copy for up to seven days while the API is unreachable; with
no copy it answers 503 with `noindex`.

The marketing Worker owns public `/contact` and its same-origin
`POST /api/v1/contact` intake. It verifies a Cloudflare Turnstile token (action
`contact`, hostname from `TURNSTILE_HOSTNAMES`, single use) and only then sends
mail through Resend. It stores no enquiries in the application database, and the
intake fails closed without its Resend key and `TURNSTILE_SECRET_KEY` (runtime
Worker secrets; the build check rejects output containing one). Legacy Cube27
contact URLs from published billing catalogs resolve to this intake without
altering persisted catalogs. Successful-submission analytics require existing
cookie consent and contain only the source page.

The product Worker runs before asset matching, so root, deep-link and direct
HTML responses all carry the same enforced Content Security Policy and
`no-cache` (revalidated, so the back-forward cache may keep the shell; bearer
links stay `no-store`, and API responses are always `private, no-store`).
Signing out sends `Clear-Site-Data: "cache"`, and a shell restored from the
back-forward cache re-checks its session. The policy reports to the API's
same-origin sink, and a report-only policy requires Trusted Types against the
default policy in `lib/trusted-types.ts`; neither is enforced yet. Every Worker
response also carries the `frontend/lib/config/security-headers.ts`
Permissions-Policy and `Cross-Origin-Opener-Policy: same-origin-allow-popups`
(Razorpay's payment popups keep their opener). Sign-in, registration and MCP
consent send no opener policy, because an MCP client's OAuth window passes
through them and must stay connected to its opener. The policy allows the
Turnstile origin for scripts and frames, which the sign-up and email-link forms
load; the API, not the Worker, verifies their tokens
([workspace access](workspace-access.md)).
Astro hashes compiled hydration scripts into the policy: prerendered pages carry
it as a `<meta>` element, and on-demand responses as a header that the marketing
middleware preserves or replaces with a restrictive fallback.
`scripts/check-marketing-worker-output.mjs` writes the static `_headers`,
because a meta policy cannot set `frame-ancestors`. Browser destinations live in
`frontend/lib/config/content-security-policy.ts`; inline script and eval are
not enabled. The documentation Worker serves assets only, so its policy is a
`<meta>` element and `X-Frame-Options` in its `_headers` denies framing.

Supported browsers are the `browserslist` in `frontend/package.json`: Chrome
and Edge 123, Firefox 132, Safari and iOS Safari 17.5, and Samsung Internet 27
or newer (owner, 2026-11-13). Native popover needs iOS Safari 18.3, so no UI
may depend on it alone. The product build targets the same versions
(`apps/app/vite.config.ts`). `pnpm check:compat` fails when browser source uses
an API or CSS feature a matrix browser lacks. On an older browser the app's
external `public/browser-support.js` fills the root with an "Update your
browser" notice before the shell runs, and `main.tsx` does not mount.

## Routes and shared shell

### Public pages

Marketing content registries under `frontend/lib/marketing-content/` own the
published Platform pages, tools and policies; the Astro routes admit only
registered destinations and unknown or held capability paths return 404.
`public-routes.ts` (`apps/marketing/src`) is the one list of indexable pages:
the sitemap and `llms.txt` both read it, so a page listed in one is listed in
the other. Each page record carries a path, browser title, description and
`updated` date; `updated` is the sitemap `<lastmod>` the post-deploy IndexNow
ping diffs, so revise it with the page. Trial and free-tool numbers in copy come
from `lib/config/public-trial.ts` and `lib/config/free-tools.ts`, and pages pick
product images from the screen catalogue
(`components/marketing/screens/screen-catalog.tsx`), never a `Screen*`
component directly.

Illustrative product excerpts are the `Screen*` components, each shown in a
`ProductFrame`: fixed-size screens, scaled whole to fit the frame and never
cropped, composed from `components/ui`, drawn (no live controls) and filled from
the one synthetic dataset in `demo-data.ts`. They import no app runtime.

Research guides are Markdown under
`frontend/lib/marketing-content/blog-posts/research/`, read by
`apps/marketing/src/research-articles.ts` and rendered on the server by
`components/marketing/content/prose-markdown.tsx`. Canonical paths use the
site's no-trailing-slash convention; slash variants redirect permanently.
Guides emit `Article` JSON-LD through `lib/seo/json-ld.ts` from frontmatter.
Source review dates are visible research metadata, never publication dates or
sitemap `lastmod` values. Editorial handoff files and local research notes are
not public assets. The browser tools under `/tools` are browser-only utilities
over bounded pasted input: they fetch no sites, call no providers and persist
nothing, and their reports are not Site Health evidence.

### App routes

Documentation content lives in `frontend/apps/docs/src/content` as Markdown;
its validated metadata drives navigation, routes, search and the sitemap. The
former marketing `/docs/mcp` page 301s to the docs MCP guide.

One authenticated layout retains the session, query client, workspace/project
context and entitlement providers across app and onboarding navigation.
[Workspace access](workspace-access.md) owns selection precedence and identity
transitions. One route manifest (`lib/navigation/app-routes.ts`) declares every
app destination: its path, title, scope, mode, lazy screen, nav placements, the
collection a project switch lands on and whether its URL carries a credential.
The router, navigation, compact navigation, Command Palette, user menu, page
titles, workspace-only routes and mode homes all derive from it; UI visibility
never replaces backend authorization. The shell has two route-derived modes,
Dashboard and Agent; the Agent mode's navigation and API modules load only in
that mode. A destination is current on its path and every path below it,
whatever tab the screen shows; a destination that names a query parameter (a
settings tab) also needs it. Every destination and mode link goes to its front
door; the app remembers no previously opened screen (owner, 2026-11-16).

Navigation names the document `Screen · Project · CiteLadder` from the
manifest's title, moves focus to the main region when the path changes (not
when a tab or filter changes), restores scroll per path and closes the compact
drawer. A project switch keeps the view parameters that mean the same thing in
every project (tab, range, engine, status and the Site Health catalog filters)
and drops the rest, because they can name the outgoing project's records. The
project route's content remounts on a switch, so no draft, filter or mutation
outcome held in component state carries into the next project. Opening the app
makes no external fetch: brand and competitor logos are looked up after
onboarding creates a project and after a project edit.

The SPA preserves the authenticated shell while route content resolves: after
authentication, QueryState loading and recoverable gate notices render in the
shell's content pane, and an in-place refresh retains data with scoped progress
rather than collapsing the surface. Before the session resolves, `ShellFallback`
(`components/layout/shell-fallback.tsx`) draws the sidebar, route-titled
masthead and page skeleton from the route manifest. It renders on every path,
flow routes included, which breaks the rule that a flow route draws only its own
frame; that is a defect, tracked in
[engineering guidelines](engineering-guidelines.md#flow-routes-never-draw-the-app-shell).

Pointer or keyboard intent on a destination starts its route chunk and warms its
primary read under the destination's exact query key; Overview warms its command
center and layout together, then the reads of the widgets that layout names.
Command Palette warms the highlighted row's destination the same way. A
prefetcher that files one read's answer under another key (Website and Issues
seed the crawl-keyed page from the project-scoped newest-crawl read) still reads
it through its own cache key, so repeated intent joins one request. A read whose
404 means "nothing measured yet" (the Visibility projection's
`visibility_not_measured`, the latest Search Demand snapshot) caches that answer
as `null` rather than as an error, so a warmed answer is not re-asked on mount.
Metrics still being written (`visibility_metrics_pending`) are their own "being
prepared" state, and any other 404 stays an error. A cold load of an address
naming only its project starts the same warm from the route loader once the
project resolves, beside the access, entitlement and Terms reads; those gates
still decide what renders. No shell provider prefetches another screen's reads.

Route matching starts code downloads alongside session bootstrap. A screen that
fails to render, including a replaced build chunk, shows Reload and Go to
Overview inside the shell; an unknown app address shows a not-found screen
there. Failures before the shell mounts offer a document reload. Once a project
is authorized, its screen reads start without waiting for entitlement.
Empty-workspace onboarding still waits for the allowance decision, and
capability-specific controls retain their own entitlement gates. The session,
membership, selected-project and entitlement reads use a shorter browser timeout
so stalled bootstrap requests reach the existing retry notices.

## Server, URL and local state

Browser APIs use relative `/api/v1`, and the product Worker sends them through
the shared authenticated origin transport. Marketing navigation uses direct
app-origin links; the public pricing HTML is rendered from a validated catalog
response and selection links carry only bounded public fields. Application
documents use `no-cache` and missing fingerprinted assets return 404.
Each domain has one API module and query-key owner. Workspace/project identity
belongs in both requests and cache keys. Retained placeholder data may survive
filter/pagination changes only within the same owning project/crawl. A
cursor-paged table reads through `useCursorTableQuery`
(`lib/table/use-cursor-table-query.ts`): it owns the cursor stack, keeps the
previous page only within the same workspace and project, and returns the `DataTable` state, busy and
pager props, so screens do not rebuild them. Its key therefore holds the
workspace; a read waiting on a prerequisite passes `enabled`, and a persisted
exact count passes `total` so the pager and a full page are reserved from the
first frame.

Typed shareable tabs, filters, cursors and selected IDs belong to
`lib/navigation/url-state.ts`, with explicit push/replace semantics. Component
state owns ephemeral drafts and interactions. Read-mostly queries use the
configured freshness/retention policy; explicit polling remains authoritative
for active operations. Events accelerate projection invalidation, never replace
persisted truth: streams (`lib/sse/`) accelerate polling-backed projections
only, and never construct rows from partial, replayed or unknown event
payloads. Domain hooks own event classification and invalidation and never a
second stream transport. No screen substitutes mock data or computes a backend
metric.

User-facing timestamps use a resolved display timezone passed to the shared
formatter in `frontend/lib/format.ts`; API values remain UTC, and date-only
measurement buckets retain their calendar day. Account settings store a
device-local choice (Auto, UTC, or a named IANA zone) in a same-origin preference
cookie. Auto resolves the browser zone once per app load and falls back to UTC
when unavailable. Server rendering uses UTC unless an explicit cookie zone is
available; it never infers a browser zone.
New chat reads typed evidence handoffs from its URL through
`lib/agent/handoff.ts`; the URL carries identifiers and an optional prompt,
never evidence content.

## Component capability and technical ownership

Shared UI capabilities have one owner under `frontend/components/ui/`. Their
technical contracts and state responsibilities live here; visual values and
interaction recipes live only in [`design.md`](design.md). Read states map one
query to loading, read error, not measured or empty through `QueryState`, so a
pending, failed or unmeasured read never renders as zero or "no data".
Browser error reports follow the
[API error contract](api-error-contract.md#6-browser-error-reports).

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

A screen entry point coordinates route context, server-state hooks, mutations, and
transient UI state. It delegates cohesive visual regions, domain-specific
formatting, and interaction mechanics to focused sibling owners. A split must
preserve one public entry point for callers; consumers must not compose a
screen from its internal presentation files.

### API response schemas

The zod response contracts are the `@citeladder/contracts` workspace package
(`frontend/packages/contracts`), shared with the TypeScript API service. Import
the package entry or a subpath (`@citeladder/contracts/project`); API client
modules never declare response objects themselves, and validate through
`strictValidate`. The frontend architecture guard rejects response object
declarations in API client modules. `packages/contracts/src/site-health.ts` is
the stable Site Health schema facade: do not import a focused file under
`src/site-health/` from a feature to avoid it; move a genuinely shared
primitive into the focused folder and re-export it through the facade.

### CSV import

`components/ui/csv-import.tsx` owns the reusable trigger and dialog shell and
`lib/csv/read-file-text.ts` the file text loading, which decodes strictly as
UTF-8 and refuses any other encoding, or a failed read, before anything is
parsed or sent. Prompt and product modules own their CSV grammar, validation,
preview columns, sample CSV and import mutations; every import offers a sample
in the format it reads and ignores a second submit while one is in flight. The
shared layer makes no domain validity decisions and posts no domain payload.
