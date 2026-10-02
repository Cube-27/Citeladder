# Architecture audit: policy in config, single owners

Paste everything below the line into the model, at the repository root.

---

You are an architecture reviewer checking two CiteLadder rules: **tunable
policy lives in configuration**, and **every concept has exactly one owner**.
This audit is cheap and well suited to a fast model. Your output is a findings
report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/invariants.md` sections 1 and 2.
3. `docs/backend-architecture.md` section "API and persistence rules".
4. Skim the file list of `frontend/services/api/src/config/` and
   `backend/app/core/config/` so you know what is already configurable.

## Scope

- `frontend/services/api/src/` excluding `config/`, `generated/`, tests.
- `frontend/lib/` and `frontend/components/` for frontend-owned policy.
- `frontend/packages/contracts/src/route-ownership.ts`.

## Hunt list

1. **Embedded policy.** Numeric thresholds, limits, timeouts, retry counts,
   weights, page-kind lists, model names, provider URLs, prompt templates or
   score formulas written as literals in service, worker or component code
   when an owning config module exists. Search for suspicious literals:
   `/\b(0\.\d+|\d{2,})\b/` near words like `limit`, `max`, `threshold`,
   `timeout`, `weight`, `score`, `retry`; model IDs (`gpt-`, `claude-`,
   `gemini`); `https://` hosts.
2. **Restated shared policy.** A TypeScript constant that duplicates a value
   from the Python export (`backend/scripts/export_ts_platform.py` output)
   instead of reading the generated export, or two TypeScript modules
   defining the same constant.
3. **Second owner.** A new store, crawler, page-analysis path, opportunity
   list, prompt resource, content queue or memory store that parallels an
   existing owner (`SitePageAnalysis` is the only page-understanding owner).
   Look for near-duplicate module names across directories.
4. **Route-family ownership.** Every route path served by the API maps to a
   family in `route-ownership.ts`; no family is served by both stacks; ingress
   rules in the Workers route only the families their manifest names.
5. **Frontend computes backend metrics.** A component or hook calculating a
   score, rate, share or delta that the backend already persists (frontend
   architecture: "No screen … computes a backend metric").
6. **Hard-coded engine or surface lists.** Lists of answer engines or surfaces
   written inline instead of read from the owning config (shipped engines are
   ChatGPT, Claude and Gemini).

## Not a finding

- Literals that are true constants (HTTP status codes, `1000` ms/s, array
  indices, protocol versions, test values).
- UI layout numbers handled by the design system — that is the design audit.

## Subagent split

- A: `frontend/services/api/src/` domain directories A–M.
- B: domain directories N–Z plus `workers/`, `queue/`.
- C: frontend `lib/` and `components/` (items 1, 5, 6) and the route manifest (4).

## Output

Use the report format in `_contract.md`. For each embedded literal, name the
config module where it should live.
