# Frontend audit: design-system conformance

Paste everything below the line into the model, at the repository root.

---

You are a design-systems reviewer checking the CiteLadder product app and
public sites against their written design contract. Linters already catch raw
colours, raw text sizes, size-named radii and stray shadows; you look for
**semantic** misuse that a linter cannot see. Your output is a findings report,
not code changes.

**Read first:**

1. `docs/prompts/_contract.md` (marketing copy is out of bounds).
2. `docs/design.md` — whole file. It is the only visual authority.
3. `docs/frontend-architecture.md` section "Component capability and technical
   ownership".

**Pick one surface per run** and say which in the Summary: Agent, Site Health,
Visibility/Prompts/Runs, Connected data (Demand, Performance, Search
Intelligence, AI Referrals), Commerce, Projects/Onboarding, Settings/Billing,
Marketing (structure only), Docs site.

## Scope

- `frontend/components/<surface>/`, related `frontend/lib/<surface>/`.
- Shared owners for reference: `frontend/components/ui/`,
  `frontend/apps/app/src/globals.css`, `frontend/components/layout/nav-items.ts`.

## Hunt list

1. **Reimplemented primitives.** Feature code building its own button, dialog,
   menu, table, tabs, select, badge, tooltip, empty state or skeleton instead of
   `components/ui/`; feature files importing `@radix-ui/*` directly.
2. **Wrong semantic colour.** Emerald/accent used for success or positive
   deltas (accent means action only); success/danger used decoratively;
   meaning carried by colour alone without text or icon.
3. **Zero vs absence.** Missing, unknown or unavailable values rendered as `0`,
   `0%`, an empty bar or a green state; loading rendered as empty; empty
   rendered as an error. Check the availability vocabulary in `design.md`.
4. **States.** Component lacking loading, error (`read-error.tsx`), empty or
   disabled states that its data can reach; refresh collapsing the whole
   surface instead of scoped progress.
5. **Hierarchy.** More than one `h1` per rendered page; headings skipping
   levels; typography not using the `.type-*`/`textRole` roles.
6. **Elevation and borders.** Resting cards or tables given shadows or outer
   borders through props or `style`; alpha-faded borders via inline style.
7. **Inline-style escapes.** `style={{…}}` carrying colours, font sizes,
   spacing or radii that bypass tokens (the linter does not read inline styles).
8. **Icons.** Icons not from Lucide/`lib/icons.ts`, stroke overridden locally,
   sizes outside the ladder for their context.
9. **Motion.** Animations not using motion tokens; motion that does not stop
   under `prefers-reduced-motion`.
10. **Dark mode.** Components hard-coding light-only values in the app (the app
    supports dark; marketing and docs are light-only by design).

## Not a finding

- Anything `pnpm check:policy` already rejects.
- Copy, wording, claims or "coming soon" labels on any surface.
- Personal taste ("would look better if …") without a `design.md` rule.

## Subagent split

Split the chosen surface's component directory into 2–3 roughly equal slices;
the lead checks shared-owner misuse (item 1) across all slices.

## Output

Use the report format in `_contract.md`. Cite the `design.md` heading each
finding violates in **Rule**.
