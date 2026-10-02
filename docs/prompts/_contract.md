# Audit contract (shared by every prompt in this folder)

You are running a **read-only audit** of the CiteLadder repository. These rules
apply to every audit prompt in `docs/prompts/`. If an audit prompt and this
contract disagree, this contract wins.

## 1. Rules of engagement

- **Do not edit, create, delete, stage or commit any repository file.** Do not
  install packages, start servers, run migrations, call external APIs, open
  network connections or touch any database.
- Allowed: reading files, listing directories, `git log`/`git show`/`git diff`,
  and text search (grep/ripgrep/glob). Do not run `scripts/check.ps1`, full test
  suites or builds. A single focused test may be run only if the prompt says so.
- If your tool insists on writing the report to disk, write only to
  `.git/audits/<prompt-name>-<YYYY-MM-DD>.md` (inside the Git directory, never
  tracked). Otherwise print the report in chat.
- Stay inside the prompt's **Scope**. Note anything important outside it in one
  line under "Out-of-scope observations" without investigating it.

## 2. Repository facts that cause false positives

Read these before judging anything. Reporting one of these as a defect is a
wrong finding.

- **Runtime is TypeScript.** Every HTTP route, worker and protocol endpoint is in
  `frontend/services/api/src/` (Node, Hono, Kysely). Python under `backend/` has
  **no web process and no executing worker**; it keeps SQLAlchemy models,
  Alembic, bootstrap and offline operators. Python models are not dead code
  because no Python route imports them.
- **Single migration baseline is intentional.** Schema changes live in
  `migrations/versions/0001_initial.py`; there is deliberately no `0002+`.
  Semantic versions all equal `1` on purpose (pre-launch reset policy).
- **No Redis, no embeddings, no vector store** — by design.
- **PostgreSQL is the queue.** Tasks are claimed with `FOR UPDATE SKIP LOCKED`.
- **Workspace scoping is by `workspace_id`, never `user_id`.** Routes resolve
  membership in `frontend/services/api/src/routes/define.ts` (session → workspace
  or project → capability → params) before the handler runs. Reads through
  `WorkspaceScope` (`frontend/services/api/src/db/workspace-scope.ts`) add the `workspace_id`
  predicate automatically. Check these before claiming a route is unauthorized.
- **Coverage is deliberately not a gate.** Do not report low coverage as such.
- **Marketing copy and "coming soon" labels are owner-controlled.** Never report
  wording, tone or claims in marketing copy.
- Linters already enforce formatting, raw colours/text sizes (`pnpm check:policy`),
  complexity ceilings, dead exports (knip/vulture) and import layering. Do not
  report what those tools catch; report what they cannot.

## 3. Authority

Binding rules live in `docs/invariants.md` (numbered sections). Cite the section
when a finding violates one, for example "Invariant 3". Feature behaviour lives
in the owner documents listed in `docs/README.md`. If code and a document
disagree, report the disagreement; do not assume the code is right.

## 4. What counts as a finding

A finding is a **concrete defect with a reachable failure scenario**:
"input/state X → code path Y → wrong result Z". It must cite the file and line
you actually opened and quote at most 6 lines of the relevant code.

Before you report, try to disprove it:

1. Search for a guard elsewhere — caller, middleware, `define.ts`, a database
   constraint or unique index in `0001_initial.py`, a zod schema, a config bound.
2. Confirm the path is reachable from a real entry point (route, worker lane,
   CLI, UI event). Unreachable code is a dead-code note, not a bug.
3. Check whether a test already pins the behaviour you think is wrong; if it
   does, the behaviour is probably intended — downgrade to a question.

Not findings: style, naming, "consider refactoring", missing comments, generic
best practices without a failure scenario, TODOs, hypothetical future misuse,
"add a test" without naming the regression it would catch, anything a
type-checker or linter already rejects.

## 5. Severity and confidence

| Severity | Meaning |
|---|---|
| **P0** | Cross-workspace data exposure, auth bypass, secret leak, money/credit loss, data corruption or loss |
| **P1** | Invariant violation or wrong user-visible result on a normal path |
| **P2** | Edge-case failure, latent bug, robustness or performance defect with measurable impact |
| **P3** | Low-impact correctness polish (use sparingly) |

| Confidence | Meaning |
|---|---|
| **Confirmed** | You traced entry point → defect → outcome in code you read |
| **Likely** | Defect is clear, one link of reachability is unverified (say which) |

Anything weaker is not a finding: put it under **Open questions** with the one
check that would settle it.

## 6. Budget and stop rules

- Report at most **12 findings**, most severe first. Fewer, verified findings
  beat many speculative ones. "No confirmed findings" is a valid, useful result.
- Do not list the same root cause twice; list extra locations under one finding.
- Stop exploring a lead after it has cost roughly 10 file reads without
  converging; move it to Open questions.

## 7. Subagents (optional)

If you can spawn subagents, use the prompt's **Subagent split**. Give each
subagent: this contract, its slice, and the prompt's hunt list. Subagents must
also be read-only and return **candidates**, not final findings. You, the lead,
must re-open the cited code and verify each candidate yourself before it enters
the report. Drop candidates you cannot verify; never merge them unread.

## 8. Report format

```markdown
# <Audit name> — <YYYY-MM-DD> — <git short SHA>

## Summary
<2–4 sentences: what was covered, overall risk, top issue.>

## Findings

### F1. <one-line defect statement> — P1 · Confirmed
- **Where:** `path/to/file.ts:123` (+ other locations)
- **Rule:** Invariant N / owner doc section / none (plain bug)
- **Evidence:**
  ```ts
  <≤6 quoted lines>
  ```
- **Failure scenario:** <input/state → path → wrong outcome>
- **Why not guarded elsewhere:** <what you checked>
- **Smallest fix:** <one or two sentences; no code dump>

## Open questions
- <suspicion> — settle by <one concrete check>

## Coverage
- Read: <directories/files actually inspected>
- Not covered: <what you skipped and why>

## Out-of-scope observations
- <one line each, optional>
```
