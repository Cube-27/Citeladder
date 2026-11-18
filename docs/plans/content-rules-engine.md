# Content rules engine (draft architecture)

Status: **architecture reviewed with the owner, 2026-11-10**. The owner
assigned the catalog part on 2026-11-11 ("Build the catalog"): the rule
catalog, evidence eligibility and the L4 model pass over it shipped (see
[content optimization](../content-optimization.md#suggestions)). The L1–L3
linters and L5 remain unassigned and not authorized for execution. Requested by the owner (2026-11-10) as a separate document: this
one owns *how a page's copy is audited and what a suggestion is*; content
optimization owns the gap evidence, the screen, the editor and measurement, and
consumes this engine.

## Goal

A Grammarly-style audit of a page's copy. Each finding names an exact span, a
category, the rule and its source, an explanation, and a replacement when one
can be written without inventing facts. Findings must be precise enough that
users accept them more often than they dismiss them. Like Grammarly, we
value a shown suggestion being right over finding everything.

## Principles

- **Deterministic first.** A rule that code can check is checked by code, with
  thresholds in config. A model judges only bounded ambiguity (is this an
  answer? is this claim supported?) and never redefines a deterministic metric.
- **Every rule cites its source.** Google Search Central, Microsoft's AI-answers
  guidance, peer-reviewed GEO research, or a named tool heuristic. Heuristics are
  labelled as heuristics in the UI; nothing promises a ranking or citation gain.
- **No invented facts.** A suggestion that needs a statistic, source, quote or
  credential the page does not hold is `needs_input`: it asks the user and is
  never filled by the model.
- **No AI-authorship verdicts.** "Humanize" rules are clarity fixes. No AI
  probability score is shown; detectors are unreliable and biased against
  non-native writers (Liang et al. 2023).
- **One owner per rule.** Site Health already owns crawl-level checks (title,
  meta, canonical, structured data, alt text, answer-first, question headings,
  source support, recency, server-rendered content, hidden text). The engine
  imports those findings for the page; it does not re-implement them.

## Layers

| Layer | Detects | Implementation | Runs where | Cost |
|---|---|---|---|---|
| L0 Site Health | Technical, on-page and AEO rules | **Page-local** rules (judged from one page's HTML) are re-run by Site Health's own deterministic evaluators on the page fetched for the editor, so they are current. **Site-context** rules (robots, rendering, canonical integrity, site-wide uniqueness, links) need the crawl; they keep the crawl's finding, with its crawl ID and date, labelled "as of the crawl of <date>". They are never re-judged by a model and never treated as fixed by an edit | Server: Site Health evaluators on the fetch, plus a crawl read | None |
| L1 Correctness | Spelling, grammar, mechanics, placeholders, leaked Markdown | Harper (`harper.js`, Rust/WASM, Apache-2.0) plus a workspace dictionary (brand, product, competitor names) | Shared package: server per saved revision; whether it also runs in the browser while typing is R2 | None |
| L2 Clarity & style | Long sentences and paragraphs, sections without subheadings, passive voice, repeated sentence starts, intensifiers, simplification, inclusive language, readability grade | retext/unified plugins (MIT) and readability formulas; thresholds in config | Shared package | None |
| L3 Humanize (deterministic part) | AI-vocabulary clusters, chatbot artifacts, em-dash overuse, copula avoidance, puffery lexicon | Lexicons and regexes written by us (rates per 1 000 words, never single words) | Shared package | None |
| L4 Model judgement | Answer-first, self-contained passages, question-style headings with direct answers, unsupported claims, statistics without sources, vague attributions, title/H1/meta consistency, people-first and originality checks, topic coverage gaps from content optimization | One structured Agent pass over the revision with the rule catalog. L0 findings and L1–L3 hits are passed in as deduplication input. A rule Site Health owns (answer-first, question headings, source support and the rest of L0) is never raised or re-judged by L4. L4 may only attach a replacement text to an existing L0 finding (same `rule_id`). L4 judges only catalog rules marked `model` or `hybrid` whose required evidence is present | Server, Agent turn | AI credits (CO8) |
| L5 Later | Deeper grammar and other languages | LanguageTool server as a sidecar (LGPL-2.1, JVM, 2–4 GB; legal check first); Vale packs for a customer's own style guide | Server | Hosting |

Not used: Yoast's `yoastseo` (GPLv3; its language data files are copyrighted
expression, so we rewrite thresholds clean-room with attribution); CoEdIT,
Gramformer and vennify T5 (non-commercial licences); GECToR (dated Python stack,
marginal over L1 + L4).

## The rule catalog

One versioned catalog, `frontend/services/api/src/config/content-rules.ts` (a
config, not code). Per rule:
- `id`, `category`, `layer`, `check` (`deterministic`, `model`, `hybrid`),
  `severity`, the page types it applies to and its thresholds;
- `source` (URL key) and `strength`: `requirement` (a search-engine policy,
  such as the spam or structured-data policies), `recommendation` (guidance
  that suggests rather than requires) or `heuristic` (a tool convention).
  Suggestions from recommendations and heuristics are phrased as options;
- `requires`: the evidence the rule needs (see
  [Evidence eligibility](#evidence-eligibility)). The catalog version is a content
fingerprint, like the Agent skill catalog. The L4 methodology reads the catalog's
model and hybrid rules, so changing a rule changes one place.

User-facing categories (Grammarly uses Correctness, Clarity, Engagement and
Delivery; ours are tied to search and AI answers):

| Category | Rules from the research catalog |
|---|---|
| Correctness | Spelling, grammar, punctuation, placeholders, leaked Markdown (F1–F4, E10) |
| Clarity | Sentence and paragraph length, subheadings, passive voice, repeated starts, intensifiers, one claim per sentence, readability grade (D1–D8, B12) |
| AI answers | Answer-first, question headings with direct answers, self-contained passages, lists and tables where the intent calls for them, precise terms (B4–B8, B13) |
| Proof | Statistics with source and date, attributed quotes, sourced claims, vague attributions, unanchored superlatives (B9–B11, B14, E8, G1–G2) |
| Search guidelines | Accurate title and headings, people-first value, no keyword stuffing, no fake freshness, author and YMYL signals (A1–A15 subset, C-rules via Site Health) |
| Natural voice | AI-vocabulary clusters, chatbot artifacts, negative parallelism, rule of three, trailing "-ing" clauses, em-dash overuse, copula avoidance, puffery (E1–E9, E11) |
| Coverage | Content angles cited for the page's prompts that the page lacks ([content optimization](../content-optimization.md)) |

The 82-rule research catalog in the [appendix](#appendix-research-rule-catalog)
seeds `content-rules.ts`. Contested rules (see below) ship as heuristics or not
at all.

## Evidence eligibility

A rule runs only when everything in its `requires` is present. Otherwise its
outcome is `insufficient_evidence`, recorded with the missing input and shown
as "not checked". Missing evidence never turns into a model guess.

| Evidence | Available | Rules that need it |
|---|---|---|
| `fetched_page` (Markdown body, SEO fields, HTML) | MVP | Most B, D, E and F rules; page-local C rules via L0 |
| `crawl` (site-wide pages, links, robots, rendering) | MVP, as of the crawl | B1–B3, B19, C3, C15, C20, G3 via L0 |
| `crawl_history` (two snapshots of the same page) | MVP via Site Health changes | A8 (fake freshness), C19 date consistency over time |
| `site_pages` (other pages' text) | Phase 2 | A11 (near-duplicates) |
| `cited_page_text` (pages the engines cite) | Phase 2 | A1 (originality against sources), A2 (coverage depth) |
| `link_checks` (outbound link status and target text) | Phase 2 | G2 (cited links resolve and support the claim) |
| `external_retrieval` (fact lookup) | Not planned | A15 (factual errors) |

**Missing support is not falsehood.** "This claim has no citation" (B11, G1,
E8) is checkable on the page and is a finding. "This claim is false" (A15) or
"the cited source does not support it" (G2) needs evidence the MVP lacks. Those
rules return `insufficient_evidence` and never imply the claim is wrong.

## Findings and anchoring

A finding belongs to one immutable revision and has one of three anchors:

```
{ rule_id, category, severity, revision_id,
  anchor:
    | { kind: 'span',                         // text in the Markdown body
        position: { start, end },             // UTF-16 offsets, half-open
        quote: { exact, prefix, suffix } }    // W3C TextQuoteSelector, ~32 chars context
    | { kind: 'field',                        // the SEO block
        field: 'title' | 'meta_description' | 'json_ld',
        expected: string }                    // the field's value when the finding was made
    | { kind: 'page' },                       // page-level or external resource, no span
  depends_on: Array<                          // what the judgement read; any change stales it
    | { kind: 'span' }                        //   the anchored text only
    | { kind: 'section', start, end }         //   the body between enclosing headings
    | { kind: 'body' }                        //   the whole body
    | { kind: 'field', field }>,              //   an SEO field, e.g. title for title/H1 consistency
  replacement: string | null,                 // null = advice only
  needs_input: string | null,                 // the question when a fact is missing
  explanation, source_key, engine, engine_version,
  source: { crawl_id, artifact_id } | null }  // L0 findings only
```

- **Unanchored findings.** A finding with no text in the body (missing schema,
  a robots or rendering issue, an external resource) uses a `field` or `page`
  anchor. It is never given an invented body span. An imported L0 finding
  keeps its Site Health target and evidence as-is.
- **Validating a span.** The server rejects a span finding unless `start` and
  `end` are integers with `0 <= start <= end <= body.length` and
  `body.slice(start, end) === exact`.
- **Offset units.** Stored offsets are UTF-16 code units, which is how
  JavaScript and CodeMirror count. Engines that count differently are
  converted before a finding is stored. Harper reports spans in Unicode scalar
  values (Rust `char`), so its endpoints are mapped to UTF-16. Tests put an
  emoji (an astral character) before a finding and check both endpoints.
- Deterministic findings for a saved revision are persisted with the catalog
  and engine versions (insert-only), so a read renders them without
  recomputing. If R2 chooses live linting, the browser also runs L1–L3 on
  unsaved edits for display only. Persisted findings stay the authority
  either way.
- Model findings (L4) are persisted with model, methodology and catalog
  versions and the source revision. They are never recomputed on read.
- After an edit, open findings are mapped through the change. A finding whose
  span was deleted, or whose text no longer equals `exact`, becomes `stale`
  and is never misapplied (Grammarly's published approach; CodeMirror's
  `mapPos` with `TrackDel`).
- **Dependencies.** An unchanged span is not enough to keep every finding
  open. Each finding lists what its judgement read in `depends_on`, and any
  change there makes it stale. For example:
  - answer-first and self-contained passages depend on their section;
  - coverage and unsupported claims judged across the page depend on the
    whole body;
  - title/H1/meta consistency depends on the `title` and `meta_description`
    fields and on the section that holds the H1, so editing the title stales
    it even though the body did not change.

  The browser shows staleness as soon as the user edits. Accept and Apply all
  enforce it on the server together with the revision check (see
  [suggestions](../content-optimization.md#suggestions)).
  Imported site-context L0 findings follow the crawl rule in
  [Layers](#layers) instead. Stale findings can't be applied; the next
  deterministic run or model pass raises them again if they still hold.
- **Field replacements** apply only while the field still equals `expected`.

## No scores (owner, 2026-11-10)

Nothing grades content: no overall score, no readability grade, no per-category
score. Suggestions are options grounded in what tends to do well, shown with
counts of open items per category. Readability formulas may only decide whether
a deterministic clarity rule fires (for example a very hard sentence) and are
never displayed as a number. Vendor scores (Surfer, Clearscope) reward copying
competitors' terms, which conflicts with originality.

## Where findings appear (owner, 2026-11-10)

Findings live only in the content editor. They never become Site Health issues,
and Issues stays exactly as it is. The engine reads Site Health findings for
the page (L0) but never writes to Site Health.

## Contested or weak evidence (labelled, thresholds in config)

- GEO effect sizes (statistics, quotations, citations, +28 to +43%) come from a
  simulated engine (Aggarwal et al., KDD 2024). Gains went mostly to
  low-ranked sources; top-ranked sources lost visibility, and C-SEO Bench (2025)
  found most such methods weak or harmful at scale. Suggest them where content
  needs them; never quote uplift.
- Answer-first and self-contained passages: Microsoft guidance and AutoGEO
  (ICLR 2026), no controlled field study.
- Freshness: vendor correlation only (Ahrefs). Faked freshness is a Google
  warning sign, so the rule is "date reflects real change", not "update often".
- Tool heuristics that Google contradicts (keyword density, minimum or target
  word counts, meta description length, a single H1, heading order, transition
  words) are excluded or labelled as heuristics.
- AI-writing tells are descriptive, drift with model generations, and occur in
  human writing; they flag clusters and are framed as clarity.

## Risks

- False positives on marketing copy (brand names, fragments, deliberate style):
  workspace dictionary, per-rule dismiss-all, and acceptance and dismissal rates
  per rule to tune precision.
- Model over-correction and meaning drift (GEC studies show LLMs over-correct):
  minimal edits, exact-span validation, no rewrite larger than a paragraph
  without `needs_input`.
- English only at first: Harper, retext and readability formulas are
  English-centric. Other languages need L5.
- `harper.js` is labelled early access; pin the version and cover it with tests.

## Open questions

R1 (MVP layers) and R3 (scores) were answered on 2026-11-10: the MVP ships L0
and L4; L1–L3 come next; no scores.

- **R2** When L1–L3 land: live linting while the user types (shared package in
  the browser) or server-side only per saved revision?

R4 and R5 were answered on 2026-11-10: the model pass (L4) works in the
project's language and L1–L3 start English-only; Agent drafts of new content
follow these rules in phase 2.

## Appendix: research rule catalog

Compiled 2026-11-10 from web research. Check: **D** deterministic, **M** model,
**H** hybrid (code finds candidates, a model judges). Strength: rules marked
*req.* restate a search-engine policy (a requirement), rules marked *heur.* are
tool heuristics, not search-engine guidance, and every other rule is a
recommendation, so its suggestions are phrased as options. A rule already owned by Site
Health is imported (L0), not re-implemented.

**Sources.** G-HC [helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) ·
G-SPAM [spam policies](https://developers.google.com/search/docs/essentials/spam-policies) ·
G-AIC [gen-AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content) ·
G-AIF [AI features](https://developers.google.com/search/docs/appearance/ai-features) ·
G-AIB [succeeding in AI search](https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search) ·
G-TITLE [title links](https://developers.google.com/search/docs/appearance/title-link) ·
G-SNIP [snippets](https://developers.google.com/search/docs/appearance/snippet) ·
G-SD [structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) ·
G-IMG [images](https://developers.google.com/search/docs/appearance/google-images) ·
G-LINK [crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable) ·
G-SSG [SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) ·
G-DATE [publication dates](https://developers.google.com/search/docs/appearance/publication-dates) ·
G-CANON [duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) ·
G-QUAL [qualify outbound links](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links) ·
G-QRG [rater guidelines](https://services.google.com/fh/files/misc/hsw-sqrg.pdf) ·
MS-AI [Microsoft, content for AI answers](https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers) ·
OAI [OpenAI crawlers](https://developers.openai.com/api/docs/bots) ·
GEO [Aggarwal et al. 2024](https://arxiv.org/abs/2311.09735) ·
CSEO [C-SEO Bench](https://arxiv.org/abs/2506.11097) ·
AUTOGEO [Wu et al. 2026](https://arxiv.org/abs/2510.11438) ·
AHREFS [freshness study, vendor](https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content/) ·
WIKI [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) ·
KOBAK [excess vocabulary](https://arxiv.org/abs/2406.07016) ·
Y-READ [Yoast readability](https://github.com/Yoast/wordpress-seo/blob/trunk/packages/yoastseo/src/scoring/assessments/SCORING%20READABILITY.md) ·
Y-SEO [Yoast SEO](https://github.com/Yoast/wordpress-seo/blob/trunk/packages/yoastseo/src/scoring/assessments/SCORING%20SEO.md) ·
RM [Rank Math](https://rankmath.com/kb/score-100-in-tests/) ·
HEM [Hemingway](https://hemingwayapp.com/help/docs/readability)

**A. Search guidelines / E-E-A-T**

| # | Rule | Check | Source |
|---|---|---|---|
| A1 | Original information or analysis beyond its sources | M | G-HC, G-AIC |
| A2 | Substantial coverage for the intent | H | G-HC |
| A3 | Title and headings describe the content without exaggeration | M | G-HC |
| A4 | First-hand experience or deep knowledge shown | M | G-HC, G-QRG |
| A5 | Byline where expected, linked to author background | H | G-HC |
| A6 | AI or automation use disclosed where readers expect it | H | G-HC, G-AIC |
| A7 | People-first purpose, not search-engine-first | M | G-HC |
| A8 | No fake freshness (date changed, content did not) | D | G-HC |
| A9 | No padding toward a word count | M | G-HC, G-SSG |
| A10 | YMYL topics meet a higher bar (expert, sourcing) | H | G-HC, G-QRG |
| A11 | No scaled or templated near-duplicate content (*req.*) | H | G-SPAM, G-AIC |
| A12 | No keyword stuffing (*req.*) | H | G-SPAM, G-SSG, GEO |
| A13 | No hidden text or links (*req.*) | D | G-SPAM |
| A14 | No thin affiliate or scraped content (*req.*) | H | G-SPAM |
| A15 | No easily verified factual errors | M | G-HC, G-AIC |

**B. AI extractability / GEO**

| # | Rule | Check | Source |
|---|---|---|---|
| B1 | Indexable and snippet-eligible | D | G-AIF, G-AIB |
| B2 | Search and answer crawlers allowed | D | G-AIF, OAI |
| B3 | Key information in HTML text, not images or collapsed elements | D | G-AIF, MS-AI |
| B4 | Answer first | H | MS-AI, AUTOGEO |
| B5 | Question-style headings followed by a 1–2 sentence answer | H | MS-AI |
| B6 | Self-contained passages (no unresolved "this"/"it" at section start) | H | MS-AI, AUTOGEO |
| B7 | Lists or tables for steps and comparisons | H | MS-AI, AUTOGEO |
| B8 | No walls of text | D | MS-AI, Y-READ |
| B9 | Specific statistics instead of vague claims | H | GEO, MS-AI, AUTOGEO |
| B10 | Attributed quotations from relevant authorities | H | GEO |
| B11 | Claims cite credible sources | H | GEO, AUTOGEO, G-HC |
| B12 | Fluent, clear prose | M | GEO |
| B13 | Precise domain terms, defined | M | GEO, AUTOGEO |
| B14 | No unanchored superlatives without supporting facts | H | MS-AI |
| B15 | Title, H1 and meta description consistent | H | MS-AI, G-TITLE |
| B16 | Neutral tone; balanced pros and cons | M | AUTOGEO |
| B17 | Time-sensitive facts carry dates | H | AUTOGEO, AHREFS, G-DATE |
| B18 | Structured data matches visible text | D | G-AIF, G-SD |
| B19 | Linked from at least one other page | D | G-AIF, G-LINK |

**C. Technical on-page** (mostly Site Health, L0)

| # | Rule | Check | Source |
|---|---|---|---|
| C1 | One non-empty `<title>` | D | G-TITLE |
| C2 | Descriptive title, not "Home" | H | G-TITLE |
| C3 | Unique title across the site | D | G-TITLE |
| C4 | No repeated words in the title | D | G-TITLE |
| C5 | Title not unnecessarily long (*heur.* ≤600 px) | D | G-TITLE, Y-SEO |
| C6 | Branding, if used, kept concise (e.g. site name at start or end behind one delimiter); not required | D | G-TITLE |
| C7 | Title language matches content | D | G-TITLE |
| C8 | Prominent H1 consistent with the title (single H1 is *heur.*) | D | G-TITLE, Y-SEO |
| C9 | Meta description present, unique and summarizing | H | G-SNIP |
| C10 | Meta description not a keyword list | H | G-SNIP |
| C11 | Meta description length (*heur.* 120–157 chars) | D | Y-SEO, G-SNIP |
| C12 | Headings describe their sections (order does not matter) | H | G-SSG |
| C13 | Descriptive alt text | H | G-IMG, Y-SEO |
| C14 | Descriptive image filenames | D | G-IMG |
| C15 | Crawlable links with descriptive anchors | D | G-LINK |
| C16 | `nofollow`/`sponsored` used correctly | H | G-LINK, G-QUAL |
| C17 | Valid structured data, required properties, specific type (*req.*) | D | G-SD |
| C18 | No misleading markup (*req.*) | H | G-SD |
| C19 | Visible dates match `datePublished`/`dateModified` | D | G-DATE |
| C20 | Canonical present and consistent | D | G-CANON |

**D. Readability and clarity** (all *heur.*)

| # | Rule | Check | Source |
|---|---|---|---|
| D1 | ≤25% of sentences over 20 words | D | Y-READ |
| D2 | No paragraph over 150 words | D | Y-READ, RM |
| D3 | A subheading at least every 300 words | D | Y-READ |
| D4 | ≤10% passive sentences | D | Y-READ, HEM |
| D5 | <3 consecutive sentences with the same first word | D | Y-READ |
| D6 | A sentence far above the page's reading level (formula decides whether it fires; no grade is shown) | D | HEM |
| D7 | Intensifiers paired with weak verbs | D | HEM |
| D8 | One claim per sentence | H | MS-AI |

**E. Natural voice** (style signals, never proof of authorship)

| # | Rule | Check | Source |
|---|---|---|---|
| E1 | AI-vocabulary clusters (rate, not single words) | D | WIKI, KOBAK |
| E2 | Chatbot artifacts and leftover placeholders | D | WIKI |
| E3 | Negative parallelisms ("not just X, but Y") | H | WIKI |
| E4 | Overused rule of three | H | WIKI |
| E5 | Trailing "-ing" significance clauses | H | WIKI |
| E6 | Em-dash overuse | D | WIKI, MS-AI |
| E7 | Puffery and inflated significance | H | WIKI, MS-AI |
| E8 | Vague attributions ("experts argue") | H | WIKI |
| E9 | Copula avoidance ("serves as", "boasts") | D | WIKI |
| E10 | Leaked Markdown or excessive bold | D | WIKI |
| E11 | Formulaic sections and recap conclusions | M | WIKI |

**F. Grammar and mechanics**

| # | Rule | Check | Source |
|---|---|---|---|
| F1 | Spelling (with workspace dictionary) | D | G-HC |
| F2 | Grammar and style | H | G-HC |
| F3 | Placeholders, broken links, template leftovers | D | G-HC, WIKI |
| F4 | Simple, consistent punctuation | D | MS-AI |

**G. Trust and sourcing**

| # | Rule | Check | Source |
|---|---|---|---|
| G1 | Each statistic carries a source and date | H | GEO, G-HC |
| G2 | Cited links resolve and support the claim | H | WIKI |
| G3 | About, contact and author pages reachable | D | G-HC, G-QRG |
| G4 | Author or reviewer credentials on YMYL pages | H | G-QRG, G-HC |
| G5 | Organization/Person markup truthful (*req.*) | M | G-SD |
