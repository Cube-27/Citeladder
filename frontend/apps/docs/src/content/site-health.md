---
title: 'Site Health'
description: 'Inspect website issues, understand Web and AEO scores, and choose changes with supporting page evidence.'
group: 'Measure and understand'
order: 130
---

A Site Health crawl captures pages from your website and analyzes their technical and content properties. Begin with **Run new crawl**, then review the crawl's scope, progress and coverage.

## Read the score with its coverage

**Web** summarizes determinate applicable website checks. **AEO** summarizes determinate checks across answerability, structure, evidence, machine readability, provenance, freshness and crawlability.

A higher score does not promise rankings, indexing or citations. "No observed blocker" means the captured evidence did not reveal a blocker; it is not confirmation that an engine indexed the page.

A **Partial audit** can still show a score. Read the accompanying coverage to understand how many pages were scored and which applicable checks remain unresolved.

## Open the affected page

For a finding you intend to fix:

1. Open its affected pages.
2. Read the captured evidence and page classification.
3. Check whether the issue applies to that page's purpose.
4. Compare with the current website before making changes if the crawl is old.

Page classification affects which checks apply. A product page and an editorial article do not have identical expectations. An unresolved page purpose remains unresolved.

## Understand how results roll up

Page scores use determinate applicable checks. Checks marked unknown, error or partial do not receive passing credit. They remain visible in completion and coverage.

Crawl scores average finalized page scores in the selected cohort. A page with many checks does not automatically outweigh one with fewer checks. Avoid rebuilding the score from a filtered issue table.

## Review crawler permissions

The crawler panel groups bots by purpose: search engines, AI search, AI
training and user-triggered fetches. Filter by purpose to focus the table.
**Root access** reports the homepage permission. **Policy** reports All allowed,
Restricted, All disallowed or Unknown access over the crawl's bounded URL sample.
These can differ when rules allow the homepage but block other paths.

The matched group shows a bot-specific group, wildcard fallback or **Not
specified**. Missing or unreadable evidence stays unknown. These observations
describe robots.txt permissions; they do not confirm indexing, citations or
bot visits.

Open **robots.txt history** to inspect earlier observations. Choose two
observations on the loaded page to compare their retained text, and use the
pagination controls for older observations. Repeated text can share a snapshot
while retaining each crawl's observation. A truncation notice means the retained
text is incomplete. **Ask agent** carries the selected crawl context into a
conversation about the evidence.

## Work through an issue

Use **Ask agent** on supported evidence screens, or **Work on this** on the related Action. Ask for a small, reviewable correction tied to the affected page.

For example: "Explain the confirmed issue on this page, distinguish it from unresolved checks, and prepare a fix brief for our developer."

## Check after implementation

After your team changes the site, declare the relevant Action implemented and run a later crawl when appropriate. Review the resulting checks and comparison scope. Different page coverage or incompatible conditions may limit what can be compared.
