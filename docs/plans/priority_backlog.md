# Priority backlog: Agent verified completion

Recorded on 10 November 2026 from an external audit of the Agent (prompted by a
client conversation about an accessibility defect on a signup form shared across
179 pages), checked against the code on `main`. This is queued input for the
owner's Phase B plan, which will be prepared separately alongside other
features; it is not an execution assignment. Feature owners in
[the documentation index](../README.md) and the [invariants](../invariants.md)
remain authoritative.

**Goal:** the Agent carries work from an observed issue to a verified
improvement, with evidence attached at every step. Today it gives good advice,
but the person still finds the HTML, writes the developer ticket, remembers the
baseline and deployment date, and comes back to arrange verification.

## Phase A remainder (trust fixes, no owner decision needed)

Phase A PR 1 (code-corruption scrubber and label association) shipped with this
document. Two PRs remain:

- **A2: Declaration ordering.** `declareAction`
  (`opportunities/declarations.ts`) freezes its baseline from the newest
  opportunity snapshot even when that snapshot postdates a backdated
  `declared_implemented_at`; choose the newest snapshot at or before it, and
  report the baseline unavailable when none exists. A recrawl that resolves the
  finding clears the Action's members (`opportunities/action-sync.ts`), so a
  later declaration is refused with "No current finding"; keep the
  pre-clearance member set (likely a forward migration) and record the outcome
  as resolved by the first crawl after deployment, or as resolved before the
  declared deployment, never credited to it. Real PostgreSQL coverage.
- **A3: Action association, drafts and small UX.** A document inherits the
  chat's Action, and `attachAgentTarget` (`agent/target-adapter.ts`) then
  ignores the page the document names; add the missing retarget endpoint and a
  "Link to /x" or "Keep with this Action" choice, which also replaces the
  passive "Name the page or topic…" caption in `action-declaration.tsx`. Keep
  section drafts (`output-canvas.tsx`) per document, revision and section until
  saved or discarded. Truncate the composer's skill label at 390px. Make the
  Agent's mid-turn crawl reads (`selectCrawl` in `mcp/evidence-site.ts`) default
  to the latest completed crawl, not the latest crawl row of any status.

## Phase B (needs owner decisions)

### B1. Site-wide Actions for Site Health issue groups

Only `aeo.*` rules map to Actions (`SITE_ISSUE_TO_OPPORTUNITY_RULE_ID` in
`config/opportunity.ts`); no `web.*` rule does, including
`web.accessibility_form_names`. Each Action targets one page, so a shared
component failing on 179 pages would become 179 Actions, and declaration caps
targets at `IMPLEMENTATION_TARGETS_MAX`. Add an Action scope for one Site
Health issue group across its affected cohort. A later comparable crawl decides
the outcome: verified, partially resolved (naming the pages still failing),
still failing or inconclusive, with the original revision and cohort shown.
Only then can `web.*` rules become Actions without flooding the list.

**Decision:** should web-fundamentals defects become Actions, and only through
issue-group scope?

### B2. Element-level evidence and minimal patches

An unnamed control is recorded only as tag, type, id, name and ordinal
(`site-health/analysis/accessibility-facts.ts`), and no raw HTML is kept
([Site Health](../site-health.md)). The Agent cannot produce a verified exact
patch without the element and its label context. Store a bounded, redacted
snippet per failing control, then have the Agent skill separate the minimal
required patch from optional improvements (validation, autofill).

**Decision:** may the crawler retain redacted snippets of customer markup
(storage, privacy and licensing)?

### B3. Developer handoff and inspectable evidence

Add "Prepare developer ticket" on top of `lib/agent/handoff.ts`, and a
recorded deployment step tied to the Action. Evidence chips group references
by kind and link multi-record groups to a generic screen
(`lib/agent/evidence.ts`); list each record with its date and whether it was
observed or inferred. Dates need persisted source metadata, since reads never
resolve records.

### B4. Journey coverage

A sanitized four-turn evaluation of the client conversation in
`scripts/eval-agent.ts`, and one end-to-end journey through the real browser,
API and database with only the model provider stubbed (browser tests mock the
API today). Accessibility resolution is the measured outcome; signup conversion
and search uplift are separate observations, never attributed automatically.

### Deferred: durable execution

A turn lives as long as its request (`routes/agent.ts`); closing the browser
ends it as interrupted, with lease recovery. This is deliberate. Moving
execution to a background worker with reconnectable progress is a large change;
revisit only if clients report interrupted runs. See also "Agent partial-text
resume" in the [backlog](backlog.md#deferred-proposals).

Owners: [Agent](../agents.md), [Opportunities](../opportunities.md) and
[Site Health](../site-health.md).
