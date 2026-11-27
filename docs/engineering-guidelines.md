# Engineering guidelines: repeated failure modes

Read this before changing code. When a failure mode repeats (a fix is undone,
a bot finding recurs), add or sharpen an entry here; don't write history into briefs.

Each entry is a failure that happened more than once. The rules it sharpens
live in [CLAUDE.md](../CLAUDE.md), [invariants](invariants.md),
[design](design.md) and [Review.md](../Review.md); this file adds the
evidence and the check, not a second copy of the rule.

## Boundaries and state

### Place every new lock in the DAG

**Rule:** A change that adds, moves or widens a row or advisory lock places it
in the [lock DAG](architecture.md#combined-transaction-lock-dag) and extends
`services/api/test/site-health-lock-order.test.ts`.
**Why:** Deadlocks and lock convoys came back five times between 12 and 17
November as new paths locked out of order: #764 (40P01 between crawl controls and grants),
#810 (foreign-key key-share against `FOR UPDATE`), `6b00efa22` and `a742f21b4`
(Site Health task commits convoying, then a deadlock from dropping a lock)
and #791 (a trial purge rechecked in lock order).
CodeAnt raised the same thing on #931 and #981.
**Check:** The diff adds `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`,
`capacityLock`, `subjectXactLock` or an insert into a project- or crawl-owned
table inside an existing transaction. Ask where it sits in the DAG and which
test interleaves it.

### Change every reader of a rule, not the one in front of you

**Rule:** When a filter, scope or rule changes in one reader, find every
other reader of the same table, query or helper and change them in the same
diff.
**Why:** CodeAnt flagged a sibling path still on the old logic in about 13 of
the last 150 PRs, for example #991 (`generationContext` still read every
topic) and #928 (`buildManifest` read Actions without the new filter). #541
read only `complete` coverage as measured and broke an E2E spec that #543 had
to repair. Admission stopped writing the frozen configuration's top-level
`provider`/`model` while summary costing still read them, so every audit's cost
read "unknown" in production.
**Check:** `rg` the table, function, status and key names the diff touches,
including keys a writer stops writing. If there are N readers and the diff
changes fewer than N, each one left alone needs a reason.

### Take limits from their owner

**Rule:** A size, count or length limit in a UI check or request schema
imports its value from the owning config or contract and never repeats a
literal.
**Why:** CodeAnt found UI, schema and database limits that disagreed in about
20 PRs: #933 (topic schema 200, column 255), #983 (the CSV preview accepts
rows the API rejects), #996 (400 bucketed runs against a 100-run cap), #804
(aliases capped after the fact).
**Check:** A numeric literal in `.max()`, `.length >`, a row cap or a
`limit=` param. `rg` the number and make sure one owner defines it.

### Let the schema refuse what the code never writes

**Rule:** A reference between two rows that share an owner (account, audit,
chat, project) is a composite foreign key through that owner, not an id alone.
A CHECK states `IS NOT NULL` or `IS TRUE` for every value it relies on, since a
NULL makes the comparison unknown and the CHECK passes. A B-tree key on an
external string has a byte bound (`policy.storage.index_key_max_bytes`) in
the column's CHECK, and its writer skips a longer value (`fitsIndexKey`)
instead of failing the batch.
**Why:** The 2026-11-23 baseline audit inserted an invoice for another account's
payment, a ledger entry against another account's grant, an audit task with
another audit's snapshots, a platform search run with no estimate and `{}` as
suggestion guidance; all passed. A 5,121-byte UTF-8 string under 2,704
characters failed every wide key it reached.
**Check:** A new FK column whose row and target both carry an owner id; a new
CHECK over nullable columns or JSON keys; a new index on a text column fed by a
provider, an import or a crawl.

### Reset view state when its context changes

**Rule:** Page indexes, selected IDs, persisted filters, placeholder data and
pending markers belong to one scope (project, range, filter, row, draft) and
reset or re-validate when that scope changes.
**Why:** This recurred in about 15 PRs: #894 (page index kept across a range
change), #980 (a removed row's ID stayed selected), #965 and #1007 (a
persisted source filter hid every row), #970 (placeholder data from the
previous selection), #919 (`busyId` held one row of many), #859 (a save that
finishes clears an edit typed after it).
**Check:** New `useState`, URL state or storage that outlives a change to the
range, project or data it filters. Mutation state keyed by anything coarser
than the item and the draft it saved.

### A variant is a union, not optional fields that travel together

**Rule:** [CLAUDE.md](../CLAUDE.md#code-taste) owns it: variants are
discriminated unions on a literal `kind`.
**Why:** The TypeScript audit on #1136 found about 12 shipped variants written
as optional bags. `FetchOutcome` (`services/api/src/source-pages/persistence.ts`)
puts `outcome: 'inspected' | 'blocked' | 'failed'` beside optional `finalUrl`,
`status` and `reason`, so nothing ties `reason` to a failure. `SurfaceExchange`
(`audits/surface-persistence.ts`) carries `raw`, `error` and `poll` as
independent options. `HandoffInput` (`lib/agent/handoff.ts`) has 15 optional
fields for handoffs that each name one subject. No lint can tell a bag of
options from a union.
**Check:** A new or widened type with two or more optional fields that are
set together, or only for one value of a status or kind field. Code that
tests one optional field to decide whether another is present.

### Parsed data leaves the parser typed

**Rule:** [CLAUDE.md](../CLAUDE.md#code-taste) owns parse-once. The value the
entry function hands on has the schema's inferred type; `Record<string,
unknown>` stays inside that function and never types a helper's parameter or
a return value.
**Why:** The #1136 audit counted 328 `Record<string, unknown>` in
`services/api` production code. `search-surfaces/parsing.ts` (24) and
`search-intelligence/normalization.ts` (17) pass raw provider objects through
helper after helper (`observedAt`, `elements`, `fragments`), each probing
fields with `typeof` again, so a provider shape change fails deep inside a
helper instead of at the parse. A JSON column type (`db/json.ts`) is legitimate.
**Check:** `Record<string, unknown>` in a parameter or return type outside
the function that receives the payload, or a `typeof x.field ===` chain on a
provider or API value that a schema could parse once.

## UI loading and first paint

### Flow routes never draw the app shell

**Rule:** Every pre-render frame (the `index.html` boot shell, the
`hydrateFallbackElement`, Suspense fallbacks, the session and workspace
gates) reads the route manifest's `shell` flag, and a flow route (sign-in,
setup, chooser) paints only its own plain frame.
**Why:** #524 and #551 removed the placeholder screens shown around sign-in.
#866 (sidebar in `ShellFallback` on every path), #875 and #883 (boot shell on
every path) and #902 (a "facts" skeleton on flow routes) brought them back:
sign-in showed three different screens before the form. #1013 made
`FirstFrame` (`components/layout/first-frame.tsx`) the one owner, and
`boot-title.js` reads the same flag.
**Check:** The diff adds or edits a `fallback=`, `ShellFallback`, `FirstFrame`,
`hydrateFallbackElement`, `boot-shell.ts` or `index.html` markup. Ask what it
draws on `/login`, `/workspaces` and `/onboarding`.

### A workspace change never remounts the shell

**Rule:** No `key` or early `return <Fallback/>` keyed to the workspace may
wrap `AppShell`, and the app has one way to switch workspaces.
**Why:** Switching workspace tore down and rebuilt the whole shell, twice
from Prompts: `PolicyAcceptanceGate` set `key={activeWorkspaceId}` and both
gates returned `ShellFallback` while checking. #551 fixed the same defect for
sign-in only. There were two switch paths (`useSelectWorkspace` and a
`<Link reloadDocument>`) and two chooser shortcuts (the loader's
`chooserShortcut` and a chooser effect), so a fix to one path missed the
other. #1013 left one of each, and a gate still answering holds the content
slot (`GateHold`, `HeldContent`) instead of replacing the tree.
**Check:** `key=` on a gate or provider above the shell, a gate that returns
a fallback once data has loaded, or a second implementation of an existing
navigation mechanic.

### New sections reserve their settled footprint

**Rule:** [design](design.md) ("Nothing moves on interaction") owns it.
**Why:** "Keep … still" fixes shipped seven times (#405, #504, #522, #532,
#541, #546, #834). Then new sections shifted on load again: the
Insights performance matrix (#982) and Competitors suggestions (#971) put
CLS at 0.12 to 0.14. The full-app review then measured 0.07 to 0.42 on cold
loads from five more causes: a "blank line" of a plain space (it collapses),
a width measured after paint (the figure strip rewrapped), a deferred turn
painted at its `contain-intrinsic-size` estimate, sections drawn under a
table whose row count was still unknown, and a cold-load warm skipped for any
address with `?tab=`.
**Check:** A section that renders `null` while pending or when empty, or a
list whose row count is unknown until the read answers. The section needs a
skeleton of its settled size or a reserved height, and what follows a list
of unknown length mounts once it answers. A reserved line holds ` `;
layout measured for rows runs in `useLayoutEffect`.

### Fit decided by measured width, never a count

**Rule:** [design](design.md) ("Toolbar placement") owns where controls go.
Whether chips, tabs or actions fit on a row is decided from the row's
measured width (`components/ui/filter-fit.ts`), never from a fixed count.
**Why:** Filters folded into one menu with room to spare across several
design rounds; the four-icon-chip cap in `filter-bar.tsx` was the latest
form, and its tests pinned the cap instead of the fit.
**Check:** A constant capping how many controls show inline. A measured fit
treats an unmeasured row (width 0: jsdom, hidden, first paint) as "everything
fits", or every test folds everything; tests that need a fold set widths. A
measured box whose own contents set its width (a `grow basis-0` flex item
sharing a line, or one with no minimum width) folds itself and stays folded:
the fit measures a box that wraps to a full line when its contents need one.

### Empty, zero and "none" only after a successful read

**Rule:** A screen says "no data", "no plan", 0 or an empty list only when
the read succeeded with that answer, and a refetch failure over retained data
shows that the data is stale.
**Why:** CodeAnt found pending or failed reads shown as authoritative in
about 20 PRs: #890 (Pricing showed the old plan after a failed refetch), #859
(no run inferred from an empty result), #881 (a pending mappings read showed
as empty), #897 (a failed next page hid loaded ads). #760, #770 and #775 then
had to retrofit `QueryState` screen by screen.
**Check:** `data?.items ?? []`, `!data` or `.length === 0` driving an empty
state without checking `isSuccess`. `isError` ignored whenever `data` exists.

### Website product pictures scale the desktop layout, never reflow

**Rule:** A drawn app screen on the website (`.cl-frame--scale`) is laid
out at its natural desktop width and height at every viewport and scaled
whole to its frame, like a screenshot. No media or container query inside a
screen hides, stacks or re-sizes its parts for a narrow viewport.
**Why:** The home hero and product page heroes were reflowed into a tall,
sidebar-less phone layout twice (#843/#845, then the `cl-figures` strip
queries in #1058); the owner reported it both times.
**Check:** The marketing E2E "product frames fit the viewport" asserts at
390px that each hero screen's `offsetWidth` is its natural width and the
drawn sidebar is visible. In review: a `max-width` media query or
`@container` rule under `components/marketing/screens/` that targets a
`.cl-screen` part.

### App restyles of shared primitives stay off the website

**Rule:** A look change to a `components/ui` primitive the website also
imports (button, input, select, textarea, tag, table, tabs, facts) re-points
a role token in the app's `:root:not([data-public-surface])` blocks, or adds a
role the website binds to its own value. Inside the primitive, the `app:`
variant may scope a class; a screen never forks a look with
`[[data-public-surface]_&]:`.
**Why:** The HeroUI move (2026-11) restyled shared controls; the review
caught the website's tables losing their corner radius and its textareas
their motion timing, after earlier rounds where a shared-component edit
restyled pages nobody named. A per-call-site surface variant is a one-off
look that the next token change misses.
**Check:** `design/surface-variant` fails a surface variant outside
`components/ui`. In review, run `rg "components/ui/" frontend/components/marketing`
and read every changed primitive in that list for an unscoped class change.

### A class migration proves the render, not the class

**Rule:** Moving classes between CSS layers or into `cn`'s merge groups (a
component class to a utility, a new role registered with tailwind-merge)
changes which class wins. Prove the move with a before/after dump of computed
values per element, not a class rename map. A passed-in class that the
component's own utility used to beat (`TableCell className="type-caption"`)
was dead: keep its rendered look explicitly and flag it, don't revive it.
**Why:** The type-role batches found classes that never rendered: a table
group row's emphasis (ds-2) and two `TableCell` captions (ds-3). They came
alive once `cn` could merge them. The same move recoloured avatar initials on
every page, because a tone landed in a map that `cn` applied after the base
ink.
**Check:** A computed-value sweep of the app before and after, plus a
per-call-site render of every converted string in each entry stylesheet; any
difference is a bug unless the plan lists it.

### A closed primitive still merges the class a Slot hands it

**Rule:** When a primitive drops `className` from its public props, its
implementation still accepts the `className` a Radix `Slot` parent injects at
runtime (`DockSlot`, `TextLink asChild`, `MastheadLabelled`) and merges it
with its own classes. Export it through a narrower function type, as `Button`
and `Pressable` do, so screens still cannot pass one.
**Why:** #1281 closed `Button` and `Pressable`. `Button` then overwrote the
dock slot widths, so the Action dock resized on every decision, and
`Pressable` let the injected class replace its whole class list under
`TextLink asChild`.
**Check:** `e2e/surface-layout-actions.spec.ts` holds the dock still; render
a `Slot` parent around any newly closed primitive before merging.

### Popup exits animate, eager CSS pays for itself

**Rule:** Radix popups (menus, popovers, tooltips, dialogs) leave with a CSS
`animation`, never a `transition`. New eager CSS makes room by deleting dead
CSS; the budget changes only with the owner.
**Why:** Radix unmounts on close only after an animation ends, so a
transition-only exit snapped shut (#918). The eager CSS gzip budget has
little headroom; the button redesign (#1082) went over it twice before dead
rules were cut.
**Check:** The CSS budget step in CI. In review: an `exit` or closed-state rule
under a Radix part that uses `transition` alone.

### A boot file's import ships the whole module

**Rule:** Code only lazy routes use lives in a module no boot file (shell,
`page-frame`, `first-frame`, `not-found`) imports. Split a shared module along
that seam rather than adding to it.
**Why:** The bundler puts every module statically reachable from the entry into
the boot chunk whole. Design batch 6 (#1274) went 13 KB over the eager JS
budget by putting setup, record and steps chrome next to the page chrome boot
screens use.
**Check:** The eager JS budget step in CI.

### The window never scrolls in the app

**Rule:** The app panel (`[data-main-column]`) is the only scroller, and it is
a positioned box, so `sr-only` and other absolute children scroll and clip
inside it. The document under the app shell is `overflow: hidden`.
**Why:** The panel scrolled without being positioned, so an `sr-only` caveat
deep in Site Health was placed against the page and grew it: the window
showed its own scrollbar and an empty band under the panel (owner, 2026-11-23).
**Check:** In review: removing `relative` from the shell's panel, or a
scroll container inside a page that holds absolute children without being
positioned.

## Value states

### Absence goes through `Absence` and nowhere else

**Rule:** A missing value renders through `Absence` and the vocabulary in
`lib/format.ts`. A nullable formatter returns `Formatted` (`string | Absent`),
never an absence word: `TableCell`, `FigureStrip`, `ChartKey` and `Value` draw
the mark for an `Absent` and print every string verbatim, so text that reads
"None" stays text. A figure's absence kind is `missingState`; `missingLabel`
is only for a word the state's own word is not. Prose (summaries, CSV, aria
labels) takes `formattedText`. Which word or mark to use belongs to
[design](design.md) and the owner.
**Why:** The rule changed four times (#112 one dash; #865 and #874 words;
#1009 a muted dash again), and every change missed some of the parallel
vocabularies. CodeAnt's custom rule caught collapsed absence states in about
50 of the last 150 PRs. `prompt-table.tsx`, `lib/visibility/matrix.ts` and
`ai-traffic/url-panel.tsx` were each flagged in four PRs. #1014 routed the
local vocabularies through `lib/format.ts`; job statuses (`rung-trail.tsx`,
`INTERNAL_LINK_STATES`) are workflow states, not absent values. Until
2026-11-19 the components matched the printed word back to a state, so a
topic or plan label equal to an absence word printed as a dash; the tagged
`Absent` type replaced that (`tsc` rejects an object JSX child).
**Check:**
`rg "'(Not measured|Unavailable|Not available|No data|Not run)'" frontend/components frontend/lib`
outside `lib/format.ts`; `availabilityLabel(` passed as a value or
`missingLabel`; a nullable formatter inside a template literal, which `tsc`
does not catch (use `formattedText`).

### Unknown never becomes zero on its way to the screen

**Rule:** A nullable measured field stays `null` until `Value`/`Absence`
renders it. Don't default it with `?? 0`, `|| 0` or `?? false`, and don't
sort or compare it as zero. The states themselves are
[invariant 7](invariants.md#7-unknown-states-remain-distinct).
**Why:** #770, #775 and #793 each removed unknown-as-zero from a group of
screens, and #863 removed it again ("Shopping zeros").
**Check:** `?? 0`, `|| 0`, `Number(x ?? …)` or `?? false` on an API field
that is a count, rate, score or share.

### Aggregates state their basis

**Rule:** A result computed over partial, sampled, truncated or mixed input
says so (partial, unknown, the actual denominator). It never reports
"satisfied", "none found" or a total as if the input were complete, and its
label names the real denominator and window.
**Why:** CodeAnt flagged partial coverage reported as complete in about 15
PRs (#994, #929, #945, #976). It flagged mixed pooling (#974: win fields from
the latest run beside summed counts; #979: a rounded gap compared) and copy
with the wrong denominator or unit (#970, #1000, #868) in about 30 more.
**Check:** A function that returns a verdict or count without reading its
coverage, limit or truncation flag. A percentage label whose denominator
differs from the code's divisor.

## Performance

### Query keys never contain "now"

**Rule:** A query key or request param never holds a value computed from the
current time. Key on the preset (`'90d'`) and resolve the bound on the
server, or round it to a stable boundary.
**Why:** `rangeToFrom` (`lib/visibility/trends.ts`) once put a
millisecond-precise `from` into the trends read, so every mount made a new
key, a refetch and a prefetch that warmed nothing, on the Insights and
Competitors hot path. It now starts the UTC day.
**Check:** `new Date()` or `Date.now()` on a path that reaches a `queryKey`,
a `queryFn` param or a prefetcher.

### Screen reads start in the first request round

**Rule:** A change to `bootstrap-loader`, `route-prefetch`, `router.tsx`,
`index.html` or a gate keeps every screen's reads in round 1 beside the gates
and adds no read that waits on another it doesn't need.
**Why:** #523, #525, #541 and #549 brought page loads to one round and
removed duplicate reads. Later changes (#727's slim project list, #551's
selection clear) pushed screen reads back to rounds 3 to 6. A prefetcher's
dynamic `import()` of its API module is required, not a regression
(`route-prefetch.ts` says why).
**Check:** An `await` before an independent request, or a read enabled only
after an unrelated one answers. Count the request rounds on a production
build when these files change.

### Work that grows with the data stays off shared locks and lanes

**Rule:** A read or loop whose cost grows with a crawl, project or history
runs outside shared locks, in bounded batches (memory as well as time), and on
a lane that cannot starve another. Every crawl-wide step (setup, finalize,
publication, reads) loads at most one keyset batch or aggregates in SQL, and
the scale fixture (`test/scale/`) covers the largest crawl an entitlement can
grant.
**Why:** #938: the live score summary reread every analysis under the crawl
lock, and throughput fell from 225 to 2 pages a minute. #497 and #936:
lanes starved behind crawls and discovery backlogs. #958: sitemap probes
timed out on large sites. 2026-11-20: an operator grant of 5,000 tracked URLs
(on a 51,000-URL inventory) made a crawl 20 times larger than any tested one.
Setup held the crawl lock past the lock timeout. The live score and the Pages
read passed the 30 s read timeout. The finalize step loaded the whole crawl
into memory, so three runner executions in a row ran out of heap, and nothing
was published. The 51,000-page fixture then showed two more failures. A
per-chunk lookup led by the tracked set took 25 s per chunk. A pairwise
duplicate-content loop (1.3 billion comparisons) held the event loop until the
finalize lease expired. 2026-11-27: the Brand and Fact-checking reads copied
`audit.configuration` (about 19 KB, up to 56 KB) onto every answer row, about
2.4 MB per run per request, and the period trend loaded whole metric rows only
to collect their ids.
**Check:** A query without `LIMIT` or a keyset inside a locked transaction or
a per-task hook. A per-row select of a per-run column (`audit.configuration`)
instead of one read per run. A whole-row read used only for its ids. A per-task step that rereads a whole crawl. An array or map
filled from every page, evaluation or issue of a crawl. A nested loop over a
crawl's pages, or a lookup led by the growing side instead of the batch. A new entitlement
ceiling without a matching `SITE_HEALTH_SCALE_PAGES` run.

### A tool result is sized for the model that reads it

**Rule:** An Agent or MCP read returns rows at the grain its question needs
(totals over a window before daily rows) and counts in place of id lists that
grow with the data. Nothing but `items` may grow with the project.
**Why:** 2026-11-24: `read_query_evidence` returned the snapshot's 2,181
source row ids with every page, which alone passed `tool_result_max_chars`.
The adapter halved `limit` down to 1, so each call gave the model one of a
page's 415 daily rows. A Search Console turn took 35 model calls and over four
minutes, and still answered on partial data.
**Check:** A read that returns an owner's whole row or snapshot (`selectAll`,
provenance arrays) to a tool. A list whose rows are per day when the skill
asks per query or page. A new provenance or version key reaching the model:
list it in `tool_view.hidden_keys` unless a skill passes it back or compares
on it. Hashes the model cannot pass to another read (give the path).

### Independent awaits run together

**Rule:** Run independent awaits together. A loop that must stay sequential
(shared transaction, lock order, rate limit, pool size) carries a bare
`// NOSONAR`, and a test or the name of the step it runs shows why.
**Why:** Sonar S9382 is the most common rule in the project's history: 209
fixed and 23 open (for example `services/api/src/agent/suggest-edits.ts` and
`page-documents/suggestion-actions.ts`). #464 had to annotate 204 loops after
the fact. 2026-11-27: the source URL detail ran its brand and competitor counts
in a `NOSONAR` loop and its sections one after another, though nothing shared
forced the order.
**Check:** `for … { await … }` over items that share no transaction, order
or budget. A `NOSONAR` loop on the request pool with no shared transaction.

## Type discipline

### The code-taste type rules are checks, not memory

**Rule:** The [CLAUDE.md](../CLAUDE.md#code-taste) type rules are enforced;
when a check rejects a change, fix the code instead of growing an allow-list
or a baseline. A PR that removes a counted site lowers its baseline entry in
the same PR, and a file split moves each long function out as an object
argument, because a new file starts at 0. A `switch` on a discriminant ends with a `never` arm; a lookup
keyed by an unparsed string is a `Map` with an explicit fallback, not a
`switch` with a silent `default`. External shapes parse through a zod schema,
and a type guard is a schema parse named `isX`. Shipped code never calls
`console`: workers log through `lib/server/worker-request-log.ts`, and a
dev-only console warning is not a check (write a lint or a test instead).
**Why:** The #1136 audit found 12 discriminant switches whose `default` hid a
new variant, about 10 shipped `console` calls (two of them dev warnings no
one saw), 485 non-null assertions in `services/api/src` and hand-written
property-by-property guards beside existing schemas, after 422 `as` casts
had already needed their own sweep.
**Check:** `check:policy` runs `frontend/scripts/type-discipline-checks.mjs`
(`exhaustive-switch`, `index-non-null`, `keys-cast`, `value-change-cast`) and
two shrink-only per-file ratchets over every source file: non-null assertions
(`frontend/scripts/non-null-baseline.json`) and functions over three
parameters (`max-params-baseline.json`). Each fails a count above its entry, an
entry above its count (lower it with `--write-non-null-baseline` or
`--write-max-params-baseline`, which never raise or add) and, against
`COMPLEXITY_BASE_SHA`, a key added or raised. `vp lint` runs `max-params` (3)
outside the baseline files, where a TanStack `onSuccess`/`onMutate`/`onError`/`onSettled`
callback takes `oxlint-disable-next-line max-params`; it also enforces
`no-console` and `consistent-type-assertions` with the allow-lists in
`frontend/vp-shared-config.ts`. Review checks the other half of the parameter
rule: two parameters of one type take an object argument.

## Replacement and debt

### A redesign deletes what it replaces, in the same PR

**Rule:** A round that retires a token, helper, vocabulary, alias or
component deletes the old one and its callers in the same PR; the
[replacement gate](invariants.md#replacement-and-retirement) applies to
design rounds too.
**Why:** Leftovers needed sweep PRs: #806, #814, #871 (retired tokens and
roles, and per-feature percent helpers folded into `lib/format`) and #896
(dead options and parallel primitives). Re-export aliases remain, for example
`services/api/src/commerce/edits.ts:59`, `routes/demand-contracts.ts:22`,
`lib/config/crawl-logs.ts:79` and `components/settings/member-roles.ts:5`.
**Check:** `export { x as y }`, `const old = new`, a second formatter or
label map beside an owner in `lib/format.ts` or `components/ui/`, or a
replacement diff with no deletions.

### Fix new Sonar findings in the PR that adds them

**Rule:** Fix every new SonarCloud issue on the PR before merge; don't leave
it for a cleanup PR.
**Why:** Eight cleanup PRs (#368 to #372, #409, #464, #739, #984 and the
2026-11-24 sweep) fixed findings that had merged. The same rules return in new
PRs: S3358 nested ternary (7 of the last 60 PRs, 3 open on 2026-11-24), S3776
cognitive complexity (5), S4624 nested template literals (4, 4 open), S8786
backtracking regex (3), S7503 `async` without `await` (4 open) and S6551
`String(x)` on an `unknown` (8 open). The last came from four copies of one
`shown` preview helper in `services/api/src/changes/`, now `shownValue` in
`changes/kind.ts`, and from reading a JSON column field by field instead of
through its schema.
**Check:** `vp lint` rejects a nested ternary (`no-nested-ternary`). The Sonar
PR comment reports zero new issues. In the diff: deeply nested branching, a
template literal inside another, a regex with nested quantifiers, an `async`
function that only returns a promise, or `String()`/a template over a value
typed `unknown` (parse it, or reuse the owner's formatter).

## Review process

### Removing an owner-chosen screen element needs the owner

**Rule:** Before a redesign removes or replaces a layout, column, mode or
page structure, run `git log -S` on it. If an owner chose it, ask before
removing it.
**Why:** Owner-chosen UI was removed and restored at least six times: the
split sign-in page (added in #527, restored in #590 and again in #911), the wide
onboarding (#852 replaced #755; #935 restored it), Site Health score strips
(#688), the Dashboard and Agent modes (#866), and Mentions and Sources on
the Prompts table (#1006).
**Check:** The diff deletes a table column, a template, a mode switch or a
page section. Find the PR that added it and whether its body cites the owner.

### A change to a cross-cutting rule names the rule it replaces

**Rule:** A brief, plan item or PR that changes loading, first paint, auth
transitions or value states names the PR that last set the behaviour and
quotes its reason. If it contradicts that PR, the owner decides first
(`record-owner-decision`). Keep the reason in a test or the owner doc you
change; source code carries no comments.
**Why:** Design-round briefs restated these rules without their history, and
builders followed the briefs: OL-01 (#866) undid #524, DAT-01 and DAT-02
(#874, #875) undid #112, and a fix plan offered "Unavailable" or "Not
measured" when the dash was the earlier decision. #865 deleted the comment
that explained `MISSING_MARK`, and #574 deleted #524's doc paragraph, so the
next builder had no reason to keep either.
**Check:** The diff removes a test or doc paragraph that gives a reason,
or a brief changes one of these areas without citing a PR. Run
`git log -S '<symbol>'` on the owner.

## Tests

### Tests mount the real providers; mocks stop at the app's edge

**Rule:** [CLAUDE.md](../CLAUDE.md#testing) owns "don't mock what you can
run". A browser test renders through `renderWithProviders`
(`frontend/test/render.tsx`) with `projectSelection` (`selectionAs(role)`,
`projectScope(project, role)`) and `entitlement`, and serves API reads with
MSW. It never `vi.mock`s a module of ours that only reads context, query
state or the API client. `vi.mock` is for what leaves the app: a hard
navigation, a file download.
**Why:** 36 tests mocked `project-context` (24) and `entitlement-context`
(12), and the mocks drifted into states the providers cannot produce:
`referrals-screen.test.tsx` gave a project in workspace `1111…` the active
workspace `aaaa…`, `settings-screen.test.tsx` returned a project from
`useProjectContext` and `null` from `useOptionalProjectContext`, and
`dashboard-screen.test.tsx` stubbed `capabilityRemaining` beside a partial
entitlement. Role checks were `useWorkspaceCapability: () => true` instead of
a role's capabilities. The #1136 test-provider PR moved them all onto the
real providers.
**Check:** `vi.mock('@/lib/…')` or `vi.mock('@/components/…')` of a module
that wraps React context, query state or `lib/api`; a hand-written hook or
capability stub where a role from `services/api/src/config/workspaces.json`
would do.
