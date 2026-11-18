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

The product Worker at `frontend/apps/app/worker.ts` serves Vite assets,
app-host API, browser MCP consent and guarded navigation. The marketing
Worker at `frontend/apps/marketing` builds every page at deploy time
(`output: 'static'`) and serves it as a free static asset: the full HTML that
search engines and AI crawlers read, without a Worker invocation per visit.
The shared chrome (navigation, cookie consent banner and the consent-gated
Google tag) is Astro markup with small module scripts in
`frontend/components/marketing/chrome/` and `frontend/components/analytics/`;
the page sections in `frontend/components/marketing/sections/` render to
static HTML. The navbar's ThemeSwitch is the one island every page hydrates;
other React islands hydrate only on pages with interactive tools, such as the
blog explorer, contact form, pricing and the free tools.
Only routes that read the request opt out with `prerender = false`: `/pricing`,
the contact intake and `/health`. The 404 page is prerendered so scanner
traffic never renders on demand (the free Workers plan stops a request past
10 ms of CPU). Astro serves that page without running middleware, so the
Worker entry (`apps/marketing/src/edge.ts`) runs first: it proxies only the
exact apex webhook path, keeps the retired research redirects and answers
`Accept: text/markdown` 404s with a Markdown body; the middleware only adds
headers to on-demand pages. A generated `_redirects` file sends each page's trailing-slash
variant to it with a 301. `/pricing`
reads the public catalog through protected origin transport without visitor
credentials. It serves a per-country copy from the edge cache for ten minutes
and the last good copy for up to seven days while the API is unreachable; with
no copy it answers 503 with `noindex`. Production delivery and acceptance remain
operator gated. The first release retains captured prior VM artifacts for a
bounded rollback; later frontend releases use accepted Worker versions.

The marketing Worker owns public `/contact` and its same-origin
`POST /api/v1/contact` intake. It validates bounded JSON, checks Origin and a
honeypot, applies native Cloudflare limits by trusted client IP and a
per-location burst cap, verifies a Cloudflare Turnstile token (action `contact`,
hostname from `TURNSTILE_HOSTNAMES`, single use) and only then sends escaped
HTML and plain text through Resend to
`contact@citeladder.com`, with the visitor email as Reply-To. It stores no
enquiries in the application database. The Resend key and
`TURNSTILE_SECRET_KEY` are runtime Worker secrets, and the intake fails closed
without either; the build check rejects output containing a Turnstile secret.
The public Turnstile site key is baked in at build. The marketing policy allows
the Turnstile origin for scripts and frames; only `/contact` loads it. Demo CTAs use `/contact`;
legacy Cube27 contact URLs from published billing catalogs resolve to this
intake without altering persisted catalogs. Cube27 product and legal identity
remain in the public chrome and policies. Successful submission analytics
require existing cookie consent and contain only the source page.

The product Worker runs before asset matching, so root, deep-link and direct
HTML responses all carry the same enforced Content Security Policy and
`no-cache` (revalidated, so the back-forward cache may keep the shell; bearer
links stay `no-store`, and API responses are always `private, no-store`).
Signing out sends `Clear-Site-Data: "cache"`, and a shell restored from the
back-forward cache re-checks its session. The policy reports to the API's
same-origin sink (`Reporting-Endpoints`, `report-to`), and a report-only policy
requires Trusted Types against the default policy in `lib/trusted-types.ts`;
neither is enforced yet. Every Worker response also carries the
`frontend/lib/config/security-headers.ts` Permissions-Policy and
`Cross-Origin-Opener-Policy: same-origin-allow-popups` (Razorpay's payment
popups keep their opener), and the product host adds
`Cross-Origin-Resource-Policy: same-origin`. Sign-in, registration and MCP
consent send no opener policy, because an MCP client's OAuth window passes
through them and must stay connected to its opener. The policy allows the Turnstile origin for scripts and frames, which
the sign-up and email-link forms load; the API, not the Worker, verifies their
tokens ([workspace access](workspace-access.md)), and the product build bakes
the public site key `PUBLIC_TURNSTILE_SITE_KEY` (Cloudflare's always-pass test
key when served locally or built for Compose). Fingerprinted resources retain
immutable caching. Marketing pages and
resources use Cloudflare asset delivery; unmatched routes reach the Worker.
Astro hashes compiled hydration scripts into the policy: prerendered pages carry
it as a `<meta>` element, and on-demand responses as a header that the marketing
middleware preserves or replaces with a restrictive fallback for proxy and error
responses. `scripts/check-marketing-worker-output.mjs` writes the static
`_headers` (X-Frame-Options, HSTS, nosniff, referrer policy, and month-long caching
for fonts and the favicon), because a meta policy cannot set `frame-ancestors`. Browser destinations live in
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

Supported browsers are the `browserslist` in `frontend/package.json`: Chrome
and Edge 123, Firefox 132, Safari and iOS Safari 17.5, and Samsung Internet 27
or newer (owner, 2026-11-13). Native popover needs iOS Safari 18.3, so no UI
may depend on it alone. The product build targets the same versions
(`apps/app/vite.config.ts`). `pnpm check:compat`
(`scripts/check-browser-compat.mjs`) fails when browser source calls a global,
static or well-known instance API that a matrix browser lacks, by MDN's
browser-compat-data, unless only optional chaining reads it; TypeScript's `lib`
covers JavaScript instance methods. Its stylesheet half
(`scripts/check-css-compat.mjs`) does the same for CSS at-rules, properties,
keyword values, functions and pseudo-classes, passing uses inside `@supports`
or after a fallback declaration, and enhancements it lists with what older
browsers show instead. On
an older browser the app's external `public/browser-support.js` fills the root
with an "Update your browser" notice before the shell runs, and `main.tsx` does
not mount.

## Routes and shared shell

### Public platform pages

The marketing content registry in `frontend/lib/marketing-content/nav.ts` owns
the published Platform labels, destinations and groups for desktop/mobile
navigation, footer, overview cards and sitemap. The Astro `/platform/[...slug]`
route admits only those published destinations; substantive narratives live in
`platform-pages.ts` and render on the server with the existing marketing primitives.
Product pages have their own metadata and WebPage/breadcrumb relationships to
the single CiteLadder software identity, plus FAQPage markup built from the FAQ
each page renders. Unknown or held capability paths return
404. The `/mcp` protocol endpoint and blocked former app roots remain unchanged.

Illustrative product excerpts are the `Screen*` components in
`frontend/components/marketing/screens/`, each shown in a `ProductFrame`: fixed-size
screens, scaled whole to fit the frame and never cropped, composed from
`components/ui`, drawn (no live controls) and filled from the
one synthetic dataset in `demo-data.ts`. They import no app runtime and are named
by the frame's label.
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

Canonical article paths, set in each article's frontmatter, use the site's
no-trailing-slash convention.

The citation destination retains its research body and a compact contextual link
to `/platform/cited-sources`; it no longer appends a full commercial page.
The guide and product page self-canonicalize separately. The existing measurement
destination retains the distinct share-of-appearances worked example. The older
`/blog/tracking-brand-visibility-ai-search` and `/check-ai-visibility` redirect
permanently to the measurement destination; `/blog/track-optimize-ai-citations`
redirects to citation tracking. Slash variants redirect permanently to the
canonical path. `public-routes.ts` is the one list of indexable pages: the
sitemap and `llms.txt` both read it, so a page listed in one is listed in the
other. It maps over the page records (`lib/marketing-content/pages.ts`, the
policies in `legal-documents.ts`, platform, comparison, tool, post and guide
records), each carrying its path, browser title, description and `updated`
date; `updated` is the sitemap `<lastmod>` the post-deploy IndexNow ping diffs,
so revise it with the page. Policies and root-level guides are served by one
`[slug].astro` route from those records. Trial and free-tool numbers in copy
come from `lib/config/public-trial.ts` and `lib/config/free-tools.ts`, and pages
pick product images from the screen catalogue
(`components/marketing/screens/screen-catalog.tsx`), never a `Screen*`
component directly.
Named competitor comparisons keep their separate product-versus-product intent.

Only the four linked public JSON inputs/templates are served from
`/research/citeladder-2026-10/` in `frontend/public`. Editorial handoff files and
local research notes are not public assets. Source review dates are visible
research metadata, never publication dates or sitemap `lastmod` values.
Each guide emits `Article` JSON-LD with the CiteLadder organization as author
and publisher and the visible review date as `dateModified`; it claims no person
author and no `datePublished` until approved publication metadata exists.
Breadcrumbs describe the visible navigation using the existing JSON-LD owner.

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

### App routes and the documentation site

Documentation content lives in `frontend/apps/docs/src/content` as Markdown.
Its validated metadata drives navigation, static routes, search and the sitemap.
The final navigation group is Updates, containing the changelog. Search runs
locally over a static index; it has no backend, session or provider dependency.
The MCP reference consumes the existing generated tool catalog. The former
marketing `/docs/mcp` page is removed and 301s to the docs MCP guide; all owned
links use the public docs origin.

One authenticated layout retains the session, query client, workspace/project
context and entitlement providers across app and onboarding navigation.
[Workspace access](workspace-access.md) owns selection precedence and identity
transitions. One route manifest (`lib/navigation/app-routes.ts`) declares every
app destination: its path, title, scope, mode, lazy screen, nav placements, the
collection a project switch lands on and whether its URL carries a credential.
The router, navigation, compact navigation, Command Palette, user menu, page
titles, workspace-only routes and mode homes all derive from it; UI visibility
never replaces backend authorization. The shell has two route-derived modes, Dashboard
and Agent. Dashboard navigation groups pages by the question they answer: Home
(Overview, Actions with its open and in-progress count), Brand, Tracking, Website,
Search and Commerce, then Integrations in the foot. A
destination is current on its path and every path below it, whatever tab the
screen shows; a destination that names a query parameter (a settings tab) also
needs it. Every destination and mode link goes to its front door; the app
remembers no previously opened screen (owner, 2026-11-16). The Agent mode's
navigation and its API modules load only in that mode.

Navigation names the document `Screen · Project · CiteLadder` from the
manifest's title, moves focus to the main region when the path changes (not
when a tab or filter changes), restores scroll per path and closes the compact
drawer. A project switch keeps the view parameters that mean the same thing in
every project (tab, range, engine, status and the Site Health catalog filters)
and drops the rest, because they can name the outgoing project's records. The
project route's content remounts on a switch, so no draft, filter or mutation
outcome held in component state carries into the next project.
Opening the app makes no external fetch: brand and competitor logos are looked
up after onboarding creates a project and after a project edit.

The Vite SPA preserves the authenticated shell while route content resolves.
`shell-fallback` is the neutral pre-session structure only; after
authentication, QueryState loading and recoverable gate notices render in the shell's
content pane. In-place refresh retains data with scoped progress rather than
collapsing the surface. Pointer or keyboard intent on a destination starts its
route chunk and warms its primary read under the destination's exact query key;
Overview warms its command center and layout together, then the reads of the
widgets that layout names. Command Palette warms the destination of its
highlighted row the same way. A prefetcher that files one read's answer under
another key (Website and Issues seed the crawl-keyed page from the
project-scoped newest-crawl read) still reads it through its own cache key, so
repeated intent joins one request. A read whose 404 means "nothing measured yet" (the
Visibility projection's `visibility_not_measured`, the latest Search Demand
snapshot) caches that answer as `null` rather than as an error, so a warmed
answer is not re-asked on mount. Metrics still being written
(`visibility_metrics_pending`) are their own "being prepared" state, and any
other 404 stays an error.
A cold load of an address naming only its project starts the same warm from the
route loader once the project resolves, beside the access, entitlement and Terms
reads; those gates still decide what renders. No shell provider prefetches
another screen's reads.

The build (`apps/app/vite.config.ts`, `output.codeSplitting`) emits React,
React Router and Zod as their own cache-stable vendor files and everything else
the entry reaches statically as one boot file; each screen is its own route
chunk, so a destination never downloads an unrelated screen. Heavy pieces a
screen does not draw on arrival load lazily inside space already reserved for
them: the execution evidence card (and its markdown renderer) inside the open
drawer, and the Actions count beside its navigation row. Charts are plain SVG
drawn by the screen's own chunk, with no chart library to load. `scripts/check-bundle-budget.mjs` holds the boot
bytes.

Route matching starts code downloads alongside session bootstrap. Pre-session
loading uses the neutral shell; authenticated route loading uses QueryState
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
fields. Application documents use `no-cache` and missing fingerprinted
assets return 404.
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
`lib/csv/read-file-text.ts`: it decodes strictly as UTF-8 and refuses any
other encoding, or a failed read, before anything is parsed or sent, with
guidance to save as CSV UTF-8. Prompt and product modules retain ownership of
their own CSV grammar, validation, preview columns, sample CSV download and
import mutations; every import offers a sample in the format it reads and
ignores a second submit while one is in flight. The shared layer must not make
domain validity decisions or post a domain payload.

### Event-stream mechanics

`lib/sse/frames.ts` owns raw Server-Sent Event frame splitting and parsing.
`lib/sse/use-event-stream.ts` owns the credentialed browser transport:
workspace and resumption headers, chunk decoding, cancellation, reconnect
backoff, and debounced invalidation delivery. Domain hooks retain event
classification and query invalidation ownership and never own a second stream
transport.

Streams accelerate polling-backed projections only. They never become a
client-side source of truth or construct rows from partial, replayed, or
unknown event payloads.

## Verification

Use the affected-owner workflow in [Development](DEVELOPMENT.md#repository-validation-harness).
Preserve the feature's meaningful authorization, API, loading/error,
accessibility and navigation coverage. Shared visual rules remain in
[Design](design.md), not class/font/pixel snapshots.
