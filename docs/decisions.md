# Accepted cross-feature decisions

Keep accepted, still-applicable choices with their reason, scope and actual
source. Feature-local rationale belongs in its feature owner; correctness
rules belong in [invariants](invariants.md). Git and PRs retain superseded history.

## TypeScript application, SQL schema baseline

The application uses TypeScript with Hono, Kysely and Zod. The schema is one SQL file,
`frontend/services/api/migrations/0001_baseline.sql`, the only schema author
under [invariant 17](invariants.md#17-the-migration-baseline-remains-singular).
The TypeScript migrate CLI (`src/cli/migrate.ts`, `pnpm migrate`) applies it
once under an advisory lock in one transaction and records its SHA-256 in
`schema_migrations`; it runs from the API image, so the deploy builds one
application image. Kysely types are generated from a baseline-migrated database.

There is no adoption shim: a non-empty database without the ledger, or a
ledger checksum that differs from the file, fails the migrate job with an instruction to redeploy with `reset_database`.
Until there are live customers every schema change is folded into the baseline
and reaches production only through that reset option, whose confirmation check
stays.

Source: owner decision of 10 October 2026 (feature 14, execution platform).

## One commercial account per workspace

A workspace owns exactly one billing account. A user owns one workspace and may
join others by invitation; each workspace retains exactly one designated Owner.
Owner and Admin have equal workspace permissions. Billing, member management
and provider/integration credentials are administrative; Member has ordinary
product read/write/run access and Viewer has read-only product access.

This makes tenancy, access and commercial ownership agree without project ACLs,
seat billing or a second account-link entity. Ownership is counted separately
from invited membership. Workspace selection is explicit; project resolution
must still authorize the project's workspace.

Source: owner-confirmed commercial and workspace decisions, implemented in
[PR #61](https://github.com/Cube-27/Citeladder/pull/61) (44fc0d22), with shell
selection in [PR #58](https://github.com/Cube-27/Citeladder/pull/58) (cae5717f).
[Workspace access](workspace-access.md) and [billing](billing-entitlements.md)
own shipped behavior. The sign-in workspace chooser and invitation delivery
through self-serve authentication (#280) are implemented.

## Preserve provider portability; billing is operational but hidden

The commercial core binds each intent/subscription/receipt to its originating
provider and environment; vendor keys and webhook vocabulary remain
vendor-owned. This avoids rewriting commercial accounting to change a payment
transport. Razorpay is the implemented provider; the option to select another
remains.

Billing is fully operational but hidden, so that enabling it is one small
configuration change. Checkout serves only workspaces holding the non-public
`billing_checkout` grant (Razorpay test keys are accepted in production for
them alone); the public catalog reads checkout unavailable, and only the free
trial is live. Enablement waits for the owner's separate live sign-off tracked in
the [backlog](plans/backlog.md#acceptance-calibration-and-rollout).

Source: owner-confirmed provider-portability decision, implemented in
[PR #61](https://github.com/Cube-27/Citeladder/pull/61) (44fc0d22); the owner
resumed Razorpay activation on 24 September 2026 and set hidden operation on
11 October 2026 (billing decisions B0 and B2, refined by B42 in the
[billing decision log](billing-decisions.md)).

Real sandbox captures, recurring-method acceptance and GST parity remain
unverified. [Provider readiness](billing-provider-readiness.md) owns the
acceptance and separate enablement boundary.

## Platform AI is metered in AI credits; the Agent has no customer model route

Every platform model call spends AI credits (1 credit is $0.001 of usage after a
30% markup), charged on tokens at the serving model's price, and internal cost
follows the provider's published rates; customers see only credits. Prompt runs
replace audit credits as the measurement unit. The Agent always uses the
platform gateway: its customer (BYOK) model route was removed. Customer provider
keys (BYOK) remain only for answer-engine and research providers, as a lower
price of the same plan.

Source: owner decisions of 11 and 12 October 2026, billing decisions B4, B8,
B11, B12, B19, B23, B31 and B53 in the [billing decision log](billing-decisions.md).
Plan sizes and prices are configuration (B55). [Billing and
entitlements](billing-entitlements.md) and [Agent](agents.md) own shipped behavior.

## One Agent runtime; the Action is the unit of work

The separate Content and Growth Agent runtimes are replaced by one in-app Agent.
It reads through the same registered read tools as MCP, applies internal skills
the user may pick by name but never sees, and keeps one versioned deliverable
per chat; the chat is the saved work. Target-level work converges on one Action
per target, grouped and diagnosed deterministically from live Opportunities.
Skills stay internal: they are not exposed through MCP or offered as a
download, and the MCP surface is otherwise unchanged apart from removing its
retired skill catalog. Generating or approving a deliverable is not an
implementation declaration.

This removes two overlapping generation stacks, keeps MCP and the app from
drifting into different reads, and gives repeated findings on one target one
place to converge.
Source: owner-settled Agent workspace plan,
25 September 2026. [Agent](agents.md) and [Opportunities](opportunities.md)
own shipped behavior.

## The Agent uses native tool calling

The Agent runs a native tool-calling loop on the providers' own APIs with no
agent framework (A1): the model calls reads and two built-ins (`load_skill`,
`save_document`) directly, one response's reads run together, and a chat's
earlier turns are replayed append-only so the prompt cache and thinking carry
across turns. It keeps both providers, Anthropic and OpenAI-compatible (A2),
behind the platform gateway. The default model is Claude Haiku 5.5 at medium
effort (A3). This replaces the JSON step protocol, which allowed one read per
step, threw away earlier reasoning and re-sent a rebuilt prompt each step.

Source: owner decisions A1–A3 of 12 October 2026 in the
[Agent native runtime plan](plans/agent-native-runtime.md); pricing in
[B53](billing-decisions.md#agent-native-runtime-2026-10-12). [Agent](agents.md)
owns the shipped behavior.

## Onboarding creates no prompts

Onboarding confirms business context and competitors, then creates the project
with an empty prompt set in the completion request. A project with no prompts
is a valid state; Overview and the Prompts page ask the user to choose the
questions to track. The previous onboarding portfolio request produced prompts
the owner judged low quality, added a completion worker and a polling state, and
committed users to prompts they had not chosen.

Source: owner decision of 26 September 2026 in the
prompt generation v2 plan, PR 1.
[Onboarding](onboarding.md) and [prompts and Visibility](visibility-prompt.md)
own the shipped behavior.

## Generated prompts are reviewed before they are tracked

Generate stages candidates in a separate table; only a user's accept creates an
active prompt, and a rejected candidate leaves review (see the quality-gate
entry below for the text-free outcome it may leave). This reverses "generated
rows are active immediately": the owner judged generated quality too uneven to
track unseen. Candidates are not a `proposed` status on `Prompt`, because every
audit, capacity and visibility query would then have to exclude proposals and
one miss would corrupt measurement.

Source: owner decision of 26 September 2026 in the
prompt generation v2 plan, PR 3a.
[Prompts and Visibility](visibility-prompt.md) owns the shipped behavior.

## The quality judgment gates generated prompts

Generation records bounded JEV (TypeSafe) judgments on the candidates it
selects, reversing "no fuzzy-similarity quality judges". The judgment is a hard
gate by default: a strong fail never reaches review, an uncertain candidate is
shown flagged and the rest pass. The owner first shipped it record-only (PR 3b),
then chose provisional, versioned thresholds (`jev-gate-1`) because judgments
can only be calibrated once the feature runs live. `JEV_MODE=shadow` restores
record-only behavior, in which a judgment ranks and flags the review list but
never drops a candidate. Calibration needs outcomes, so a rejected candidate that
carries a judgment, whether rejected by a user or by the gate, is kept as an
outcome record without its question text for a configured retention. This
narrows "rejected candidates are deleted". Code still owns every check code
can make, and a judgment never retires a tracked prompt.

Source: owner decisions of 26 September 2026 (PR 3b) and 27 September 2026
(PR 3c) for the prompt generation v2 plan.
[Prompts and Visibility](visibility-prompt.md) owns the shipped behavior.

## TypeSafe is a published subprocessor; production runs JEV

The subprocessor, Privacy Policy and AI Policy revision naming TypeSafe
(United States) for prompt-suggestion and internal-link judgments was published
on 28 September 2026, and `PRIVACY_NOTICE_REVISION` moved to that date. The
owner enabled `JEV_API_KEY` in production at once rather than after the DPA's
30-day notice, because CiteLadder is pre-launch and has no DPA customers to
notify. Later subprocessor changes follow the DPA notice period.

Source: owner decision of 28 September 2026.
[Prompts and Visibility](visibility-prompt.md) and
[Site Health](site-health.md#internal-links) own the shipped behavior.

## JEV judgments are unmetered and unthrottled

JEV is built for parallel calls and costs almost nothing per judgment, so
CiteLadder does not cap its concurrency or meter judgments against AI credits.
Prompt generation sends every candidate's request at once, and an internal-link
analysis sends one request per source page at once. A bounded call count per
generation and each job's deadline remain.

Source: owner decision of 28 September 2026.
[Prompts and Visibility](visibility-prompt.md) and
[Site Health](site-health.md#internal-links) own the shipped behavior.

## Scoped API keys are explicit user decisions

The public REST API at `https://api.citeladder.com/v1` is a paid-plan
capability (`api_access`, ten live keys per workspace; not the public trial).
Only an Owner or Admin creates a key. A key belongs to one workspace, may be
restricted to chosen projects, and its scopes intersect its creator's current
role on every request; removing the creator revokes the key. A write through a
key holding the matching scope is therefore an explicit user decision under
[invariant 10](invariants.md#10-automation-stays-bounded), and it runs through
the same command layer as the browser. Creating or spending POSTs require an
`Idempotency-Key`; an audit launch carries the caller's `max_attempts` ceiling.

Source: owner decisions D4.1–D4.3 of 10 October 2026 (competitive tracker F4).
[Public API](public-api.md) owns the shipped behavior.

## MCP writes are confirmed user decisions

An MCP connection can change product data only when the person ticked
**Allow changes** (unticked by default) at consent, adding `citeladder:write`,
and only as far as their live role in the project's workspace allows. Larger
changes are prepared, validated by a dry run of their command, and run only
through `confirm_change` after the user agreed to the preview; such a
confirmation satisfies [invariant 10](invariants.md#10-automation-stays-bounded).
Prompts added this way are active immediately, with no candidate staging,
unlike generated prompts. Existing grants are not re-consented (greenfield).
The in-app Agent stays read-only.

Source: owner decisions D4.2 and D4.4 of 10 October 2026 (competitive tracker F4).
[MCP](mcp.md#changes) owns the shipped behavior.

## The public website is flat

The marketing site and docs (`[data-public-surface]`) follow the
design-taste-frontend house rules where they differ from the shared
Attio/Linear material: nothing at rest casts a shadow (Lattice-style flat
surfaces), there is no thin divider or 1px outlined box outside real tables
and form fields, no gradient or button sheen, and no icon-topped card rows.
Surfaces separate by a tone step or by space; a section may change its whole
field colour. Coded product views (`data-ui`) keep the product's own material
inside their frame, and detached layers (menus, the consent bar) keep their
overlay shadow. Product views carry no "Illustrative example" caption. The
marketing H1 is the first screen's dominant element on desktop. The
authenticated app keeps its own material (see below).

The same day the owner extended the flat rule to sign-in, sign-up, the mailbox
screens and onboarding (`[data-flow-surface]`, light mode only: dark mode keeps
its edge rings), applying only the changes relevant to a form flow, and set the
desktop marketing H1 4px smaller from 900px (so a desktop at 125% display
scaling counts as desktop): the hero tops out at 68px and the page title is
40px, then 64px from 1280px.

Source: owner, 16 October 2026 (design-taste-frontend inspection of the public
pages; "prefer skill over design system"). [Design](design.md) owns the system.

## The product app uses hairlines, not lift

The authenticated app trades its layered shadows for crisp hairlines: cards and
the workspace sheet are a one-pixel edge, secondary controls keep only a
one-pixel contact shadow, the primary action is one flat fill with no sheen,
and the current sidebar destination and selected list rows take the neutral
selected tint rather than a raised face. Detached menus and dialogs keep their
overlay shadow, and dark mode keeps its edge rings.

Source: owner, 16 October 2026, asking for an audit and redesign of the app
because it "doesn't really look professional enterprise grade yet", with the
design choices left to the agent. [Design](design.md) owns the system.

## The brighter refresh: signal green, Sora and General Sans

Every surface (website, docs, sign-in, onboarding and the app) moves to a
brighter look. The brand and action colour becomes a vivid signal green
(`#00a650`) in place of forest; because it is bright, a filled control carries
near-black ink, and links and focus take a deeper green. The logo keeps its
drawing and its two-tone split, with the bars and "Cite" in the new green. The
homepage hero, the closing band and the sign-in brand panel are whole mint
fields, and the announcement strip is lime. Display headings set in Sora and
text in General Sans, both capped at weight 500; editorial serif display faces
were rejected, as were the faces of the reference site the owner showed. The
public H1s are a step smaller than before: the hero tops out at 60px (about
52px at 1280px) and the marketing page title is 36px, then 56px from 1280px.
Phones get their own homepage composition rather than the desktop one shrunk
(superseded for product views on 31 October 2026: see
[Product views scale down on phones](#product-views-scale-down-on-phones);
the copy, actions and engine list keep their phone composition).
Motion stays subtle: copy arrives in sequence, and product pictures assemble
themselves (lines draw, bars grow). Website copy is unchanged.

Source: owner, 21 October 2026. The owner asked for "a brand new look ... brighter
colors", left the design free except content and logo, allowed the app and the
brand green to change, then chose the first of three first-screen mocks with
Sora replacing Cabinet Grotesk, a 500 weight limit, slightly smaller H1s and
special treatment for mobile. [Design](design.md) owns the system.

On a phone, a pair of calls to action shares one row at equal widths, in the
hero and in every closing band; the hero's product picture keeps its title,
its one action and its filter bar to one line each, dropping its secondary
header controls and the widest filter (superseded on 31 October 2026: the
picture now keeps every control, see
[Product views scale down on phones](#product-views-scale-down-on-phones));
and the announcement strip can be
closed, which the visitor's browser remembers for that announcement. In the
app, record tables give the row's identity the width (a prompt's topic and tags
are a caption line under it), set figures right-aligned with no header band,
and start at the card's top edge.

Source: owner, 21 October 2026, follow-up requests on the shipped refresh: the
hero and closing CTAs "on the same row", the hero picture's title, action and
filters "overflowing to two rows" ("u can remove one filter"), a cross to close
the top strip, the prompt column "too less width", provider names wrapping, the
padding above table headers, and the app improved with the taste-skill v2.1
dashboard rules.

The text face becomes Geist in place of General Sans on every surface, with
Sora kept for display headings. General Sans read light, and it has no
tabular figures, so numeric columns never lined up; Geist has them. Geist
Mono is not in the font repository, so figures set in Geist's tabular digits
rather than a monospace. Records with fewer rows than a page show no pager
and no blank padding rows; the competitor table, which never exceeds six
brands, is not paged at all.

Source: owner, 21 October 2026: "general sans doesnt look very good and is a
lighter font ... maybe geist is a better choice and geist mono for numbers? ...
if it requires a lot of file to change ignore and just use geist instead";
"rpp and pagination only appears on 11th row and above, we dont show blank
rows"; "the competitor table will never be more than 6 so no point in rpp and
paginatiosn".

## Site Health crawler parity checks and Apple's crawlers

Site Health gains the deterministic crawler checks a comparison with two
open-source SEO crawlers (LibreCrawl and FreeCrawl) found missing: canonical
targets that redirect, are noindex or chain to another canonical; redirect
chains and loops; internal links to redirects; exact and near-duplicate main
content; sitemap URLs that redirect and sitemap `lastmod` dates that contradict
the page; and meta-refresh or script redirects. All run on evidence the crawl
already fetches, so they add no fetch or infrastructure cost. Headless
rendering, external-link checks and readability or pixel-width heuristics stay
out.

Applebot joins both crawler-access checks (Apple's search and Apple
Intelligence crawler), and Applebot-Extended joins the AI-crawler check as a
training control.

Recrawling an existing crawl from the Changes view and scheduled Site Health
crawls are the top Site Health backlog priorities.

Source: owner, 17 October 2026, approving the crawler comparison report
("proceed with implementation of 5 findings plus applebot"; recrawl and
scheduled crawls "should go in backlog as top priority").
[Site Health](site-health.md) owns the behavior.

## The public site presents CiteLadder as open source

The public website says CiteLadder's source is public under AGPL-3.0 at
`https://github.com/abhij1306/CiteLadder` (exact casing). Open source is a
supporting pillar, not the lead: the hosted product keeps the name
"CiteLadder" (never "CiteLadder Cloud"), the homepage carries no added
open-source line, and the GitHub mark sits in the header and footer instead.
`/open-source` compares self-hosted with hosted; the compare pages carry an
open-source row; `/enterprise` cites public, auditable scoring code but does
not pitch self-hosting, because the self-hosted build is single-workspace
with no login. This replaces the earlier rule that commercial pages make no
open-source or self-hosting claim.

Source: owner, 20 October 2026, approving the SEO and open-source plan with
the caveats "dont add a line in landing page instead your github logo with
link on the header" and "no citeladder cloud".

## Filled controls carry white ink; product views are windows

Anything that carries ink on green (buttons, the selected calendar day, a
checked mark, the current onboarding step) has white ink on a deeper green
fill (`#00873f`, 4.6:1) instead of near-black ink on signal green. Signal
green itself, the logo, tab underlines and tracks are unchanged; dark mode
keeps its bright fill and dark ink. This replaces the near-black ink of the
brighter refresh.

Every coded product view on the public site (hero, product shots and the
homepage tiles) is the same window: a white panel with the overlay ring and
soft lift, so it never merges with the page. This is an exception to the flat
public website. Product stages lose their dot lattice and its drift, and on
the public site only section headings rise on scroll; cards, stages, rows and
article blocks are static. The homepage hero drops its four-tab product tour
(Visibility, Citations, Site Health, Agent) and its entrance animations for
one still AI Visibility page. No product window sits on a tinted stage:
hero, solutions, platform and deep-dive shots sit straight on the page. The mint field (hero, closing band, sign-in brand panel) is much
lighter (`#e8f9ee`). Weight stays capped at 500 on the public site too.

Source: owner, 30 October 2026, after an unslop review: "the font in buttons is
black on green background should be white" (choosing a deeper fill over white
on the current green), "for product UI images in the landing page and
elsewhere use a common style like iOS so they dont look merged with
background", the stage lattice "is not very good", "scroll reveal actually
doesnt work apart from main headings of pages so apart from that u can remove
scroll reveals", "500 is the limit" and "remove the 4 tabs and designs
completely from landing page product UI and just keep a static visibility page
so no motion", then "the green background used in landing page and above
footer section can u make it much lighter" and "there is background in product
UI visibility which u can remove too", including "backgrounds from solutions
product UI".

## Uncut Sans replaces Sora for display headings

Display headings on every surface (the product page title, the public hero,
page and section headings, the flow title and Markdown `h2`) set in Uncut Sans
instead of Sora, still capped at weight 500. Geist stays the text face. Uncut
Sans comes from the private Cube27 font repository like every other face, so
no font binary enters this repository; the pinned font revision moves to the
one that adds it.

Source: owner, 30 October 2026: "replace the display font to uncut sans its
already present in github" ("cube27 fonts repo").

## Outfit replaces Uncut Sans for display headings

Display headings on every surface set in Outfit instead of Uncut Sans, still
capped at weight 500. Geist stays the text face. The face is Outfit's Latin
variable subset (`Outfit-Variable.woff2`), added to the private Cube27 font
repository; the pinned font revision moves to the one that adds it.

Source: owner, 31 October 2026: Outfit should replace "Uncut Sans (headings)".

## Product views scale down on phones

On a phone or tablet every coded product view on the public website (the
homepage hero picture, the homepage tiles and every product shot) shows its
desktop layout scaled down, sidebar and every control included. Nothing in a
view is hidden, trimmed or reflowed for a small screen. Each view lays out at
the width its frame has on a 1440px desktop and scales down to fit, never up;
desktop renders are unchanged. Text inside a view gets very small at phone
widths (about a quarter of its size in the hero picture), and that is
accepted. This replaces the 21 October phone treatment of the hero picture
(no sidebar, dropped header controls and filter, a larger readable scale);
the phone composition of the surrounding copy, actions and engine list stays.

Source: owner, 31 October 2026, via the marketing-site design brief: product
UI mocks on mobile should be scaled, not reflowed, keeping the desktop
composition with the sidebar visible and no hidden controls, with small text
on phones accepted. [Design](design.md) owns the system.

## The public site gets a neutral ground and inks

The public site's direction changes: only CiteLadder's content, its signal
green accent (buttons, links, badges) and its logo stay its own; the rest
follows a neutral system. This replaces the flat rule above for the
homepage's cards and chips and for public type and ink.

- **Homepage ground:** every band sits on one `#f7f7f7` ground; cards and
  tiles are white; the capability group labels become small white chips. The
  homepage draws no wireframe lines: no section rails, band rules or column
  dividers. No copy, section order or product view changes, and the whole
  treatment is one stylesheet that can be switched off.
- **Neutral fields:** the homepage hero and announcement strip lose their
  mint and lime fields and take the same `#f7f7f7` ground. The homepage
  closing band keeps its mint field and lattice, like every other page's. The
  accent stays on buttons, links and the logo.
- **Type and ink (every public page, docs included):** hero 64/48/32px at
  weight 400, section heading 39/32/26px, subtitle under a heading 24/18/15px
  at 500 in a lighter ink, card titles 18/18/16px at 600, body 16/14/17px
  (larger on a phone), across desktop (≥1200px), tablet (810–1199px) and
  phone; inks are `#171717` headings, `#707070` sentences, 60% ink navigation,
  footer links and subtitles, and 55% black lead-in labels. These lighter
  inks are deliberately lighter than the headings but meet 4.5:1 on white,
  the ground, the footer's band and the mint closing band.
  The feature heading beside a product shot keeps its earlier size. The font
  families stay Outfit and Geist.

Source: owner, 31 October 2026, via the design brief for this change
(wireframe grid skeleton; type scale and colour hierarchy), with the follow-up
to adopt the neutral ground, white fitted cards, chips, dividers and line
colours, and to keep the current font families. Owner answers the same day:
the hero and closing band fields become the neutral ground with the accent
kept on buttons, links and the logo; docs takes the new type scale; "Feature
heading size is good currently, so don't change it."; body ink is `#707070`;
the navigation, subtitle and lead-in inks darken just enough to pass 4.5:1
everywhere they render. The first version also drew faded section rails,
full-bleed band rules and column dividers; the owner removed them after
seeing it live ("remove the lines, they look pretty bad, rest is fine") and put the mint
closing band back on the homepage "like all other pages".
[Design](design.md) owns the system.
