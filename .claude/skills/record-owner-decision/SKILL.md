---
name: record-owner-decision
description: Where CiteLadder owner decisions are recorded and what counts as one. Invoke when the owner answers a question or makes a product, billing, legal or cross-feature decision, when a change relies on such a decision, or when citing one.
---

# Recording owner decisions

Owner decisions live only in these logs:

- [Decisions](../../../docs/decisions.md): cross-feature choices.
- [Billing decisions](../../../docs/billing-decisions.md): billing, pricing,
  credits and plan gating (B-numbers).
- [Legal decisions](../../../docs/operations/legal-decisions.md): legal
  commitments, subprocessors, company details.
- A plan's owner-decisions section, for decisions scoped to that plan.

Notes an agent wrote in a PR or plan are not owner decisions.
The source of an entry is the owner and the date, never an agent's reading.

## Writing an entry

Record the rule as the owner meant it, interpreted and dated (owner, date), in one
or two lines. Never paste a quote, and never reword an answer into more than
the owner said. A choice the implementer made is not the owner's: leave it out
or label it.

## Keeping the log lean

Every addition re-reads the whole log first, then in the same change:

- rewrites or removes any entry the new one duplicates, contradicts or
  supersedes (never append a correction);
- merges entries about the same rule;
- deletes entries that code or an owner document now fully encodes, linking the
  owner instead;
- keeps rationale, shipped behaviour and layout detail out: those belong to the
  feature doc or [design](../../../docs/design.md).

A new owner answer is recorded in the matching log in the same pull request that
relies on it.
