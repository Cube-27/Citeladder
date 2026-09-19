# Simplify onboarding competitor and prompt discovery

**Status: active, selected by the owner on 19 September 2026.** Saving and
activation authorize planning only, not implementation or provider execution.
Scope execution explicitly before starting an implementation slice.

[Onboarding](../onboarding.md), [Prompts and Visibility](../visibility-prompt.md),
[Content](../content-generation.md), and [AGENTS.md](../../AGENTS.md) remain the
owners of shipped contracts and engineering constraints.

## Summary and plan registration

This is the sole active plan in [ACTIVE.md](ACTIVE.md). Google AI Overview and
Earned-source intelligence are completed per owner confirmation; retain their
documents and recorded limitations. Search Intelligence is next queued, with
the other queued work preserved.

**Priority:** improve initial buyer-demand topics and prompts, preserve useful
business context, then simplify competitor suggestions. Success means fewer
generation branches, coherent grounded portfolios, reliable persistence, and
removal of superseded code.

No live evaluation gate. The owner will assess discovery quality after
implementation; automated coverage verifies behavior and contracts.

## Intended behavior and contracts

### Business context

Preserve the onboarding sequence: business discovery appears on the second
screen; competitor selection happens on the third.

Repurpose the existing unused context model into one canonical `BusinessContext`
under the Projects owner. Provide constructors for confirmed onboarding input
and persisted projects, plus a shared generation serializer.

- Preserve offerings, positioning, audience, category vocabulary, buyer needs,
  market, language and relevant business facets.
- Unknown inferred facets remain nullable; never silently substitute a specific
  business model or market scope.
- Explicitly reviewed values override inference. Retain field-level provenance;
  submitting onboarding must not mark unseen generated prose as reviewed.
- Persist through the existing BrandProfile and research records. No second
  context store.
- Onboarding generation, subsequent Generate prompts and Content consume
  consistent persisted facts. Keep Content's existing context builder, evidence
  omissions and frozen generation history.

### Competitor suggestions

Use one generic `default_agent` request to identify approximately ten plausible
competitors. Configure a suggestion maximum of ten, independently of the five
tracked-competitor limit. Return fewer when evidence is insufficient.

When Keenable is configured, allow one bounded category-and-market search
supplying snippets to that request. Search failure produces a warning and
permits suggestions from available context. No query reformulation, page-fetch
fan-out, confidence ranking or automatic top-five selection.

- Clean names and registrable domains, remove owned/noise domains and exact
  duplicates, and preserve stable ordering.
- Present accessible toggle chips with name and domain; initially leave
  suggestions unselected.
- Allow manual name/domain additions within the same five-selected limit.
- At five selections, disable only unselected chips and additions. Selected
  chips remain removable.
- Resolve only selected/manual domains before accepting completion, outside
  database locks. Show failures against editable choices without silently
  removing them.
- Keep suggestions explicitly provisional; domain cleanup does not establish
  commercial equivalence.

Retain existing discovery endpoints. Simplify suggestion fields to identity
data actually consumed by the UI; keep acquisition/model provenance in research
records.

### Initial prompt portfolio

Replace topic selection followed by per-topic generation with one structured
discovery request after business context and competitor selection are confirmed.
Competitors support portfolio construction but are not required for every topic
or prompt. The response hierarchy
must preserve the semantic order: business context → buyer needs and decision
intents → topics → prompts. Buyer intent guides portfolio construction; it is
not merely a label assigned to prompts after generation. This remains one
model request, with no separate intent-generation or post-generation
classification call.

The model receives canonical context, accepted competitors, first-party
evidence, offering harvest and already acquired research. It identifies
materially distinct buyer needs and decision intents supported by that context
and constructs appropriate coverage. The structured response is fixed:

- `intents[]`: request-local `id`, `buyer_need`, `decision_intent`, and
  `buyer_stage`.
- `topics[]`: `name`, `description`, `intent_ids[]`, `evidence_refs[]`, and
  nested `prompts[]` with `text` and `intent_id`.
- `diagnostic_prompts[]` and `comparison_prompts[]`: `text` and `intent_id`,
  using existing cohort semantics. These may remain topic-unbound.

Existing prompt intent metadata is derived from the governing intent, not
assigned to finished prompts as a post hoc label. Intent IDs are local to the
request and are not persisted as a new table or store.

Code assigns topic UUIDs after admission. Topics describe buyer needs, rather
than mirroring navigation.

Guide the model toward roughly two to ten meaningful topics without hard topic
quotas, fixed prompts per topic, stage quotas or filler. The model owns the
semantic judgment of which needs matter and how to cover them. Code verifies
structural integrity: every admitted intent has a topic and a surviving core
prompt; every topic references admitted intents; every core prompt resolves to
its topic and intent; diagnostic and comparison prompts resolve to an admitted
intent. Code does not invent fixed intent categories, minimum counts or a
semantic judge. Existing capacity, payload and transport limits remain safety
constraints.

Reuse deterministic admission for source references, topic cleanup/distinctness,
prompt identity, exact duplicates, placeholders, length and cohort rules. Allow
references to supplied confirmed context and research, not only website offerings.

Drop topics with no surviving prompts and record warnings. Accept smaller valid
portfolios without regeneration. If no valid intent with surviving core prompt
coverage remains, use the existing recoverable completion-failure flow.

Make one primary discovery request. The existing structured-repair owner may
make at most one repair request only when the response fails its schema or
deterministic admission contract. Do not regenerate for topic or prompt counts,
buyer-stage distribution, missing quotas or subjective semantic quality.
Remove per-topic, per-intent, per-cohort and prompt-level retry loops; preserve
bounded worker recovery and idempotency.

## Ordered implementation slices

1. **Inventory and business-context convergence.** Trace current callers,
   schemas, persistence, configuration and tests before replacement. Replace
   the unused context model, nullable semantic defaults and duplicated context
   assembly. Verify Content receives preserved facts and provenance. Keep all
   discovery model routing through the generic configured gateway.

2. **Correct topic persistence.** Insert every missing generated topic even when
   the project already has topics; rebuild the canonical topic map before
   inserting prompts. Reject unresolved core or explicitly topic-bound prompts
   atomically. Permit intentionally unbound diagnostics/comparisons. Preserve
   workspace authorization, completion locking and replay behavior.

3. **Simplify competitors and selection UI.** Implement the ten-suggestion
   contract and five-selection chips. Remove automatic peer scoring,
   candidate-wide domain verification and unused qualification fields. Preserve
   identity research, selected-domain error recovery and the existing
   asynchronous completion lifecycle.

4. **Replace onboarding portfolio generation.** Build against the final
   accepted-competitor contract. Change completion orchestration and provenance
   together with the fixed intent → topic → prompt response schema. Admit the
   relationships before persisting prompts. Reuse existing deterministic
   validators. Delete separate onboarding topic selection, per-topic/named-cohort
   fan-out, quota machinery and obsolete configuration once callers are removed.

Subsequent Generate prompts' existing requested-count, topic, cohort, capacity
and locking semantics remain in scope as preservation checks. Improved
automatic GSC grounding is a [separate queued follow-up](citeladder-subsequent-prompt-grounding.md).
The queued explicit "generate from selected search queries" feature remains
separate from both.

## Verification and removal gates

Add focused deterministic tests for:

- Unknown facets, reviewed-value precedence, and context continuity from
  onboarding into prompts and Content.
- Intent-to-topic-to-prompt binding, structural intent coverage, valid
  and invalid evidence references, empty topics, duplicates, cohort rules and
  bounded model attempts.
- Existing-topic insertion, unresolved-topic rollback, cross-workspace rejection
  and idempotent completion replay.
- Competitor cleanup, manual additions, five-selection enforcement, deselection
  at capacity and editable resolution failures.
- Preservation of subsequent Generate prompts' existing user-facing semantics.

Use mocked providers and disposable PostgreSQL where persistence/concurrency
coverage requires it. Run targeted tests and the repository check script
according to `AGENTS.md`; CI owns full release validation.

Before completing each replacement, search for retired symbols and inspect
remaining callers. Remove obsolete implementation, contracts, flags and tests;
retain useful coverage against the new behavior. Do not leave permanent old/new
fallback architectures.

Update owner documentation when the shipped contract changes. Keep routine
implementation evidence in PR/CI records.

## Boundaries and defaults

- No live model evaluation, provider calls, deployment or database reset is
  authorized by this plan.
- No DataForSEO discovery integration, embedding service, runtime semantic judge,
  voting or rewrite loop.
- Preserve Commerce competitor discovery, observed-competitor analysis and
  Visibility scoring/reporting.
- Preserve generic provider transports and post-onboarding slot/batching
  machinery still in use.
- No new queue, evidence store, replay subsystem or tracked-competitor provenance
  column.
- Preserve append-only evidence, explicit activation boundaries and same-origin
  API contracts.
- Do not claim improved semantic quality from structural tests alone; the
  owner's post-implementation review supplies that assessment.
