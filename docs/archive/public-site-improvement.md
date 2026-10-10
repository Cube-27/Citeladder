# Public site and documentation site improvement plan

**Status:** audited and implemented 2026-10-10 in one PR.

Feature 16 of the [feature review tracker](feature-review-tracker.md): the
marketing Worker at `frontend/apps/marketing` (with `components/marketing`,
`lib/marketing-content` structure, `lib/seo`, `components/analytics`) and the
static documentation Worker at `frontend/apps/docs`. Marketing copy is out of
scope unless the owner authorizes a specific change; findings that touch copy
are listed as decisions, not edits. Shipped behaviour belongs to
[frontend architecture](../frontend-architecture.md) and [design](../design.md).

## Context

Live evidence (read-only GETs, 2026-10-10, Marseille edge):

- Every marketing page is rendered by the Worker on every request:
  `output: 'server'` and no page declares `prerender`. HTML carries
  `max-age=0, must-revalidate` and no `CF-Cache-Status`; Server-Timing shows
  `cfWorker` about 30 ms. Docs pages are static assets and edge `HIT`.
- First load is about 250–330 KB. Every marketing page ships about 99 KB of
  JavaScript (React runtime 67 KB, nav island, `button` chunk with
  tailwind-merge 13.5 KB, cookie banner). The homepage adds about 55 KB because
  the whole `LandingPage` hydrates with `client:load`. The blog index adds about
  80 KB (every post body plus zod).
- `/pricing` shows "Plans are temporarily unavailable": it calls Cloud Run on
  every view with `no-store`, and production Cloud Run is down from the closed
  billing account (feature 14). Even when it is up, the API scales to zero, so
  a cold start can exceed the 3 s catalog timeout.
- `/pricing/` and `/blog/` return 200 duplicates; missing paths, `/favicon.ico`
  and `/apple-touch-icon.png` render an 84 KB HTML 404 in the Worker.
- Fonts and the favicon are `max-age=0` and preloaded on every page.
- Production has no GA measurement ID, so the in-repo GA island is not
  rendered. Only the cookieless Cloudflare Web Analytics beacon loads. The
  Google Tag Gateway (`/e80f/`) did not appear in fetched HTML; re-check in a
  real browser.

## Findings

### Performance and cost

1. **Every public page costs a Worker request and nothing is edge-cached.**
   Only `/pricing` (country header, `?byok`, catalog fetch) and the
   proxy/contact routes read the request. Static assets are free and do not count
   toward the 100k requests/day free-tier cap; Worker SSR does, with a 10 ms CPU
   limit. Crawlers and AI agents (robots.txt invites eleven) all spend that quota.
   `robots.txt`, `sitemap.xml`, `llms.txt` and the manifest are SSR too.
2. **`/pricing` wakes Cloud Run and the e2-micro database on every view**
   (`pricing.astro:12-18`, `public-catalog.ts:21-43`), and its fallback is an
   indexable 200 page.
3. **Homepage hydrates the entire landing page** (`index.astro:16`), whose
   only state is the tour tab (`landing-page.tsx:112`). It imports capability
   and FAQ components from `pages/platform`, which pulls in Radix and
   floating-ui (`menu-variants`, 57 KB raw).
4. **Blog index island ships all post bodies and zod**
   (`components/marketing/pages/blog.tsx`, `lib/marketing-content/blog*.ts`).
5. **React ships to every page for chrome alone** (nav island and cookie
   banner `client:load`). The same applies to docs `DocsSearch`, which loads on
   page load but is only needed when search opens.
6. **Duplicate trailing-slash URLs and full-page 404s for asset probes.**
7. **Fonts and favicon revalidate on every page**; docs `_headers` merges
   `max-age=0, must-revalidate` into the immutable `/_astro/*` rule
   (`apps/docs/public/_headers:6-8`), producing a contradictory header.
8. **Marketing and the app share `frontend/public`** (`astro.config.mjs:42`,
   `apps/app/vite.config.ts`), so each host publishes the other's assets and
   marketing cannot have its own `_headers`.
9. **One render-blocking 171 KB (raw) stylesheet** on every page: the layout
   imports commerce, content and editorial page CSS globally.

### Logic and correctness

10. **The GA stub pushes arrays** (`google-analytics.tsx:121`); gtag.js only
    processes `arguments` objects, so consent updates, `config` and every
    conversion event would be dropped once a measurement ID is configured. The
    tests assert the array shape (`google-analytics.test.tsx:117-128,188`).
11. **The layout's JSON-LD escape is a no-op** (`MarketingLayout.astro:66`,
    `'<'` is `<`); `lib/seo/json-ld.ts` already has the correct
    `serializeJsonLd`.
12. **Contact limits exceed the mail provider's quota.** 5/min per IP is about
    7,200 mails a day from one address; the "aggregate" burst limiter is
    per-location, not global (`wrangler.jsonc`, `contact-request.ts:80-84`).
    There is no challenge or daily cap.
13. **robots.txt and the apex route keep different retired-path lists**
    (`robots.txt.ts:3-18`, `apex-route.ts:18-37`). Disallowing a path that
    already 404s hides the 404 from Google.
14. **Plain `http://` gets an empty 404** from the Worker
    (`apex-route.ts:207-209`); it only works today because the zone redirects.
15. **App and website origins have two sources each**: build-time defines for
    nav links, runtime vars for pricing CTAs (`app-link.ts:5`, `worker-env.ts:11`).
    Docs hard-codes both (`DocsLayout.astro:54-73`).
16. **`llms.txt` omits the nine research guides, `/tools` and its six pages and
    `/ai-search-share-of-voice`**, and hard-codes the host (`llms.ts:55-91`).
    Sitemap and llms.txt have separate lists.
17. **Blog index JSON-LD lists 5 of the 14 items the page shows**
    (`blog/index.astro:11`); research guides and `/blog` have no sitemap
    `lastmod` although `reviewed_at` and a `dateModified` exist.
18. **The crawl-log Worker template has no freshness check.** It is generated
    (`crawl:worker`) and current today, but `quality.mjs` checks only the MCP
    reference, so a new crawler would silently miss customers' Workers.
19. **Dead code**: marketing `/health` (no caller), `IconButtonLink` (test-only),
    exported `PlatformActions`, the docs nav icon fallback, and three copies of the
    `mcp/tools` special case.

### Usability

20. **Docs describe retired or wrong behaviour** (verified against code and
    owner docs):

    | Page | Says | Shipped |
    |---|---|---|
    | `quickstart.md:20,52` | Prompts appear after an initial portfolio generates | Onboarding creates no prompts; the user generates or adds them |
    | `visibility.md:26` | A "Recommendation" observation | Visibility (mention rate), Share of voice, Owned citation rate, Average position; engines never named |
    | `sources.md:33,39`, `agent/actions.md:49` | Earned Actions check placement or discrepancy on the publisher page | One earned Action (competitors listed, you absent), measured on the prompts that cite the page |
    | `agent/actions.md:45-47` | One 30-day window | Keyword-presence checks run 90 days and are missing from the list |
    | `site-health.md:12,31,33` | Scores use every determinate check; "selected cohort" | Only scored checks move a score; the cohort is the monitored set |
    | `performance.md:14` | Search Console and GA4 | Bing ships too |
    | `mcp.md:22,30`, `mcp/examples.md:82`, `mcp/tools.md:16,36` | "Agent-only Action reads", "opportunities", `search` finds any record, `open_analytics` opens analytics | Shared catalogue, Actions, `search` finds projects/Actions/prompts, `open_analytics` opens the project picker |
    | `changelog.md` | Last entry 26 September | Ten features shipped 7–10 October |

21. **Bare 404s**: unknown `/tools/*` and `/platform/*` return plain text;
    missing blog posts and comparisons render a lone heading without the
    recovery links `404.astro` has.
22. **Navigation accessibility**: Escape after a hover-opened panel steals
    focus from any field on the page (`nav.tsx:171,222-232`); the mobile sheet
    does not contain focus (`nav.tsx:298-322`); new-tab links have no
    screen-reader cue and first-party docs links drop the referrer
    (`nav-items.tsx:47-58`).
23. **Social titles keep "| CiteLadder"** on most pages because the layout strips
    only " · CiteLadder" (`MarketingLayout.astro:57-59`).
24. **The manifest claims `standalone` with only an `.ico` icon**, which is not
    installable.

### Visibility and traffic impact

25. **Engine claims disagree across surfaces** (copy, owner item): `llms.ts:46`,
    `enterprise.tsx:109` and `legal.ts:204` name three engines; the homepage
    and platform pages name four. `llms.ts:59-63` has an empty "Engines measured
    directly" heading. llms.txt is the file written for AI engines.
26. Findings 1, 2, 16 and 17 also affect how crawlers and AI engines read the
    site: pricing can be indexed as unavailable, and llms.txt hides most guides.

### Checked and fine

Contact intake (CRLF rejection, escaping, strict schema, Origin, honeypot,
fail-closed limits, idempotency); the apex proxy forwards only exact protocol and
webhook paths; CSP is hashed with no inline or eval script; consent gating in code;
`/_astro/*` immutable on marketing; free tools are browser-only; sitemap covers
every routable page once with matching canonicals; internal and docs links
resolve; the MCP reference is generated and drift-checked; the crawl-log
template matches today's catalogue; docs search loads its index lazily.

## Owner decisions (answered 2026-10-10)

1. **Static by default: yes.** Prerendered pages are the same full HTML crawlers
   and agents read, served free from the edge. Only routes that read the request
   stay on demand: `/pricing`, the contact intake, `/health` and the
   Markdown-negotiating 404.
2. **Pricing: delegated.** Pricing is not enabled yet. The Worker keeps the page
   on demand and caches the catalog per country (10 minutes fresh, last good
   copy for 7 days); with no copy the page answers 503 with `noindex`.
3. **Contact: Turnstile and tighter limits.** The owner created the widget (site
   key `0x4AAAAAAFS7i6wNJ4sAbY-8`). Cloudflare rate-limit bindings only accept
   10 or 60 second periods, so the per-IP limit is 2 a minute instead of 3 per
   10 minutes; Turnstile carries the rest.
4. **Copy: approved** for docs corrections and October changelog entries,
   llms.txt coverage and its engine list, the three-engine claims (Enterprise and
   the AI policy) and social metadata.
5. **UX addition:** faster pages (only the homepage tour and the blog explorer
   hydrate; nothing per visit runs in the Worker) and docs that describe the
   shipped product.

## Shipped

- Findings 1, 2, 3, 4, 6 (slash variants answer 301 from a generated `_redirects`; missing slugs reach
  the real 404 page), 7, 10, 11, 12, 13, 16, 17 (ItemList only; see below), 18,
  19 (`IconButtonLink`, docs nav and `mcp/tools` duplication), 20, 21, 22, 23,
  24 and 25.
- A test file under `pages/` was being served as the route `/robots.test`; it
  moved beside the code.
- Docs: `_headers` no longer merges `max-age=0` into immutable assets, fonts
  cache for a month, docs links follow the configured origins, and the crawl-log
  Worker template has a `--check` gate in `quality.mjs`.

## Declined or deferred

- **Finding 17, `lastmod` from `reviewed_at`:** declined. Review dates describe
  the sources, not publication, by an earlier documented decision.
- **Finding 5, React-free chrome:** deferred to the backlog. The nav and cookie
  banner still ship React (about 94 KB gzip per page); the cookie banner now
  hydrates at idle.
- **Finding 8, separate public directories:** declined. Fonts and brand marks are
  shared and delivery pulls fonts into one directory; the marketing `_headers`
  is generated at build instead.
- **Finding 9, per-page CSS:** deferred; the stylesheet is cached immutable.
- **Finding 14, http to https:** declined; the zone redirects before the Worker.
- **Finding 15, pricing app origin:** deferred until pricing is enabled.
- **`PlatformActions` export:** kept; it has callers and a behavioural test.
- **llms.txt said general crawler-log ingestion was unavailable:** corrected on
  the owner's request; it now says crawler analytics need the site's own logs.

## Test changes

Added: the sitemap and llms.txt list the same pages; the edge-cached catalog and
its stale fallback; Turnstile verification (missing, replayed, wrong action,
wrong hostname, missing secret); gtag commands are `arguments` objects; the blog
ItemList; a hover-opened menu keeps focus in a page field; the mobile menu makes
the page inert. Removed: two llms.txt text-match tests and the `IconButtonLink`
test (retired component), the vacuous catalog credentials test, and copy-bound
assertions in `e2e/docs.spec.ts`.
