# Agent end-to-end reliability and workflow plan

> Archived on 7 October 2026. Retained as historical scope and evidence, not
> execution authority or a current status report. Remaining work is consolidated
> in [the backlog](../plans/backlog.md), queued through [plan status](../plans/ACTIVE.md).

Status: slices A–G implemented locally on `plan/agent-end-to-end`, following
the owner's implementation assignment on 5 October 2026. Publication, CI,
deployment and live-provider quality evaluation remain separate. The audit and
implementation decisions below retain the original planning evidence.

## Objective and baseline

Make the Agent reliably answer questions, turn persisted evidence into bounded
deliverables, and refine those deliverables without losing their source context.
Preserve the existing document editor, outline approval, revision history,
Action attachment and explicit implementation declaration.

Branch: `plan/agent-end-to-end`, created from local `main` at
`50fa4b03d92a5ef3bf11f93410afaa20cdc632d5`. The existing 12 modified files were
carried onto the branch unchanged. They are part of the implementation baseline,
not changes made by the audit. At audit completion no commit, push, PR, merge
or deployment had occurred; implementation now has local slice commits.

Audit evidence: independent static review of the working tree, the supplied GLM audit,
Agent owner documentation and invariants. Reviewed admission, runtime, context,
output persistence, catalog, tool adapters, retrieval, queue/progress, handoff
codec, relevant UI callers and existing test cases. This is not a live-provider
quality evaluation, browser acceptance run or exhaustive security certification.
The external audit is a lead list, not an accepted specification.

Read [AGENTS.md](../../AGENTS.md), [Agent](../agents.md), the affected
[invariants](../invariants.md), and [Review.md](../../Review.md) on implementation.
Read Site Health, MCP and frontend owners only for slices touching them. This
plan covers the findings below; it does not resume deferred work in other plans.

## Independent findings and corrections

Paths below are relative to `frontend/`; line numbers describe the audited
working tree and must be rechecked before implementation.

| Priority / disposition | Evidence and impact | GLM items |
|---|---|---|
| P1 confirmed | `services/api/src/agent/runtime.ts:256–281` slices manifest, history and current revision after allocating tool transcript space. It discards newest history/current output first and can remove all context without a marker. | 1.5, 1.6 |
| P1 additional constraint | `services/api/src/config/agent-runtime.json` admits 100,000-character output bodies but only 90,000 characters of working transcript. Reserving the entire output unconditionally is impossible for valid saved documents. JSON escaping adds further overhead. | Missing from proposed repair |
| P1 confirmed | `services/api/src/agent/runtime.ts:352` accepts a respond/output without a skill as success but never saves the output. | 1.2 |
| P1 confirmed contract exposure | `services/api/src/routes/agent.ts:96–98` returns catalog entries, including internal methodology bodies. Client-side schema stripping is not wire sanitization. This violates the documented catalog boundary; it is not evidence of credential exposure. | 1.1 |
| P2 confirmed attribution defect | `services/api/src/agent/store.ts:126–148,183–201` excludes requester identity from replay binding. Workspace sharing is intentional; returning another actor's submission as one's own is not. Keep the workspace key uniqueness in `backend/app/models/agent.py:166`; adding only a user filter would collide with that constraint. | 1.4 |
| P1 workflow gap | `components/site-health/issue-detail-rail.tsx:44,132–146` sends an issue title/count with no typed issue reference. `lib/agent/handoff.ts` has no issue producer. The server cannot reliably recover the selected issue. | 2.1, 3 |
| P2 confirmed | `services/api/src/agent/context.ts:99–112` slices serialized JSON; `context-adapter.ts:17–18,143–161` double-serializes evidence and duplicates substantial evidence in summary. `issue_count` counts blocks, not findings. | 1.7, 5.2, 5.7 |
| P2 confirmed | `runtime.ts:245` supplies bare skill IDs for model selection. The core `Skill` type lacks public description metadata even though the loaded catalog has it; this is not just a one-line prompt edit. | 4.2 |
| P2 confirmed ambiguity | Packaged `skills/content_create/SKILL.md:36–37` asks for current-source research while the operating contract provides no browsing. The skill's final fallback acknowledges missing browsing, so the problem is conflicting workflow guidance, not proof of actual fabricated research. | 4.3, 4.4 |
| P2 confirmed | `lib/agent/next-steps.ts` and `components/agent/conversation.tsx:212–226` pass a document title and optional Action, not an exact output revision. Duplicate titles cannot identify the accepted upstream brief. | 2.5, 6.2 |
| P2 confirmed | Retry restarts in-memory state in `runtime.ts:127–155`; `model-calls.ts:116` overwrites steps used; `reads.ts:57–102` selects only the current attempt. Prior work and repeated cost become hard to understand. | 1.8 |
| P2 confirmed contract drift | `store.ts` freezes only step/read/time budgets; context, history, tool-result and reply sizing read current global policy at execution. Docs promise frozen size budgets. New sizing logic must use the admitted run policy. | Additional finding |
| P2 confirmed | `outputs.ts:81` coerces unapproved work to outline; `runtime.ts:355–363` normalizes format without explaining the effective save. Users can see a reply describing a draft while the persisted phase says outline. | 1.10, 6.1 |
| P3 confirmed | `reads.ts:137–140` includes the full manifest in every detail response; title-only list search is at `reads.ts:227`. `store.ts:171–177` records approval as an ordinary synthetic user utterance. | 6.4–6.6 |
| Improve with constraints | Earlier tool bodies are not persisted: attempts retain references, omissions and hash (`runtime.ts:294–327`), not the complete response as the audit states. Reuse must reauthorize/re-read exact evidence through its owner, not invent a second memory store. | 5.1, 6.2 |
| Improve with constraints | Field semantics are sparse in `services/api/src/mcp/tools.ts`; `agent/tool-adapters.ts` classifies availability with a name list. Missing state is a contract failure, not automatically unavailable. | 5.5, 5.6 |
| Partly supported | Site Facts embeds a crawl ID in prose, while `read_ai_crawlability` uses project/latest scope. `site-facts-panel.tsx:39` prefers dashboard crawl; an actual stale-screen reproduction is still needed. Exact-reference semantics should prevent races even when the screen was latest at click time. | 2.4 |
| Reject as current bug | `skill-picker.tsx:67–85` already labels inherited selection “Continue with …”, “Continue chat workflow” or “From attached Action”. Both chat surfaces pass inherited state. Clearing a server pin is absent, but the claimed “Automatic” lie is stale. Treat selection simplification as a product improvement. | 1.3, 4.1, 4.5 |
| Reject | `runtime.ts:24–32` replaces the entire unverified URI; `raw.slice(end)` retains only trailing punctuation. Existing runtime coverage exercises fabricated citations. | 1.9 |
| Reject proposed diagnosis | `contextCitations` intentionally permits frozen Action diagnosis references, as documented. The genuine gap is allowing references whose supporting blocks were omitted from the actual prompt. Preserve diagnosis citations when supplied. | 5.4 |
| Reject as current bug | `conversation.tsx` renders failed outcomes and retry recovery through `runOutcome`/`runErrorCopy`. Lack of an appended failure message does not mean a silent UI failure. Avoid duplicate failure messages and authorization-dependent terminalization. | 5.8 failure visibility |
| Reject proposed arithmetic | Retrieval measures the entire serialized document in UTF-8 bytes; the registry checks the same JSON's character length. A document within the byte bound also fits the equal character bound. Existing pending tests exercise this path. Generic tool slicing is still a separate defect. | 5.9 |
| Reject unsafe repair | Missing/foreign explicit Actions must remain refused under `context.ts:55–65` and the documented 404 contract. No active purge path was established. Do not soft-fail every unresolved ID to fix a hypothetical deleted Action. | 2.6 |
| Do not adopt | Blanket UUID/HTTP URL removal can corrupt proposed routes, legitimate code and supplied source links. A performed-verb scanner is not a reliable factual validator and conflicts with invariant 12's rejection of a deterministic claim-validator layer. | 5.3, 6.1, 4.4 optional scanner |

The audit's missing-test list is not a mandate to create a test file per component.
`agent-panel.test.tsx` already exists, as do runtime citation, failure, revision,
funding and cross-project tests. Add cases for decisions that are actually missing.

## Implementation decisions

1. Keep one read-only runtime, one PostgreSQL queue and existing evidence owners.
   No browsing, autonomous publishing, new memory store or user-authored skill
   subsystem. Model-authored prioritization must be identified as judgment and
   compared with the product's supplied rank, never presented as a new metric.
2. Keep automatic selection with an optional explicit selection through one
   shared composer control. `/` opens that same control, not a second selection
   implementation. The capability catalog remains a useful way to start a task.
   Do not remove user choice merely because it exists in several entry points.
3. Keep the output revision exact. Never replace a whole document using a prompt
   containing only an undisclosed fragment. For an oversized current revision,
   preserve it and return an explicit size limitation before provider dispatch.
   Support section editing later only with a typed section/base-revision contract
   and deterministic preservation of untouched sections; prose “section 2” is not
   an adequate patch protocol. Do not lower the existing saved-document limit.
4. Issue aggregates start with analysis and a bounded implementation plan. Counts
   describe the complete persisted set; samples must be labeled as samples.
   Do not claim template grouping from a handful of URLs unless the owner has
   persisted grouping evidence. Individual page tasks may produce exact edits.
5. Handoff identifiers are authorized on the server. Keep browser evidence out
   of URLs. Origin references carry the exact crawl/dataset/revision scope; new
   chats never silently substitute “latest” for a selected historical source.

## Ordered slices

### A — Retain and establish the pending baseline

Inventory the existing modifications before editing. Preserve:

- `components/agent/conversation.tsx` and its chat-screen regression: tool-specific
  labels and distinct failed/unavailable states.
- `services/api/src/agent/tool-adapters.ts`, `mcp/tools.ts`, `mcp/retrieval.ts`
  and their three modified test files: exact evaluation provenance, final-analysis
  issue resolution, same-origin internal links, bounded continuation documents
  and fetched-record citation references.
- `services/api/src/workers/runner.ts`, `test/runner.test.ts` and Site Health doc
  changes: Site Health batch admission bounded by policy and pool capacity.
- The existing Agent owner documentation changes.

The retrieval and label changes are supported by source inspection. Do not call
the runner change operationally proven: its new spy test verifies the argument,
not heartbeat/settlement behavior under real pool saturation. Inspect the Site
Health worker transaction lifetime and run affected PostgreSQL coverage before
shipping that shared-runtime change. Keep this a separate commit from Agent UX.

Acceptance: all retained paths have credible affected-owner coverage; historical
and finalized analyses retain exact evaluation IDs and workspace isolation;
continuation reads reassemble Unicode evidence and expose completeness honestly.
Do not rerun prior successful evidence if it can be tied to the unchanged tree.

### B — Fix admission and output completion correctness

Owners: `routes/agent.ts`, `agent/store.ts`, `runtime.ts`, `outputs.ts`, contracts,
error vocabulary; existing cutover/runtime tests.

- Map catalog entries explicitly to the public contract's snake_case fields.
  Assert the raw HTTP JSON projection, before client parsing, excludes body and
  internal metadata. Do not add source-text policy tests.
- Keep workspace idempotency-key uniqueness. Reject replay when `replay.user_id`
  differs from the authorized requester; retain cross-project refusal and legacy
  replay behavior. No schema migration or user-scoped product data is needed.
- An output without a selected skill spends the existing bounded protocol-repair
  budget and asks for valid selection. Exhaustion fails atomically without a
  success reply or new revision; reply-only conversations still need no skill.
- Record effective outline/format handling in the visible completion reply. Keep
  approval enforcement server-side. Reject/repair invalid formats when meaningful
  rather than describing a format that was silently discarded.

Acceptance: two active members cannot replay one another's submissions, identical
same-member races share one run, unauthorized requests create no artifacts, and
the saved revision/phase agrees with the completion message. Existing cancellation,
stale-base, output-kind and funding fences remain intact.

### C — Make context assembly structurally bounded and inspectable

Owners: `agent/context.ts`, `context-adapter.ts`, `runtime.ts`, `tools.ts`,
`contracts.ts`, native Agent config; context/runtime/owner-adapter tests.

- Introduce a pure prompt-assembly boundary under the runtime owner. Allocate
  explicit space for instructions/request, selected context, exact current
  revision, separators and omission metadata before optional history and tool
  observations. Account for serialized size, not only raw body length.
- Apply decision 3 when mandatory material alone cannot fit. Keep newest history;
  remove complete oldest messages first. Per-message truncation and history-query
  limits must be represented as omissions. Never concatenate fragments of JSON.
- Represent evidence as structured sections serialized once. Keep a compact
  summary, exact source/version metadata, and named omitted sections. Rename
  `issue_count` to `evidence_block_count`. Avoid duplicating whole handoff objects
  inside summary. Preserve immutable persisted source identifiers.
- Couple citation grants to the context/tool sections actually sent on each
  call. Record-level citations may cite a supplied partial observation, but must
  not imply that omitted fields or all continuation parts were read.
- Replace generic tool mid-JSON slicing with a valid bounded envelope and explicit
  omissions; prefer owner-supported pagination/continuations. Preserve the pending
  retrieval byte-bound implementation; do not subtract arbitrary “safety” bytes.
- Freeze all relevant size/history/protocol-error limits with the admitted run
  budget. Version/parse the contract consistently and fail explicitly for an
  incompatible queued run rather than silently applying different policy.
  Follow pre-launch version policy; do not arbitrarily bump semantic versions.

Acceptance: scripted model captures demonstrate valid bounded context for a full
history, six large reads, Unicode/escaped strings, large Action diagnoses and the
latest user-edited output. A legal 100k document fails refinement transparently
without truncation/save; smaller editable documents preserve exact content.
Omitted evidence is never granted as if supplied. Policy changes after admission
do not change queued-run limits. Context-used UI reflects actual omissions.

### D — Repair entry points and exact follow-up handoffs

Owners: `lib/agent/handoff.ts`, contracts/API mapping, context adapter, Site Health
issue reads, `issue-detail-rail.tsx`, `site-facts-panel.tsx`, SI/Demand entry points,
`new-chat-screen.tsx`, `next-steps.ts`, conversation and panel seed consumers.

- Add an issue-group reference using the existing Issues read owner's identity
  and crawl scope. Inventory that owner's actual grouping key first: an aggregate
  is not necessarily one issue-row UUID. Resolve description, remediation,
  evidence, total count and bounded occurrence sample server-side.
- Do not overload `site_health_reference`: its current reader requires one page,
  current finalized analysis and allowed content-addressable checkpoints. Retain
  that contract and extend the same owners with the missing aggregate reference.
- Use the same typed reference in full-screen and panel entry points. Keep “Copy
  fix prompt” useful outside CiteLadder; share bounded task intent, not browser-
  supplied evidence authority. Agent context should contain at least the owner-
  resolved information available in that clipboard prompt.
- Aggregate prompts ask for analysis, priorities and a bounded implementation
  plan. Preserve one-row/page specificity. Replace the technical starter's claim
  to fix the site. Keep genuine deterministic product actions outside Agent.
- Carry an exact crawl reference for Site Facts through an authorized persisted
  read, including unavailable/historical states. Cover a new crawl completing
  between click and execution; never silently explain a different crawl.
- Carry exact output and revision IDs in next-step handoffs. Resolve both under
  workspace/project ownership; freeze the selected revision and provenance as
  upstream context. A later user edit must not change that accepted brief.
- Add removable, human-readable chips for new refs and complete next-step copy.

Acceptance: issue with 119 pages yields a labeled bounded sample and plan, one
page yields page-specific context, SI selections preserve exact dataset scope,
same-title documents resolve correctly, and sibling-project/stale/malformed refs
fail explicitly. Both UI surfaces send equivalent inputs. No network acquisition
or provider work occurs on a read. Large upstream revisions obey slice C.

### E — Align skills and tool descriptions with real capabilities

Owners: core/catalog skill metadata, packaged operating contract and affected
methodologies, MCP definitions and Agent adapters.

- Provide id, description, output kind and outline behavior during selection;
  extend core types and fixtures coherently. Do not expose methodology via HTTP.
- Rewrite current-source research as persisted-evidence synthesis. Distinguish
  source observations from facts approved for public use. Missing current facts
  become explicit editorial requests, not fabricated URLs. Preserve legitimate
  supplied public URLs and proposed destination paths.
- Replace unsupported inter-skill routing promises with explicit next-step advice.
  Explain that previous reads may need re-fetching; only supplied evidence can be
  reused. Keep questions reply-only and preserve user instructions/brand context.
- Require ranking outputs to distinguish product rank from proposed ordering and
  explain departures. Do not fabricate a system score when none is supplied.
- Describe ambiguous MCP fields (cohort, date windows, baseline, verification,
  resolution outcome). Define result-availability semantics with each tool and
  derive adapter behavior there; a malformed response remains a contract failure.

Acceptance: catalog/format loader tests pass; scripted selection sees useful
metadata; adapter tests distinguish successful empty, unavailable, refused and
failed reads. Review every edited methodology against advertised tools. Loader
tests validate packaging, not whether a real model will obey prose; report that
limitation instead of adding literal-text assertions or a second model judge.

### F — Simplify selection and make retries understandable

Depends on B–E. Owners: shared composer/selection hooks, picker/command menu,
skills screen, chat/panel, store, model-call progress and run presentation.

- Consolidate explicit selection into one shared composer control and shared
  state, with `/` as a shortcut. Capability cards may preselect that same state.
  Preserve accessibility, keyboard interaction, drafts, retry-send idempotency,
  project guards and output-kind conflict handling. Keep the document pane.
- If offering “Automatic” on a pinned chat, implement tri-state submission:
  omitted = inherit, null = clear explicit pin, ID = pin. Define automatic as
  respecting the existing deliverable kind and Action context. Preserve this
  distinction in request fingerprints, retries, schemas and API mapping.
- Show actual method attribution on Agent replies; explicit user selection need
  not be repeated as a second bubble label. Catalog copy explains capabilities
  without implying user-authored skills or invisible multi-agent execution.
- Keep retry attempts visible and numbered. Treat steps_used as a documented
  monotonic progress high-water mark, while attempt records remain the source
  for actual calls/cost. Never disguise a restart as checkpoint resume.
- Preserve existing terminal error rendering; exercise protocol error, catalog
  change, provider exhaustion, cancellation and access loss on both surfaces.
  Ensure prior-attempt progress cannot display as currently running.

Acceptance: selection state is truthful through follow-up/retry/reload; clearing
a pin does not change output kind; automatic questions remain possible; failed
runs have one actionable recovery presentation. Restarted attempts preserve old
activity and accounting evidence. Do not add provider retry layers or checkpoint
storage in this slice.

### G — Improve continuity and trim detail reads

Owners: Agent reads/contracts, context assembly, revision handoffs, conversation
events and history search.

- Project only UI-required context identity, labels, included sources, limitations
  and budget/omission summary in detail responses. Inventory actual context
  consumers before deleting `context.package`; retain full frozen context on the
  run for provenance, not in each two-second browser poll.
- Reuse bounded prior evidence references from existing attempts/revisions as
  navigation hints. Reauthorize and re-read exact records through their owners
  before using them as evidence; count these reads against the same budget and
  freeze what was supplied. Do not treat prior model prose or a hash as source
  facts, and do not create a parallel digest truth store.
- Render outline approval as an explicit approval event tied to its revision,
  using the existing run mode/relationships where possible. Keep attribution and
  idempotency; do not introduce a new message role without auditing DB and wire
  role constraints. Historical synthetic messages remain readable.
- Extend scoped history search to persisted message content using a bounded
  query/result policy and existing pagination. Inspect the query plan on a
  disposable fixture before deciding whether an index is needed.

Acceptance: context disclosure still works with the smaller DTO; follow-ups reuse
exact authorized evidence or explain its absence; approval reads as an action,
not text the user typed; search finds a later topic without duplicates or leaking
another workspace. Preserve append-only evidence and revision history.

## Validation and completion

Use existing suites, adding regression cases within their owners. Commands below
are implementation commands, **not results of this planning turn**. Select affected
files for each slice; do not run the whole matrix after every commit.

From `frontend/`, API cases use:

```powershell
pnpm --filter @citeladder/api test test/agent-runtime.test.ts test/agent-cutover.test.ts
pnpm --filter @citeladder/api test test/agent-context.test.ts test/agent-owner-adapters.test.ts
pnpm --filter @citeladder/api test test/agent-skills.test.ts
pnpm --filter @citeladder/api test test/mcp-retrieval.test.ts test/mcp-evidence.test.ts test/runner.test.ts
pnpm exec vp test run components/agent/chat-screen.test.tsx components/agent/agent-panel.test.tsx components/agent/new-chat-screen.test.tsx lib/agent/handoff.test.ts
```

Add the funding suite when modifying retry/dispatch/settlement boundaries; select
affected Site Health/SI component and owner tests when implementing their handoffs.
Use real PostgreSQL for admission races, authorization, leases and provenance.
Follow [Development](../DEVELOPMENT.md#repository-validation-harness): tests disable
dotenv and inherited provider credentials, and `API_TEST_DATABASE_URL` must name
an explicitly disposable migrated database. Never reset development/shared data.
Send native output to one reusable log under the worktree Git directory, inspect
the exit code and failure tail, and keep check/test processes sequential.

Run `./scripts/check.ps1 -CheckOnly` once when the executable diff is complete,
because this work changes contracts and shared runtime. Use `-All` only if actual
shared-config changes require it. Do not reproduce all CI builds/E2E/backend
tests locally. Do not repeat successful checks just for a commit or handoff.

Focused offline acceptance should exercise the whole path: issue or Action →
authorized context → scripted tool/skill steps → outline → explicit approval →
draft → user edit → refinement → exact next-step revision. Also exercise no
evidence, pressure limits, incompatible output kind, member revocation and retry.
Inspect full-screen and panel views at narrow and wide widths with mocked or
disposable data. Real-provider quality evaluation is separate and requires
explicit authorization; no live calls are authorized by this plan.

Before consolidation/removal, inventory callers, routes, schemas, tests, fixtures
and docs. Afterward search old names and delete superseded owners. Update
`docs/agents.md` and the affected evidence owner only when their contracts change.
Keep routine execution evidence in commit/PR records, not new audit sidecars.
Review the final diff with Review.md, `git diff --check`, `git diff --stat` and
`git diff --name-status`. Report exact checks, retained baseline changes, removals,
skipped checks and unresolved risks. Publishing and merging are separate actions.

## Deferred deliberately

- Durable checkpoint/resume and a new aggregate wall-clock deadline. Existing
  per-call/step/attempt bounds are finite; changing elapsed-time policy requires
  defining queue wait versus active time, retry persistence, cancellation and
  late billing settlement. Measure before adding another retry/deadline mechanism.
- Streaming, user-authored skills, durable memory promotion and autonomous plans.
- Bulk page-selection/batch orchestration UI. First ship the typed bounded issue
  analysis and preserve deterministic source-owner counts.
- Arbitrary claim scanners, blanket UUID/URL scrubbing, soft authorization failures
  and a full panel-to-route rewrite. Share behavior where duplication actually
  causes drift; do not redesign the entire Agent shell to fix a handful of defects.

## Accepted implementation scope

The owner assigned the plan for implementation. The scope remains:

> Implement `docs/plans/citeladder-agent-end-to-end.md` on the existing branch.
> Preserve the pending baseline fixes and follow slices A–G in dependency order.
> Reconfirm the audit evidence against the current tree. Use one coherent commit
> per slice, proportional native tests and the required final affected-owner check.
> Preserve the document UI and the explicit deferred scope. Do not call live
> providers, reset shared data, push, merge or deploy without separate instruction.

The original planning turn established source evidence only. Implementation
verification is recorded with the local commits, including disposable
PostgreSQL and mocked browser acceptance. It does not establish real-model
quality, production-scale performance, CI or deployment acceptance.
