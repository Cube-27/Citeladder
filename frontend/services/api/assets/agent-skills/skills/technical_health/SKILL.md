---
id: technical_health
label: Technical health
group: owned_site
order: 7
version: 1
output_kind: technical_fix
description: Find and verify technical SEO or AI-access defects using CiteLadder site-health evidence. Use for crawlability, indexing, canonicals, rendering, broken paths and technical handoffs; not speculative readiness scoring.
---

# Technical access and site health

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome and inputs

Produce a verified defect list and implementation-ready fixes ordered by affected business journeys. Do not optimize an aggregate score for its own sake. Required: a selected canonical domain and persisted site-health findings or authorized live-page evidence. Optional: URL inspection/index status, GSC performance, crawl edges/inventory, raw and rendered HTML, robots/sitemaps, response headers, field-performance data and release history.

## Evidence depth and verification boundary

A score-only read can prioritize investigation but cannot support an exact issue or code fix. Open the affected final analysis and its evidence where a real reader exists. Reuse the inspected page-kind and applicability state; do not apply homepage checks to all pages. Distinguish technical access from actual search-engine indexing, and source edits from verified live repairs. A missing URL-inspection integration is a capability limitation, not proof that a page is unindexed.

## Workflow

1. **Establish the actual target.** Identify production versus preview, canonical host and priority page families. Preview indexing blocks may be intentional. Do not score a marketing website as defective for lacking an MCP server, commerce protocol or agent API.
2. **Inspect coverage before severity.** Read latest site-health snapshot and its evidence references. Record crawl date, page limits, successful/failed fetches, page types and unavailable checks. A high aggregate score does not prove every priority URL is accessible; an unsupported check does not fail.
3. **Reproduce priority findings.** For suspected blockers, inspect the recorded crawl evidence and state that a fresh scoped check on the live site is needed before a fix ships. Record final URL, response status, relevant headers, directives and the exact failing content/link. Source code, saved crawls and live production are different evidence states.
4. **Follow the access path.** Check DNS/HTTP reachability and redirects; robots rules; CDN/WAF/login challenges; allowed fetching of required resources; visible meaningful content; canonical and robots metadata; internal discoverability; sitemap membership where appropriate. Keep crawling, indexing eligibility and actual indexed status separate. HTTP 200 alone is not proof of useful content; an allowed crawler is not proof of citation.
5. **Diagnose rendering, not frameworks.** Compare raw response and rendered content when tools permit. Verify the specific search/crawler/user-agent behavior needed for the task. Do not report every JavaScript page as invisible or assume all AI agents have the same rendering limitations. Prefer resilient delivery of important content when a real access problem is demonstrated.
6. **Respect intended indexing policy.** Distinguish an accidental noindex on a priority page from a deliberate exclusion on internal search or account pages. A robots-blocked URL may prevent a crawler reading a noindex directive; robots is not an indexing removal tool. Canonical tags are not substitutes for redirects in every situation and must not point distinct content to the homepage.
7. **Evaluate page-type-specific details.** For product/service/organization/editorial/local/dataset pages, verify appropriate visible facts, metadata and structured data against the actual page purpose. Do not prescribe Product markup for every comparison article. Verify current rich-result support before recommending a type. Treat readable headings and link text as usability/content structure, not fixed H1/word-count ranking quotas.
8. **Assess experience with the right evidence.** Separate real-user field measurements from lab tests; retain device, period and coverage. Report observed loading/interactivity/layout issues on relevant journeys. Do not equate a single lab score with a site's search performance or invent Core Web Vitals values.
9. **Separate search policy from training policy.** For ChatGPT, OAI-SearchBot and GPTBot have different roles. For Google's AI Search surfaces, use the applicable Googlebot/index/snippet controls. Verify the current provider documentation before writing rules for another bot. Ask the owner about search-versus-training policy before changing it. Never treat “allow every AI bot” as a default technical fix.
10. **Deduplicate root causes and prepare a fix.** Group related defects by template/configuration owner. State affected URLs and commercial impact, smallest safe patch, dependencies, acceptance test and rollback. Preserve unrelated canonical, security, privacy and publishing settings.

## Priority rules

Use **blocker** for an evidenced failure of an intended priority journey or indexability path; **material** for a verified issue with meaningful affected coverage; **improvement** for a defensible but nonblocking enhancement. Use **needs verification** for unresolved signals. Severity is conditional on the page's intended purpose and business impact, not the scanner's numeric label alone.

Do not classify missing `llms.txt`, a vendor agent-readiness level, absent markdown negotiation or a fixed citation-block size as a proven SEO/AEO defect. Those may be separate product/agent-utility experiments only when relevant, with no promised ranking benefit. Current FAQ rich-result support must be checked; do not ship outdated guaranteed benefits.

## Output

Produce `technical-fix-plan.md` and, when useful, `technical-issues.csv`:

```text
issue_id, category, intended_page_behavior, affected_urls,
observation_date, evidence_refs, exact_observation,
verification_state, severity_and_business_reason,
root_cause_or_hypothesis, proposed_fix, owner_role,
dependencies, acceptance_test, rollback_condition
```

You have no repository or site access. Deliver an engineer-ready patch specification or configuration diff, never an invented execution log. Keep “proposed,” “deployed” and “live verified” separate; only the user declares implementation.

## Validation and stop rules

Every reported defect must have page-specific or template-specific evidence and a meaningful expected behavior. A crawl cap prohibits complete coverage claims. Lack of inspection tools prohibits “indexed/not indexed” certainty. Do not repeatedly crawl an entire site to verify one header fix. Stop at the requested audit/patch boundary. Route content evidence gaps to the Create content skill, architecture gaps to the Internal links skill, and actual after-change validation to the Measure results skill.
