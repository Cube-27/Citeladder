---
id: internal_links
label: Internal links
group: owned_site
order: 6
version: 1
output_kind: link_plan
description: Improve contextual internal links to commercially important pages using CiteLadder page and crawl evidence. Use for supporting-page maps, weak inbound linking and orphan candidates; not blind link quotas.
---

# Internal links and page architecture

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome and evidence

Make useful priority pages discoverable from relevant content and guide readers toward the next appropriate decision. Required: priority destinations plus actual source-page content; a true graph audit additionally requires link-edge data and a declared URL inventory. Optional: GSC, backlinks, crawl depth, sitemap, CMS inventory, canonical/redirect data and conversions.

Begin by confirming which pages drive or support the business outcome. Do not route every link to the homepage or a commercial page regardless of reader intent. A policy, methodology, guide or help page may be the correct next step.

## Use a page map, not a link quota

When priority pages are not confirmed, propose a minimal map with money, hub, support and trust roles from observed page purpose. Explain which supporting task makes each proposed contextual link useful. Retain current links that already serve that job. A domain backlink overview cannot substitute for internal edges; a truncated crawl cannot establish site-wide orphan status. Hand off exact source paragraph, destination and proposed descriptive anchor for each accepted change.

## Workflow

1. **Build the URL universe and coverage statement.** Reconcile observed crawl URLs with available sitemap/CMS/GSC/backlink destinations. Keep dataset origin and dates. Apply only confirmed canonical/redirect relationships; do not strip meaningful parameters or assume slash/case variants are identical. A crawl-limited universe cannot establish whole-site orphans.
2. **Separate link types.** With DOM/placement evidence, distinguish editorial body links, navigation/footer, breadcrumbs, related-content modules and unknown placements. Keep both all-link and contextual-link views. A destination present on at least half of sampled pages is only a *candidate* template link, not an automatic exclusion: inspect repeated placement and source templates before removing it from the contextual view.
3. **Count defensibly.** Compute distinct inbound source pages per target, excluding self-links. Keep repeat links and anchor variants as separate diagnostics, not additional independent endorsements. A repeated component on 50 pages should not become 50 editorial recommendations. Retain link attributes and final destinations where observed.
4. **Classify isolation correctly.** `Observed unlinked` means no inbound edge within the available complete-for-scope graph; `orphan candidate` means the page exists in another inventory but inbound coverage is incomplete; `contextually unsupported` means navigation/module links exist but editorial links do not. A page with no GSC rows is not an orphan. Never claim a partial crawl proves a whole-site absence.
5. **Map supporting content to priority pages.** Select source pages that answer adjacent buyer questions and naturally need the destination. Use topic relevance and the reader's next task first, then observed traffic/backlink value and feasibility. An externally linked guide with no useful path to a related service page may be a good candidate; external links do not prove the internal link will improve rankings.
6. **Find concentration and leaks.** Inspect targets receiving disproportionate contextual links and those starved despite business importance. Distinguish intentional hubs from accidental template effects. Review links to outdated/redirected/broken pages and correct the actual destination when intent matches. Do not remove useful hub or utility links simply to redistribute a metric.
7. **Write precise proposed placements.** Fetch/read each proposed source paragraph. Provide source URL, target URL, exact section/current text, revised sentence, descriptive anchor and reader benefit. Use a natural anchor that explains the destination; do not rotate words mechanically, force exact matches or repeat generic “learn more.” Skip irrelevant placements, even when a target has no links.
8. **Preserve the architecture.** Connect new content through suitable hubs and related pages. Avoid creating circular link blocks whose only purpose is search manipulation. Do not overburden an already useful paragraph. Document dependencies on missing pages or broken target URLs.
9. **Validate and plan measurement.** Verify each proposed destination is the intended accessible canonical page. After authorized implementation, check actual rendered anchors, paths and placement; retain a change log. Compare page/cluster discovery, query coverage and business outcomes over adequate periods with the Measure results skill.

## The four-link heuristic

The user-supplied study describes an observational association around four contextual inbound links. Its sample statistics were not independently verified. You may flag priority pages with fewer than four distinct contextual source pages as an exploratory triage view **only if the user asks for that rule**. Never enforce four links as a ranking threshold, declare causation, or add a fourth irrelevant link. Similarly, “top 20 pages hold half the links” is a diagnostic to measure on this site's data, not an assumed universal fact.

## Outputs

Produce `internal-link-plan.md` and `internal-link-edits.csv`:

```text
edit_id, source_url, destination_url, source_section,
current_text, proposed_text, anchor_text, placement_type,
reader_benefit, supporting_evidence, target_priority,
verification_state, dependency
```

Include a money/support-page map and a graph summary only if edge coverage supports them: known URL universe, crawled share, link-type rules, distinct contextual sources by target, orphan candidates and concentration. Otherwise label the deliverable a **candidate placement plan**, not a completed internal-link audit.

## Questions, validation and stops

Ask which conversion destination matters only if business context cannot resolve it. No crawl-edge data means no graph statistics; missing source copy means no invented before/after quotation. Do not remove navigation/footer links from the site merely because they were excluded from an editorial analysis. Do not claim a live link exists after producing a draft. Stop at the number of placements that can be justified; never pad to a quota. Route real target errors to the Technical health skill and missing supporting assets to the Create content skill.
