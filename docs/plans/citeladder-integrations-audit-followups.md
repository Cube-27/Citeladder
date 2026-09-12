# Integrations and AI Visibility — pending work

Pending, selected by the owner; no active implementation is established.
[Connected data](../integrations-traffic-analytics.md),
[Visibility](../visibility-prompt.md) and [Opportunities](../opportunities.md)
own shipped behavior. The [original audit follow-up](../archive/plans/citeladder-integrations-audit-followups.md)
preserves evidence and historical suggestions. Queue order is not inferred.

## Remaining scope

- Make Mentions & Citations actionable: show mentioned+cited, mentioned-only,
  cited-only and neither, engine coverage and competitor evidence, then link
  applicable evidence to the existing Opportunity/Content handoff.
- Add explicit generation from selected search queries. Carry QueryEvidenceRow
  identity and observation provenance through existing generation, validation
  and editing. The former pipeline plan's Slice 6 is consolidated here; no
  parallel plan or second generator is needed.
- Improve evidence-backed Opportunity sorting and labelling without another
  blended score; expose the existing three-leg verification result, gap changes,
  overlapping actions and causality notice.
- Add an evidence-grounded Trends summary. Preserve comparable selection and
  existing backend measurement authority.
- Improve property selection using the project's site identity and existing
  page-equivalence evidence. Move history-backfill fan-out out of the HTTP
  request through the existing task owner if implemented.
- Review whether Query Fanout grouping should move server-side; its full-selection
  totals already do. Do not claim grouping work is complete.
- Correct any public claim that CiteLadder already imports generative-AI Search
  Console reporting. Verify current copy before editing.

## Boundaries and acceptance

First-party AI report integration requires a documented endpoint, supported
authentication and an explicitly authorized successful response. Until then it
is unverified, not disproven: do not scrape an authenticated dashboard or
substitute ordinary search traffic. Keep first-party AI observations separate
from search traffic and CiteLadder experiments with exact metric/source identity.

Never auto-replace the tracked portfolio, equate GSC impressions with AI prompt
volume, overwrite the user's Content skill choice or auto-publish. Preserve
workspace authorization, source IDs, coverage, null/zero semantics and
configuration-owned limits. Scope execution explicitly before starting a slice;
apply the existing repository validation policy to its finished executable diff.
