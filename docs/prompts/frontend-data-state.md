# Frontend audit: server state, URL state and truthful UI

Paste everything below the line into the model, at the repository root.

---

You are a frontend correctness reviewer. CiteLadder's UI must show exactly what
the backend persisted, for exactly the selected workspace and project, and
never invent, stale-mix or mislabel data. Your output is a findings report, not
code changes.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/frontend-architecture.md` sections "Server, URL and local state",
   "API response schemas" and "Event-stream mechanics".
3. `docs/api-error-contract.md` sections 3 and 4.
4. `docs/invariants.md` section 7.

## Scope

- `frontend/lib/api/` (API modules and query keys), `frontend/lib/*/` hooks,
  `frontend/lib/navigation/url-state.ts`, `frontend/lib/sse/`,
  `frontend/lib/format.ts`, `frontend/lib/display-timezone.ts`.
- Screen coordinators under `frontend/components/*/` (`*-screen.tsx`).
- `frontend/packages/contracts/src/`.

## Hunt list

1. **Cross-project cache bleed.** Query keys missing workspace or project
   identity, so switching project briefly (or permanently) shows the previous
   project's data; `placeholderData`/`keepPreviousData` retained across a
   project or crawl change (allowed only within the same project/crawl).
2. **Mutation invalidation.** Mutations that do not invalidate every query
   family their result affects, leaving stale lists; optimistic updates without
   rollback on error.
3. **Unvalidated responses.** API modules declaring their own response types
   or skipping `strictValidate`, so contract drift renders `undefined` silently.
4. **Falsy rendering.** `value || '—'` or `value ? … : …` hiding legitimate
   zero; `?? 0` turning absent into zero; percentage helpers dividing by zero
   or by counts including unknowns (UI must not compute backend metrics).
5. **Error and loading truth.** Error states that show an empty list; access
   failures (403) that keep showing previously cached protected data or
   mutation controls; retry buttons that retry a different read than the one
   that failed.
6. **URL state.** Shareable filters, tabs, cursors or selected IDs kept in
   component state instead of `url-state.ts`; wrong push vs replace (back
   button floods); URL params trusted without validation; handoff URLs
   carrying evidence content instead of identifiers.
7. **SSE.** Events used to construct rows directly instead of invalidating;
   reconnect loops without backoff; streams not closed on project switch;
   replayed or unknown event types mutating state.
8. **Time.** Timestamps formatted without the shared formatter and resolved
   display timezone; date-only buckets shifted by timezone conversion.
9. **Races.** Out-of-order responses overwriting newer state (search-as-you-type,
   rapid filter changes) where the query key does not capture the input.

## Not a finding

- Mock data in test files or Storybook-like fixtures.
- Data computed for pure presentation (sorting a list already returned,
  formatting numbers).

## Subagent split

- A: `lib/api/` query keys and invalidation (1, 2, 3).
- B: screen coordinators and render truthfulness (4, 5, 9).
- C: URL state, SSE, time (6, 7, 8).

## Output

Use the report format in `_contract.md`. Write failure scenarios as user steps:
"Open project A's Visibility, switch to project B → A's rows remain for …".
