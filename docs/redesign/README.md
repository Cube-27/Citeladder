# Searchify v2 Redesign — Handoff

**Audience: the external agent/team implementing this redesign.** Everything you need is in
this branch — plan, design assets, binding product decisions, and the work already completed.
Start here, then read [`plan.md`](./plan.md) (the authoritative task-by-task spec) and
[`decisions.md`](./decisions.md) (binding product decisions).

## What this is

A full visual + structural redesign of Searchify (AEO / AI-visibility SaaS — FastAPI backend,
Next.js frontend, Postgres). Three workstreams:

1. **Product app** — port the owner's Figma design system (light theme verbatim), plus a
   newly authored Perplexity/Claude-style soft-charcoal dark theme. Grouped nav, elevated
   cards, Figma type scale, Inter.
2. **Marketing site** — a complete, independent creative rebuild ("Signal/Dusk" system):
   new content architecture, cinematic animated hero, scroll storytelling, heavy motion.
   Marketing has **no relation to the app** (owner decision).
3. **Onboarding** — first-run users get a full-screen stepper with **AI auto-discovery**
   (brand + URL in → competitors/domains/prompts discovered → editable review → confirm),
   gated so they never land in the empty app first.

## What's already done (on this branch, committed)

| Commit | Scope | Status |
|---|---|---|
| `d14ca67` | **Task 9 (backend):** stateless `POST /brand-suggestions/prompts` — mirrors the sibling suggest endpoints (workspace auth, `confirm_send_evidence`, 422→503→502 guard order, nothing persisted). DTOs in `backend/app/domain/projects/schemas.py`, logic in `suggestions.py` reusing the prompt-generation construction half, knobs in `backend/app/core/config/suggestions.py`. Tests: 27 new (unit + component), full sibling regression 123/123 green, ruff clean | **Complete** |
| `a9c8bd7` | **Task 1 (P1 token foundation):** `frontend/app/globals.css` — Figma light theme verbatim (`#2756FF` anchor) + authored dark theme + all new tokens (ramps, chart, score-ring, shadows, radii, type scale); Inter via next/font; light default in `lib/theme.ts`; `docs/design.md` fully rewritten; guard upgrades — `globals.test.ts` now has a programmatic WCAG AA suite for both themes + dark luminance floor/ordering assertions + marketing `--mkt-*` pair checks (auto-activate when Task 7 declares the `#1F1E1B` dusk canvas); `check-design-tokens.mjs` scans both CSS files; `check-frontend-architecture.mjs` globals.css budget raised 800→1000. Tests: 810 passed; `pnpm check:policy` clean; `tsc --noEmit` clean; `pnpm build` green | **Complete** |

Task 1 documented deviations (AA-driven value nudges within the same color families) — see
its commit message and `docs/design.md`. **No other task has been started; the tree is clean.**

## What remains

Tasks **2–8 and 10–12** of [`plan.md`](./plan.md) §5. The plan has per-task file lists,
approaches, acceptance criteria, and test commands. Execution order:

```
P1 (Task 1) ✅ ──► Tasks 2, 3, 7 (parallel) ──► Tasks 4, 5, 6, 10 (after 3),
Task 9 ✅ ───────► Task 11 (after 3 + 9), Task 8 (after 7), Task 12 last (full gate)
```

- **Task 2** — app shell restyle (Figma geometry, grouped nav kept; fix stale `Optimize`
  assertion in `e2e/shell.spec.ts` → `Improve`)
- **Task 3** — port Figma primitives into `components/ui/` (buttons rounded-md not pills,
  owned-citation badge blue, ScoreRing/Sparkline/donut geometry, new `empty-state.tsx`)
- **Task 4** — Visibility dashboard per `figma/VisibilityDashboard.tsx` (hero metric card,
  underline tabs, engine pills, sparkline table, SOV donut)
- **Task 5** — measurement surfaces reskin (prompts, products, runs, analytics, traffic)
- **Task 6** — action surfaces reskin (content, site-health per `figma/SiteHealthDetail.tsx`,
  knowledge-base, settings/providers, setup edit)
- **Task 7** — marketing landing: copy module `lib/marketing-content/landing.ts`, dusk token
  rewrite of `app/(marketing)/marketing.css`, `motion-primitives.tsx`, cinematic hero
- **Task 8** — pricing presentation + secondary marketing pages (facts frozen)
- **Task 10** — auth screens in the Figma language
- **Task 11** — onboarding route + AI auto-discovery + first-run gating (watch the two race
  conditions specified in the plan: gate waits for `isLoading`; confirm awaits projects-query
  refetch before navigating)
- **Task 12** — empty-state sweep, a11y/motion pass, full verification

## Design assets (in this branch)

- **`docs/redesign/figma/`** — the owner's Figma design system export (source of truth for
  the app): `tokens.css` (full light+dark token CSS — light ported verbatim, dark NOT
  adopted), `AppShell.tsx`, `VisibilityDashboard.tsx`, `SiteHealthDetail.tsx`,
  `OnboardingScreen.tsx`, `DesignSystemSheet.tsx` (type scale + components), `ScoreRing.tsx`,
  `Sparkline.tsx`, `App.tsx` (screen switcher), `Reference.tsx`.
- **`docs/redesign/designs/`** — the approved HTML mockups (open in a browser):
  - App: `app-visibility-overview-{light,dark}.html`, `app-prompts-list-{light,dark}.html`,
    `app-prompts-empty-light.html`, `app-site-health-detail-{light,dark}.html`
    (the dark files define the authored dark ramp now in globals.css).
  - Marketing: `marketing-landing-dusk.html` (full landing + 14s animated hero loop),
    `marketing-pricing-dusk.html`, `marketing-style-guide-dusk.html` (the Signal language:
    palette, type, nine named motions).
  - Onboarding/auth: `onboarding-{brand-step,ai-discovery,review,login,register}-{light,dark}.html`.
  - `design-plan.json` — section/variation index with one recommended variation per section.

## Repo orientation

- Read `Agents.md` first (repo bootstrap + rules), then `docs/design.md` (the design system
  in written form — rewritten in commit `a9c8bd7`), `docs/invariants.md` (hard rules),
  `docs/frontend-architecture.md` as tasks require.
- `frontend/app/globals.css` is the single source of truth for app tokens (bridged Tailwind
  semantic tokens). `frontend/app/(marketing)/marketing.css` (~4,700 lines) is the existing
  `.mkt`-scoped marketing creative system — Task 7 rewrites its token section; marketing
  components consume plain `.mkt` CSS classes, not Tailwind utilities.
- Guard toolchain (must stay green): `frontend/app/globals.test.ts` (palette + AA suite +
  name-set sync with `docs/design.md`), `frontend/scripts/check-design-tokens.mjs`,
  `check-token-escapes.mjs` (no raw hex in `.ts/.tsx`), `check-frontend-architecture.mjs`.
  Run all via `pnpm check:policy` + vitest.

## Run & verify

```bash
# Backend (from backend/) — needs a local Postgres; creds via DATABASE_URL / repo docker:
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8000
uv run --extra dev pytest tests/unit/test_<area>.py tests/component/test_<area>.py -q
uv run ruff check .

# Frontend (from frontend/) — pnpm ONLY (pinned 11.9.0):
pnpm install
pnpm dev                      # same-origin /api proxy via next.config rewrites
pnpm test -- <file>           # vitest, colocated *.test.tsx
pnpm build && pnpm lint && pnpm check:policy
pnpm test:e2e                 # playwright (needs the app running)
```

Per-task focused test commands are in `plan.md`. Task 12 runs the full gate.

## Non-negotiables (will fail review otherwise)

- Honor [`decisions.md`](./decisions.md) — owner-confirmed, they outrank the Figma references.
- No raw hex in `.ts`/`.tsx`; both themes AA ≥ 4.5:1 (the guard computes it — run the tests).
- `score-band.ts` thresholds stay 25/50/75; nav groups stay Analyze/Improve; pricing facts
  stay in `lib/marketing-content/pricing.ts` untouched.
- All animation transform/opacity only, `prefers-reduced-motion`-gated, decorative scenes
  `aria-hidden`.
- pnpm only; minimal scoped diffs; update colocated tests + affected e2e specs in the same
  change; keep `docs/design.md` ↔ `globals.css` token name-sets in sync (guard-enforced).
- Data honesty: never invent dashboard fields the API doesn't return (Avg Rank and Sentiment
  render `—` by design).
