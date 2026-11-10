# Actions simplification

Status: proposed, 2026-11-10. Comes before content optimization phase 2 (the
page editor).

## Why

Phase 1 of content optimization added a second list (Content, `/agent/content`)
that splits Actions by page kind. For a retailer it fills with "planned pages"
named after competitors' shop categories, and it hides content work from the one
list users already use. Meanwhile, opening any Action leads to an Agent chat
whose message box is empty, even though the Action already says what to do.

The owner's direction (2026-11-10):

1. Keep one Actions feature. Remove the Content screen and fold content work back
   into Actions.
2. Redesign the Actions list so that every actionable item is visible and grouped
   logically, taking the idea (not the look) from Peec's Actions. The URLs
   "Gap" pages ("Draft a request to be listed") belong in Actions.
3. Working on an Action opens an Agent chat with the message already written.
   The user edits it or just presses Send.
4. The list keeps its table and gains an All filters button. The detail page is
   one centered column with its three actions floating at the bottom.

Phase 2's editor plan is written after this ships.

## Decisions (owner, 2026-11-10; supersede CO1 and CO10)

| ID | Decision |
|---|---|
| AS1 | One Actions list. No per-surface screens; `actions.surface` and the Content screen are removed. Content-gap findings are ordinary Actions. |
| AS2 | The list is grouped. Group headings show open counts; each group shows its top items by priority with "Show all N". |
| AS3 | "Work with the agent" opens a new Agent chat with the Action attached and a prefilled, editable message; the user never has to type to start. |
| AS4 | Every page in the URLs Gap filter is already actionable ("Draft a request to be listed") and is listed on the Actions page (one definition of "gap"). |
| AS5 | Content gaps use only competitors' and editors' content pages as evidence (articles, guides, comparisons, listicles, reviews, case studies), never their product, category, collection or home pages, and only answers to tracked prompts. |
| AS6 | The list keeps today's table and adds an **All filters** button (one menu, a submenu per filter). |
| AS7 | The Action detail page is one centered column, not a grid of boxes, with Dismiss, Mark implemented and Work with the agent in a bar floating at the bottom. |

## Groups

Derived at read time from fields every Action already has (`approach`,
`target_kind`), mapped in `config/actions.ts`. No new column.

| Group | Contains | Sub-groups (by approach) |
|---|---|---|
| Fix how AI reads your site | `fix_technical`, `improve_links` | Technical fixes, Internal links |
| Improve your own pages | `create_new`, `improve_existing`, `consolidate` on pages, planned pages, queries and prompts | Create a new page, Improve a page, Merge pages |
| Get mentioned elsewhere | `earned_placement` | Get listed |
| Improve your products | `product` and `category` targets | (by approach) |

"Fix wrong claims AI makes about your brand" has no rule today and is not added
here.

## Changes

### PR 1: one list, and the content-gap evidence fix

- New migration `0018` drops `actions.surface`, its CHECK and its index.
- Delete:
  - the surface derivation and writes (`actionSurface`, `restampMemberless`, the
    config's `SURFACE_*`);
  - from the list response: the `surface` filter, `surface_open_counts`,
    `content_gap_source` and `content_gaps`;
  - `action_surface` on every read that links to an Action;
  - the contracts' `action-surface.ts`, `ACTION_SURFACE_SCREENS` and the
    `actionPath` surface branch;
  - `/agent/content`, `content-optimization-screen.tsx`, the sidebar entry, its
    prefetch and its badge;
  - the MCP `surface` argument.
- Every Action link is `/agent/actions/{id}` again.
- The detail page keeps the content-gap evidence ("Why this matters").
- Content gaps (AS5):
  - The clustering step receives each cited page's URL path as well as its title,
    and leaves out product, category, collection and home pages.
  - Citations from answers with no tracked prompt are not read.
- Docs:
  - `docs/content-optimization.md`, `opportunities.md`, `agents.md` and `mcp.md`.
  - The public docs page and the changelog entry that describe the Content screen.
  - `decisions.md` gets AS1 to AS5.
  - The phase 1 plan is marked superseded where it describes the surface.

### PR V: AI visibility layout and the shared All filters menu

Owner, 2026-11-10 (AS8):

- **All filters component.** One shared control for the tabs row:
  - An **All filters** button at the far right of the tabs row opens a menu that
    lists each filter with its current value.
  - Each entry opens a submenu of options; long lists such as prompts get a search
    box.
  - The button shows how many filters differ from their defaults.
  - Every filter stays URL state.
  - It lives with the page shell so the Actions list (PR 2) reuses it.
- **Every AI visibility tab** (Trends, Sources, Perception, Accuracy, Ads, Query
  fanouts) loses its second row of filter selects. The run, prompts, surfaces,
  domain type, range, granularity, market and fanout group filters all move into
  All filters.
- **Sources.** The Domains | URLs switch moves below the tabs, at the start of the
  table's toolbar, before the search box.
- **Trends.**
  - The Over time card gets more width: Brand and competitors and Over time
    split the row evenly.
  - Runs that aren't comparable still break the solid line. Across a break, the
    chart now draws a faint dashed connector, so the series reads as a line and
    the method-change marker stays at the break. With two runs, you see a line
    rather than two dots.

### PR 2: grouped Actions list and URL gaps

- API:
  - `GET /projects/{id}/actions` accepts `group`.
  - Each list item carries `group`.
  - The response adds `group_counts` (open Actions per group).
- Screen: today's table, with its rows grouped under collapsible header rows
  (group name and count). Each group shows up to five rows by priority, then
  "Show all N", which filters the list to that group (URL state). Columns:
  Action, Priority, Action type (approach), Source (family).
- All filters (AS6), reusing PR V's component: one button whose menu opens a
  submenu per filter. The filters
  are Status, Group, Action type, Priority, Target type and Source. Every filter is
  URL state; the active ones show as removable chips. This replaces the separate
  Status and Target type selects.
- A row click opens the Action detail page.
- AS4: `earned_page_acquire_listing` fires for every page the URLs Gap filter
  shows. It drops `EARNED_PAGE_INCLUDABLE_FORMATS` and `EARNED_PAGE_MIN_RECURRENCE`;
  priority still ranks them. On a URL page, "Draft a request to be listed" always
  opens the Action's prefilled chat.

### PR 3: centered detail page and a prefilled chat

- Detail page (AS7): one centered column (the thread width), top to bottom:
  - breadcrumb (Actions › the full target) and a one-line title (a URL target
    by its host and last path segment);
  - overview (what happened, from the diagnosis), with Copy as prompt;
  - a Details card: Status, Priority, Action type, Target, Source;
  - Why this matters (evidence, including content-gap evidence);
  - What to do (the remediation steps);
  - Measure with, and Avoid;
  - Affected pages or members, then Chats.
- The page's actions float in a bar at the bottom center: Dismiss, Mark
  implemented, and Work with the agent (primary). They replace the header buttons
  and the Implementation card; the Mark implemented dialog is unchanged.

- Each `APPROACH_TREE` branch gets a message template in config. Examples:
  - Get listed: "Draft a request to be listed on {target}, alongside {competitors}."
  - Improve a page: "Improve {target} so AI answers cite it for {angle}."
  - Create a new page: "Write a page about {angle} for the prompts in this Action."
  - Technical fix: "Fix {issue} on {target}."
- The server fills each template from the Action's own evidence and returns it as
  `handoff.message` on list and detail reads.
- Work with the agent opens `/agent?action_id=…&prompt=…` (plus the workflow when
  the diagnosis names one). The composer is prefilled and editable, and Send is
  enabled.
- The URLs gap button, the New chat "Recommended Actions" and the detail page's
  button use the same message.

## Not in scope

The page editor and Optimize content (phase 2), creating your own Actions, due
dates and repeats, and "Fix wrong claims".
