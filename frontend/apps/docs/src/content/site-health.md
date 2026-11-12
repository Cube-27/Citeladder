---
title: 'Site Health'
description: 'Inspect website issues, understand Web and AEO scores, and choose changes with supporting page evidence.'
group: 'Measure and understand'
order: 130
updated: '2026-11-12'
---

A Site Health crawl captures pages from your website and analyzes their technical and content properties. Begin with **Run new crawl**, then review the crawl's scope, progress and coverage. **Recrawl** reruns the shown crawl with the same scope and settings, so Changes compares like with like.

## Schedule crawls

**Schedule** beside the crawl buttons reruns the latest crawl automatically, **Weekly** or **Monthly**, with the same scope and settings as **Recrawl**. It is off until you turn it on, on every plan, and shows the next crawl's date. A scheduled crawl uses your crawl allowance like one you start. If a crawl is still running, or the allowance is used up, that occurrence is skipped and the schedule shows why; repeated failures turn it off.

## Crawl pages robots.txt excludes

CiteLadder respects your robots.txt by default. To audit pages it disallows on your own site, open the menu beside **Run new crawl** and choose **Run new crawl ignoring robots.txt…**, then confirm that you are authorized to crawl the site. Crawl delay, rate limits and access controls still apply, and the crawl only ignores robots.txt on your site's domain and its subdomains.

Your confirmation is recorded on the crawl with your email. **Recrawl** and scheduled crawls keep the choice and say so. Pages fetched only because of it are marked **Robots.txt excluded**. CiteLadder's other fetches, such as competitor, cited-source and product pages, always respect robots.txt.

## Read the score with its coverage

**Web** summarizes scored website checks. **AEO** summarizes scored checks across answerability, structure, evidence, machine readability, provenance, freshness and crawlability.

A higher score does not promise rankings, indexing or citations.

A **Partial audit** can still show a score. Read the accompanying coverage to understand how many pages were scored and which applicable checks remain unresolved.

## Find the issues to fix first

**Issues** opens with how many issues the latest crawl found, how they split by severity, and the three worst to fix first. The table below lists one tab at a time: **Technical** (how pages are served and indexed), **Content** (titles, descriptions, headings, accessibility and page copy) and **AEO** (what answer engines need to read and cite a page). Search it, filter by severity or page kind, switch to advisories, and sort by severity or by pages affected. Open an issue to see how to fix it, every affected page, **Ask agent** and **Copy fix prompt**.

In **Site Health → Pages**, search finds pages by any part of their URL.

A page's own screen lists its issues worst first, then one card per issue with the fix, the evidence and the scores it counts toward. **Ask agent about this page** starts a chat about all of the page's issues; each card's **Ask agent** starts one about that issue on that page. **Re-audit to verify** re-checks the page after a fix.

## Open the affected page

For a finding you intend to fix:

1. Open its affected pages.
2. Read the captured evidence and page classification.
3. Check whether the issue applies to that page's purpose.
4. Compare with the current website before making changes if the crawl is old.

Page classification affects which checks apply. A product page and an editorial article do not have identical expectations. An unresolved page purpose remains unresolved.

## Scored and advisory checks

Only scored checks move the Web and AEO scores. They are the checks that affect whether search and AI engines can reach, read and trust a page, such as HTTPS, indexability, crawler access, valid structured data and visible attribution.

Other checks are unscored: advisory checks such as meta descriptions, Open Graph tags or content recency, and defects such as broken internal links. A failing unscored check still raises an issue you can work on; fixing it does not change a score. A few diagnostic readings, such as response time, are reported without raising an issue.

## Understand how results roll up

Page scores use the scored checks that apply to the page. Checks marked unknown, error or partial do not receive passing credit. They remain visible in completion and coverage.

Crawl scores average the finalized page scores of the pages CiteLadder monitors for the project. A page with many checks does not automatically outweigh one with fewer checks. Avoid rebuilding the score from a filtered issue table.

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

A website issue that fails on many pages, such as a shared template or component, is [one Action across all of them](/agent/actions/#fix-one-issue-across-many-pages). The Agent gets the affected pages without reading each one. For form fields without an accessible name, the crawl also keeps one redacted HTML example of a failing field (tags and attribute names, with text and values removed), so the Agent can write an exact fix.

On a content page, such as an article or guide, the related Action also holds any [content gaps](/content-optimization/) on that page. The issue still appears in **Issues**.

For example: "Explain the confirmed issue on this page, distinguish it from unresolved checks, and prepare a fix brief for our developer."

## Check after implementation

After your team changes the site, declare the relevant Action implemented and run a later crawl when appropriate. Review the resulting checks and comparison scope. Different page coverage or incompatible conditions may limit what can be compared.
