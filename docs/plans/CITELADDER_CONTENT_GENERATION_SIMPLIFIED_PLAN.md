# CiteLadder Content Pipeline

**Status:** shipped architecture and active implementation authority
**Supersedes:** the 2026-08-28 demo-first plan, now in `docs/archive/`

## Product contract

Content turns durable CiteLadder evidence plus one user instruction into one
editable draft with one provider call. It is part of Content Intelligence and
does not own a second knowledge store.

```text
durable brand memory
+ optional target-page evidence
+ optional Site Health / Opportunity / Demand evidence
+ a bounded set of related persisted pages
+ the user's exact instruction
+ one selected file-backed skill
= one provider call
```

The textarea contains only the user's words. Entry points pass identifiers,
never generated prose. There is no prompt classifier, confirmation step,
second model call, critic, claim scanner, automatic rewrite, live fetch,
embedding store, or agent loop.

## Canonical context owner

`backend/app/domain/content/context_builder.py` is the only generation-context
owner. Its persisted `ContentContext` contains:

- `brand_block`;
- `target_page_block`;
- `issue_block`;
- `related_site_block`;
- a bounded provenance summary;
- the context version.

The builder authorizes all project, target, Opportunity, Demand, and Site
Health identifiers in the active workspace before rendering evidence. It reads
persisted state only. It never crawls, syncs, repairs state, or calls a model.

Brand context reuses Project, Brand, BrandProfile, aliases, onboarding business
context, and competitor entity names. Competitor names are entity context, not
permission to invent competitor facts.

The preferred target is `target_site_url_id`; `target_url` is the unresolved
escape hatch. The selected page is prioritized in the existing deterministic
crawl-fragment selector, followed by only a bounded relevant site subset.
Site Health makes its `site_url_id` the target. Owned Opportunity and Demand
URLs are used when they belong to the project site.

## File-backed skills

The 18 production skills live only at:

```text
backend/app/core/config/content_skills/packs/<skill_id>/SKILL.md
```

Each file contains scalar YAML metadata and the authored craft instructions.
Python owns only loading, validation, ordering, and metadata projection. The
catalog is grouped into Web, Social, Video, Community, and Email; the default
is `content_page`. The API and read-only MCP metadata consume the same registry
and never expose or copy skill bodies.

## Provider messages

`backend/app/domain/content/message_builder.py` creates exactly:

1. a fixed system role and factual-grounding rule;
2. the selected `SKILL.md` body followed by `USER REQUEST:` and the user's
   exact instruction;
3. when present, labelled reference material explicitly treated as data, not
   instructions.

The frozen context snapshot, numeric skill version, message digest, safe
message snapshot, provider/model provenance, attempts, and result remain on the
generation record. Provider secrets never enter persistence or responses.

## Request and entry points

Generation accepts:

- project UUID;
- skill ID;
- `user_instruction`;
- optional `target_site_url_id` or `target_url`;
- optional `opportunity_id`;
- optional `demand_signal_id`;
- optional typed Site Health reference.

Manual Content supports a crawled target, an arbitrary URL, or no target.
Site Health, Opportunity, and Demand open the same composer with an empty,
focused instruction. Site Health and Opportunity may preselect a target and
skill. Demand defaults to the catalog skill unless durable server-owned data
supports a stronger choice.

The composer uses one searchable page picker backed by the newest usable
persisted crawl selected by Content's canonical policy. The compact context
indicator reports brand memory, target, issue count, and related-page count.
It is informational and never blocks Generate.

## Queue, history, and deletion

`ContentGeneration` is the durable queue/result row and
`ContentGenerationAttempt` is append-only provider-call provenance. The shared
PostgreSQL queue retains lease, idempotency, retry, and single-writer rules.

Only terminal generations (`succeeded`, `failed`, `cancelled`) may be deleted.
Deleting one generation cascades its owned attempts. Clearing a project's
history deletes only terminal rows and retains active work. Active work uses
Cancel. Opportunity implementation declarations remain immutable; deleting a
linked generation sets their nullable `generation_id` to null.

There is no archive, soft delete, restore, retention subsystem, or legacy-row
compatibility path.

## Schema and version policy

CiteLadder is pre-launch. Content schema changes are folded into
`migrations/versions/0001_initial.py`; development databases are disposable.
No compatibility migration or old-row adapter is maintained. Skill versions
are the numeric versions authored in each `SKILL.md`. Context, generator, and
selection provenance retain their current config-owned versions.

## Verification authority

Focused Content tests cover workspace authorization, idempotency, context
mapping, target selection, message isolation, queue attempts, entry-point
identifier forwarding, history deletion, and linked-event preservation. The
repository completion gates remain `scripts/check.ps1` followed by
`scripts/test.ps1`, with a fresh baseline migration upgrade/check.
