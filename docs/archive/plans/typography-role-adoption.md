# Typography role adoption — deferred debt

> Retired from the working queue by the owner. Historical scope and evidence
> follow; imperatives below do not authorize execution or establish acceptance.
> Current owners are listed in [the documentation index](../../README.md).

> Status: **not started — deliberately deferred.** Recorded during the UI
> consolidation pass so the measurement is not lost. Nothing here is a shipped
> contract; [`design.md`](../../design.md) remains the visual authority.

## The finding

`components/ui/typography.tsx` owns a closed set of product text roles, and it
is good. Adoption is the problem, not the system:

| Measure | Count |
| --- | --- |
| `textRole(...)` call sites (app UI) | 271 |
| Raw size utilities (`text-xs`…`text-3xl`), app UI excluding marketing | 407 |
| `text-sm` + `text-secondary` pairs (≈ the `body` role) | 78 |
| `text-xs` + `text-muted` pairs (≈ the `meta` role) | 152 |

Marketing carries a further 110 raw utilities and is correctly out of scope: it
owns a separate ladder by design.

## Why this was not done in the consolidation pass

A find-and-replace is **not** safe here, and the counts hide the reason.

The `meta` role is `text-xs font-medium text-muted` — **medium weight**. The 152
`text-xs text-muted` sites are weight 400. Swapping them to `meta` would silently
bolden 152 places across the authenticated app. That is a visual change to every
timestamp, count and footnote in the product, not a consolidation, and it is
exactly the churn the pass was scoped to avoid.

Exact-duplicate counts, measured:

- `className="text-muted text-xs font-medium"` (true `meta` duplicates): **0**
- `className="text-secondary text-sm"` (true `body` duplicates): **37**

So only 37 of 407 sites are mechanically substitutable with no visual change.

## How to do it properly

Per role, not per file, and never as one commit:

1. **`body` (37 exact sites).** Lowest risk: identical classes, no weight
   change, no layout classes entangled. Safe to do first and independently.
2. **`meta` (152 sites).** Requires a decision BEFORE any edit: either accept
   that metadata moves to weight 500 (a real, intended visual change, reviewed
   as such), or add a 400-weight metadata role and map these to it. Do not
   start until that choice is made and recorded in `design.md`.
3. **Everything else** (`text-lg`/`base`/`xl`/`2xl`/`3xl`, 19 sites). Small
   enough to inspect individually; several are legitimate exceptions.

Each step wants its own review, because the diff is large and visually
load-bearing while the behavior is unchanged — the reviewer is checking
rendering, not logic.

## Explicitly not in scope

Retyping the ladder itself. A visual audit proposed 30/36 page titles, 20/28
section titles, 10px card radius, 52px table rows and a 260–264px sidebar.
`design.md` ships 26/32, 16/24, 8px, 44px and 232px. Adopting those numbers
would restyle every screen at once, which is a redesign, not a polish pass, and
would invalidate the role system this document is about adopting.
