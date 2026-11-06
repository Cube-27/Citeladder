# CiteLadder Design System

> The repo's owner of the visual system: where the system lives, which files
> carry it, and the token contract the policy check enforces. The system
> itself is the artifact below; this file does not restate it.

The CiteLadder Design System artifact is the reference for every surface — the
website, docs, sign-in, onboarding and the app:
<https://claude.ai/artifact/G73m4PDH6bowXxNpPFMcLU> (private to the owner;
read it with the Artifact tool, `action: "read"`, `path` for one file). It
holds the brand book (`project/README.md`), every token in both themes
(`project/tokens.json`), and each component's CSS, React, contract and states
(`project/components/`). Where the repo and the artifact disagree, the
artifact is right; where a page needs something the artifact lacks, add it to
the system first (one component, both themes), then use it. The rollout onto
the system is [plans/design-system-rollout.md](plans/design-system-rollout.md).

Visual work never changes factual copy, data, feature claims, scripted preview
content, transactions or confirmation gates without approval. Tests verify
ownership, accessibility and product behaviour, not classes or pixels as a
second visual authority.

## The system in one paragraph

Monochrome with one accent. Ink (`#111111`, `#f4f4f4` in dark) carries every
primary action, heading and figure; Flare (`#e8501a`, `#ff6a33` in dark) is a
mark only: the logo's bars, the own-brand chart series, a 2px rung, a dot, a
link's ink as `accent-ink`. Cal Sans sets display type at its one weight, 400:
on the website the H1 and one heading per section (D28), in the docs its
headings, and in the app the page title. Geist sets everything else; Geist Mono sets data
and code. Fields, composers and cards wear a soft edge, never a dark hairline.
Light and dark on every surface, defaulting to the system preference.

## Decisions

| | Decision (owner, 5 November 2026) |
| --- | --- |
| D1 | Cal Sans, Geist and Geist Mono replace the previous faces. They are self-hosted from the private `Cube-27/cube27-fonts` repo through `pnpm fonts:pull`, never committed and never fetched from the web. |
| D2 | One theme store for the app, website and docs (`frontend/lib/theme/theme.ts`): light, dark or system, persisted in the `citeladder_theme` cookie on the parent domain so one choice follows the reader across subdomains. System is the default. |
| D3 | The logo drawing (`packages/contracts/src/brand-logo.ts`) is unchanged; its accent is Flare everywhere: the inline mark, `public/citeladder-logo.svg`, the favicon, the social card and the billing PDFs. |
| D4 | PDFs keep Inter as their text face; only their colours follow the system. |
| D5 | Borders are soft grey, never a dark hairline. Fields (Input, SearchField, Select, Textarea, ChipInput, the Agent composer, the docs search trigger) and checkbox and radio boxes wear a 1px `line` edge with the faint `shadow-edge` smudge under it (`FIELD_EDGE` in `components/ui/input.tsx`); hover steps the edge to `line-strong`, focus turns it `focus` with a 3px `line` halo, and an invalid field turns it `negative`. Reserved slots (the dashed create tile, Turnstile) take a dashed `line-strong` edge, and linked website cards step to `line-strong` on hover. `line-control` survives only for marks that are not borders: the switch's off track, the ink link underline, the pending step ring, chart rules, crosshairs and event markers, the neutral data swatch and a not-cited engine mark. |
| D6 | Geist is never set above 500 on any surface, the website included: the `heading` token, the title, item-title, figure and heading roles, Markdown `strong`, the docs' and the website's own styles are all 500, and the Geist and Geist Mono faces load only 400–500 (`lib/config/brand-fonts.json`). |
| D7 | In the app Cal Sans is the PageHeader title's (`type-page-title`) alone. Stat and score figures are `stat` (Geist 500 28/36 since D15), ScoreRing and donut centres Geist 500 32/38 (`type-figure-ring`), dialog and drawer titles `heading-lg` (Geist 500 22/28), and card titles and the sign-in shell's title Geist 500. The docs keep their display use; the website's is D28. |
| D8 | A score card shows its number in `stat` with a bare 48px `ScoreRing` (auto tone, no centre number) centred on its right; the 96px ring with its number is for a page's headline score. A table cell shows the number only. `ScoreBar` (the segmented score bar) is deleted from `components/ui` with its tests and exports, and `check:policy` rejects its name. |
| D9 | Metric cards sit in one row from the `desktop:` breakpoint: `AppGrid` quarters are 4 across at 982px, fifths 5, a pair 2; never 2 × 2 and never 2 + 1. |
| D10 | Corners are only slightly rounded on every surface: `radius-2xs` and `radius-xs` 2, `radius-sm` 4, `radius-md` 6, `radius-lg` and `radius-xl` 8. `radius-full` is for avatars, status dots, switch tracks and count pills only; a chip, citation pill, meter or progress track is a small radius. No corner anywhere is rounder than 8px. |
| D11 | The app is compact and technical (GitHub, Claude Code), not airy. Controls are `control-md` 32 on every surface (28 compact). The app's document (the one without `data-public-surface`) rebinds its spacing: table and fact rows `row-app` (40), card and dialog padding 16, header → controls 16, card gaps 12, gutter 24 (16 in the rail). The PageHeader title is `display-sm` (24/32) with its actions centred on its row (its band is D12's top bar). The sidebar has no logo; it shares the page's lines: the mode switch and palette field are level with the tabs and filter rows (`page-band-gap`, 8, apart). The docs and website keep their spacing. |
| D12 | The app's top bar is sticky and has no blank gap: the sidebar's project switcher cell and the PageHeader are one 56px bar (`page-header-band`: the `row-app` title row with 8 above and below) at the top of the window, ruled underneath with a 1px `line` that runs from the sidebar to the main column's far edge. Content scrolls under it; `sticky-header-offset` is its height, so sticky panes and in-page anchors land below it. The geometry census holds both halves of the bar on one bottom line. |
| D13 | A `TextLink` set at a type role stands in a list, table, row or card and is underlined only on hover and keyboard focus; one inside a sentence (`text="inherit"`) keeps its resting underline. A link in a list or table cell therefore takes its text's role, never `inherit`. |
| D14 | A ranked action row (`ReorderList`) is its position, its title and priority badge (D42), and its move controls; it has no score figure, since the badge carries the priority. The title truncates (its full text in a tooltip) so the badge stays on its line. |
| D15 | A metric's number (`stat`) is 28/36, Geist 500; metric cards stay in one row (D9). `check:policy` holds the size. |
| D16 | A tab, segment or filter chip shows its count after the label in Geist at the control's size, `ink-muted`, in brackets (`ControlCount`): "All signals (107)". Never mono. |
| D17 | A card that is itself a control (the Agent's workflow cards) keeps the plain card's one fill; hover underlines its title instead of tinting it. Card titles in a grid of cards (workflows, skills) are `heading` (16/24, 500), under a `sectionTitle` section heading. |
| D26 | Website type (sizes superseded by D30, D34 and D36: article titles now take the section size, and D36 fixes the website's eight sizes): the marketing H1 (`--text-site-title`, every hero and article title) is 48/52 from 768px up, the owner's 982px desktop included, and 32/38 on phones, replacing D23's 42. Running text, blog and article prose included, is `body` 16/26; a lead or subheading under a heading is `body-lg` 18/30, never the 20px `lead`. Cal Sans is never tracked on the website or docs: display headings set no `letter-spacing`; Geist Mono eyebrows keep theirs. The app's tokens are unchanged. |
| D27 | No inverted cards or bands on the website: every tile, PageHighlight included, is the flat card (surface fill, 1px `line` edge, ink text) in both themes; only ink-filled buttons stay ink. Nav popups for multi-column menus (Platform, Resources) start at the navbar's left edge; one-column Solutions still hangs from the trigger row (owner, 5 November 2026; supersedes D22's anchor for those two). |
| D28 | Cal Sans is for headings only on the website: the H1 and one section heading per section; card titles, figures and every other text are Geist (owner, 5 November 2026). Card, step, form and tool titles and article h3 are `heading-lg` (Geist 500 22/28); FAQ questions, plan names and the author's name keep `title-sm`'s size in Geist 500; stacked split titles, large tiles and the PageHighlight title keep `display-md`'s size in Geist 500; figures and prices are Geist 500; article quotes are Geist. Product screens set no Cal Sans: frame captions, screen figures and the drawn app's page title are Geist 500. A feature split that is its section's only heading keeps Cal Sans. `check:policy` rejects `--font-display` in a website stylesheet outside the heading selectors. |
| D29 | The website's ground is the other way round (owner, 5 November 2026): the page sits on `paper` (grey in light, black in dark) and every card, the CtaBand included, on `surface` (white in light, lighter in dark) with its 1px `line` edge and `shadow-card`. A product frame's well has no fill, so a screen never sits on a second, darker ground inside its card, and FeatureCards carry no step numbers. The footer is dark in both themes on its own fixed tokens (`footer`, `footer-ink`, `footer-ink-muted`, `footer-line`) with a fine film grain, and the page above it ends on a curved foot (40px, 24px under 1024px), past D10's 8px. The primary button is a raised key: `shadow-press` is a top highlight, a bottom inner shade, a tight drop and a soft lift over a faint light-to-shade sheen, and drops to `shadow-edge` while pressed; it stays ink, never the accent. The docs keep the `surface` ground. Supersedes D27's flat card and the flat-website rule for shadows. |
| D30 | The website H1 (`--text-site-title`) is 60/64 from 768px up, past D26's 48, and a section heading (`--text-site-section`) is 44/50; phones keep 32/38 and 28/34, and the H1 remains the ceiling no website or docs type exceeds (owner, 5 November 2026). The homepage hero reads "Get your business recommended by AI" over the one-sentence lead "CiteLadder helps marketing and SEO teams grow their AI visibility, traffic and revenue." (owner, 6 November 2026; it replaced "CiteLadder gives you the tools to grow your AI visibility, traffic and revenue."), so the lead's engine rotor is retired. |
| D31 | Website cards follow the owner's Cal.com reference (owner, 5 November 2026): a FeatureCard or product frame is a 20px `surface` card with a small 8px inset. Only a card with supporting text (a FeatureCard) gets the grey well: `paper` with its own 1px `line` edge, a 20px radius (14px until D36) and compact padding (12/16, 8/12 on phones), the vignette inside it a white 12px card (10px until D36) with 16px padding, and the copy below 16px under the well, 12px from the card's foot, title and text 4px apart. A frame with no supporting text is one card: no well fill or edge, and the screen sits straight on it. D29's fill-less well therefore holds only for text-less frames; the app keeps its ≤8px radii. |
| D32 | The ThemeSwitch is one ghost IconButton on every surface (owner, 5 November 2026): a visitor starts on the device's theme (`system`, never shown as an option), and a click stores the opposite of the theme on screen, its icon (moon or sun) the theme it turns on. Replaces the three-segment light, dark and system switch and its 28px `control-sm` height. |
| D33 | Only a page's opening (its hero) and its closing CtaBand are centred on the website (owner, 5 November 2026); every section header is left-aligned, a reading-measure list sits at the left under it, and an FAQ is the aside layout: "Frequently asked questions" in the 4/12 column on the left, the questions on the right. Supersedes D18's centred section headers. |
| D34 | Website headings match the owner's Cal.com reference (owner, 5 November 2026): the H1 (`--text-site-title`) is 80/86 and a section heading (`--text-site-section`) 56/60 from 768px up, the owner's 982px desktop included; phones keep 32/38 and 28/34. Every Cal Sans heading on the website is tracked -0.01em, and hero titles run to 1120px (960 left-aligned). The landing announcement is a borderless pill: the white pill with its grey "New" pill inside, both fully round, no edge or ring. `check:policy` no longer bans styles: the type ceiling, the Cal Sans weight, size and placement rules, the accent-as-mark rule, the review rules D5–D28, the heading full-stop rule and the retired-identifier list are deleted; it keeps the token plumbing (token contract, no raw colours outside `globals.css`, the 4px grid, motion and shadow tokens), WCAG contrast and the app's component layering. Supersedes D30's sizes and ceiling and D26's untracked Cal Sans. D36 keeps 80 for landing and product heroes only and moves article, blog and guide titles and the CtaBand title to the 56 section size. |
| D35 | The website gets depth from its pictures, never its type or controls, which stay black and white (owner, 5 November 2026, from the Cal.com, Semrush, Profound and Linear references: fade-in and wash, subtle colours, grain gradients, product animation, layers and frosted glass). Four soft tints (`stage-sky`, `stage-mint`, `stage-lilac`, `stage-peach`) over `paper` with a soft-light film grain make a stage: a product image sits on one (48px in, 16 on phones, 24px radius) inside a translucent frosted rim that blurs the grain, on its own white card with `shadow-pop`; a FeatureCard's well and the CtaBand are stages, and neighbouring bento tiles and reversed splits take different mixes. Each hero has a tinted, grained glow that fades into the page, and a full app screen fades out at its foot. Motion as amended by D36: nothing enters on scroll and no part or product image ever starts hidden (the scroll entrances, the play-out of rows, bars and charts and `site-motion.js` are deleted); only the landing heroes' copy loads in, a chart's latest point pings, and linked cards lift 4px on hover. Reduced motion leaves the page static and fully visible, and nothing depends on a script. Supersedes D29's white frame card and D31's grey well. |
| D36 | Website type, reading and controls (owner, 6 November 2026, from the accessibility and UI audit). **Type scale, a priority rule never to be violated:** the website uses exactly eight sizes, 12 · 14 · 16 · 18 · 22 · 28 · 56 · 80 (phones keep their smaller H1 and section sizes, 32 and 28). A website page should normally use no more than three of them, except detail pages such as docs or pricing, because every extra size makes it harder for a person to focus. Product images use 12 and 14 only (no 11 or 13), the 24px drawn page title is 22, and the closing CtaBand title is the 56 section size. Nothing on the website is below 12px; 12px text has at least 1.4 leading (12/20) and 18px text is 18/28. `.cl-site` in `site.css` re-points the product roles the website reuses (eyebrow, data, code, caption leading, the drawn page title, `title-sm`, `display-lg`, `lead`, `site-feature`) onto this scale, so the app's tokens are unchanged. **Eyebrows:** a marketing heading carries no eyebrow when it already says what the section is (pillar stages, solution segments, the 404 page and the section, split, highlight, hero and CtaBand eyebrow slots are gone); one stays only where it adds what the heading lacks (an Enterprise card's unit, a related post's topic, a nav group's name, a figure's label). Geist Mono is for short labels, numbers, URLs and code; every sentence (the hero trial note, a CtaBand note, an integration description, a plan or step note) is Geist. **Reading:** article prose holds to 65ch (about 600px at 16px) inside the 720 column, where tables and figures stay; article, blog, guide and research H1s are the 56/60 section size in Cal Sans, and landing and product heroes keep 80. **Radii:** controls and chips 2 · 4 · 6 · 8; surfaces only 12 (an inner card or vignette, a popup, the navbar, the cookie card), 20 (a card) and 24 (a stage); the full radius only for pills (10 → 12, 14 and 18 → 20). **Motion:** see D35; the one entrance is the landing heroes' load-in restored from #572, where the H1 never starts invisible (it sharpens from a 5px blur and settles 10px) and the lead and actions rise 14px from a 6px blur in a stagger, all under `prefers-reduced-motion: no-preference`. **Cookie banner:** Accept and Reject are the same outlined secondary button; on a short or narrow screen (under 768px wide or 640px tall, 200% zoom included) the card becomes a slim bar along the bottom that takes at most a quarter of the height, its text scrolling inside it before the bar grows. **Naming:** every breadcrumb and label for a `/blog` page says "Blog", never "Guides". **Copy:** the homepage lead (D30), the pricing opening ("Start with a seven-day free trial", what the trial includes and that a paid plan is by contact, Start free trial and Contact sales, the no-markup point moved to its own section below and the trial card renamed "What the trial includes"), and linked cards name their destination ("Explore AI Visibility →") instead of "Learn more →". **Accessibility:** quiet text in product images is `ink-secondary` and a not-named engine mark `ink-muted`, both 4.5:1 in both themes; copy on a stage is `ink` or `ink-secondary` (held by the contrast check); links in article copy and footnote markers are ink with an underline; headings follow their visual level (a product image holds no headings, one H1, H2 for a section, H3 for a card or step, a label-only section gets a visually hidden H2, and footer column titles and the cookie title are text naming their list or region); the footer's "Launch MCP" link is a 24px target; the announcement pill wraps to two lines on a phone instead of truncating; spacing one-offs snap to the 4px grid; integration logos sit in one 32px box so their names line up. |
| D37 | Every form control's resting edge holds WCAG 1.4.11's 3:1 (owner, 6 November 2026): the `line-field` token (`#808080` light, `#707070` dark, at least 3:1 on `paper`, `surface` and `surface-sunken` in both themes, held by the contrast matrix) is the 1px edge of every input, password and adorned field frame, search field, select and filter trigger, date field, textarea, chip input, the Agent composer, the docs search trigger, the CSV file input and checkbox and radio boxes, through `FIELD_EDGE` and the checkbox and radio atoms; the MCP consent page's inline palette mirrors it for its workspace choices. Hover darkens it to `ink-secondary`; focus is a 2px `focus` edge (`negative` when invalid) in a 3px `line` halo. Cards, dividers and other edges that are not controls keep `line`. The sign-in, sign-up and other auth card titles are Cal Sans at `display-lg` like the website's headings; elsewhere in the app Cal Sans stays the PageHeader title's alone. Supersedes D5's `line` field edge and `line-strong` hover, and D7's Geist sign-in title. |
| D38 | Fixes from the app UI audit the owner commissioned on 6 November 2026 (field edges are D37's `line-field`). The mono eyebrow (`type-eyebrow`) is 12px, the 0.75rem text floor, set apart from the caption by its face, caps and tracking. Sidebar labels wrap rather than being cut, so larger text spacing (WCAG 1.4.12) loses none. A field's end button (show password, clear search) is a 24px target (WCAG 2.5.8). |
| D39 | Overview's Next action button says where it goes ("Open the Action", "Open Runs", "Choose prompts", …), never a bare "Continue". The "No comparable measurement yet" empty state offers Launch audit, which opens the Launch audit dialog; the person confirms the run and its credits there, and nothing starts from Overview (owner, 6 November 2026). |
| D40 | The prompt library has no topics side panel (owner, 6 November 2026): a Topic filter in the control strip beside Active / Archived, search and Filter lists "All topics" and each topic with its prompt count, then "Add topic" and "Manage topics…"; Manage topics is a dialog listing every topic with rename and delete. Rows carry no topic or classification tags (owner, 6 November 2026: "the user can just select from filters"); the caption line only says when audits skip a prompt beyond the plan limit, and the question wraps to two lines (`rowLines={3}`). Every column fits from the owner's 982px desktop up; below it the table scrolls with the prompt pinned. |
| D41 | Below 900px (`rail:`) there is no sidebar column (owner, 6 November 2026): the page header leads with a menu button that opens the sidebar, labelled, in a full-height left drawer (`NavDrawer`) with the same groups, Dashboard \| Agent switch, project switcher and account. It traps focus, Escape closes it and returns focus to the button, and it closes on navigation. From 900px to 1280px the sidebar stays the icon rail; from 1280px the labelled column. |
| D42 | A priority (High, Medium, Low) is an order, not a state (owner, 6 November 2026): its badge (`Badge variant="priority"`) is the accent tint for High and neutral for Medium and Low, each with a three-, two- or one-bar signal glyph and its word, so the three differ by more than colour. Red stays reserved for errors and destructive actions; Site Health's issue severities keep their status tones. |
| D43 | Account access has no card (owner, 6 November 2026, from a reference sign-in screen): the sign-in, sign-up and mailbox forms sit straight on the left half's `paper`, centred at the same 480px width, with the account switch line under the form and the legal links at the foot; the showcase half is unchanged (D24). D37's Cal Sans auth title stays. |
| D44 | The website is editorial, not a wall of cards (owner, 6 November 2026, from the Semrush, Superhuman and Infosys references: "I don't like cards at all unless it's a product image"). No website surface has a border, a shadow or a hover lift; panels are told apart by colour alone. Soft tints (`--tint-mint`, `-sky`, `-lilac`, `-peach`: each stage colour 55% into `paper`; `--tint-neutral`: 4% `ink` into `paper`) fill a FeatureCard that links or holds a product image (the tint turns per tile and bento cell, its white product image inside it with no edge), QuestionCards, a PageHighlight (mint), pricing plans (neutral; the featured plan mint), LogoTiles, ToolPanels and website tables (neutral). A static text-only FeatureCard is a column under a `line-strong` hairline. A linked panel darkens 5% on hover; nothing moves. Product frames keep their D35 stage and frosted rim, without the rim's edge or the screen's pop shadow. RelatedCards ("Keep exploring", "Related guides", "Related reading", the blog's start paths) are a full-width index: a mono number, the title, the summary in a wider column and an arrow between hairlines, the summary under the title below 900px. The blog's featured post is a lilac text panel with no product screen. A SourcesList is one disclosure ("Sources" and its count), open with up to six sources and closed with more; its rows have no domain-initial badge. Blog posts get the "On this page" rail of their sections back, an unruled byline, an unboxed author line and pager, and related reading full width; the blog index lists its posts at full width with the meta in a left column from 1024px. Supersedes D29's shadowed cards, D31's bordered card and well, and D35's lift on hover. |
| D45 | A product image is the one website surface with a shadow (owner, 6 November 2026: the image "had one more unnecessary background" and "can have shadows since they sit on a background"). The frosted rim is gone: the frame's well has no fill, blur or padding of its own, so the white screen card sits straight on its stage (a standalone frame) or its tint (a FeatureCard), lifted by `shadow-pop` (its faint ring and soft drops; the dark theme's own pair). Every other D44 rule stands. Supersedes D35's and D44's frosted rim and D44's no-shadow rule for product images. |
| D46 | Form controls go back to the soft edge (owner, 6 November 2026: the dark border "should be dark grey smudged like before"). Fields, the docs search trigger, the CSV file input, checkbox and radio boxes and the MCP consent page's choices wear D5's 1px `line` edge with the `shadow-edge` smudge (radio: no smudge), `line-strong` on hover; the `line-field` token and its 3:1 contrast check are deleted. D37's 2px `focus` edge in the 3px `line` halo stays, as do its Cal Sans auth titles. Menu rows never shrink below 32px when a long menu scrolls. A table row takes `surface-sunken` on hover only when pressing it does something (it has an `onClick`). Supersedes D37's `line-field` resting edge and `ink-secondary` hover, and D38's field edges. |

D5–D17 come from the owner's reviews of the shipped app and docs on 5 November
2026. D18–D25 are the website review rounds in the
[rollout plan](plans/design-system-rollout.md); D26 is the owner's website
type rule of the same day. D39–D43 are the owner's answers in chat on
6 November 2026 to the app UI audit (D38).

## Ownership

| Owner | Responsibility |
| --- | --- |
| `frontend/apps/app/src/globals.css` | Every token (the single `@theme`, `:root` and `:root[data-theme='dark']`), the marketing site's responsive `--text-site-*` display sizes, the type roles (`.type-*`), focus, motion and the shared component geometry derived from the tokens |
| `frontend/scripts/design-system-tokens.json` | The artifact's `tokens.json`, verbatim: the contract `globals.css` is checked against |
| `frontend/lib/config/brand-fonts.json` | The three faces by role (`display`, `sans`, `mono`), their files and revision in the font repo; `pnpm fonts:pull` writes the metric-matched fallbacks |
| `frontend/lib/fonts/brand-fonts.ts` | The `@font-face` rules and fallbacks each runtime (the app's Vite build, `PublicFonts.astro`) loads |
| `frontend/lib/theme/theme.ts`, `frontend/public/theme-preference.js` | The theme preference and the pre-paint bootstrap every surface runs |
| `frontend/components/ui/logo-mark.tsx`, `packages/contracts/src/brand-logo.ts` | The logo, drawn inline in ink (`currentColor`) and the accent |
| `frontend/components/ui/`, `frontend/components/layout/` | The app's components and shell, composed by feature folders that set no geometry of their own |
| `frontend/apps/marketing/src/site.css`, `frontend/components/marketing/chrome/`, `frontend/components/marketing/sections/` | The website's components: SiteNav, SiteFooter, CookieBanner, Breadcrumbs, AnnouncementPill and the page sections, the system's `cl-*` geometry on the tokens above, and the website's type roles (the `cl-*` titles, lead, body and note) |
| `frontend/apps/marketing/src/screens.css`, `frontend/components/marketing/screens/` | The website's product images: ProductFrame and the `Screen*` components ("Website product images" in Screen contracts): fluid card vignettes at real type size, and two full app screens scaled whole to fit their frame (never cropped), with their demo data in one typed module; the home page's first view (`ScreenAppVisibility`, D25) is the whole app at 1440 × 820, its chrome drawn at the app's density |
| `frontend/apps/marketing/src/layers.css` | The website's depth layer (D35, D36, D45): stages, hero washes, the product image's shadow, the landing heroes' load-in and the chart ping, all in CSS with no script |
| `frontend/services/api/src/billing/pdf-brand.ts` | The PDF palette, read from `globals.css` |

## Token contract

`pnpm check:policy` (`frontend/scripts/check-design-system.mjs`) holds
`globals.css` to the artifact:

- **Values.** Every system colour in both themes, every type style (size,
  line height, weight, tracking), radius, control height, layout size,
  spacing step and shadow equals `design-system-tokens.json`. A colour, type
  style or radius the system does not have fails; the only extra colours are
  the third-party `--color-brand-*` marks. `--spacing` is 4px, so `p-N` is the
  system's space-N.
- **Faces.** `brand-fonts.json` names Cal Sans, Geist and Geist Mono for the
  display, sans and mono roles.
- **Contrast.** Every ink on every ground holds 4.5:1 in both themes, each
  status on its own soft, the labels on ink and on Flare; marks, control
  borders, the focus ring and the chart series hold 3:1; positive against
  negative and the three named series stay apart under red–green colour-vision
  loss.
- **Usage.** Raw colours, `@theme` and font files live only where they are
  owned; radius is the `rounded-*` scale with no arbitrary value; shadows are
  `shadow-xs|card|pop|press`; spacing stays on the 4px grid; type sizes,
  leading, tracking and faces outside `components/ui/` come from a type role;
  no text ink becomes a background. Debt older than a rule is ratcheted in
  `frontend/scripts/design-system-baseline.json` and only falls.
- **Documentation.** The tables below are generated from `globals.css` by
  `node frontend/scripts/audit-design-tokens.mjs --write`; a stale table, a
  duplicate value that is neither aliased nor recorded, and a non-system token
  without a consumer all fail.

### Colour

<!-- generated:tokens:start -->
| Token | Light | Dark |
| --- | --- | --- |
| `--color-accent` | `#e8501a` | `#ff6a33` |
| `--color-accent-ink` | `#b53a0c` | `#ff9466` |
| `--color-accent-soft` | `#ffe6da` | `#3b1a0c` |
| `--color-brand-google-blue` | `#4285f4` | `#4285f4` |
| `--color-brand-google-green` | `#34a853` | `#34a853` |
| `--color-brand-google-red` | `#ea4335` | `#ea4335` |
| `--color-brand-google-yellow` | `#fbbc05` | `#fbbc05` |
| `--color-chart-grid` | `#ececec` | `#262626` |
| `--color-data-1` | `#e8501a` | `#ff6a33` |
| `--color-data-2` | `#111111` | `#f4f4f4` |
| `--color-data-3` | `#7a7a7a` | `#8c8c8c` |
| `--color-data-other` | `#c2c2c2` | `#4a4a4a` |
| `--color-focus` | `#111111` | `#f4f4f4` |
| `--color-footer` | `#151515` | `#151515` |
| `--color-footer-ink` | `#f4f4f4` | `#f4f4f4` |
| `--color-footer-ink-muted` | `#a6a6a6` | `#a6a6a6` |
| `--color-footer-line` | `#2a2a2a` | `#2a2a2a` |
| `--color-info` | `#1f5fbf` | `#7fb0ff` |
| `--color-info-soft` | `#e3edfc` | `#14243d` |
| `--color-ink` | `#111111` | `#f4f4f4` |
| `--color-ink-hover` | `#2a2a2a` | `#d6d6d6` |
| `--color-ink-muted` | `#6b6b6b` | `#8c8c8c` |
| `--color-ink-secondary` | `#525252` | `#a6a6a6` |
| `--color-line` | `#e5e5e5` | `#2a2a2a` |
| `--color-line-control` | `#858585` | `#747474` |
| `--color-line-strong` | `#d4d4d4` | `#3a3a3a` |
| `--color-nav-glass` | `rgb(244 244 244 / 78%)` | `rgb(30 30 30 / 78%)` |
| `--color-negative` | `#c4122f` | `#ff7387` |
| `--color-negative-soft` | `#ffe2e6` | `#3d0e16` |
| `--color-on-accent` | `#111111` | `#111111` |
| `--color-on-ink` | `#ffffff` | `#111111` |
| `--color-paper` | `#f4f4f4` | `#0a0a0a` |
| `--color-positive` | `#0b6e69` | `#4fd1c5` |
| `--color-positive-soft` | `#d6f2ef` | `#0e2e2b` |
| `--color-scrim` | `rgb(17 17 17 / 32%)` | `rgb(0 0 0 / 64%)` |
| `--color-stage-lilac` | `#dfd6f7` | `#231b3d` |
| `--color-stage-mint` | `#cdeedf` | `#0f2a26` |
| `--color-stage-peach` | `#fcdac6` | `#2f1b22` |
| `--color-stage-sky` | `#d2e2f8` | `#13223d` |
| `--color-surface` | `#ffffff` | `#151515` |
| `--color-surface-sunken` | `#ececec` | `#1e1e1e` |
| `--color-warning` | `#8a5000` | `#f5b84a` |
| `--color-warning-soft` | `#fff0d1` | `#3a2a0a` |
<!-- generated:tokens:end -->

### Type

Product roles are the `.type-*` classes in `globals.css`, reached through
`textRole()` in `components/ui/typography.tsx`; the website roles are the
`cl-*` title, lead, body and note classes in `site.css`.

<!-- generated:type:start -->
| Role | Surface | Size / line height | 768–1023px |
| --- | --- | --- | --- |
| `.type-badge` | product | `12px / 16px` | — |
| `.type-body` | product | `14px / 20px` | — |
| `.type-caption` | product | `12px / 16px` | — |
| `.type-code` | product | `13px / 22px` | — |
| `.type-control` | product | `14px / 20px` | — |
| `.type-delta` | product | `13px / 20px` | — |
| `.type-eyebrow` | product | `12px / 16px` | — |
| `.type-figure` | product | `28px / 36px` | — |
| `.type-figure-ring` | product | `32px / 38px` | — |
| `.type-figure-sm` | product | `16px / 24px` | — |
| `.type-item-title` | product | `16px / 24px` | — |
| `.type-label` | product | `14px / 20px` | — |
| `.type-page-title` | product | `24px / 32px` | — |
| `.type-section-title` | product | `22px / 28px` | — |
| `.cl-body` | public | `16px / 26px` | — |
| `.cl-fcard-title` | public | `22px / 28px` | — |
| `.cl-lead` | public | `18px / 30px` | — |
| `.cl-lhero-title` | public | `80px / 86px` | — |
| `.cl-note` | public | `14px / 20px` | — |
| `.cl-phero-title` | public | `80px / 86px` | — |
| `.cl-shead-title` | public | `56px / 60px` | — |
<!-- generated:type:end -->

### Controls and layout

<!-- generated:controls:start -->
| Token | Value |
| --- | --- |
| `--container-site` | `1320px` |
| `--container-app` | `1440px` |
| `--container-thread` | `1040px` |
| `--container-prose` | `720px` |
| `--container-narrow` | `560px` |
| `--control-sm` | `28px` |
| `--control-md` | `32px` |
| `--control-lg` | `48px` |
| `--nav-height` | `64px` |
| `--sidebar-width` | `248px` |
| `--nav-item-height` | `32px` |
| `--menu-item-height` | `32px` |
| `--badge-height-sm` | `22px` |
| `--tab-height` | `32px` |
| `--table-row-height` | `44px` |
| `--table-header-height` | `32px` |
<!-- generated:controls:end -->

### Radius

<!-- generated:radii:start -->
| Token | Value |
| --- | --- |
| `--radius-2xs` | `2px` |
| `--radius-xs` | `2px` |
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `8px` |
| `--radius-xl` | `8px` |
| `--radius-full` | `9999px` |
<!-- generated:radii:end -->

## Behaviour every surface keeps

These hold whatever a component looks like:

- **Nothing moves on interaction.** Pagination, tabs, filters, sorting, loading
  and empty states keep their footprint; a select is as wide as its widest
  option; a pending button keeps its label's box.
- **The app has one component breakpoint**, `desktop:` (981px), and two shell
  breakpoints, `rail:` (900px) and `shell:` (1280px). Below 1280px the sidebar
  is the 57px icon rail, and below 900px the navigation drawer behind the page
  header's menu button (D41); `labelled:` styles the sidebar wherever its
  labels show. Below 1280px `AppGrid` halves and main-aside stack, the KPI layouts (quarters,
  fifths, pair, thirds) stay one row from `desktop:` and the `FilterBar` puts
  its filters on a second row; a child spanning an AppGrid
  row spans at `shell:` too. Product components use no other breakpoint.
- **Atoms have one form.** Geometry lives in `components/ui` and
  `components/layout`; a feature folder composes them and sets no spacing,
  sized box, radius, `size=` or `padding=` (`layer-*` rules, unratcheted).
- **Charts** are `aria-hidden` with a written description; a null point is a
  gap, never a zero.
- **Accessibility.** WCAG 2.1 AA; visible keyboard focus (2px of
  `--color-focus`, offset 2px); meaning never by colour alone; all motion stops
  under `prefers-reduced-motion`; forced colours and print stay usable.

### Availability vocabulary

Use the state actually known; never punctuation alone or a fabricated zero.

| Label | Meaning |
| --- | --- |
| **Not measured** | No measurement exists |
| **Not run** | Workflow has not started |
| **Not set** | Missing user-configurable fact |
| **Unavailable** | Evidence/provider cannot supply a value |
| **Not applicable** | Field does not apply |
| **Unknown** | System cannot determine the state |

Observed zero remains `0`. Chart series keep unavailable-point gaps and explain
them accessibly. A state is written once where it is decided: a section whose
values share one state says so once, and its metric slots show the muted dash
(`MetricValue`) with the state as the accessible name. A metric cell in a table
uses `MissingValue` (a muted en dash, the state as assistive text, the reason on
hover and focus); it is never blank, because an empty cell and a measured zero
are opposite findings. State a shared reason once, on the column header or the
section. A table or chart with nothing to show uses one empty state that
distinguishes first use, no results, loading and error.

### Screen contracts

**Overview.** Useful before any audit. Project identity and warnings lead; the
widgets follow the project's saved layout (Project State with Track context;
Movement; one Next action; where you're missing; ranked actions and report
proof; Company facts) in a two-column grid, in the same DOM order at every
width. Editing lives in one Layout menu and per-widget controls overlay the
widget, so neither entering edit mode nor saving moves anything.

**AI Visibility.** Exactly three tabs: Trends (default), Sources, Query
fanouts. A backend token reaches a reader only through
`lib/visibility/vocabulary.ts`; an unmapped token renders as nothing. Run
bookkeeping stays out of the default view. One filter row, every control a
question a customer would ask. Trends shows Visibility, Share of voice and
Owned citation rate, one metric-selectable history chart and one competitor
table; a change column with nothing comparable is omitted. Prompt results
belong to the prompt row; Sources splits Domains and URLs on a segmented
control; Query fanouts is one table under a Group by control.

**Site Health.** The crawl control and URL inventory lead; Run new crawl before
and after a run, Stop crawl while one is active. Issues and Advisories are
separate (user-visible text never says "defect"); a rule's description states
the passing expectation and the rail leads with How to fix. "Stalled" needs
backend expired-lease evidence, never a browser timer. URL detail leads with
the page's issues, then scores; history opens in the right drawer.

**AEO Readiness.** Opens on a seven-dimension ledger, never a gauge;
not-applicable rows stay visible without failure styling.

**Website Changes.** An evidence ledger with four named classes and
before/after provenance; observed zero says "No changes were observed".

**Agent.** A full workspace in Agent mode. Queued, running, cancelled, failed
and stopped-at-limit are distinct states with Stop while active. Actions list by
deterministic priority (High, Medium, Low); neither chats nor Actions count
evidence sources. Context is one `ListScreen` whose subjects are its tabs.

**Website product images.** `ProductFrame` shows a screen in a well with even
padding (24, 16 under 768px) and no fill of its own, inside a surface card
(1px soft border, radius at most 8px, `shadow-card`, D29), so the screen sits
straight on the card; in a FeatureCard it sits above the title, body and
link, with no step number. Screens come in two kinds, named by the frame's
`fit`:

- **Vignette (`fluid`, every card image).** One `Vignette`
  (`screen-vignette.tsx`, `.cl-vig`): a white card, 1px `line` border, radius
  8, padding 20, laid out at the width of its well, never scaled, its height
  from its content. Header: title (Geist 500, 16/24), an optional meta line
  (14/20, muted) and an optional badge at the right. Body: exactly four rows
  (a 20px mark or icon, label 14/20 500, a muted secondary line 14/20, an
  optional middle column, a value 14 tabular), or three figures (label 12,
  value `stat` 28/36 Geist 500, change) over one small chart, or a short
  panel of the same height. Every vignette uses this one type scale, no Cal
  Sans and nothing over 28px, so tiles in a bento row match; in a taller row
  the vignette fills its well and its rows share the extra height. Key text
  wraps, never ellipsizes; below 420px of card width a row drops its middle
  column. A vignette's frame is at most 760px wide and centres in a wider
  slot: a platform hero shows its one vignette centred, and a feature asking
  for a full-width vignette is laid out as a split beside its copy.
- **Full app screen (`scale`).** Laid out once at a natural size
  (`--screen-w` by `--screen-h`) and scaled down whole to the well's width
  (CSS container query units, no script, no layout shift), never up and
  never cropped: the home page's app in its chrome (`cl-screen--app`,
  1440 × 820, D25) and the AI Visibility overview (`cl-screen--visibility`,
  1200 × 680), each in a full-width frame.
