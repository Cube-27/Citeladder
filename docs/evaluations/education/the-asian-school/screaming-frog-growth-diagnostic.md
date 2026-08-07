# The Asian School — Growth Intelligence Diagnostic

**Domain:** `https://www.theasianschool.net/`  
**Evidence date:** 2026-08-05  
**Primary source:** supplied Screaming Frog export  
**Business context:** client-reported approximately 1% paid-acquisition return or conversion; not verified by this crawl

## Executive conclusion

The current problem should not be framed as “we need more keywords.” The crawl cannot establish paid-media return because it contains no advertising cost, lead-quality, application, enrollment, CRM, or revenue evidence. It does show that the website is not yet a strong admissions decision and answer surface:

- **90 successful internal HTML pages**, but **38 lack an H2** and **21 are flagged as low-content**;
- **zero detected structured-data implementations** across those 90 HTML pages;
- **180 internal PDFs**, making document inventory, current-versus-historical state, and contradiction handling essential;
- important admissions and trust assets exist, but their facts are scattered across pages and documents rather than represented as governed current knowledge;
- template and infrastructure issues affect most of the site, including blank-anchor links, unsafe cross-origin links, oversized images, and missing security headers;
- a sitewide `/calendar/` link creates **87 redirecting references** before resolving to `/school-calendar/`;
- two internal URLs returned 5xx responses, but the supplied summary does not identify them.

The recommended proposal is:

> Build a measurable admissions journey; turn the school’s pages and documents into governed, evidence-backed knowledge; repair answerability and machine clarity; create parent decision content from verified facts; then use GSC, GA4, paid-media, admissions, and AI-visibility evidence to decide what should be improved next.

This is a stronger CiteLadder pitch than a one-off SEO audit: Site Intelligence finds and structures the evidence, Content Intelligence turns verified gaps into work, Demand Intelligence connects behavior and demand, and the Growth Agent coordinates bounded actions with human approval.

## Evidence boundaries

### Supported by the supplied crawl

- discovered URL and content-type inventory;
- status codes, redirects, depth, indexability, headings, metadata, images, links, canonicals, directives, structured data, and security-header observations;
- the presence of admissions, fees, prospectus, curriculum, facilities, affiliation, disclosure, leadership, results, policy, contact, event, and archive surfaces.

### Not supported by the supplied crawl

- actual ROAS or cost per enrollment;
- which paid keywords are wasteful;
- qualified lead, application, or enrollment conversion;
- GSC demand, rankings, clicks, or query-to-page alignment;
- GA4 engagement, key events, or journey abandonment;
- CRM/admissions-stage outcomes;
- current AI mentions, citations, rankings, or competitor share of voice;
- Core Web Vitals or accessibility quality. The supplied PageSpeed and accessibility summaries contain zero observations, which means unavailable/not run—not “no issues.”

### Resolve the reported “1%” first

| Possible metric | Definition | Required evidence |
|---|---|---|
| Landing-page conversion | qualified enquiries ÷ paid landing sessions | campaign/session identity, enquiry event, lead-quality rules |
| Enquiry-to-application | valid applications ÷ qualified enquiries | CRM or admissions-stage records |
| Application-to-enrollment | confirmed enrollments ÷ valid applications | admissions records |
| Cost per qualified enquiry | paid spend ÷ qualified enquiries | Ads cost plus lead qualification |
| Cost per enrollment | paid spend ÷ confirmed enrollments | Ads plus admissions outcomes |
| ROAS | attributable enrollment value ÷ paid spend | agreed value and attribution policy |

Until the data dictionary is agreed, external material should say **“client-reported ~1% paid-acquisition return/conversion”**, not present it as an audited KPI.

## Crawl baseline

Source files include `crawl_overview.csv`, `issues_overview_report.csv`, `serp_summary.csv`, `redirects.csv`, and `redirect_chains.csv`.

| Observation | Result | Interpretation |
|---|---:|---|
| URLs encountered / crawled | 500 / 495 | Broad crawl completed in 43 seconds |
| Internal URLs | 471 | Pages, assets, and documents |
| Internal indexable / non-indexable | 459 / 12 | Generally open, but role/disposition still needs review |
| Successful internal HTML | 90 | Primary page-analysis corpus |
| Internal PDFs | 180 | 38.22% of internal URLs; documents are a first-class product requirement |
| Internal redirects | 8 | Several are linked internally; `/calendar/` is sitewide |
| Internal 5xx | 2 | Exact URLs absent from the supplied summary |
| Internal 4xx | 0 | Positive at crawl time |
| HTML depth | 1 at depth 0; 66 at depth 1; 23 at depth 2 | Shallow reachability is positive |
| Structured-data pages | 0 of 90 | Critical machine-clarity gap |
| Missing H2 | 38 of 90 | Weak answer decomposition/content structure |
| Low-content flags | 21 | Needs role-aware review, not a blanket word-count fix |
| Exact duplicate content | 2 | Requires URL-level consolidation review |
| Images over 100 kB | 84 of 123 | Optimization opportunity; verify impact with performance data |
| Images missing alt text | 18 of 123 | Accessibility and image-understanding gap |
| Images missing dimensions | 7 of 123 | Layout-stability opportunity |
| Missing canonical | 181 of 270 HTML/PDF successes | Combined category is PDF-heavy; segment before remediation |
| Missing HSTS/CSP/XCTO/secure Referrer-Policy | 461 | Primarily server/template configuration |
| Unsafe cross-origin links | 88 | Likely repeated `target=_blank` handling without safe rel values |

### Canonical caveat

The canonical summary combines **90 HTML pages and 180 PDFs**. It reports 87 self-referencing canonicals and 181 missing canonicals. Because PDFs cannot carry an HTML `<link rel="canonical">`, do not report this as “181 HTML pages missing canonical tags.” Segment HTML and document policy first.

### Other material observations

- Titles: 2 duplicates, 4 over 60 characters, 6 below 30, 6 over the pixel recommendation, and 4 matching H1 text.
- Meta descriptions: 3 missing, 21 above 155 characters, 12 below 70, 26 above the pixel recommendation, and 12 below it.
- H1: 2 missing, 3 over 70 characters, and 2 pages with multiple H1s.
- H2: 38 missing, 2 duplicate, 4 over 70 characters, 12 pages with multiple H2s, and 1 non-sequential structure finding.
- Links: 2 pages have no internal outlinks; 88 have internal outlinks without anchor text; 88 have high external-outlink counts.
- All 471 internal URLs use HTTPS; zero mixed-content findings were recorded.

## Admissions knowledge diagnosis

### High-value knowledge already present

The crawl indicates owned content covering:

- institution identity, history, vision, and leadership;
- admissions procedure, enquiry, fees, and prospectus;
- academics, curriculum, grades/streams, syllabus, and calendar;
- boarding/pastoral care, transport, food, infirmary, sports, and facilities;
- faculty, affiliation, mandatory public disclosure, policies, awards, and results;
- contact, virtual tour, FAQs, events, news, and archives.

The gap is not simply “more pages.” These facts are scattered, time-sensitive, and sometimes document-heavy. They need a typed model that can distinguish current, historical, conflicting, unknown, and approved knowledge.

### Admissions journey to model

1. **Discover** — category/local/comparison question or paid search.
2. **Evaluate fit** — location, grades, curriculum, boarding/day fit, facilities, safety, results, activities, and faculty.
3. **Evaluate cost and requirements** — fees, inclusions, eligibility, documents, assessment, dates, and policies.
4. **Build trust** — affiliation, disclosure, leadership, proof, campus, and current results.
5. **Enquire or visit** — phone, WhatsApp, prospectus, contact, or campus visit.
6. **Apply** — registration/application start and submission.
7. **Complete enrollment** — assessment/interaction, payment, and confirmed admission.

For every stage, CiteLadder should expose supporting pages/documents, verified current assertions, unanswered questions, calls to action, compatible outcome events, and missing evidence. Missing measurement must remain `unavailable`, never be displayed as zero.

### PDF governance

The 180 PDFs may include prospectuses, fee schedules, disclosures, syllabi, circulars, transfer certificates, newsletters, and historical records. Required dispositions:

- `analyze` — current decision, compliance, or proof documents whose text should inform assertions;
- `inventory_only` — archives retained for coverage and provenance without extraction cost;
- `exclude` — duplicates, unsupported utilities, or irrelevant artifacts.

Each document needs media type, canonical identity, content hash, extraction coverage, publication/effective dates, temporal state, related entities/journey stages, and source coordinates. Historical documents must not silently overwrite current fees, dates, policies, or personnel.

## Findings by intelligence dimension

### Discoverability and delivery — mixed

Positive:

- HTTPS throughout the internal corpus;
- no internal 4xx at crawl time;
- shallow HTML depth.

Priority defects:

- identify and repair the two 5xx URLs from a URL-level response export;
- update the 87 `/calendar/` references directly to `/school-calendar/`;
- remove internal references to `/fee_stru.html`, `/sports/`, `/indian-classic-dance/`, and the older redirected blog URL;
- replace/remove the prize-ceremony image that redirects to `/404-error`;
- diagnose the repeated blank-anchor and high-external-outlink template elements;
- review the two pages with no internal outlinks.

### Knowledge completeness — present but fragmented

Create entities and assertions for the organization, campuses, programs, grades, curriculum, people, facilities, services, fee schedules, admission windows, affiliations, policies, and events. Every assertion needs exact source evidence, scope, confidence, temporal state, and contradiction status. Unknown values remain unknown and are requested from the school rather than inferred.

### Answerability — weak and inconsistent

The 38 missing-H2 and 21 low-content observations point to weak decomposition, but the objective is not mechanical heading insertion. Priority admissions pages need:

- an answer-first summary;
- explicit parent questions;
- current, scoped facts;
- proof and qualification;
- a next-step CTA;
- internal links to supporting evidence.

### Trust and evidence — strong source potential, weak governance

Affiliation, disclosure, policies, results, leadership, faculty, and institutional proof exist. The missing layer is current/historical state, consistent source ownership, contradiction review, and machine-readable parity. Security-header fixes should be server/platform work; test a CSP rather than copying a restrictive policy that may break forms and third-party services.

### Journey clarity — assets exist, outcomes unavailable

Admissions, fees, enquiry, contact, prospectus, and payment surfaces exist, but the crawl cannot show movement or event compatibility. Proposed event vocabulary:

- `view_admissions_overview`
- `view_fee_information`
- `download_prospectus`
- `start_admission_enquiry`
- `submit_admission_enquiry`
- `click_phone`
- `click_whatsapp`
- `book_campus_visit`
- `start_application`
- `submit_application`
- `confirm_enrollment`

Only compatible events present in the connected property should become active outcomes.

### Machine clarity — critical

Screaming Frog detected no structured data across the 90 HTML pages. Education v1 should support role-aware expectations where visible content supports them:

- `EducationalOrganization`/`Organization`, `WebSite`, `WebPage`, and `BreadcrumbList`;
- `Person` for current leadership/faculty profiles;
- `Article`/`BlogPosting` for editorial content;
- `Event` for current events with valid dates/status/location;
- `FAQPage` only for visible questions and answers;
- `VideoObject` for a real accessible virtual tour;
- organization logo/image identity.

Structured data must mirror visible content. Do not invent fees, dates, ratings, outcomes, or people.

## Prioritized program

### P0 — Measurement contract

1. Define the reported 1% precisely.
2. Define primary outcomes: qualified enquiry, valid application, confirmed enrollment.
3. Map GA4 key events and admissions/CRM stages.
4. Standardize UTM/campaign identity and paid landing-page ownership.
5. Establish baseline windows, attribution limits, and coverage.

**Output:** approved journey/outcome definition and evidence-coverage view.

### P1 — Education knowledge foundation

1. Inventory all HTML and PDFs.
2. Assign `analyze`, `inventory_only`, or `exclude`.
3. Separate generic page kind from Education role.
4. Extract typed entities, assertions, relations, content units, questions, and dates.
5. Group contradictions and promote only explicitly approved facts into durable memory.

**Product blocker:** current CiteLadder URL admission hard-excludes `.pdf`; Education v1 must admit PDFs as document inventory while keeping them out of the HTML analyzer.

### P1 — Admissions answerability and schema

Prioritize role clusters:

1. admissions overview/procedure;
2. fees and cost scope;
3. enquiry/application path;
4. curriculum/streams/grade fit;
5. boarding, safety, health, food, and transport;
6. affiliation/disclosure/results/trust;
7. contact/location/campus visit;
8. FAQ and comparison support.

For each role, define required questions, verified facts, sections, CTA, internal links, and schema expectations.

### P1 — Template and infrastructure fixes

- repair the two 5xx URLs;
- update redirecting internal links;
- fix the missing image reference;
- repair blank anchors and unsafe cross-origin links;
- optimize 84 oversized images, add 18 missing alt attributes where meaningful, and add 7 missing dimensions;
- add HSTS, X-Content-Type-Options, safe Referrer-Policy, and frame protection after testing;
- design and test CSP.

### P2 — Archive and intent rationalization

- separate current parent decision pages from certificate/archive surfaces;
- review duplicate `virtual-tour` host variants and duplicate content/title findings;
- normalize low-value author/category archives;
- label time-sensitive documents with effective dates and current/historical state.

### P2 — Demand and visibility loop

After the foundation exists:

- import GSC query×page and GA4 landing/event evidence;
- add paid cost/search-term evidence and admissions outcomes;
- identify demand with weak coverage or weak CTR;
- generate provisional prompts from approved knowledge;
- evidence-prioritize, review, and activate the prompt portfolio;
- compare later crawl, demand, and visibility snapshots without claiming causality.

## 90-day deployment

| Window | Work | Output |
|---|---|---|
| Days 0–14 | clarify metric; audit events/campaigns; inventory HTML/PDF; fix 5xx/redirect/template defects | approved outcomes and clean baseline |
| Days 15–30 | Education role classification; entity/assertion extraction; temporal review; journey map | Site Intelligence snapshot and review queue |
| Days 31–60 | admissions/fees/trust briefs; schema graph; linking and image improvements | approved implementation program |
| Days 61–90 | publish; recrawl; GSC/GA4 demand signals; prompts and visibility baseline | reproducible closed-loop report |

## Executive KPIs

Do not collapse everything into one opaque SEO score.

**Evidence and knowledge**

- corpus inventory and analysis coverage;
- current/historical/unknown coverage;
- entities/assertions with direct evidence;
- unresolved contradictions;
- approved-memory reuse.

**Site and content**

- journey-stage and required-question coverage;
- visible/schema parity;
- grouped actions resolved after recrawl;
- unsupported/stale claim rate;
- template/image defects resolved.

**Demand and outcomes**

- GSC query-to-page join coverage;
- paid/organic landing-page coverage;
- enquiry/application/enrollment event coverage;
- cost per qualified enquiry/enrollment when source evidence exists;
- accepted prompts, owned mentions/citations, and share of voice;
- before/after observations with aligned windows and explicit limitations.

## Acceptance criteria for the first customer

CiteLadder should be able to:

1. reproduce the supplied crawl baseline from sanitized fixtures;
2. retain all 180 PDF URLs as document inventory;
3. prevent PDFs from entering the HTML analyzer;
4. classify HTML/documents into generic kinds and Education roles;
5. distinguish current, historical, conflicting, and unknown facts;
6. map the admissions journey and expose missing outcome configuration;
7. create role-aware findings and grouped actions;
8. build briefs without inventing fees, dates, claims, or outcomes;
9. propose editable prompts from approved knowledge and reprioritize them after demand evidence arrives;
10. create a new recrawl/snapshot without mutating earlier evidence;
11. export a report where every factual conclusion links to persisted evidence.

## Required follow-up data

- URL-level HTML/PDF and issue exports, including the exact two 5xx URLs;
- robots and sitemap contents/reports;
- Google Ads campaign/ad-group/search-term/cost/click/conversion exports;
- GA4 landing/source-medium-campaign/event reports;
- GSC query×page data;
- admissions/CRM stages and qualified enquiry/application/enrollment outcomes;
- a data dictionary explaining the reported 1%.

## Source caveats

- Zero PageSpeed/accessibility observations do not mean zero issues.
- Zero sitemap association in this export does not prove no live sitemap exists.
- The 181 missing-canonical count combines HTML and PDFs.
- The exact two 5xx URLs and issue-level URL lists are absent from the supplied summary.
- The reported 1% is client-supplied and unaudited in this dataset.
