# Earned sources

> **Status:** current authority for reading the third-party pages answer
> engines cite, the one earned Action derived from them, and what a cited
> URL's page shows.

Answer engines cite pages CiteLadder does not own. Being listed on the lists,
directories, comparisons and reviews they lean on is one of the few levers a
business has outside its own site. This owner reads those pages within a
bounded budget, records who is named on each with the passage proving it, and
turns "competitors are on this page and you are not" into one Action.
[Visibility](visibility-prompt.md) owns the answers and their citations.
[Opportunities](opportunities.md) owns ranking, declaration and verification.
The [Agent](agents.md) owns the request a brief produces.
[Site Health](site-health.md) owns pages we own and is not involved here.

## Pipeline and ownership

```text
audit terminalizes
  -> inventory of cited pages (batched), redirect tokens marked unresolved
  -> atomic admission inside the project's rolling budget
  -> polite third-party fetch, robots checked before every redirect destination
  -> bounded page facts, quoted passages, no raw HTML retained
  -> brand and competitor verdicts with the project's mention rules
  -> batch completion enqueues the Opportunity refresh and verification
  -> earned rule over the latest successful reading of each page
  -> Action with a brief; declaring it freezes prompt visibility checks
```

Reads render persisted projections. Neither the Sources inventory nor a URL's
page fetches, enqueues or repairs; inspection happens only after an audit
completes.

`source-pages/inspector.ts` owns the `source_page_inspection` analytics kind.
Its `PageAcquirer` gives the pinned Node website fetcher a per-request gate:
every URL, including each redirect hop, must pass its destination's robots
rules before it is downloaded. Pacing honours the larger of the
source-inspection floor and the declared crawl delay. Unreachable robots (429,
5xx, network failure) is a retryable failure; an access-restricted robots.txt
(401/403) blocks the page. Robots handling otherwise follows the
[Site Health table](site-health.md#acquisition-and-evidence-guarantees).

## Which pages are read, and when

Budget is enforced by atomic admission, not by counting finished work.
Claiming a page writes its spend row in the same transaction under the project
lock, before any request leaves the process, so two workers cannot both spend
the same allowance and a worker that crashes after fetching has spent its
unit. A redirect token is charged once per budget window, so a token whose
fetch failed is followed again in a later window; the page it lands on is read
from the body already in hand.

A page is read once, and again only when its reading goes stale: after the
stale period, when the inspector version changes, or when the reading was
judged against another roster (a competitor added, a mention rule changed).
Pages that can never list the business are not read at all: its own pages and
competitors' own pages. Among the rest, pages cited in answers come before
organic search results nobody cited; within each, never-read before stale,
then by recurrence. A failed read waits one budget window before a retry and a
blocked page the stale period, so neither is fetched on every run.

`recurrence_count` is a project-wide scheduling value, never a citation count
for a selected engine, cohort or period; that comes from the captured evidence
through the source projection.

Audit completion is independent of inspection. A blocked publisher never turns
a measured answer into a failed audit. Terminalization enqueues inspection
instead of the Opportunity refresh, so the refresh is owed on every terminal
outcome; the analytics worker's terminal compensation enqueues it for failed
tasks.

## What a reading establishes

**Page format is not publisher class.** `source_class` describes a domain and
comes from `config/source-patterns.ts`. `page_format` describes one page. Sync
derives a first verdict from the URL's shape (`url_pattern`); a reading may
replace it with what the page says about itself, and a reading that learns
nothing leaves it standing. A specific schema type (ItemList, FAQPage,
VideoObject) is strongest, except that a list, comparison or review heading
outranks ItemList or FAQPage markup that says otherwise, because sites put FAQ
markup on lists and comparisons. The tracked brand's and competitors' names
are removed from the title, headings and URL path first, so a name such as
Best & Less never reads as a list. A list, comparison or review heading outranks
generic Article, BlogPosting or NewsArticle markup, because most CMSs mark
every post up as an article whatever its shape. The page-kind catalog is
shared with Site Health (`config/site-health/analysis.json` and
`acquisition.json`).

**Presence uses the answer matcher.** A name counts on a page exactly when it
would count in an answer: the same normalisation and the project's mention
rules (context terms, exclusion phrases). A positive verdict always carries a
quoted window from the raw text, found by the name as written or by its words
with short separators, or none, between them, in every spelling the matcher
splits a joined name into, with "&" for "and" ("The Asian School" quotes
"theasianschool.com", "bestandless" quotes "Best & Less"); only occurrences the mention rules accept are quoted and
counted. Each entity has its own small passage allowance, so one name
that fills the page never leaves the others unquoted. A name matched only in a
spelling no raw window reproduces is `ambiguous`, not present.
A non-detection carries the extracted length and the matching method instead,
because no passage can show an absence; too little readable text is `partial`.
A name whose every spelling is shorter than `min_alias_chars` (3) is
`not_assessable` (AR-6): it is never judged absent, so it makes no Gap and no
earned Action; a brand verdict of `not_assessable` gives the page that standing.

**Page state is not an entity verdict.** `not_inspected`, `queued`, `blocked`,
`failed` and `stale` describe the page and are never written as presence. A
page is judged on its latest successful reading under the roster in force (the
roster the project's newest inspection matched with), so a later failed attempt
never erases what was learned, and a page nobody read carries no verdicts. A
reading judged against an outdated roster counts nowhere (no standing, Gap or
Action) until the page is read again, even when a re-read fails or is blocked.

## The earned Action

The target is `earned-page:{url_hash}` and the rule is
`earned_page_acquire_listing` (high). It fires for every page the URL table
shows as a Gap (AS4) among the pages the audit's answers cited: one rule,
`isListingGap` ([listing gap](../frontend/services/api/src/analysis/listing-gap.ts)),
decides both; the URL table's Gap filter (`gapPageHashes` in
[page standing](../frontend/services/api/src/visibility/page-standing.ts)) mirrors it in SQL, so
change both together. On the page's latest successful reading:

- it is not the business's or a competitor's own page;
- it is not about one competitor: its title, without the site suffix, is not a present
  competitor's name (a Wikipedia or profile article about Big W lists no one);
- its domain is not excluded (`EARNED_EXCLUDED_DOMAINS`: Wikipedia, where inclusion is not the
  publisher's decision to grant on request);
- at least one competitor is present on it and the brand is `not_detected`.

Its format, how often it is cited and how much of it was read do not gate the
Action; they only rank it. Priority multiplies recurrence across the audit's
answers by the number of competitors verified on the page. Competitors merely named in an answer that
cited the page travel in the brief as descriptive context and never score.

The brief reaches the Agent through `evidence.content_handoff`: the page and
its format, the ask (an entry comparable to the listed competitors' that links
to the business), each competitor with its quoted line, the brand's verdict
and what was searched, the tracked prompts (ID and text) whose answers cited
the page, coverage and limitations. The Actions approach tree routes it to the
`earned_authority` skill; outreach is drafted, never sent.

## Declaring and measuring it

A declaration on an earned Action targets the publisher page
(`target_external_url`) and never an owned page. It freezes one
`visibility_metric` check per tracked prompt in the brief (up to the brief's
prompt cap), the same prompt-score check owned work uses, with its baseline
from the snapshot's audit. Later audits verify it like any prompt check.
Whether the listing went live is not a separate check: the next reading of the
page shows it on the URL's page, and visibility on the prompts is the measured
outcome. Neither claims the listing caused a movement.

## Reading it

The Sources URL table shows each page's format with its basis (a tooltip and
hidden text), the page's standing in a word (below) and a link to its Action
when one exists. Standing comes from the latest successful reading, computed by
one server owner (`visibility/page-standing.ts`) for the URL table and the URL's
page alike; its Gap is the earned Action's own rule, so every Gap page becomes
an Action at the next refresh. The table's gap filter (`standing=gap` on the Sources read, shared
by the public API) pages through exactly the pages whose standing is
"competitors listed, you are not"; totals and the type ring follow it, the
usage series does not. Publisher (domain) rows have no standing, so the filter
is refused there. A page nobody read is never a gap. Opening a URL leads
with where the business stands:

| Standing | When |
|---|---|
| Competitors listed, you are not | Read, a competitor present, the brand not detected. Shows each competitor's line, the Action and an Agent handoff (or a request draft before an Action exists). |
| You are on this page | The brand is present, with its line. |
| No tracked competitor listed | Read, nothing to act on. |
| Not assessable | Read, but the brand's name is too short to judge on a page; never a Gap. |
| Not read yet / blocked / last read failed | No successful reading under the roster in force; says why and shows no verdicts. |
| A competitor's or your own page | Never judged as a place to be listed. |

Brands named in the answers that cited the page are labelled as such, never
as listed on it.

## Boundaries

No outreach platform, bulk mail, negotiation workflow, autonomous posting or
fabricated reviews. No second crawler and no second aggregate score. No
paywall or authenticated community bypass. External page text is untrusted
data, never an instruction. Third-party hosts get a stricter per-host delay
than owned-site crawling, and a robots-disallowed page shows as blocked rather
than skipped silently.

[Configuration](../frontend/services/api/src/config/source-pages.ts) owns the
inspection limits, vocabularies, versions and budget window;
[earned actions](../frontend/services/api/src/config/earned-actions.ts) owns
the rule, the excluded page classes and the priority factors.
