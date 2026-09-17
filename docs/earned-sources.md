# Earned sources

> **Status:** current authority for the inspection of externally cited pages,
> the page-keyed earned actions derived from them, and the evidence a reader
> is shown beside either.

Answer engines cite pages CiteLadder does not own. This owner inspects those
pages within a bounded budget, records who appears on each of them with the
passage proving it, and turns a qualified gap into one named action on one
page. [Visibility](visibility-prompt.md) owns the answers and their citations.
[Opportunities](opportunities.md) owns ranking, declaration and verification.
[Content](content-generation.md) owns the draft a brief produces.
[Site Health](site-health.md) owns everything about pages we do own, and is
not involved here.

## Pipeline and ownership

```text
audit terminalizes
  -> inventory of cited pages, redirect tokens marked unresolved
  -> atomic admission inside the project's rolling budget
  -> polite third-party fetch, robots honoured on the host we land on
  -> bounded page facts, quoted passages, no raw HTML retained
  -> per-project brand and competitor verdicts, roster frozen per verdict
  -> batch completion enqueues the Opportunity refresh
  -> page-keyed earned rules over the full eligible answer set
  -> brief, declaration against the publisher page
  -> pending placement checks compared against that batch's readings
  -> placement reported beside, never inside, comparable visibility movement
```

Reads render persisted projections. Neither the Sources inventory nor a page
detail fetches, enqueues or repairs. Inspection is either automatic selection
or an explicit authorized command, never a side effect of looking.

## Two distinctions that carry the whole feature

**Publisher class is not page format.** `source_class` describes a domain and
comes from the taxonomy in `core/config/source_patterns.py`. `page_format`
describes one page and is derived from that page's own content. A single
inspected comparison page is actionable on its own terms; it never promotes
its publisher to a known category.

**Page state is not an entity verdict.** `not_inspected`, `blocked` and
`stale` are properties of the page and are never written as a presence row.
`domain/source_pages/projection.py::get_source_page` is the single resolver
that maps the two onto the vocabulary a reader sees, so no caller can report
a page nobody read as a confirmed absence.

A positive claim always resolves to a snapshot and a quoted window. A
non-detection carries the extraction coverage and the matching method instead,
because no passage can demonstrate an absence.

## Inspection and budget

Budget is enforced by atomic admission, not by counting finished work.
Claiming a page (`not_inspected` -> `queued`) writes its spend row in the same
transaction under the project lock, before any request leaves the process, so
two workers cannot both read the same remaining allowance and a worker that
fetches and then crashes has spent its unit. Following a redirect token is
fetching its publisher, so the page it lands on is read from the body already
in hand rather than claimed and fetched again.

Selection is never-inspected first, then stale, then pages that owe a placement
recheck, then the rest, with recurrence ranking within each set. A due recheck
is an inspection like any other: it is claimed under the same project lock and
pays the same budget unit, which is why it changes a page's PRIORITY rather
than getting its own path around the accounting. A recent enough inspection is
reused, so a page read inside the reuse window is not re-read for a due check
either — the reading that check needs already exists. A changed content hash is
only knowable after retrieval, so it decides whether analysis reruns, never
whether retrieval happens.

`recurrence_count` on `source_pages` is a project-wide scheduling value. It is
never rendered as the citation count for a selected engine, cohort or period;
that comes from the full captured evidence through the source projection.

Audit completion is independent of inspection. A blocked publisher never turns
a successfully measured answer into a failed audit. Because terminalization
enqueues inspection INSTEAD of the Opportunity refresh, that refresh is owed on
every terminal outcome; the queue's terminal compensation in `AnalyticsWorker`
fires it on both failing paths, including the lease sweep, which runs no
executor code.

## The four page-keyed actions

The target is `earned-page:{url_hash}`. Four rule ids rather than one rule with
an action field, because scoring consolidates on `(rule_id, target_key)` and
acquiring a listing and correcting one have different done-states.

| Rule | Severity | Fires when |
|---|---|---|
| `earned_page_acquire_listing` | high | The page was read with sufficient coverage, its format admits a new entrant, at least one competitor is present on it, and the brand is not detected. |
| `earned_page_correct_listing` | medium | The brand is present and a specific checkable discrepancy is identified — named in prose while every rival has an entry, or a page that links every rival and not us. Presence alone never qualifies. |
| `earned_page_defend_listing` | low | A usable prior snapshot exists and the placement deteriorated. Both brands present is a healthy watch state and produces nothing. |
| `earned_page_research_source` | low | The source is relevant and recurrent, or was explicitly asked for, but classification, presence, coverage or an actionable route is unresolved. |

Qualification is hard and precedes ranking: coverage, a tracked prompt,
recurrence, a current roster, resolved entity matching and a resolved page
format. `earned_page_research_source` is the deliberate exception, because it
exists for exactly what that gate rejects. It is `low` and not `info`: with an
`info` weight of 0.5, a scale of 10 and a surfacing floor of 10.0, an info hit
at base factors scores 5.0 and is dropped at write time — the silent-drop
defect this rule set removes.

Where evidence would satisfy both defence and acquisition, defence wins: it
carries the prior snapshot that explains what changed. One page and one
intended outcome produce one task.

`page_competitor_presence_factor`, computed from verified on-page presence, is
the only competitor input to priority. `ambiguous` and `partial` are not
presence. Answer-level co-occurrence travels in the brief as descriptive
evidence, labelled as such, and never scores.

## Brief, declaration and the retired rule

The brief reaches Content through the existing handoff on
`evidence.content_handoff`, and its output type follows the page format rather
than defaulting to an article. It carries the snapshot, the quoted passages,
the extraction coverage and its own limitations; it cannot manufacture
placement evidence.

A declaration against an earned rule targets the publisher page directly. It
never routes through `resolve_owned_page`, which would match a third-party URL
against this project's crawled inventory and raise, and it rejects owned page
targets outright: verifying an owned-page change against an external placement
would report two things as one.

## Confirming the placement

A declaration opens a `placement_checks` row anchored on the IMPLEMENTATION
EVENT rather than on the opportunity. The same page and the same action can be
attempted more than once, and a check has to know which attempt it verifies;
the opportunity's stable key travels alongside for navigation across recompute
and is never the anchor. The row never references an owned `SiteUrl`.

It freezes the project-scoped source identity, the expected change, the
baseline snapshot and the roster that snapshot's verdicts were judged against.
The expected change comes from the rule, so each done-state is verified on its
own terms:

| Rule | Expected change | Satisfied when |
|---|---|---|
| `earned_page_acquire_listing` | `brand_listed` | The brand is present on a later reading. |
| `earned_page_correct_listing` | `discrepancy_resolved` | Every discrepancy the task NAMED is gone — an entry heading of our own, or an outbound link to a reviewed owned domain. Brand presence alone never satisfies it. |
| `earned_page_defend_listing` | `placement_restored` | The brand is present again and mentioned no less than at the deteriorated baseline. |
| `earned_page_research_source` | `source_resolved` | The page was read with sufficient coverage and yielded a verdict against the current roster. |

The comparison itself is pure
(`analysis/opportunities/placement_outcome.py`) and runs when an inspection
batch commits, against the reading that batch just took. A reading judged
against a different roster is not comparable and is not compared, which is the
rule `earned_page_hits._prior` already applies to deterioration. Insufficient
coverage, a missing baseline, a missing brand verdict and an uncheckable
discrepancy code are all `unavailable`, and `unavailable` never decays into
`unmet`: a page we could not read says nothing about whether the placement went
live.

An empty first reading is an OBSERVATION, not a contradiction — a publisher
does not act the day somebody emails them. The check re-arms a bounded number
of times and only then reports a contradiction, at which point it stops asking
and stops competing for the budget.

Placement live and visibility moved are reported as two observations, in two
places in the verification result. Folding placement into the comparable
visibility, AI-referral and branded-demand legs is exactly the defect: they
describe different things and are free to disagree.

The domain-keyed `earned_source_recurs_beside_gap` is retired in one cutover
and ships config-only, so its rows and their history stay readable. A human
status carries forward only to an unambiguous successor — the same registrable
domain resolving to exactly one qualified page with a matching action intent.
Everywhere else the legacy decision is attached as context and the new task
starts open, because a domain-level judgement does not distribute across
pages.

## Boundaries

No outreach platform, bulk mail, negotiation workflow, autonomous posting or
fabricated reviews. No second crawler and no second aggregate score. No
paywall or authenticated community bypass. External page text is untrusted
data and never an instruction to an enrichment step. Third-party hosts get a
stricter per-host delay than owned-site crawling, and a robots-disallowed page
produces a visible blocked state rather than a silent skip.

## Reading it

Inspection has no surface of its own. What it establishes reaches a reader
through two places that already exist: the page format it derives is the URL
type in [Sources](../frontend/components/visibility/visibility-sources.tsx),
and the entity-presence verdicts back the Opportunities verification payload.

Page format is deliberately not hostage to the inspection budget. Every cited
page gets a format from its URL at sync time, stamped `url_pattern`; an
inspection that reads the page REPLACES that with what the page says about
itself, and never the other way round. An inspection that read nothing — a
blocked page, or one whose kind is not evident — leaves the address verdict
alone, because it has learned nothing that contradicts it.

What was never read stays distinguishable from what was read and found absent.
A page carries presence verdicts only once a snapshot exists.

[Configuration](../backend/app/core/config/source_pages.py) owns the
inspection limits, vocabularies and budget window;
[earned actions](../backend/app/core/config/earned_actions.py) owns the rule
ids, the qualification thresholds and the format-to-output-type mapping;
[placement](../backend/app/core/config/placement.py) owns the expected-change
vocabulary, the check states and the recheck schedule.
