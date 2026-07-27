# Atlassian Design System + Flat 2.0

Status: **Phase 1 (app) shipped. Phases 2 and 3 pending.**
Owner decisions locked with the user 2026-07-27.

## Context

Three problems, solved in three phases.

**1. The visual language wasn't flat.** Every previous design pass drifted back to soft-shadow
"floating card" UI. The systems the owner actually wants — Atlassian/Jira, Trello, Superhuman,
and the Infosys reference (`~/OneDrive/Desktop/Infosys - …`) — share one trait: surfaces are
flat fills separated by tint steps and 1px hairlines, and shadows exist only where something
genuinely floats. The old `globals.css` worked against this: `--shadow-card-value` and
`--shadow-elevated-value` were applied to ordinary in-flow cards, and dark theme deliberately
kept a `0 0 0 1px` catchlight ring on them.

**2. Two divergent token systems.** The app ran `--bg-*`/`--text-*`/`--accent-*` (dual-theme,
royal blue `#2756FF`). Marketing + auth run a separate `--mkt-*` "Proof" system (light-only,
warm `#f5f5f0` paper, Manrope display, own radii/shadows/type scale).

**3. Marketing is stale and positionally wrong.** It advertises 6 answer engines when 3 are
measurable, sells self-hosting and "$0 forever", ships `[TODO(user)]` placeholder cells and a
`docs.searchify.example` help URL, and says nothing about the Commerce/Shopify suite, revenue
attribution, Bing, the 33-rule site-health crawler, AI content generation, Traffic or Answers —
all shipped.

### Locked decisions

| Decision | Choice |
|---|---|
| Flat depth | **Sunken canvas, zero card shadows.** Shadows only on true overlays. |
| Character | **Atlassian core** — navy-ink neutrals, `#0C66E4` blue, alpha borders. |
| Scope | **Everything** — app, marketing design, marketing content. |
| Token source | **Hand-ported CSS layer**, no `@atlaskit/*` dependency. |
| Marketing theme | **Light-only. Marketing gets NO dark theme.** (Owner, explicit.) |

---

## The design language

### Flat 2.0 — the five rules

Machine-enforced by `frontend/scripts/check-flat-elevation.mjs`, wired into `pnpm check:policy`.
This enforcement is the point: flatness regressed repeatedly while it was only a preference,
and the two rules that never drift in this repo (no raw hex, no token escapes) are the ones a
script enforces.

1. **No shadow on anything in normal document flow** — cards, panels, tables, sidebars, page
   headers, stat tiles, inputs, tabs, badges.
2. **Shadow only on true overlays** — modal, dropdown, popover, tooltip, toast, command
   palette — through the single `shadow-modal-value` rung, from an explicit file allowlist.
3. **Depth is a 3-step tint ladder, not light** — sunken canvas → surface panel → raised hover.
4. **Every surface boundary is a 1px alpha hairline** (`#091E4224` / `#A6C5E229`). Alpha, not
   opaque, so it composes over any tint.
5. **No gradients on UI chrome, no glass/blur, no inner catchlight rings.** Gradients are
   display art only (`components/marketing/`), never a control or container.

The guard also asserts the token half — the four in-flow rungs must resolve to `none`. A
component scan cannot see that, and if those values return every card silently lifts again.

### From the Infosys reference

What's worth adopting, and consistent with Atlassian:

- **Tinted section blocks.** Full-bleed flat bands (`#e9eef7`, `#f0f5fd`, `#e0e7fe`) alternating
  with white, instead of shadowed cards on one background. This is the primary marketing rhythm
  device in Phase 2.
- **Generous radii** — 8–10px on containers, `50px` pills on CTAs and chips.
- **Geist** for display (they pair Geist + Inter; Geist Mono is already loaded).
- Their electric `#2e53e1` sits between ADS `#0C66E4` and the old `#2756FF`; we use the ADS
  value for token fidelity.

---

## Phase 1 — App ✅ SHIPPED

`(app)` + `(onboarding)`, 26 routes. Delivered:

- **New** `frontend/app/ds-tokens.css` — 84 ADS primitives, both themes, verbatim from
  `@atlaskit/tokens`. No dependency added (the package ships ~1600 unused variables and its
  theming runtime would collide with the hand-rolled bootstrap in `lib/theme.ts`).
- `globals.css` 1019 → 865 lines, **authoring zero hex** — every value is a `var(--ds-*)`. The
  dark block collapsed from 120 hand-authored values to `color-scheme: dark`.
- **New** `scripts/check-flat-elevation.mjs`, the fourth `check:policy` guard.
- ~110 domain tokens (sentiment, citation, run status, score band) recomposed from the ADS
  nine-hue accent ramp; `--chart-1..8` from the ramp's `bolder` step.
- `globals.test.ts` and `check-design-tokens.mjs` rewritten; `docs/design.md` §1–§6 rewritten.

Verification: 4/4 guards green, 1028 tests pass (including ~35 contrast pairs at ≥4.5:1 in both
themes, no threshold relaxed), `tsc` clean, production build succeeds, both themes screenshotted.

### Phase 1 judgement calls — recorded so they are not re-litigated

1. **Sidebar took the panel surface, not the canvas.** The original sketch shared the canvas
   tone. Sidebar + top bar as one continuous white frame around a recessed content well is the
   Jira arrangement; sharing the canvas left the top bar as the only light band, which reads as
   an inconsistency rather than a decision.

2. **`--score-good` is teal, not yellow.** A four-step ramp wants yellow third, but the only
   AA-safe ADS yellow is `#946F00` — a dark mustard, and 72/100 rendered as a large mustard ring
   reads as a warning. The brighter `#E2B203` looks right but reaches only ~1.8:1 on white,
   under the 3:1 floor for a graphical object. Teal is 32° clear of green, so the top two bands
   stay distinguishable — the actual defect in the old ramp, where `good` and `high` were two
   greens 7° apart.

3. **Dark `--danger-solid` takes the LIGHT end of the red ramp.** Mapping `--danger-fg` to
   `text-inverse` gave dark text on a dark red fill in dark mode — 2.6:1, an unreadable Delete
   button. Caught by the contrast gate. Fixed to match how `background-brand-bold` and
   `background-neutral-bold` both go light in dark mode: a "bold" fill in dark is a light fill
   carrying dark inverse copy.

4. **`--border-subtle` and `--border` resolve to the same value.** At 14% alpha on white there
   is no room for two tiers, and inventing a lighter one produced edges that vanished on the
   sunken canvas. The distinction survives in `--border-strong`.

5. **`Card` lost its `elevation` prop outright** rather than keeping a no-op API — it had zero
   call sites.

6. **`.logo-mark` lost its violet → orchid → ember gradient** for a flat `--accent` fill. It was
   authored for the dusk violet accent, and a three-stop gradient on the one mark present on
   every screen was the loudest possible exception to rule 5.

7. **Citation competitor moved orange → magenta.** Warning is orange now, and a competitor
   citation in the warning hue read as an error state.

8. **Two dusk-system constraints deliberately dropped**, recorded as assertions in
   `globals.test.ts` rather than deleted so the reversal stays visible:
   - The **"never near-black" luminance floor** (0.007). An aesthetic rule for the warm-charcoal
     deck (base `#262522` ≈ 0.0185); ADS dark genuinely is near-black (`#101214` ≈ 0.0054).
   - The **soft-shadow-stack rule** — there is no dark shadow stack left to be soft.
   - Related: the accent no longer splits hue by theme (was royal blue light / violet dark).

9. **Spacing and the type scale were left alone.** `--space-1..20` already matches ADS
   `space.025…1000`, and the 11/12/13/14/15/17/26 ladder is already close to ADS
   `font.heading.*`. Renaming would churn ~40 contract entries for no visual gain.

---

## Phase 2 — Marketing design (PENDING)

Fold `--mkt-*` onto the ADS layer and rebuild the marketing rhythm around flat tinted bands.

> **Marketing stays LIGHT-ONLY.** This is an owner decision and it reverses the assumption in
> the original plan, which treated "marketing gains dark theme for free" as a benefit of sharing
> the token layer. It is not wanted. Consequences:
> - Keep the `color-scheme: light` pin on `html:has(.mkt-root)`.
> - Marketing consumes **only the `:root` (light) values** of `ds-tokens.css`. It must never
>   respond to `data-theme`, and no `mkt` surface gets a dark override.
> - The `(auth)` decision is now coupled to this: auth currently runs on the marketing token
>   set. Either keep auth light-only with marketing (simpler, consistent with "logged-out
>   surfaces are light"), or move auth onto app tokens and give it the theme toggle. **Ask the
>   owner before assuming.**
> - `globals.test.ts` must keep a marketing assertion that no dark `mkt` value exists — the
>   existing "is light-only: the retired dusk canvas is gone" test already does this and should
>   be extended, not removed.

### 2.1 Retire the parallel system

- Fold `app/(marketing)/marketing-theme.css` onto the ADS layer: `mkt-paper` → `surface-sunken`,
  `mkt-ink` → `text`, `mkt-line` → `border`, `mkt-surface` → `surface`.
- **Delete** the `mkt-glass*`, `mkt-slate*` and `--shadow-mkt-*` families — glass and float
  shadows are exactly what rule 5 bans.
- **Keep** `--color-mkt-engine-*` (real vendor brand colours). Remap the four state hues to ADS
  accents: `mkt-proof`→blue, `mkt-evidence`→green, `mkt-signal`→red, `mkt-amber`→orange.
- Move the unlayered `h1–h6`/`p` base styles in `globals.css` into `@layer base` so
  marketing's `revert-layer` hack becomes unnecessary, then delete the hack.
- `marketing-theme.css` should **shrink** well below its 400-line budget.

### 2.2 Typography

- Drop **Manrope**; add **Geist Sans** as `--font-display-family` (matches the Infosys pairing;
  Geist Mono is already loaded). Update `app/layout.tsx`.
- Collapse `--text-mkt-*` into ADS `font.heading.*` plus two fluid display steps for the hero.
- Note the existing live TODO: the Manrope woff2 transfer size was never verified on a real
  deploy. Dropping it resolves that outright.

### 2.3 Flat band rhythm — the core visual change

Replace "shadowed cards floating on paper" with full-bleed alternating tinted bands:

```
band A  surface              #FFFFFF   hero
band B  surface-sunken       #F7F8F9   the shift
band C  accent-blue-subtlest #E9F2FF   method
band A  surface              #FFFFFF   product
band B  surface-sunken       #F7F8F9   evidence
```

- Add a `tone` prop to `components/marketing/primitives/section.tsx` driving the band fill;
  every landing section declares its tone.
- `--radius-mkt-*` → ADS radii; CTAs and engine chips keep the `full` pill.
- `scenes/wallpaper-panel.tsx` — `GlassPanel` becomes a flat bordered panel. Gradients survive
  only inside the hero scene art.
- Rework `scenes/product-window.tsx` and `scenes/evidence-panel.tsx` to the flat app chrome from
  Phase 1 — they are meant to look like the product, so they should now actually match it.
- Overlay shadow only on the nav dropdown in `chrome/nav.tsx`.

### 2.4 Contracts

- **Delete `MARKETING_SHADOW_EXEMPTION` from `check-flat-elevation.mjs`.** The guard already
  fails if the exemption stops suppressing anything, so it cannot outlive its purpose — Phase 2
  is what expires it. The 8 currently-exempt sites are: `chrome/nav.tsx` (×2),
  `landing/how-it-works.tsx`, `pages/compare.tsx`, `primitives/button.tsx` (×3),
  `scenes/wallpaper-panel.tsx` (×2).
- Update the marketing half of `globals.test.ts` (the `mkt-*` name set, the "AA-safe text
  sibling" assertions, the light-only assertion) and the `--mkt-*` list in
  `check-design-tokens.mjs`.
- Tokenize the two `rgb(10 143 106 / …)` literals baked into the `mkt-pulse` keyframe in
  `marketing-motion.css`.

---

## Phase 3 — Marketing content (PENDING)

Content only. Three jobs: remove self-host/OSS positioning, make every claim true, add the
shipped features that are missing.

### 3.1 Remove all self-host / open-source positioning — 17 live hits

| File | What |
|---|---|
| `lib/marketing-content/pricing.ts:70` | "Managed-cloud or self-hosted deployment" — Enterprise feature |
| `lib/marketing-content/pricing.ts:121` | table row `Self-hosted deployment` — delete row |
| `lib/marketing-content/solutions.ts:83` | "Self-host when you outgrow the cloud — Docker Compose…" |
| `lib/marketing-content/faq.ts:137-141` | entire "Can I self-host Searchify?" Q&A |
| `app/(marketing)/faq/page.tsx:8,43` | metadata + hero lead "…and self-hosting." |
| `app/(marketing)/enterprise/page.tsx:8,14,49` | metadata + `<EnterpriseSelfHost />` render |
| `components/marketing/pages/enterprise.tsx:66-73` | "Self-host & control" ops card |
| `components/marketing/pages/enterprise.tsx:89-98` | "Self-hosted" deploy card |
| `components/marketing/pages/enterprise.tsx:159` | hero lead "…or self-hosted inside your network." |
| `components/marketing/pages/enterprise.tsx:195-232` | delete `EnterpriseSelfHost()` entirely |
| `components/marketing/pages/enterprise.tsx:257-261` | "…a self-hostable platform…" |
| `components/marketing/pages/compare.tsx:32` | `Deployment: Cloud or self-host with Docker Compose` |
| `app/(marketing)/demo/page.tsx:70-73` | "Your deployment path — Managed cloud or self-hosted" |
| `lib/marketing-content/compare.ts:30-74` | `SEARCHIFY_COLUMN` is dead code with two self-host rows — **delete the export** |
| `lib/marketing-content/landing.ts:54` | hero marquee prompt "…open source BI tools" — swap the example |
| `lib/marketing-content/pricing.ts:31-42` | `cadence: 'forever'` renders "$0 forever" → "Free tier" |
| `lib/marketing-content/pricing.ts:128` | Support `Docs and community` — no `/docs` route exists |

**Keep BYOK** — it is true and it is a differentiator. Stop implying a free self-hosted path.

Tests asserting the removed copy, to update in the same commit:
`app/(marketing)/enterprise/page.test.tsx:40-48`, `faq/page.test.tsx:99-104`,
`solutions/page.test.tsx:64`. Extend `e2e/marketing-pages.spec.ts` to assert absence.

### 3.2 Fix false claims

- **Engine roster: 6 → 3.** `provider_catalog.py` supports exactly ChatGPT (`gpt-5.4`), Claude
  (`claude-sonnet-4-6`), Gemini (`gemini-flash-latest`). Marketing ships six chips including
  Perplexity, Grok and Microsoft Copilot, and `scenes/product-window.tsx:45-51` shows fabricated
  per-engine scores for Perplexity and Grok. **Grok appears nowhere in the backend at all.** This
  contradicts the site's own published rule *"Never claim coverage of engines we do not audit"*.
  Reduce `primitives/engine-chip.tsx` to `AUDITED_ENGINES`, and drop the "connect any other
  provider you hold keys for" claim — there is no UI for it (`e2e/providers.spec.ts` asserts
  exactly three).
  Perplexity / Copilot / Google AI Overview may be named honestly as **AI-referral traffic
  sources** detected in Answers — a separate, real capability.
- **"Scheduled audits"** — `audit_scheduling` is a capability flag with **no scheduler behind
  it**. Remove until built.
- **Sentiment / Avg Position** — permanently `null` by design. Must not appear as features.
- **Terminology drift** — FAQ calls the paid tier "Starter", `pricing.ts` calls it "Paid".
- **Pricing table contradiction** — header says "Capabilities ship to everyone" while the table
  gates four capabilities.
- **`docs.searchify.example`** at `components/visibility/visibility-toolbar.tsx:38` — an
  `.example` TLD shipped as a live help URL.
- **Fake numbers** (`72.4`, `+4.8`, `1,248`, `3,091`, `Formula v4.2`, artifact hashes) are
  `aria-hidden` and "Example data"-marked, which is defensible — but the engine names inside
  them must be real ones.

### 3.3 Add the shipped features marketing never mentions

All verified real in the backend:

- **Commerce / Shopify suite** — catalog + order sync, product share-of-voice, rank
  distribution, price-match, competitor co-placement, buyer-destination breakdown, catalog
  health. The newest and largest unmarketed feature.
- **Revenue attribution** — GA4 platform-attributed + Shopify order-referrer snapshots.
- **Traffic** — Google Search Console, GA4, **Bing Webmaster Tools** (unmentioned), with
  recurring sync and late-data revision windows.
- **Answers / LLM analytics** — AI-referral volume and share, referrals by source, and the
  Visibility↔AI-referral **correlation**.
- **Site Health, precisely** — **33 deterministic rules across 8 categories**, Technical/AEO
  scored 50/50, `llms.txt` checks, **AI-crawler stance detection** per bot, 9-way page-type
  classification with per-type expected schema, three fetch engines with auto-escalation and
  bot-block detection. Currently badly undersold.
- **AI content generation** grounded in the customer's own crawled pages.
- **Onboarding auto-discovery** — AI-suggested competitors, owned domains, prompts.
- **Opportunities + Issues** — deterministic prioritized actions; grouped issue catalog with
  remediation text.
- **Provenance versioning** — every derived number carries a stamp (`scoring-v1`, `sh-rules-2`,
  `opp-formula-1`, …). The strongest proof point for "evidence-first", and barely used.

### 3.4 Structural content debt

- **`/blog` and `/compare` are empty** — `POSTS = []`, `COMPETITORS = []`, so both render empty
  states and every `/blog/[slug]` and `/compare/[competitor]` 404s, while the nav "Resources"
  dropdown links to both. Either write real content or remove them from nav and footer.
- **`[TODO(user)]` renders as page copy** — `pages/compare-detail.tsx:60,119,128-140` outputs
  `'Last reviewed · [TODO(user): date]'` and literal `'// 2–3 paragraphs: …'` instructions.
- **`/demo` is a dead end** and is the target of *every* primary CTA site-wide. Without
  `DEMO_BOOKING_URL` or `PUBLIC_SALES_EMAIL` it renders "Demo scheduling is being configured."
- **`CONTACT_EMAIL = ''`** → footer Contact link omitted; `SOCIAL_LINKS = []` → social row empty.
- **SEO gaps** — no `metadataBase`, no `openGraph.images`, no `title.template` (every title
  repeats "Searchify"), no `sitemap.ts` / `robots.ts` / `manifest.ts`, no JSON-LD, no canonicals.
  The OG-image blocker is a production domain, which `docs/operations/aws-hosting-runbook.md`
  now addresses.
- **Centralize the inline copy** — `/enterprise`, `/compare`, `/demo` and the landing scenes hold
  copy inline rather than in `lib/marketing-content/`.
- Delete the dead `LANDING_CONTENT.compositions` keys (`landing.ts:172-193`).

---

## Verification (per phase)

1. `cd frontend && pnpm check:policy` — four guards: no-raw-hex, no token escapes, architecture
   line budgets, flat elevation. Primary gate.
2. `pnpm test` — `app/globals.test.ts` parses the CSS, models dark-over-light inheritance,
   alpha-composites translucent fills over `--bg-panel`, and asserts ~35 pairs at ≥4.5:1 in both
   themes. **If a pair fails, fix the token choice, not the assertion.**
3. `pnpm lint && npx tsc --noEmit`, and `BACKEND_ORIGIN=https://<host> npx next build`.
4. `pnpm test:e2e`.

**Visual check.** There is no screenshot-baseline harness — only the two ad-hoc scripts
`.navshot.mjs` and `.p2shot.mjs`, which seed the theme via
`localStorage.setItem('searchify-theme', t)` and capture both themes at 1440px. Phase 1 used a
temporary `app/flatpreview/page.tsx` route to render the primitives (app routes need auth);
that route was deleted after review — recreate it the same way if needed, and note that Next
treats `_`-prefixed folders as private so they 404.

Promoting these into a real Playwright `toHaveScreenshot` suite remains the highest-leverage prep
step and was **not** done in Phase 1.

**Manual, per phase:**
- Phase 2 — walk all 10 marketing routes plus `/login` and `/register`. Confirm the tinted band
  rhythm reads, that `product-window` matches real app chrome, and that **nothing responds to
  `data-theme`**.
- Phase 3 — grep the built output for every removed term (`self-host`, `open source`,
  `Docker Compose`, `forever`, `Perplexity`, `Grok`, `Copilot`, `scheduled audits`,
  `TODO(user)`, `searchify.example`) and confirm zero hits outside legitimate AI-referral-source
  context.

## Sequencing

Phase 2 and Phase 3 both touch marketing components. Landing Phase 2 first avoids rewriting copy
into components that are about to be restructured. Phase 3 can proceed independently if the
content work is more urgent than the restyle.
