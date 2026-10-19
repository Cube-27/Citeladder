---
name: record-owner-decision
description: Where CiteLadder owner decisions are recorded and what counts as one. Invoke when the owner answers a question or makes a product, billing, legal or cross-feature decision, when a change relies on such a decision, or when citing one.
---

# Recording owner decisions

Owner decisions live only in these logs, each entry with its date and source:

- [Decisions](../../../docs/decisions.md): cross-feature choices.
- [Billing decisions](../../../docs/billing-decisions.md): billing, pricing,
  credits and plan gating (B-numbers).
- [Legal decisions](../../../docs/operations/legal-decisions.md): legal
  commitments, subprocessors, company details.
- A plan's owner-decisions section, for decisions scoped to that plan.

Notes an agent wrote in a PR, plan or code comment are not owner decisions.
A new owner answer is recorded in the matching log in the same pull request that
relies on it.
