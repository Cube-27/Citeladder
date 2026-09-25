---
id: comparison_content
label: Comparison content
group: content
order: 11
version: 1
output_kind: content
description: Research and write honest product, service or provider comparisons and alternatives pages grounded in CiteLadder buyer demand and verified claims. Use for named competitors, not fabricated superiority or neutral-looking promotion.
---

# Comparison and alternatives content

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome and inputs

Deliver a comparison that helps the stated buyer make an informed decision. The sponsoring brand may be a strong choice, a narrow-fit choice, or not the best fit for some needs. Do not force the “one narrow concession, our product wins broadly” premise from the supplied example.

Required: the actual entities, buyer decision/market, verified facts and the requested page format. Optional: relevant GSC queries, AI prompts/answers, competitor selection, current comparison pages, user reviews, product documentation, pricing and approved firsthand tests. For a named comparison, research that comparison directly rather than launching a full competitor discovery program.

## Keep scope and factual symmetry

A named comparison needs research on that comparison, not a new competitive-landscape project. Use the same decision criteria and current evidence standard for both providers. A competitor’s keyword footprint cannot establish its feature set. Compare alternatives by buyer fit, including more than one competitor advantage when supported; never constrain research to one convenient concession. Carry pricing, geographic coverage and packaging dates into the claim ledger and recheck them before public use.

## Workflow

1. **Frame the decision.** Identify who is choosing, for what use case, under what material constraints and where the businesses actually overlap. Separate factual comparison from opinions/test experience. Disclose the publishing brand's relationship where a page might otherwise appear independent.
2. **Inspect existing coverage and demand.** Read existing owned pages and the relevant prompt/query cohort. Decide whether to update a canonical comparison, create a genuinely distinct page or avoid duplication. Do not choose competitors merely because they are recognizable.
3. **Define equivalent criteria first.** Use the buyer's material decision dimensions: suitability, scope, capabilities, service model, total cost, implementation, limitations, compatibility, geographic availability or verified compliance where relevant. Apply the same definitions and evidence standard to each option. Do not cherry-pick trivial criteria the sponsor wins.
4. **Verify primary facts.** Check current official pricing, product/service pages, documentation and applicable terms. Record source and verification date per claim. Price comparisons must preserve currency, billing cadence, annual commitment, seat/usage assumptions, mandatory add-ons, tax treatment when provided, and quote-based language. Unknown does not mean missing/free/worse. A feature absent from a page is not proof the product lacks it.
5. **Handle independent sentiment carefully.** Use credible attributed reviews for reported experiences, not universal capability claims. Do not invent review scores, customer quotes or personal hands-on testing. Resolve conflicts between current product facts and dated reviews; preserve uncertainty when unresolved.
6. **Derive fit guidance from evidence.** Name the conditions under which each option is appropriate and the important limitations of the sponsor. Do not require exactly one competitor advantage or exactly three differentiators. If evidence is insufficient for an overall recommendation, publish a factual table with conditional choice guidance instead of a forced verdict.
7. **Write complete content.** Include a clear title; concise decision summary with qualifications; a sourced like-for-like table; explanation of only decision-relevant differences; actual pricing context; when to choose each; migration/replacement caveats when applicable; real unanswered buyer questions; and a relevant, non-deceptive CTA. Do not repeat every table row in prose or add a year unless the comparison is actually maintained and current.
8. **Make source and brand claims inspectable.** Keep critical qualifiers and source links near the relevant claim. Tables must not use unsupported checkmarks. Keep important visible content accessible in the implementation. Recommend structured data only when it truthfully fits the actual page/entity and current supported features. Do not default every comparison to Product + FAQPage or promise citation gains.
9. **Review fairness and facts.** Recheck the strongest superiority/price/replacement claims against the same criteria and source dates. Ask whether a buyer choosing the competitor would feel their use case is represented honestly. Remove implied guarantees, unverified compliance claims and unsupported category-wide assertions.

## Outputs

Produce `comparison-page.md` and `comparison-evidence.csv`:

```text
criterion, definition, buyer_relevance,
option_a_claim, option_a_source, option_a_verified_at,
option_b_claim, option_b_source, option_b_verified_at,
qualifiers, unresolved_conflict, public_copy_location
```

For an alternatives list, add rows/options as actually justified and explain inclusion/exclusion criteria. Do not fill a “top 10” list with poor fits. Include a maintenance note naming volatile facts and a review trigger, not a fake updated date. Default to a reviewed draft, not publication.

## Questions, validation and stop rules

Ask only for an essential buyer/market/offer ambiguity. A missing current price blocks a definitive “cheaper” claim but not a comparison of verified capabilities. Stop a comparison premise that depends on false superiority; replace it with conditional evidence-led guidance. Do not publish defamatory allegations or disguise branded content as independent testing. No mandatory word count, FAQ count or narrow-concession quota. Route cross-page link needs to the Internal links skill and follow-up performance to the Measure results skill.
