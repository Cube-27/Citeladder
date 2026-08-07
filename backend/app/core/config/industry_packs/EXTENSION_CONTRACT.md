# Industry Pack and Project Extension Contract

**Status:** normative governance contract  
**Applies to:** shared pack releases, capability composition, taxonomy mappings, and
workspace/project overlays

## Principles

1. Shared packs are reusable product knowledge, not customer knowledge.
2. Every shared definition is versioned, immutable after release, namespaced, source-reviewed, and
   fixture-backed.
3. Customer evidence, public labels, local terminology, approvals, and overrides remain directly
   workspace/project scoped.
4. A project overlay cannot weaken core safety, provenance, abstention, review, or generation
   controls.
5. A later pack version never changes the meaning of a frozen historical manifest.
6. Composition is one primary pack plus explicitly compatible capabilities and optional reviewed
   project overlays—not arbitrary inheritance.

## Shared pack release

A shared release may add or revise:

- page roles and deterministic positive/negative signals;
- entity types and bounded attributes;
- assertion predicates, relations, and conflict policies;
- journeys, stages, outcomes, and required questions;
- role-aware schema expectations and parity fields;
- deterministic, hybrid, or model-assisted rule definitions with review policy;
- brief templates, prompt archetypes, generation constraints, and fixture expectations;
- compatible capability IDs, aliases, and taxonomy mappings.

All stable IDs use the pack namespace, for example `education.program_detail` or
`commerce.return_policy`. Renaming a label does not require a new ID; changing the concept's
meaning does. Removed IDs require an explicit migration/deprecation record in the next version.

A shared release must not contain:

- customer/company/domain names or private URLs;
- crawl findings, current prices, fees, schedules, staff, inventory, or other project facts;
- approved brand memory or user decisions;
- credentials, integration payloads, raw excerpts, or copyrighted corpus bodies;
- generated claims presented as reviewed industry truth;
- customer-specific score tuning intended to improve one benchmark;
- guarantees of rankings, rich results, or search appearance.

## Capability composition

[`capabilities.json`](capabilities.json) lists reusable modules and exact compatible pack IDs. A
pack opts into capabilities through its `capability_ids`; the validator requires the reverse
compatibility list to match.

Composition rules:

- one primary pack owns IDs, roles, entities, questions, rules, and maturity;
- capabilities add reusable requirements but do not replace the pack namespace;
- incompatible capability/pack combinations fail validation rather than being silently ignored;
- capabilities may strengthen review or evidence requirements but may not weaken shared controls;
- capability changes are versioned with the catalog and included in the frozen content hash.

## Project overlay

A versioned project overlay may supply:

- local role aliases and public labels;
- route/section mappings for a specific owned corpus;
- known entity aliases and identifiers linked to project evidence;
- project journey labels or stage mappings;
- explicit include/exclude/inventory-only corpus rules;
- approved project assertions and memory references;
- reviewed thresholds that are expressly overlayable;
- local fixture examples and reviewer decisions.

It may not:

- modify shared JSON in place;
- introduce an unregistered shared ID;
- turn `unknown`, `historical`, `conflicting`, or `unavailable` into a current fact;
- classify from schema alone or remove minimum-score/margin requirements;
- disable human review, visible/schema parity, direct evidence, or conflict blocks;
- copy facts into another workspace;
- convert a model proposal directly into approved memory;
- activate publishing, prompts, or external mutation autonomously.

The sanitized Education public-label fixture at
[`fixtures/education/asian-school-public-labels.json`](fixtures/education/asian-school-public-labels.json)
demonstrates the boundary: semantic labels can be tested without embedding customer facts in
[`packs/education.json`](packs/education.json).

## Resolution and merge order

The resolved analysis context is:

```text
core catalog
  + exact primary pack
  + exact compatible capabilities
  + versioned project overlay
  + immutable observed evidence
  + explicitly approved project memory
```

Rules:

1. Resolve the primary pack from an explicit project setting or reviewed taxonomy mapping.
2. Freeze catalog, pack, capability, and overlay versions/content hashes before analysis.
3. Validate every overlay target against fields declared overlayable by the owning contract.
4. Merge by stable ID; never by display label or array position.
5. Preserve source of each resolved value (`core`, `pack`, `capability`, `overlay`, `approved_memory`).
6. Reject duplicate/conflicting overlay operations unless a reviewed conflict policy exists.
7. Persist omissions, conflicts, and rejected operations in the resolution manifest.
8. Never mutate the cached shared pack object.

## Versioning

- Patch: documentation, source metadata, or fixture correction with no semantic/runtime output
  change; content hash still changes and historical manifests remain exact.
- Minor: backward-compatible additions such as new roles/questions/signals or optional fields.
- Major: removed/repurposed IDs, changed required semantics, incompatible resolver/classifier
  behavior, or migration-requiring schema changes.

The active registry contains one explicitly selected version per pack. Loading without a supplied
version may use that single registered version; it must not scan filenames for a latest version.
Old versions may be retained in a release archive when runtime migration requires them, but only
registered canonical files are active.

## Maturity promotion

A `foundation` pack may become `validated_candidate` only after:

- domain reviewer approval of vocabulary and sources;
- representative positive, negative, unknown, ambiguous, schema-only, historical, and conflicting
  fixtures;
- question/FAQ safety and visible/schema parity cases;
- role and finding precision/error review on sanitized or opt-in field data;
- no customer leakage;
- deterministic validator/tests/benchmark passing;
- documented known limitations and reviewer identities/dates.

Promotion beyond candidate status requires production field evaluation, disagreement review,
calibration thresholds, and a release decision. File size and fixture pass rate alone are
insufficient.

## Required change workflow

1. Add/edit canonical JSON only under this directory.
2. Update [`sources.json`](sources.json) for new external vocabulary or policy claims.
3. Add sanitized fixtures before changing expected runtime behavior.
4. Update registry version, path, maturity, aliases, and canonical content hash.
5. Recompute [`catalog-summary.json`](catalog-summary.json) through the owning build/release
   procedure; do not handwave count drift.
6. Run the validator, unit suite, linter, compile checks, and relevant 10,000-page benchmarks.
7. Update active documentation and the wiring handoff when the runtime contract changes.
8. Preserve unrelated dirty-worktree changes and never stage/commit without an explicit request.

From `backend/`:

```bash
uv run python -m app.core.config.industry_packs.validate
uv run pytest tests/unit/test_industry_pack_catalog.py -q
uv run ruff check app/core/config/industry_packs tests/unit/test_industry_pack_catalog.py
```
