# Frontend audit: performance

Paste everything below the line into the model, at the repository root.

---

You are a web-performance engineer auditing CiteLadder's three frontends from
source: the Vite + React Router product SPA (`app.citeladder.com`), the Astro
SSR marketing site (`citeladder.com`) and the static Astro docs site. Your
output is a findings report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/frontend-architecture.md` sections "Routes and shared shell" and
   "Server, URL and local state".

## Scope

- SPA: `frontend/apps/app/src/` (route modules `*-routes*.tsx`, `main.tsx`),
  `frontend/apps/app/vite.config.ts`, `frontend/components/`, `frontend/lib/`.
- Marketing: `frontend/apps/marketing/src/`, `frontend/components/marketing/`,
  `frontend/apps/marketing/astro.config.mjs`.
- Docs: `frontend/apps/docs/src/`.

## Hunt list

**Product SPA**

1. **Code splitting.** Route components imported eagerly into route modules
   instead of lazily; heavy libraries (charts, PDF, markdown, syntax
   highlighting, date libs, Radix bundles) imported from shared modules that
   every route loads; the Agent mode leaking into Dashboard bundles (the
   architecture doc says Agent modules load only in Agent mode).
2. **Request waterfalls.** Queries that wait on another query without a real
   data dependency; screens that do not start reads until entitlement resolves
   (the doc says authorized project reads start without waiting); prefetch
   keys that differ from the destination's query key (no cache hit).
3. **Over-fetching and polling.** `refetchInterval` left running after an
   operation reaches a terminal state or when the tab is hidden; polling plus
   SSE invalidation both firing for the same data; `staleTime: 0` on
   read-mostly data contrary to the configured freshness policy.
4. **Re-render cost.** Context providers whose `value` is a new object each
   render; large tables (crawl pages, links, prompts, answers) rendered without
   virtualization or pagination; expensive derivations in render without
   memoization; inline closures passed to memoized children in hot lists.
5. **Memory leaks.** Event listeners, intervals, observers, SSE streams or
   abort controllers not cleaned up on unmount.

**Marketing and docs (Core Web Vitals)**

6. **Hydration.** Astro islands using `client:load` where `client:visible`,
   `client:idle` or no hydration would do; whole sections hydrated for one
   interactive control.
7. **LCP.** Hero images/fonts not preloaded or prioritised; LCP image
   lazy-loaded; large unoptimised images; render-blocking CSS beyond critical.
8. **CLS.** Images, embeds and rotating elements without reserved dimensions;
   font swaps causing layout shift without matching fallback metrics.
9. **INP/TBT.** Heavy synchronous work on interaction; large client scripts;
   animations on layout properties instead of transform/opacity.

## Not a finding

- Cloudflare-injected scripts (Zaraz/GTM, Web Analytics) — not in the repo.
- Micro-optimisations without a user-visible effect; `useMemo` absence on
  cheap computations.

## Subagent split

- A: SPA bundling and code splitting (1).
- B: SPA data fetching, polling, prefetch (2, 3).
- C: SPA rendering and leaks (4, 5).
- D: marketing and docs (6–9).

## Output

Use the report format in `_contract.md`. State the expected user-visible
effect for each finding (for example "≈200 KB extra JS on first app load",
"extra request per poll tick", "CLS on hero").
