# FAQ Intelligence — First End-to-End Growth Intelligence Slice

> **Status:** canonical first implementation slice.  
> **Parent architecture:** [`growth-intelligence-platform.md`](growth-intelligence-platform.md).  
> **Depends on:** Site Intelligence corpus/page-role contracts and the Industry Pack loader.  
> **Outcome:** prove that CiteLadder can classify an industry page, detect missing customer
> questions, generate evidence-grounded visible FAQs, obtain human approval, and verify the
> improvement after recrawl.

## 1. Why FAQ comes first

FAQ generation is the smallest workflow that exercises the platform’s full differentiator:

- industry-aware page-role classification;
- deterministic question and content expectations;
- project knowledge with temporal/conflict handling;
- gap detection and priority;
- bounded selective context;
- provider-neutral generation;
- unsupported-claim and visible/schema validation;
- human review;
- recrawl verification.

It produces useful content without beginning with unrestricted long-form generation. The same
contracts apply to Education, Commerce, and every later industry pack.

## 2. Product boundary

The first slice supports three outputs:

1. **FAQ section** for an existing page.
2. **Standalone FAQ/support page** when the pack and site portfolio justify one.
3. **FAQPage JSON-LD draft** only for visible, reviewed questions and answers.

It does not autonomously publish, rewrite unrelated page copy, invent facts, or add hidden schema.
A JSON-LD draft is never a substitute for visible FAQ content.

## 3. Required inputs

A generation is allowed only when the system can freeze:

- project/workspace and active industry-pack version;
- target corpus item, page understanding, generic kind, and industry role;
- applicable journey stages and audience;
- pack-required question archetypes;
- observed question/answer content units;
- current assertions and approved memory relevant to each answer;
- contradictions, historical facts, prohibited claims, and unavailable values;
- source evidence and safe internal-link targets;
- optional demand/visibility evidence when available;
- skill, validator, and context-selection versions.

Demand evidence may affect priority but is not required for a provisional FAQ gap. Missing demand
data reduces coverage; it does not fabricate low demand.

## 4. Deterministic question coverage

For every applicable role and journey stage, compare pack-required question archetypes with
observed question/answer units.

Each question receives one state:

```text
answered_strong
answered_weak
missing
conflicting
unsupported
historical_only
not_applicable
unavailable_evidence
```

Deterministic code owns:

- archetype and page/role eligibility;
- exact/normalized question identity and duplicate detection;
- required-fact availability;
- source and temporal compatibility;
- visible answer length/structure thresholds;
- internal-link target validity;
- output contract and schema syntax;
- coverage, priority inputs, and lifecycle state.

A bounded semantic analyzer may map differently worded visible questions to archetypes or explain
why an answer is incomplete. Its mapping is persisted with frozen inputs, model/template version,
confidence, and validation; it never changes raw evidence.

## 5. `FaqGap` contract

A gap is a typed working-intelligence artifact containing:

- project, snapshot, page/corpus item, role, audience, and journey stage;
- required question archetype and normalized question intent;
- observed answer state and evidence IDs;
- missing required predicates/facts;
- conflicting/historical/prohibited assertion IDs;
- demand/visibility links when selected;
- severity, confidence, coverage, priority inputs, and formula/rule versions;
- recommended output location: existing section, new page, or no generation;
- supersession identity for recompute.

FAQ gaps group into the existing Opportunity/action owner by target page, role, journey, and FAQ
action family. Do not create an unrelated recommendation store.

## 6. `FaqBrief` contract

Implement as a `ContentBrief` kind rather than a separate content system. A frozen brief contains:

- target page/role/audience/journey and intended business outcome;
- selected question gaps and required ordering/grouping;
- verified facts allowed for each answer;
- source refs and internal-link targets;
- unresolved conflicts and facts that must be omitted or requested;
- tone/style constraints from approved memory;
- answer format, length, caveat, CTA, and schema requirements;
- success criteria for visible content and optional JSON-LD;
- source snapshot, pack, builder, context policy, and brief hash/version.

A brief can be built without a model. Rebuilding from a new snapshot creates a new immutable
version and never mutates the evidence behind an earlier generation.

## 7. Selective context

The FAQ context package includes only:

- the brief and selected question archetypes;
- approved identity/style guidance relevant to the target;
- current compatible assertions and exact supporting excerpts;
- target page plus directly supporting pages/documents;
- contradictions and prohibited/unavailable facts;
- valid next-action and internal-link targets;
- pack-specific FAQ skill and output schema.

It excludes the full site, unrelated memory, raw HTML, raw analytics rows, secrets, other
projects, and historical facts presented as current. Included and omitted IDs/counts are visible
in the manifest.

## 8. Generation output

The provider returns strict structured output:

```json
{
  "items": [
    {
      "question_archetype_id": "education.what_fees",
      "question": "What are the current fees and what do they include?",
      "answer_markdown": "...",
      "source_ids": ["uuid"],
      "internal_link_ids": ["uuid"],
      "limitations": ["..."]
    }
  ],
  "section_intro": "optional bounded text",
  "schema_candidate": null
}
```

The provider cannot cite an artifact absent from its context package. Server validation resolves
IDs and rejects fabricated citations.

## 9. Validation

Before review, deterministic validators check:

- exact output schema and requested archetype coverage;
- duplicate/near-duplicate questions;
- unsupported numbers, dates, prices, fees, availability, ratings, policies, personnel,
  regulated claims, and other time-sensitive facts;
- conflict with current assertions or approved memory;
- historical evidence used as current truth;
- missing required qualification/caveat;
- invalid or cross-project links;
- question/answer clarity and brief constraints;
- safe Markdown/markup;
- FAQPage syntax and exact visible-content parity when schema is requested.

Validation creates an immutable result. It flags or blocks review states; it never rewrites the
provider output silently.

## 10. Review lifecycle

Reuse Content Intelligence revision ownership:

```text
generated -> in_review -> edited -> approved -> publish_ready -> published_claimed
          -> rejected
```

`published_claimed` records user intent. `publication_observed` is a separate later recrawl
result. Generated answers do not become Approved Brand Memory automatically; a reviewer may
separately save a supported fact or style rule through the memory approval flow.

## 11. Verification

A later compatible Site Intelligence snapshot compares the approved FAQ revision with observed
evidence:

- target section/page observed, absent, or materially different;
- selected questions and compatible visible answers observed;
- required internal links and next action observed;
- FAQPage graph observed and equal to visible content when applicable;
- original FAQ gaps resolved, partially resolved, unchanged, or replaced by new conflicts;
- role/question/journey coverage change;
- later demand/visibility observations shown only when windows and identity are compatible.

Verification is descriptive. It does not assert that the FAQ caused a conversion or ranking
change.

## 12. Education acceptance

Using the sanitized The Asian School fixture:

1. classify admissions, fees, curriculum, boarding/student-care, trust/disclosure, contact, and
   FAQ roles from deterministic signals even when structured data is absent;
2. load Education-required parent questions;
3. detect at least one missing and one weak question with exact evidence;
4. preserve historical PDF facts without using them as current answers;
5. build one admissions/fees FAQ brief;
6. generate with a fake provider using only selected evidence;
7. reject an invented fee/date and a citation outside the context package;
8. approve an edited visible FAQ section and matching optional JSON-LD;
9. recrawl a modified fixture and verify resolution without mutating the first snapshot.

## 13. Commerce acceptance

Using category/PDP/support fixtures:

1. classify category, product detail, policy, and FAQ/support roles;
2. identify questions about suitability, variants, specifications, availability, shipping, and
   returns;
3. omit or request unknown price, stock, identifier, review, shipping, return, safety, or policy
   facts;
4. generate one PDP FAQ section and one category selection FAQ;
5. validate Product/Offer facts separately from FAQPage parity;
6. recrawl and verify visible content, links, and schema.

## 14. APIs and UI

Initial projection/mutations:

```text
GET  /projects/{id}/content/faq-gaps
POST /projects/{id}/content/faq-gaps/recompute
POST /projects/{id}/content/briefs/from-faq-gaps
POST /content/briefs/{id}/generate
GET  /content/generations/{id}/validation
POST /content/generations/{id}/revisions
POST /content/revisions/{id}/transition
GET  /content/revisions/{id}/verification
```

Use existing Content routes and artifact names where they already fit; route names above describe
the product contract, not permission to duplicate owners.

The UI path is:

```text
Site/Content gap -> selected questions -> evidence and limitations -> FAQ brief
-> generated immutable attempt -> validation -> editable revision -> approval/export
-> publication claim -> recrawl verification
```

## 15. Implementation slices

### F0 — Pack question contracts and fixture labels

- validate question archetype, role, journey, and required-predicate references;
- label Education and Commerce fixture expectations;
- add deterministic coverage-state contracts.

**Gate:** identical fixture evidence produces identical question coverage and source IDs.

### F1 — Gap detector and opportunity grouping

- project visible question/answer units;
- map to archetypes deterministically, with optional persisted semantic adjudication;
- create/supersede FAQ gaps and grouped actions.

**Gate:** no missing fact becomes a generated assertion and no utility/archive page receives an
inapplicable FAQ action.

### F2 — Brief and context package

- build immutable FAQ briefs;
- select current assertions, approved memory, evidence, contradictions, and links;
- freeze budgeted context manifests.

**Gate:** fixtures prove project isolation, historical/current separation, and reproducibility.

### F3 — Generation, validation, and review

- add the FAQ skill/output schema through the provider-neutral gateway;
- persist immutable attempts and validations;
- support editable revisions, approval, and exports.

**Gate:** invented/scoped facts, invalid citations, duplicate questions, and hidden-schema-only
outputs are blocked.

### F4 — Recrawl verification and product flow

- compare approved revisions with later compatible Site snapshots;
- resolve FAQ actions only from observed passing evidence;
- ship the end-to-end UI and report module.

**Gate:** both Education and Commerce acceptance scenarios complete with fake providers in CI and
no external call from a read endpoint.
