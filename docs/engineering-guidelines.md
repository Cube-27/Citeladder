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
to repair.
**Check:** `rg` the table, function and status names the diff touches. If
there are N readers and the diff changes fewer than N, each one left alone
needs a reason.

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

## Value states

### Absence goes through `Absence` and nowhere else

**Rule:** A missing value renders through `Absence` and the vocabulary in
`lib/format.ts`. No component or `lib/` module writes its own absence word,
map or `missingLabel` string. Which word or mark to use belongs to
[design](design.md) and the owner.
**Why:** The rule changed four times (#112 one dash; #865 and #874 words;
#1009 a muted dash again), and every change missed some of the parallel
vocabularies. CodeAnt's custom rule caught collapsed absence states in about
50 of the last 150 PRs. `prompt-table.tsx`, `lib/visibility/matrix.ts` and
`ai-traffic/url-panel.tsx` were each flagged in four PRs. #1014 routed the
local vocabularies through `lib/format.ts`; job statuses (`rung-trail.tsx`,
`INTERNAL_LINK_STATES`) are workflow states, not absent values.
**Check:**
`rg "'(Not measured|Unavailable|Not available|No data|Not run)'" frontend/components frontend/lib`
outside `lib/format.ts`. Any `missingLabel:` literal.

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
runs outside shared locks, in bounded batches, and on a lane that cannot
starve another.
**Why:** #938: the live score summary reread every analysis under the crawl
lock, and throughput fell from 225 to 2 pages a minute. #497 and #936:
lanes starved behind crawls and discovery backlogs. #958: sitemap probes
timed out on large sites.
**Check:** A query without `LIMIT` or a keyset inside a locked transaction or
a per-task hook. A per-task step that rereads a whole crawl.

### Independent awaits run together

**Rule:** Run independent awaits together. A loop that must stay sequential
(shared transaction, lock order, rate limit, pool size) says why on the line.
**Why:** Sonar S9382 is the most common rule in the project's history: 209
fixed and 23 open (for example `services/api/src/agent/suggest-edits.ts` and
`page-documents/suggestion-actions.ts`). #464 had to annotate 204 loops after
the fact.
**Check:** `for … { await … }` over items that share no transaction, order
or budget.

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
**Why:** Seven cleanup PRs (#368 to #372, #409, #464, #739, #984) fixed
findings that had merged. The same rules return in new PRs: S3358 nested
ternary (7 of the last 60 PRs), S3776 cognitive complexity (5), S4624 nested
template literals (4), S8786 backtracking regex (3), S7503 async without
await, and S7765 `.some()` for an includes check.
**Check:** The Sonar PR comment reports zero new issues. In the diff: a
ternary inside a ternary, deeply nested branching, a template literal inside
another, or a regex with nested quantifiers.

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
(`record-owner-decision`). Keep the reason in the code or doc you change.
**Why:** Design-round briefs restated these rules without their history, and
builders followed the briefs: OL-01 (#866) undid #524, DAT-01 and DAT-02
(#874, #875) undid #112, and a fix plan offered "Unavailable" or "Not
measured" when the dash was the earlier decision. #865 deleted the comment
that explained `MISSING_MARK`, and #574 deleted #524's doc paragraph, so the
next builder had no reason to keep either.
**Check:** The diff removes a comment or doc paragraph that gives a reason,
or a brief changes one of these areas without citing a PR. Run
`git log -S '<symbol>'` on the owner.
