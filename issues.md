



# Changes summary
- Auth + marketing UI refresh: new auth layout background, login/register card UI, updated auth brand panel, marketing theme/motion updates, landing page section reshuffle, footer/nav tweaks.
- Design system token change: app “brand” accent moved from ADS blue to slate (`#27455c`) in `ds-tokens.css`, with corresponding updates in `globals.test.ts`.
- Marketing “Proof” contract test refactored to resolve live CSS tokens instead of hardcoding hex values.

<QODO_CONFIRM>
{
  "identifier": "all-security",
  "text": "0 Security vulnerabilities",
  "ctaText": "Resolve all",
  "doneCtaText": "✓ All resolved",
  "prompt": "Resolve all security suggestions",
  "type": "resolve_all",
  "suggestionIdentifiers": []
}
</QODO_CONFIRM>

<QODO_CONFIRM>
{
  "identifier": "all-bugs",
  "text": "4 Potential bugs",
  "ctaText": "Resolve all",
  "doneCtaText": "✓ All resolved",
  "prompt": "Resolve all bug suggestions",
  "type": "resolve_all",
  "suggestionIdentifiers": ["bug_001","bug_002","bug_003","bug_004"]
}
</QODO_CONFIRM>

<QODO_SUGGESTION>
{
  "identifier": "bug_001",
  "description": "**Marketing reveal animation likely broken: `mkt-reveal-in` referenced but removed/renamed**\n\n- Description: The CSS still assigns `animation: mkt-reveal-in ...` but the keyframes were renamed to `mkt-reveal-in-left/right` and the new `@keyframes mkt-reveal-in` is no longer present, so default reveals will not animate.\n- PR Git Diff Pointer:\n```diff\ndiff --git a/frontend/app/(marketing)/marketing-motion.css b/frontend/app/(marketing)/marketing-motion.css\n@@\n-@keyframes mkt-reveal-in {\n-  from {\n-    opacity: 0;\n-    transform: translateY(14px);\n-  }\n-}\n+@keyframes mkt-reveal-in-left {\n+  from {\n+    opacity: 0;\n+    transform: translateX(-48px);\n+  }\n+}\n+\n+@keyframes mkt-reveal-in-right {\n+  from {\n+    opacity: 0;\n+    transform: translateX(48px);\n+  }\n+}\n```\n- Evidence: In the same file, the `@supports (animation-timeline: view())` block previously set `animation: mkt-reveal-in ...` for `[data-mkt-reveal]` elements, and the diff does not show a replacement rule that sets `animation-name: mkt-reveal-in-left/right` for the default case.\n- How to Fix: Reintroduce `@keyframes mkt-reveal-in` (the default rise) and ensure the selector sets `animation-name` appropriately for default/left/right variants.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\app\\(marketing)\\marketing-motion.css",
  "severity": "high",
  "prompt": "Fix marketing-motion.css so default reveal animation references an existing keyframes name (restore mkt-reveal-in or update selectors)."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "bug_002",
  "description": "**Reduced-motion comment contradicts code: `filter` pin added but reveal no longer animates filter**\n\n- Description: The reduced-motion pin now clears `filter: none` with a comment claiming “reveal now animates filter too”, but the new reveal keyframes only animate `opacity` and `transform`, so this is either dead code or indicates a missing `filter` animation.\n- PR Git Diff Pointer:\n```diff\ndiff --git a/frontend/app/(marketing)/marketing-motion.css b/frontend/app/(marketing)/marketing-motion.css\n@@\n   [data-mkt-reveal],\n   [data-mkt-reveal] > * {\n     animation: none !important;\n     opacity: 1;\n     transform: none;\n-    /* The reveal now animates filter too, so the pin has to clear it — a\n-       reduced-motion reader must never be left looking at blurred copy. */\n     filter: none;\n   }\n```\n- Evidence: The same diff introduces `@keyframes mkt-reveal-in` / `mkt-reveal-in-left/right` with only `opacity` and `transform` changes and no `filter` property.\n- How to Fix: Either remove the `filter` pin/comment if not needed, or add the intended `filter` animation to the reveal keyframes and ensure it’s consistently reset.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\app\\(marketing)\\marketing-motion.css",
  "severity": "medium",
  "prompt": "Align reduced-motion pin/comment with actual reveal animations (remove filter pin or add filter animation)."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "bug_003",
  "description": "**Auth pages bypass marketing token system, risking inconsistent theming and broken component assumptions**\n\n- Description: `frontend/app/(auth)/layout.tsx` switches from `mkt-root bg-mkt-paper text-mkt-ink` to raw Tailwind slate/indigo classes, but auth pages still render marketing primitives (`Button`, `MktInput`, `MktField`, `Wordmark`) that may assume marketing CSS variables and `.mkt-root` scoping.\n- PR Git Diff Pointer:\n```diff\ndiff --git a/frontend/app/(auth)/layout.tsx b/frontend/app/(auth)/layout.tsx\n@@\n-    <div className=\"mkt-root bg-mkt-paper text-mkt-ink min-h-dvh min-[900px]:grid min-[900px]:grid-cols-12\">\n+    <div className=\"relative min-h-dvh w-full overflow-hidden bg-slate-50 text-slate-900 antialiased selection:bg-indigo-500 selection:text-white min-[900px]:grid min-[900px]:grid-cols-12\">\n```\n- Evidence: `frontend/app/(auth)/login/page.tsx` and `register/page.tsx` still import and use `Button` from `@/components/marketing/primitives/button` and `MktInput/MktField`, so removing `.mkt-root` can change CSS variable availability and styling behavior.\n- How to Fix: Keep `.mkt-root` on the auth layout (even if you override background/text), or ensure marketing primitives do not rely on `.mkt-root`-scoped variables when used under `(auth)`.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\app\\(auth)\\layout.tsx",
  "severity": "high",
  "prompt": "Ensure auth layout still provides required marketing CSS variable scope (restore mkt-root or decouple primitives)."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "bug_004",
  "description": "**App-wide brand token change may break dark-theme expectations and link contrast gates**\n\n- Description: `ds-tokens.css` changes `--ds-background-brand-bold` and `--ds-link` from ADS blue to slate, which can silently degrade contrast/recognition across the app where components assume “brand” equals blue, and the test updates only cover a subset of pairs.\n- PR Git Diff Pointer:\n```diff\ndiff --git a/frontend/app/ds-tokens.css b/frontend/app/ds-tokens.css\n@@\n-  --ds-background-brand-bold: #0c66e4;\n+  --ds-background-brand-bold: #27455c;\n@@\n-  --ds-link: #0c66e4;\n+  --ds-link: #27455c;\n```\n- Evidence: `frontend/app/globals.test.ts` adds new contrast pairs (`['text-link','bg-base']`, `['accent-fg','accent-hover']`) indicating prior gaps; changing brand/link tokens affects many surfaces beyond those explicitly gated.\n- How to Fix: Run/extend contrast gates for all link/button variants across both themes and key surfaces (panel/base/sidebar) and audit any components that hardcode “blue” semantics for brand actions.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\app\\ds-tokens.css",
  "severity": "medium",
  "prompt": "Audit app-wide impact of changing ds brand/link tokens to slate; extend contrast tests and verify component semantics."
}
</QODO_SUGGESTION>

<QODO_CONFIRM>
{
  "identifier": "all-quality",
  "text": "3 Code quality issues",
  "ctaText": "Resolve all",
  "doneCtaText": "✓ All resolved",
  "prompt": "Resolve all quality suggestions",
  "type": "resolve_all",
  "suggestionIdentifiers": ["qual_001","qual_002","qual_003"]
}
</QODO_CONFIRM>

<QODO_SUGGESTION>
{
  "identifier": "qual_001",
  "description": "**Marketing Proof gate now depends on `@theme {}` parsing; brittle if CSS structure changes**\n\n- Description: The test now parses marketing tokens via `extractBlock(marketingCss, /@theme\\s*\\{/))`, so any refactor that moves variables out of `@theme` (or changes formatting) will fail tests even if tokens still exist.\n- PR Git Diff Pointer:\n```diff\ndiff --git a/frontend/app/globals.test.ts b/frontend/app/globals.test.ts\n@@\n-const PROOF_PAPER = '#F5F5F0';\n+/** Live token map for the marketing theme — values are read, never asserted. */\n+const mktTokens = parseDeclarations(extractBlock(marketingCss, /@theme\\s*\\{/));\n```\n- Evidence: `mktColor()` throws if `resolveColor` can’t resolve `--color-mkt-*`, so a harmless CSS re-org (e.g., moving vars to `:root` or another layer) becomes a hard failure.\n- How to Fix: Make token extraction resilient (search for `--color-mkt-` declarations across the file or support multiple blocks) and add a clearer failure message pointing to expected structure.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\app\\globals.test.ts",
  "severity": "medium",
  "prompt": "Harden globals.test.ts marketing token extraction so it doesn't depend on a single @theme block."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "qual_002",
  "description": "**Auth brand panel uses animated ping/pulse without reduced-motion guard**\n\n- Description: The auth brand panel introduces `animate-ping` and `animate-pulse` indicators, which can violate reduced-motion expectations since they are not gated by `prefers-reduced-motion` like the marketing motion system.\n- PR Git Diff Pointer:\n```diff\ndiff --git a/frontend/components/auth/brand-panel.tsx b/frontend/components/auth/brand-panel.tsx\n@@\n+              <span className=\"absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-75\"></span>\n@@\n+          <span className=\"size-1.5 animate-pulse rounded-full bg-emerald-500\" />\n```\n- Evidence: Marketing motion has explicit reduced-motion handling in `frontend/app/(marketing)/marketing-motion.css`, but these Tailwind animations are outside that system and will continue animating.\n- How to Fix: Add `motion-reduce:animate-none` (or equivalent CSS) to these elements so reduced-motion users get a static indicator.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\auth\\brand-panel.tsx",
  "severity": "low",
  "prompt": "Add reduced-motion guards to auth brand panel ping/pulse animations."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "qual_003",
  "description": "**Inconsistent typography token usage: app shell/page header now use marketing font classes**\n\n- Description: `AppShell` and `PageHeader` introduce `font-mkt-display` and marketing-like tracking/weight in core app chrome, which blurs the separation between app DS tokens and marketing tokens and can complicate future theming.\n- PR Git Diff Pointer:\n```diff\ndiff --git a/frontend/components/layout/app-shell.tsx b/frontend/components/layout/app-shell.tsx\n@@\n-            <span className=\"text-foreground text-heading-sm\">Searchify</span>\n+            <span className=\"font-mkt-display text-foreground text-heading-sm font-bold tracking-tight\">\n+              Searchify\n+            </span>\n\ndiff --git a/frontend/components/layout/page-header.tsx b/frontend/components/layout/page-header.tsx\n@@\n-        <h1 className=\"text-foreground min-w-0 flex-1 text-xl [overflow-wrap:break-word]\">\n+        <h1 className=\"font-mkt-display text-foreground min-w-0 flex-1 text-2xl font-bold tracking-tight [overflow-wrap:break-word]\">\n```\n- Evidence: Marketing theme defines its own typography ladder in `frontend/app/(marketing)/marketing-theme.css`, while app headings typically use `text-heading-*` tokens; mixing them increases coupling and risk of regressions when marketing typography changes.\n- How to Fix: Use app DS typography tokens for app chrome (or explicitly promote the chosen font/weights into the app DS layer) and avoid referencing marketing-specific classes in `(app)` components.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\layout\\page-header.tsx",
  "severity": "low",
  "prompt": "Decouple app chrome typography from marketing-specific classes (use app DS tokens or promote shared tokens)."
}
  




- PR focuses on tightening “config zero-tolerance” docs and refactoring/cleanup across the frontend marketing + onboarding UI (motion provider, JSON-LD helpers, keying lists, reducer state, etc.).
- Overall: a few correctness/reliability risks were introduced (notably JSON-LD script `id` collisions, unstable keys via `JSON.stringify`, and `crypto.randomUUID()` usage), plus some likely build breaks due to removed exports/files that may still be imported elsewhere (diff is truncated, so this is especially important to verify).

<QODO_CONFIRM>
{
  "identifier": "all-security",
  "text": "1 Security vulnerability",
  "ctaText": "Resolve all",
  "doneCtaText": "✓ All resolved",
  "prompt": "Resolve all security suggestions",
  "type": "resolve_all",
  "suggestionIdentifiers": ["sec_001"]
}
</QODO_CONFIRM>

<QODO_SUGGESTION>
{
  "identifier": "sec_001",
  "description": "**JSON-LD script injection hardening may be incomplete if `serializeJsonLd` is not consistently used everywhere**\n\n- Description: `JsonLd` now uses `serializeJsonLd(data)` (good), but the PR also moved JSON-LD builders out of this component file; any remaining JSON-LD `<script dangerouslySetInnerHTML={{__html: JSON.stringify(...)}}>` usages elsewhere would reintroduce the `</script>`-breakout risk.\n- PR Git Diff Pointer:\n```diff\n--- a/frontend/components/marketing/seo/json-ld.tsx\n+++ b/frontend/components/marketing/seo/json-ld.tsx\n@@\n-export function JsonLd({ data }: Readonly<{ data: JsonLdObject }>) {\n+export function JsonLd({ data, id }: Readonly<{ data: JsonLdObject; id?: string }>) {\n   return (\n-    <script type=\"application/ld+json\" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />\n+    <script\n+      id={id ?? 'json-ld'}\n+      type=\"application/ld+json\"\n+      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}\n+    />\n   );\n }\n```\n- Evidence: `frontend/lib/seo/json-ld.ts` defines `serializeJsonLd` specifically to prevent a JSON value from terminating its containing script element (`replace(/</g, '\\\\u003c')`), implying other call sites must also use it to be safe.\n- How to Fix: Grep for `application/ld+json` and ensure every JSON-LD script uses `serializeJsonLd` (or the shared `JsonLd` component) rather than raw `JSON.stringify`.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\marketing\\seo\\json-ld.tsx",
  "severity": "medium",
  "prompt": "Search for all JSON-LD script tags and ensure they use serializeJsonLd / shared JsonLd component everywhere."
}
</QODO_SUGGESTION>

<QODO_CONFIRM>
{
  "identifier": "all-bugs",
  "text": "4 Potential bugs",
  "ctaText": "Resolve all",
  "doneCtaText": "✓ All resolved",
  "prompt": "Resolve all bug suggestions",
  "type": "resolve_all",
  "suggestionIdentifiers": ["bug_001", "bug_002", "bug_003", "bug_004"]
}
</QODO_CONFIRM>

<QODO_SUGGESTION>
{
  "identifier": "bug_001",
  "description": "**Duplicate DOM ids for JSON-LD scripts (`id=\"json-ld\"`) can break hydration/tests and violate HTML uniqueness**\n\n- Description: `JsonLd` now assigns a default `id` of `json-ld`, so rendering multiple JSON-LD blocks on the same page will create duplicate IDs and can cause flaky selectors or unexpected behavior.\n- PR Git Diff Pointer:\n```diff\n--- a/frontend/components/marketing/seo/json-ld.tsx\n+++ b/frontend/components/marketing/seo/json-ld.tsx\n@@\n-export function JsonLd({ data }: Readonly<{ data: JsonLdObject }>) {\n+export function JsonLd({ data, id }: Readonly<{ data: JsonLdObject; id?: string }>) {\n   return (\n     <script\n-      id={id ?? 'json-ld'}\n+      id={id ?? 'json-ld'}\n       type=\"application/ld+json\"\n       dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}\n     />\n   );\n }\n```\n- Evidence: Marketing layout and pages can emit organization JSON-LD plus page-specific JSON-LD (e.g., `frontend/app/(marketing)/layout.tsx` renders organization JSON-LD and `frontend/app/(marketing)/faq/page.tsx` renders FAQ JSON-LD), which would produce two `<script id=\"json-ld\">` nodes unless callers pass distinct `id`s.\n- How to Fix: Remove the default `id` entirely or generate a unique default (or require callers to pass an explicit unique `id`).\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\marketing\\seo\\json-ld.tsx",
  "severity": "high",
  "prompt": "Fix JsonLd default id behavior to avoid duplicate DOM ids when multiple JSON-LD scripts are rendered."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "bug_002",
  "description": "**Unstable React keys from `JSON.stringify(block)` can cause remounts and state loss**\n\n- Description: Using `JSON.stringify(block)` as a key can change if property order differs or if non-serializable fields appear later, causing React to remount blocks and potentially lose internal state or break animations.\n- PR Git Diff Pointer:\n```diff\n--- a/frontend/components/marketing/pages/blog.tsx\n+++ b/frontend/components/marketing/pages/blog.tsx\n@@\n-          {post.body.map((block, index) => (\n-            <PostBlock key={index} block={block} />\n-          ))}\n+          {withOccurrenceKeys(post.body, (block) => JSON.stringify(block)).map(({ key, value }) => (\n+            <PostBlock key={key} block={value} />\n+          ))}\n```\n- Evidence: `withOccurrenceKeys` explicitly tries to avoid duplicate keys by appending an occurrence counter, but it still relies on the stability of the `identity` string; `JSON.stringify` is not a stable identifier across transformations.\n- How to Fix: Prefer a stable `id` field on `BlogBlock` (or derive a stable hash from canonicalized content) rather than `JSON.stringify`.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\marketing\\pages\\blog.tsx",
  "severity": "medium",
  "prompt": "Replace JSON.stringify-based keys for blog blocks with stable ids/hashes."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "bug_003",
  "description": "**`crypto.randomUUID()` in onboarding can crash in environments without Web Crypto (older browsers / some test runners)**\n\n- Description: Adding competitors now uses `crypto.randomUUID()` directly; if `crypto` or `randomUUID` is unavailable, clicking “add competitor” will throw and break onboarding.\n- PR Git Diff Pointer:\n```diff\n--- a/frontend/components/onboarding/onboarding-screen.tsx\n+++ b/frontend/components/onboarding/onboarding-screen.tsx\n@@\n                 onAddCompetitor={() =>\n                   setCompetitors((prev) => [\n                     ...prev,\n                     {\n-                      id: `competitor:manual:${crypto.randomUUID()}`,\n+                      id: `competitor:manual:${crypto.randomUUID()}`,\n                       name: '',\n                       domains: [],\n                       selected: true,\n                     },\n                   ])\n                 }\n```\n- Evidence: This code runs in a client component (`OnboardingScreen` is a UI wizard) and is invoked by user interaction; there is no fallback path if `crypto.randomUUID` is missing.\n- How to Fix: Use a safe fallback (e.g., `globalThis.crypto?.randomUUID?.() ?? someDeterministicId()`) or a small UUID library already used in the repo.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\onboarding\\onboarding-screen.tsx",
  "severity": "medium",
  "prompt": "Add a safe fallback for crypto.randomUUID() usage in onboarding."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "bug_004",
  "description": "**Potential build break: removed exports/files may still be imported elsewhere (diff is truncated)**\n\n- Description: Several components/functions were deleted or made non-exported (`HeroVisual` file deleted, `ScrollScene` deleted, `VerifiedMark`/`LiveDot` removed, `BrandMark` no longer exported, `isOfficialEngine` removed); any remaining imports will fail TypeScript builds.\n- PR Git Diff Pointer:\n```diff\n--- a/frontend/components/marketing/landing/hero-visual.tsx\n+++ /dev/null\n@@\n-export function HeroVisual() {\n-  ...\n-}\n```\n```diff\n--- a/frontend/components/marketing/primitives/badge.tsx\n+++ b/frontend/components/marketing/primitives/badge.tsx\n@@\n-export function VerifiedMark({ children = 'Verified' }: Readonly<{ children?: ReactNode }>) {\n-  ...\n-}\n```\n```diff\n--- a/frontend/components/marketing/primitives/wordmark.tsx\n+++ b/frontend/components/marketing/primitives/wordmark.tsx\n@@\n-export function BrandMark({ className }: Readonly<{ className?: string }>) {\n+function BrandMark({ className }: Readonly<{ className?: string }>) {\n```\n- Evidence: The diff shows deletions/visibility changes but does not show corresponding updates across the whole repo (and the PR diff is explicitly truncated), so unresolved imports are a realistic risk.\n- How to Fix: Run a repo-wide TypeScript build and grep for imports of the removed symbols/files, then either update imports or re-export compatibility shims.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\marketing\\landing\\hero-visual.tsx",
  "severity": "high",
  "prompt": "Check for and fix any remaining imports of deleted/removed exports (HeroVisual, ScrollScene, VerifiedMark, LiveDot, BrandMark export, isOfficialEngine)."
}
</QODO_SUGGESTION>

<QODO_CONFIRM>
{
  "identifier": "all-quality",
  "text": "2 Code quality issues",
  "ctaText": "Resolve all",
  "doneCtaText": "✓ All resolved",
  "prompt": "Resolve all code quality suggestions",
  "type": "resolve_all",
  "suggestionIdentifiers": ["qual_001", "qual_002"]
}
</QODO_CONFIRM>

<QODO_SUGGESTION>
{
  "identifier": "qual_001",
  "description": "**`react-doctor-disable-next-line` comments risk becoming permanent lint debt without scoped justification**\n\n- Description: Multiple new `react-doctor-disable-next-line` suppressions were added; without a consistent policy (ticket link / expiry / rationale), these tend to accumulate and hide real regressions.\n- PR Git Diff Pointer:\n```diff\n--- a/frontend/components/layout/onboarding-gate.tsx\n+++ b/frontend/components/layout/onboarding-gate.tsx\n@@\n     if (needsOnboarding) {\n       // Project availability is client-fetched; the skeleton prevents a page flash.\n       // react-doctor-disable-next-line\n       router.replace('/onboarding');\n     }\n```\n- Evidence: Similar suppressions appear in multiple files in this diff (`BrandProfilePanel`, `MarketingNav`, `UserMenu`, `OnboardingScreen`, `ProductWindow`), indicating a pattern rather than a one-off.\n- How to Fix: Replace generic disables with rule-specific disables (as done once in `MarketingNav`) and add a short, consistent rationale format (and ideally a tracking reference).\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\layout\\onboarding-gate.tsx",
  "severity": "low",
  "prompt": "Standardize react-doctor disable comments to be rule-specific and include consistent rationale/tracking."
}
</QODO_SUGGESTION>

<QODO_SUGGESTION>
{
  "identifier": "qual_002",
  "description": "**Direct DOM mutation in `AnimatedNumber` bypasses React rendering and can desync on rerenders**\n\n- Description: `AnimatedNumber` now writes `ref.current.textContent` in GSAP callbacks; if React rerenders the component (e.g., parent rerender with same `value`), React may overwrite the DOM text unexpectedly or cause hard-to-debug inconsistencies.\n- PR Git Diff Pointer:\n```diff\n--- a/frontend/components/marketing/scenes/product-window.tsx\n+++ b/frontend/components/marketing/scenes/product-window.tsx\n@@\n-  const [displayValue, setDisplayValue] = useState(value);\n   const ref = useRef<HTMLSpanElement>(null);\n@@\n-        setDisplayValue(Math.floor(obj.val).toString());\n+        ref.current.textContent = Math.floor(obj.val).toString();\n@@\n-  return <span ref={ref}>{displayValue}</span>;\n+  return <span ref={ref}>{value}</span>;\n```\n- Evidence: The component still renders `{value}` as children, so React has an opinion about the text node while GSAP also mutates it; this is a classic source of UI tearing when rerenders occur.\n- How to Fix: Keep the animated value in React state (or render an empty span and let GSAP fully own it) so there is a single source of truth.\n",
  "filePath": "c:\\Projects\\Searchify\\frontend\\components\\marketing\\scenes\\product-window.tsx",
  "severity": "medium",
  "prompt": "Refactor AnimatedNumber to avoid mixing React-rendered text with imperative textContent mutations."
}
</QODO_SUGGESTION>

Fix the following issues. The issues can be from different files or can overlap on same lines in one file.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/landing/hero-entrance.tsx around lines 36 - 43, Update the hero entrance component’s m.div animation configuration to use a client-only initial hidden/offset state so the configured opacity, y, duration, and EASE_OUT transition actually run after isClient mounts, while preserving hydration-safe server rendering.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/primitives/tour-stepper.tsx around lines 38 - 68, Replace the tablist and tab semantics in the step selector rendered by the steps.map loop with ordinary button semantics, removing the role="tablist" and role="tab" attributes while preserving aria-selected only if replaced with an appropriate button state attribute. Keep onSelectStep, active styling, and visual behavior unchanged.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/app/(marketing)/faq/page.test.tsx around lines 130 - 131, Remove the duplicate mainEntity declaration in the FAQ test, keeping the existing block-scoped const and its TOTAL_ITEMS length assertion intact.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/knowledge-base/brand-profile-panel.tsx around lines 197 - 314, Prevent pending save or apply mutations from overwriting newer field edits in the brand profile form. Update the field controls in the draft-editing grid and the relevant mutation success/state-reset logic so editing is disabled while saveMutation or acceptMutation is pending, or ensure post-submit edits are preserved when applying the response; keep the existing success behavior for unchanged drafts.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/seo/json-ld.tsx around lines 14 - 19, Update the JsonLd component’s script attributes so the id attribute is omitted when the id prop is undefined, rather than defaulting to the shared "json-ld" value; preserve caller-provided IDs and keep serializeJsonLd(data) unchanged.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/products/product-visibility-panel.tsx around lines 327 - 356, Keep the fallback identifier from rowKey out of product links in RankingTableRow: only render the /products/${id} Link when an own row has a real product_id. When product_id is absent, render the existing plain product-name span while preserving fallback keys for row identity.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/site-health/url-detail.tsx around lines 92 - 103, Bound the pre-active polling path in the query configuration: add a counter with RERUN_MAX_PRE_ACTIVE_POLLS (10) and stop returning RERUN_POLL_INTERVAL_MS once that limit is reached when no pending/running snapshot has been observed. Reset this counter together with hasObservedActiveRerunRef in onRerunComplete, while preserving continued polling for observed active reruns.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/tour/product-tour-provider.test.tsx around lines 179 - 190, Unmount the provider created by renderTour() before rendering the second ProductTourProvider in this test. Capture the first render result and call its unmount method before the second render, ensuring document.querySelector and driverCalls only observe the second provider instance.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/tour/product-tour-provider.tsx around lines 85 - 102, Add an onError handler to the useMutation in the product-tour provider so failed persist calls reset transitioning.current and renderedStep.current, allowing the tour to recover and reopen on the next effect run. Keep the existing onSuccess behavior unchanged and ensure the failure is surfaced through the provider’s established error signaling mechanism.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/ui/trend-chart.tsx around lines 204 - 221, Restore the export on the MultiTrendChart function declaration so existing external imports from the trend-chart module continue to compile. Do not change its props or rendering behavior.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/lib/onboarding/create-project.ts around lines 67 - 88, The createTopics implementation now issues all topic requests concurrently, conflicting with the sequential rate-limit protection used by prompt creation. Update createTopics to create distinct topics sequentially while preserving lowercase name-to-ID mapping and intentionally swallowed failures; do not use Promise.all for topic creation.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/lib/products/use-products-screen.ts at line 167, Replace the bare react-doctor-disable-next-line directive immediately before useMutation with a rule-specific directive naming the intended react-doctor rule, and include a concise justification consistent with the qualified directive used in create-project.ts.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/lib/setup/forms.ts at line 96, Remove the duplicate toEntries const declaration in forms.ts, retaining only one definition of the helper so TypeScript no longer reports a block-scoped redeclaration error.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @Review.md around lines 9 - 15, Revise the configuration invariant in Review.md to distinguish externally tunable operational settings from fixed validation rules. Exclude legitimate static form validation bounds and defaults, including those in frontend/lib/setup/forms.ts, from the blanket prohibition on inline numeric values while preserving the requirement that tunable settings remain centralized in configuration.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @issues.md around lines 44 - 52, Do not treat the defensive filter reset in the reduced-motion reveal rule as a bug based solely on the keyframes diff; provide a concrete failing reproduction or test demonstrating incorrect behavior before changing it. If no failure can be demonstrated, downgrade the finding to a quality note and leave the existing filter reset intact.