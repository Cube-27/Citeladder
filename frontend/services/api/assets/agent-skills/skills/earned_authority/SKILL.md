---
id: earned_authority
label: Earned authority
group: visibility
order: 9
version: 1
output_kind: earned_brief
description: Find legitimate third-party citation, mention and backlink opportunities using CiteLadder source and competitor evidence. Produce source-specific pitches, corrections or linkable-asset plans; never bulk spam or automatic outreach.
---

# Earned mentions, backlinks and source opportunities

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome and inputs

Choose attainable, relevant third-party actions that improve the information available to buyers and potentially to search/AI systems. Deliver researched prospects and usable drafts, not a list of famous domains. Required: verified business facts and at least observed source URLs, usable backlink records, or an explicitly scoped prospect list the user supplies. Optional: competitor profiles, source usage by prompt/run, source inspections, lost/broken links, unlinked mentions, first-party research and approved proof assets.

Distinguish four outcomes: a live backlink, an unlinked mention, a cited source containing the brand, and an independent recommendation. They can overlap but are not interchangeable. An owned social profile is not independent earned evidence.

## Asset and contact qualification

Begin with the exact asset and a defensible reason for an editor to cite it. Separate candidates discovered from AI citations, observed individual backlinks, referring-domain summaries, and prospects the user supplies. A summary does not establish a particular linking page or anchor. You cannot browse, so do not supply contact details: for the best candidates, name the contact path the user should look for (author page, editorial guidelines or contact form) and never guess email patterns. Draft a page-specific request; sending remains separate authorization.

## Workflow

1. **Start from observed relevance.** Read project source/visibility and opportunity evidence. For backlink analysis, require actual source→target records with provider coverage/time. Search Intelligence backlink datasets are referring-domain and destination-page aggregates, not individual edges; state missing raw link data rather than inventing a profile.
2. **Build a typed prospect pool.** Separate recurring AI-cited sources, competitor referring domains, relevant unlinked mentions, lost/broken referring links, reputable directories/associations, reviewers/editors, communities and potential research partners. Deduplicate syndicated copies and multiple links from the same source. Do not infer public contact names/emails from naming patterns.
3. **Inspect the actual page and inclusion rules.** For priority prospects, verify relevance to the target audience, recency, editorial quality, factual criteria, competitor presence, current brand presence, existing outbound links and accessible contribution/contact route. A domain appearing in a provider database is not proof the backlink is still live or that it accepts submissions.
4. **Separate host authority from useful evidence.** Provider authority/rank metrics are contextual estimates. Assess topic fit, audience, editorial independence, real readership/utility, attainable inclusion and evidence contribution. Do not prioritize solely by a high domain metric or a platform's global citation share.
5. **Choose the right intervention.**
   - **Correction:** a source states a materially false/outdated fact; prepare a short factual correction with primary proof.
   - **Editorial inclusion:** the brand meets documented criteria and adds useful coverage; prepare a specific pitch, not a demand for a backlink.
   - **Link reclamation:** verify an existing mention or lost/broken link and suggest the correct relevant destination.
   - **Expert contribution:** offer genuinely available expertise or a quote supplied/approved by a real person. Do not invent an interview or impersonate an expert.
   - **Original asset:** specify useful research, data, a tool, methodology, comparison or reference worth citing. Plan collection/verification before claiming results.
   - **Community participation:** answer an actual current question, disclose the company relationship and follow platform/community rules. Do not insert promotional links when the answer does not need one.
   - **Reference/profile correction:** update factual records through the appropriate process. For conflict-of-interest encyclopedic topics, use the disclosed request/talk process, not covert promotional edits or fabricated notability.
6. **Draft usable content.** Write a source-specific outreach message, correction request, community answer or asset brief. Name the exact article/context and the factual value offered. Use the real sender identity only when provided; otherwise keep a marked sender placeholder outside publication-ready text. For buyer-facing drafts, separate internal prospect scores and private analytics from public claims.
7. **Prioritize practical work.** Compare relevant observed citation/source usage, genuine audience fit, missing useful evidence, editorial accessibility, effort and risks. Show a short high-confidence shortlist; fewer verified prospects are better than 100 guessed domains. Use a declared small pilot batch, not a mass campaign.
8. **Plan compliant execution and verification.** Default to drafts. Sending, posting, account creation and follow-up schedules need explicit authorization and an appropriate tool. Respect opt-outs, contribution policies and sender identity. Record action/date/outcome. Verify a resulting placement live; then track link presence, relevant source coverage, referrals and stable-panel visibility separately.

## Backlink-risk rules

A low provider score is not proof of a harmful link. Do not automatically disavow links or accuse a publisher of spam. Investigate actual patterns, ownership and relevant first-party warnings before recommending specialized cleanup. Do not buy links intended to pass ranking credit, create link networks, fake reviews/testimonials, require positive sentiment or manufacture community consensus. Legitimate paid sponsorship must be clearly distinguished from earned editorial evidence and handled under applicable platform/search rules.

A competitor being mentioned by a source does not prove that the source caused the recommendation. A newly earned link does not establish AI visibility uplift. Label the mechanism as a hypothesis and measure through the Measure results skill.

## Outputs

Create `earned-opportunity-plan.md`, `prospects.csv` and `outreach-drafts.md`:

```text
prospect_id, source_url, publisher, source_type, content_control,
relevant_buyer_task, observed_citations_or_links, observation_dates,
competitors_observed, current_brand_presence, evidence_refs,
inclusion_criteria, attainable_action, proposed_destination,
proof_required, verified_contact_route, priority_reason,
draft_id, permission_state, measurement
```

Provide one complete draft for each selected actionable prospect, or explicitly state which verified fact/contact input prevents it. Include an original-asset brief when the brand lacks a credible contribution. Reject prospects with a reason rather than silently filling the list.

## Validation and stops

No guessed contact details, fabricated backlink counts or unsourced competitor claims. No assumption that Reddit/Wikipedia/YouTube is the right destination for every industry. Stop outreach when authorization or identity is missing; continue with drafts. Stop link-profile conclusions when only citation-source data exists. Route missing proof/content assets to the Create content skill and comparative facts to the Comparison content skill.
