---
title: 'Site Health'
description: 'Inspect website issues, understand Web and AEO scores, and choose changes with supporting page evidence.'
group: 'Measure and understand'
order: 130
updated: '2026-11-18'
---

A Site Health crawl captures pages from your website and analyzes their technical and content properties. Begin with **Run new crawl**, then review the crawl's scope, progress and coverage. Every crawl audits the same tracked pages, so **Run new crawl** is the one crawl button and Changes always compares like with like. The Overview's **Open issues over time** card plots your open issues, one point for each day a crawl or re-audit landed.

## Schedule crawls

**Schedule** beside **Run new crawl** runs it automatically, **Weekly** or **Monthly**. It is off until you turn it on, on every plan, and shows the next crawl's date. A scheduled crawl uses your crawl allowance like one you start. If a crawl is still running, or the allowance is used up, that occurrence is skipped and the schedule shows why; repeated failures turn it off.

## Crawl pages robots.txt excludes

CiteLadder respects your robots.txt by default. To audit pages it disallows on your own site, open the menu beside **Run new crawl** and choose **Ignore robots.txt**, then confirm with **I am authorized, run crawl**. Crawl delay, rate limits and access controls still apply, and the crawl only ignores robots.txt on your site's domain and its subdomains.

Your confirmation is recorded on the crawl with your email. Later and scheduled crawls keep the choice and say so; to respect robots.txt again, choose **Respect robots.txt** from the same menu. Pages fetched only because of it are marked **Robots.txt excluded**. CiteLadder's other fetches, such as competitor, cited-source and product pages, always respect robots.txt.

## Read the score with its coverage

**Web** summarizes scored website checks. **AEO** summarizes scored checks across answerability, structure, evidence, machine readability, provenance, freshness and crawlability.

A higher score does not promise rankings, indexing or citations.

A **Partial audit** can still show a score. Read the accompanying coverage to understand how many pages were scored and which applicable checks remain unresolved.

## Find the issues to fix first

**Issues** opens with how many issues the latest crawl found, how they split by severity, and the three worst to fix first. The table below lists one tab at a time: **Technical** (how pages are served and indexed), **Content** (titles, descriptions, headings, accessibility and page copy) and **AEO** (what answer engines need to read and cite a page). Each tab lists defects and advisories together: an advisory carries an **Advisory** tag and sorts after the defects of its severity. Search the list, filter by page kind or by **Severity** (**High**, **Medium**, **Low**, or **Advisory** for advisories only), and sort by severity or by pages affected. Open an issue to see how to fix it, its affected pages, **Ask agent** and **Copy fix prompt**. A sitewide finding, such as a broken link in the navigation, lists a sample of the pages it was found on with the total.

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

Other checks are unscored: advisory checks such as meta descriptions, Open Graph tags, content recency, a missing H1, dead-end pages that link to no other page on the site, and meta descriptions repeated across the site; and defects such as broken internal links, invalid JSON-LD, titles repeated across the site, and your site still being served over plain HTTP instead of redirecting to HTTPS. A sitemap that was served but could not be parsed is reported as such, rather than as a missing sitemap. Pages marked noindex or canonicalized elsewhere are left out of the duplicate checks. A certificate problem on your homepage is named (expired, not yet valid, self-signed, wrong hostname, untrusted or revoked) instead of reported as a failed connection.

Answer-first checks, which look for a server-rendered answer under each question-style heading, also run on articles, guides, how-tos, docs and comparison pages, not only FAQ pages. These new checks apply from your next crawl. A failing unscored check still raises an issue you can work on; fixing it does not change a score. A few diagnostic readings, such as response time, are reported without raising an issue.

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

Use **Ask agent** on an issue, on one of its pages, or on supported evidence screens. Ask for a small, reviewable correction tied to the affected page, or one fix for a shared template or component that fails on many pages. For form fields without an accessible name, the crawl also keeps one redacted HTML example of a failing field (tags and attribute names, with text and values removed), so the Agent can write an exact fix.

Issues are tracked here, in **Issues**, from finding to fix. Each issue with something to fix (not a diagnostic reading), advisories included, is also listed in [Actions](/agent/actions/), covering every page it affects; an advisory's row there is marked **Advisory**. This page works the same either way.

For example: "Explain the confirmed issue on this page, distinguish it from unresolved checks, and prepare a fix brief for our developer."

## Check after implementation

After your team changes the site, declare the relevant Action implemented and run a later crawl when appropriate. Review the resulting checks and comparison scope. Different page coverage or incompatible conditions may limit what can be compared.
