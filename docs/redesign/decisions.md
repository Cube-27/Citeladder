# Searchify v2 Redesign — Product Decisions Record

These are the **binding product decisions** made by the product owner during design review.
Every implementation task in [`plan.md`](./plan.md) must honor them. Where a Figma reference
conflicts with a decision below, the decision wins.

## Scope & direction

1. **Redesign everything** — marketing site, auth screens, and the logged-in app — under one
   new design effort (two visual systems: marketing is independent, see decision 7).
2. **What was rejected about the old design:** too dark/gloomy, bland/generic, too
   dense/cramped, fonts too small. The new app must feel like a clean, modern,
   customer/enterprise-facing SaaS; marketing must be dramatically more ambitious.
3. **App visual language = the owner's Figma design system** (reference files since removed), light
   theme ported **verbatim** (royal blue `#2756FF` anchor, blue-gray neutrals, Inter,
   14px-based type scale).
4. **Dark theme is AUTHORED, not ported.** The Figma midnight dark (`#09090F`/`#0D1228`
   near-black) was explicitly rejected. The new dark theme is a **Perplexity/Claude-style
   lighter soft charcoal** — never near-black, elevated surfaces clearly lighter than the
   base. Exact ramp lives in the approved mockups
   was superseded: see decision 12 below. Implemented in `frontend/app/globals.css`. Machine-enforced: `frontend/app/globals.test.ts`
   asserts a not-near-black luminance floor, `base < panel ≤ elevated` ordering, and AA pairs.
5. **Light is the default theme**; dark remains a full sibling. The theme toggle stays.
   Stored user choice is respected (`frontend/lib/theme.ts`).

## Confirmed semantic calls

6. **Type scale: Figma's 14px-based scale verbatim** (hero 48 / page title 26 / section 17 /
   card 15 / body 14 / secondary 13 / caption 12 / micro 11). This overrode an earlier
   "bump body to 15–16px" idea — the owner chose fidelity to the Figma file.
7. **Score bands keep the current thresholds 25/50/75** — `frontend/components/ui/score-band.ts`
   must NOT change; only band *colors* change (mapped onto the Figma band palette).
8. **Owned citations become Figma blue** — the old green identity is dropped.
9. **Navigation keeps the grouped Analyze / Improve structure** (the Figma AppShell's flat
   ungrouped nav is NOT adopted). Group labels are not renamed. The Figma shell *geometry*
   (220px sidebar, 36px rows, active = accent-subtle bg + accent text + 3px left bar,
   52px topbar) is adopted.

## Marketing

10. **"Marketing pages have no relation to the app"** (owner verbatim). Marketing is a fully
    independent creative system — its own palette/type ("Signal/Dusk": warm charcoal
    `#262522`/`#1F1E1B` canvas, Söhne/Inter + Georgia-italic accents + mono, rationed
    violet→magenta→coral gradient) defined in the approved mockups
    (`docs/redesign/designs/marketing-style-guide-dusk.html`). It is **not** anchored to the
    Figma app tokens.
11. **Marketing must be extremely ambitious**: new content architecture with rewritten punchy
    copy, a cinematic animated hero (live-audit scene), scroll-driven storytelling,
    parallax/floating-card motion, hover micro-interactions — Superhuman-class polish.
    All motion is transform/opacity only and `prefers-reduced-motion`-gated.
12. **Pricing facts are frozen**: tiers, prices, quotas, and comparison rows keep rendering
    from `frontend/lib/marketing-content/pricing.ts`. Presentation only — no fact edits.

## Onboarding

13. **First-run users must not land in the app.** Post-login, users with zero projects are
    gated into a **full-screen onboarding stepper** (no app shell): Brand (name + website
    URL) → **AI auto-discovery** (competitors, owned domains, starter prompts discovered by
    AI, animated progress) → editable pre-checked Review → Confirm → land on `/visibility`.
    Goal: fewer clicks than the old manual 2-step form. Manual fallback must work end to end
    when the AI agent is not configured (503 path).
14. Onboarding visual language: Figma `OnboardingScreen.tsx` layout (split screen: left
    stepper/form, right live-preview panel), per approved mockups
    (mockups since removed; see the implementation in `frontend/components/onboarding/`).

## Hard rules that outrank aesthetics

- **No raw hex in `.ts`/`tsx` source.** Hex lives only in `frontend/app/globals.css` (app)
  and `frontend/app/(marketing)/marketing.css` (marketing). Guard: `pnpm check:policy`.
- **WCAG AA ≥ 4.5:1** for all documented text/surface pairs in both app themes, enforced by
  the programmatic suite in `frontend/app/globals.test.ts`; marketing `--mkt-*` body pairs
  likewise (display/decorative carve-outs documented in `docs/design.md`).
- Backend invariants (see `docs/invariants.md`): config never in service code; workspace auth
  on every query; secrets never returned; provenance on derived rows.
- Frontend package manager is **pnpm only** (pinned 11.9.0). Never npm/yarn.
