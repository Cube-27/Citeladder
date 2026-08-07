
(searchify-backend) PS C:\Projects\Citeladder\frontend> pnpm eslint . --fix         

C:\Projects\Citeladder\frontend\components\marketing\landing\final-cta.tsx
  7:10  warning  'Eyebrow' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars

C:\Projects\Citeladder\frontend\components\marketing\landing\hero.tsx
  7:10  warning  'Eyebrow' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars

C:\Projects\Citeladder\frontend\components\marketing\landing\platform.tsx
  3:3  warning  'BrainCircuit' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars

✖ 3 problems (0 errors, 3 warnings)

(searchify-backend) PS C:\Projects\Citeladder\frontend> 

Fix the following issues. The issues can be from different files or can overlap on same lines in one file.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @docs/design.md at line 89, Update the radius contract in docs/design.md to reflect the actual globals.css token scale, including the 20px --radius-2xl value, and revise the obsolete scale requirement at the later radius checklist. Ensure both documented references consistently describe one unified radius scale.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/app/globals.css around lines 392 - 463, Remove the .marketing-atmosphere styles, including its pseudo-elements, radial gradients, animation keyframes, and reduced-motion override, so the marketing surface complies with the design contract. Do not retain the aura through alternate selectors or colors; only revise docs/design.md instead if this treatment is intentionally becoming part of the canonical contract.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/app/globals.css around lines 200 - 201, Resolve the mismatch between the --text-2xl token in globals.css and the text-2xl specification in docs/design.md by updating one authoritative definition so both specify 28px. Keep the --text-3xl token unchanged and ensure components use the aligned section-heading size.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/app/globals.css around lines 550 - 555, Update the flip-card styles around .flip-card-inner to honor prefers-reduced-motion: reduce by disabling the transform transition and presenting the flipped state without animated rotation. Preserve the existing animated 3D behavior for users who have not requested reduced motion.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/app/globals.css around lines 240 - 243, Update the --focus-ring design token to use an opaque, sufficiently contrasting outer outline instead of the current 82%-transparent accent shadow, and validate that the resulting indicator meets 3:1 non-text contrast across all surface roles. Leave the adjacent skeleton and placeholder tokens unchanged.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/app/layout.tsx around lines 2 - 18, Align the font setup with the canonical Public Sans contract by removing the Manrope import and `manrope` configuration from the layout, then remove its `font-manrope` display binding in the related global styling. Ensure all display, UI, body, and data consumers continue using Public Sans and no `font-manrope` references remain.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/landing/hero.tsx around lines 26 - 29, Extract the duplicated kicker badge markup into a shared KickerBadge component and the CTA button pair into a shared CtaPair component under ../primitives/. Update both hero.tsx and final-cta.tsx to import and render these primitives, preserving the existing eyebrow content, links, labels, behavior, and class strings.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/landing/hero.tsx around lines 33 - 35, Update the gradient classes on the em element rendering hook.titleAccent to replace the raw to-blue-600 stop with the appropriate theme token defined in globals.css, preserving the existing gradient behavior while allowing dark-mode token swaps. Remove the semantic em markup if the gradient requires non-emphasis markup, and retain the existing styling classes.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/landing/platform.tsx around lines 92 - 93, Update the pipeline diagram container and the animate-pulse elements near the relevant platform component sections to respect prefers-reduced-motion: use motion-safe variants or the existing useReducedMotion pattern to disable continuous SMIL and pulse animations for reduced-motion users while preserving normal animation behavior otherwise.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/landing/platform.tsx around lines 255 - 401, Replace the duplicated intelligence-card markup within the landing component with a card descriptor array and a map over it, following the existing data-driven pattern used by packs.tsx and shift.tsx. Store each card’s icon, number/label, name, description, checklist strings, and footer text in the descriptors, then render one shared StaggerItem/article structure and map the checklist items to shared list markup while preserving the current styling and content.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/landing/platform.tsx around lines 126 - 240, Update every delayed animateMotion in the three streams identified by path-site-pipe, path-content-pipe, and path-demand-pipe to use negative begin offsets, preserving the existing half-second spacing and animation durations so each dot is already positioned on its path at initial render.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/landing/shift.tsx at line 8, Update the shift content entries and rendering logic to attach each icon directly to its fact, following the icon-key pattern used by packs.tsx and trust.tsx with LANDING_ICONS. Remove the positional SHIFT_ICONS array and modulo-based lookup, and resolve the icon from each entry’s own icon key so reordering or adding facts cannot mispair icons.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/primitives/section.tsx at line 162, Remove the redundant conditional justify-center class from the Eyebrow in the eyebrow rendering within the section component, leaving the parent Reveal alignment and existing Eyebrow content unchanged.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/primitives/gsap-reveal-initializer.tsx around lines 15 - 19, Update the useGSAP call in the GSAP reveal initializer to include reduceMotion in its dependency configuration, so the callback reruns when the media-query preference resolves or changes and cleans up prior animations. Preserve the existing reduceMotion and window guards, applying the same dependency update to the related useGSAP block identified by the comment.

- Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @frontend/components/marketing/primitives/gsap-reveal-initializer.tsx at line 22, Update the useGSAP configuration and direct querySelectorAll calls in the reveal initializer so the scope option is not misleading: remove the unused scope element and scope option, or explicitly document that the document-wide queries are intentional. Apply the same correction to both queries and preserve useGSAP’s existing animation cleanup behavior.