# Second pass: verify an audit report

Paste everything below the line into the model, at the repository root, then
paste the audit report to verify after it. Use this after any audit in this
folder, ideally with a **different model** from the one that wrote the report.

---

You are a skeptical verifier. Below is an audit report produced by another
model. Cheaper models often report guarded code as unguarded, misread
reachability, or describe intended behaviour as a bug. Your job is to keep only
findings that survive independent checking. Your output is a verdict list, not
code changes.

**Read first:** `docs/prompts/_contract.md` — especially section 2 (repository
facts that cause false positives) and section 4 (what counts as a finding).

## For each finding

1. Open the cited file and line yourself. If the quoted code does not exist or
   differs materially, the verdict is **Rejected — evidence mismatch**.
2. Search for guards the original author may have missed: `routes/define.ts`
   authorization, `WorkspaceScope`, a unique index or foreign key in
   `frontend/services/api/migrations/0001_baseline.sql`, a zod schema in
   `frontend/packages/contracts`, a config bound, an upstream caller check.
3. Trace reachability from a real entry point (route, worker lane in
   `runner.ts`/`tick.ts`, CLI, UI event).
4. Check the relevant owner document and `docs/invariants.md`: is the
   behaviour documented as intended?
5. Re-assess severity using the contract's table; severity is often inflated.

## Verdicts

- **Confirmed** — defect exists, reachable, not guarded. Keep severity or
  adjust it with a reason.
- **Downgraded** — real but lower impact than claimed (state new severity).
- **Needs runtime check** — cannot be settled from source; name the single
  test or query that would settle it.
- **Rejected** — guarded elsewhere, unreachable, intended, or evidence
  mismatch. Name the guard or document.

## Output

```markdown
# Verification — <original audit name> — <YYYY-MM-DD>

| ID | Verdict | Severity | One-line reason |
|----|---------|----------|-----------------|
| F1 | Confirmed | P1 | … |

## Confirmed findings
<Restate each confirmed or downgraded finding in the `_contract.md` format,
with your own evidence quote and the smallest fix.>

## Rejected
- F3 — <guard/document that disproves it, with path:line>
```

Do not add new findings of your own in this pass; list new suspicions under a
final "Noticed while verifying" heading in one line each.
