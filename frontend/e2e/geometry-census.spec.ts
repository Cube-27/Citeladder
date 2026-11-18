import { expect, test, type Page } from '@playwright/test';

import { skills } from '../test/agent-chat-fixture';
import { FIXTURE_PROJECT, fixtureProjectPath, stubAuthedShell } from './helpers/app-fixture';

const PROMPT_SET_ID = '44444444-4444-4444-8444-000000000001';
/** One brand set holding one active prompt, so the library draws its search. */
const PROMPT_SETS = {
  prompt_sets: [
    {
      id: PROMPT_SET_ID,
      project_id: FIXTURE_PROJECT.id,
      name: 'Main',
      kind: 'brand',
      prompt_count: 1,
      prompts: [
        {
          id: '44444444-4444-4444-8444-000000000002',
          prompt_set_id: PROMPT_SET_ID,
          text: 'Best pricing tools for small teams',
          theme: '',
          intent: '',
          cohort: 'core',
          branded: false,
          enabled: true,
          status: 'active',
          origin: 'manual',
          over_plan_limit: false,
        },
      ],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ],
  limits: {
    generation_count_max: 50,
    import_rows_max: 500,
    bulk_prompts_max: 500,
    persona_max_chars: 200,
    run_context_max_chars: 2000,
    distribution_personas_max: 5,
    seed_query_ids_max: 20,
    context_list_max_entries: 20,
    audit_repetitions_min: 1,
    audit_repetitions_max: 5,
  },
};

/**
 * The rendered geometry census: what the browser DRAWS, not what the code
 * asks for.
 *
 * `check:policy` guards the inputs (tokens, classes). It cannot see a 28px
 * button beside a 32px tab, a toolbar rebinding a token, or an error block
 * that is 88px on one route and 152px on the next — and those are what made
 * the app look inconsistent. So this
 * walks every product route at the owner's viewport (982×900, DPR 1) and at
 * 1280×900 (light: dark rebinds only colours and shadows), measures every visible control, tag, tab,
 * band, section, slip and state block, and asserts ONE value per role — the same
 * literals in every configuration. The expected values are literals on
 * purpose: deriving them from the tokens would let a token edit move the
 * whole app and still pass.
 *
 * The shell fixture answers every unstubbed read with a 404, so most routes
 * settle into their read-error state; Runs is also rendered with fixture
 * rows, so table rows and status marks are measured too, and Settings
 * integrations with a connection, so neighbouring slips are measured.
 */

const ROUTES = [
  '/projects',
  '/site',
  '/issues',
  '/search-intelligence',
  '/performance',
  '/products',
  '/prompts',
  '/visibility',
  '/runs',
  '/ai-traffic',
  '/ai-traffic?tab=crawlers',
  '/ai-traffic?tab=activity',
  '/ai-traffic?tab=pages',
  '/settings',
  '/settings?tab=integrations',
  '/settings?tab=providers',
  '/settings?tab=connections',
  '/billing',
  '/actions',
  '/agent/skills',
  '/agent/context',
] as const;

/** One control height for the product: control-md, 32 in the app. */
const CONTROL_HEIGHT = 32;
/** A switch's round track: 20 (components/ui/switch.tsx). */
const SWITCH_HEIGHT = 20;
/** Tags and status marks in running content (cells, facts): 24. */
const TAG_HEIGHT = 24;
/** Text controls have one horizontal padding; icon-only controls are square, with none. */
const TEXT_CONTROL_PADDING_X = 12;
const ICON_CONTROL_PADDING_X = 0;
/** A page's tab row (`--page-tabs-height`); section tab rows are one control high. */
const PAGE_TABS_HEIGHT = 32;
/** Tabs are text on a hairline with 12 each side and 4 between; segments no padding and 16 between. */
const TAB_PADDING_X = 12;
const TAB_GAP = 4;
const SEGMENT_GAP = 16;
/** The sidebar's project and account buttons: control-lg, 44, at 982 and at 1280. */
const SIDEBAR_IDENT_HEIGHT = 44;
/**
 * The masthead and the sidebar's switcher cell end on one 52px line from the
 * top of the window, the hairline under both.
 */
const MASTHEAD_HEIGHT = 52;
/**
 * Sidebar destination rows and the group labels that fold them are 32 (on a
 * 34 pitch): rows, not controls, and their labels never wrap.
 */
const NAV_ROW_HEIGHT = 32;
/**
 * Masthead, filter strip and tab strip stack flush, each the same height on
 * every page (owner, 2026-11-18): the filter strip is 8 around its 32
 * controls, the tab strip 4 above 32 tabs. The main column is padded 32 left
 * and right (`--page-pad-inline`); the body starts 16 below the last strip.
 */
const BAND_GAP = 0;
const PAGE_PAD_INLINE = 32;
const TABS_STRIP_TOP = 4;
const TABS_STRIP_HEIGHT = 36;
const FILTER_STRIP_PADDING_Y = 8;
const FILTER_STRIP_HEIGHT = 48;
const BODY_TOP_GAP = 16;
/** The content band's sections stand 32 apart on the page surface. */
const CONTENT_GAP = 32;
/** Neighbouring slips sit on the grid, one grid gap apart. */
const SLIP_GAP = 16;
/** One card recipe (2.4) for slips: padding 16 and radius 8. */
const SLIP_INSET = 16;
const SLIP_RADIUS = 8;
/**
 * A state's height is its content. As a read error (its Notice is the box) or
 * inside a container, a state that draws no frame has no padding.
 */
const QUERY_STATE_PADDING = 0;
/**
 * A row of a title over its caption (`TableCellLines`): a two-line table holds
 * every row at 56, the title (20) + 4 + caption (16) centred in it.
 */
const TABLE_ROW_HEIGHT_TWO_LINES = 56;
/** Rows are a height with content centred in it: 4 keeps a 32 control in a 40 row. */
const TABLE_CELL_PADDING_Y = 4;
/** A DataTable's title-and-toolbar row is one control high. */
const DATA_TABLE_HEADER_HEIGHT = 32;
/** A FigureStrip cell is padded 12; a strip's cells share one height. */
const FIGURE_CELL_PADDING_Y = 12;
const FIGURE_STRIP_HEIGHT_SPREAD = 0;
/** A figure cell is two lines: 12 + label 20 + 4 + value 24 + 12. */
const FIGURE_CELL_HEIGHT = 72;
/** A work tree's status, group and grouping rows and its Show more line (Actions v3). */
const TREE_ROW_HEIGHT = 40;
/** The Icon atom's one glyph size. */
const ICON_SIZE = 16;
/** A metric card's icon tile is a 40px square, centred on the label and value lines. */
const ICON_TILE_SIZE = 40;
/** A ControlRow and an IdentityRow hold their parts 8 apart (compact-gap). */
const ROW_PART_GAP = 8;
/** A ruled fact list pads each fact 8 above and below. */
const FACT_ROW_PADDING_Y = 8;
/** A field's end target (clear, reveal) is a 24px square, WCAG 2.5.8's minimum. */
const FIELD_END_TARGET_SIZE = 24;
/** An inline code token is padded 8 across and 4 down. */
const CODE_TOKEN_PADDING_X = 8;
const CODE_TOKEN_PADDING_Y = 4;

type Box = Readonly<{ route: string; role: string; label: string; value: number }>;

/** Everything the census measures on one settled page, as role/value records. */
function measure({ route }: { route: string }) {
  const round = (value: number) => Math.round(value * 2) / 2;
  const visible = (element: Element) => {
    if (element.closest('[hidden]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };
  const label = (element: Element) =>
    (element.getAttribute('aria-label') ?? (element as HTMLElement).innerText ?? '')
      .replaceAll(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
  const px = (value: string) => round(Number.parseFloat(value) || 0);
  const records: { route: string; role: string; label: string; value: number }[] = [];
  const add = (role: string, element: Element, value: number) =>
    records.push({ route, role, label: label(element), value: round(value) });
  const all = (selector: string) => Array.from(document.querySelectorAll(selector)).filter(visible);
  const hasText = (element: Element) => ((element as HTMLElement).innerText ?? '').trim() !== '';

  // Controls the user presses. Tabs, segments and in-field affordances are
  // measured as their own roles below; a hint's enlarged hit area (negative
  // margin around a glyph) is a target, not a drawn control.
  for (const element of all('button, a[role="button"]')) {
    // A switch is its own 32×20 track (components/ui/switch.tsx), measured as
    // `switch.height` wherever it sits, a dialog included.
    if (element.getAttribute('role') === 'switch') {
      add('switch.height', element, element.getBoundingClientRect().height);
      continue;
    }
    if (element.closest('[role="tablist"], [role="radiogroup"], [role="menu"], [role="dialog"]'))
      continue;
    if (element.closest(':has(> input)')) continue;
    // The sidebar's project and account rows, and its group labels (nav rows),
    // are their own roles below.
    if (element.matches('[data-sidebar-ident], [data-sidebar-group-toggle]')) continue;
    // A checkbox is its own 16px box, and a column header's sort or hint
    // button is the header's label, measured as `data-table-header.height`.
    if (element.getAttribute('role') === 'checkbox' || element.closest('th')) continue;
    // A work tree's level rows and a pressable figure's cell are whole-row
    // targets (components/ui/work-tree.tsx, figure-strip.tsx), measured as their own roles.
    if (element.matches('[data-tree-row]')) {
      add('tree-row.height', element, element.getBoundingClientRect().height);
      continue;
    }
    if (element.matches('[data-figure-cell] > button')) {
      // The whole cell is the target: its button covers the cell exactly.
      const cell = element.parentElement?.getBoundingClientRect().height ?? 0;
      add('figure-target.gap', element, cell - element.getBoundingClientRect().height);
      continue;
    }
    const style = getComputedStyle(element);
    if (Number.parseFloat(style.marginTop) < 0) continue;
    if (
      element.getAttribute('role') === 'combobox' ||
      element.getAttribute('aria-haspopup') === 'listbox'
    )
      continue;
    const rect = element.getBoundingClientRect();
    add('button.height', element, rect.height);
    const text = Array.from(element.childNodes).some(
      (node) =>
        (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ||
        (node instanceof HTMLElement &&
          node.tagName !== 'svg' &&
          hasText(node) &&
          !node.matches('[class*="rounded-full"]')),
    );
    add(text ? 'button.padding-x.text' : 'button.padding-x.icon', element, px(style.paddingLeft));
    add('control.font-size', element, px(style.fontSize));
  }
  // A field's drawn box is the bordered frame around the native input.
  for (const input of all(
    'input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="file"]), textarea',
  )) {
    let box: Element = input;
    for (let node: Element | null = input; node; node = node.parentElement) {
      if (Number.parseFloat(getComputedStyle(node).borderTopWidth) > 0) {
        box = node;
        break;
      }
    }
    if (input.tagName !== 'TEXTAREA')
      add('input.height', input, box.getBoundingClientRect().height);
  }
  for (const element of all('select, [role="combobox"], button[aria-haspopup="listbox"]'))
    add('select.height', element, element.getBoundingClientRect().height);
  // Tabs and segmented switches are measured by their track: the tabs and
  // segments sit inside it.
  // The census routes carry only page tab rows (section rows are one control high).
  for (const element of all('[data-page-band="tabs"] [role="tablist"]'))
    add('page-tab.height', element, element.getBoundingClientRect().height);
  for (const element of all('[role="tab"]'))
    add('tab.padding-x', element, px(getComputedStyle(element).paddingLeft));
  for (const element of all('[role="tablist"]'))
    add('tab.gap', element, px(getComputedStyle(element).columnGap));
  for (const element of all('[data-segmented-track] > [role="radiogroup"]'))
    add('segment.gap', element, px(getComputedStyle(element).columnGap));
  for (const element of all(
    '[data-segmented-track], [role="radiogroup"]:not([data-segmented-track] *)',
  )) {
    add('segmented.height', element, element.getBoundingClientRect().height);
  }
  for (const element of all('[data-sidebar-ident]'))
    add('sidebar-ident.height', element, element.getBoundingClientRect().height);
  // The sidebar's switcher cell and the masthead end on one line, the rule
  // under both, scrolled or not.
  for (const element of all('[data-sidebar-ident-cell], [data-masthead]'))
    add('masthead.bottom', element, element.getBoundingClientRect().bottom);
  for (const element of all('aside a, nav a, [data-sidebar-group-toggle]')) {
    if (element.closest('[role="radiogroup"], [role="tablist"], [data-segmented-track]')) continue;
    if (!hasText(element)) continue;
    add('nav-row.height', element, element.getBoundingClientRect().height);
  }
  // Tags and status marks in running content, never inside a control.
  for (const element of all('[data-tag-kind], [data-status-tone]')) {
    if (element.closest('button, a, [role="radiogroup"], [role="tab"]')) continue;
    const display = getComputedStyle(element).display;
    if (!display.includes('flex')) continue;
    add('tag.height', element, element.getBoundingClientRect().height);
  }
  // The masthead cluster: every control on the masthead's row, the shell's
  // own (search, Ask agent) included.
  const identity = document.querySelector('[data-masthead]');
  if (identity && visible(identity)) {
    const band = identity.getBoundingClientRect();
    for (const element of all('button, a[role="button"]')) {
      const rect = element.getBoundingClientRect();
      if (rect.top >= band.top && rect.bottom <= band.bottom && rect.left >= band.left)
        add('header-cluster.height', element, rect.height);
    }
  }
  // Band rhythm: from each band to whatever band follows it.
  const bandGap = (selector: string, role: string) => {
    for (const band of all(selector)) {
      const next = band.nextElementSibling;
      if (next && visible(next))
        add(role, next, next.getBoundingClientRect().top - band.getBoundingClientRect().bottom);
    }
  };
  bandGap('[data-masthead]', 'band.gap');
  bandGap('[data-page-band="tabs"]', 'band.gap');
  bandGap('[data-page-band="filters"]', 'band.gap');
  for (const body of all('[data-page-body]'))
    add('body.top-gap', body, px(getComputedStyle(body).paddingTop));
  // Every strip is one height on every page, its content at one inset.
  for (const band of all('[data-page-band="tabs"]')) {
    add('tabs-strip.top', band, px(getComputedStyle(band).paddingTop));
    add('tabs-strip.height', band, band.getBoundingClientRect().height);
  }
  for (const band of all('[data-page-band="filters"]')) {
    const style = getComputedStyle(band);
    add('filter-strip.padding-y', band, px(style.paddingTop));
    add('filter-strip.padding-y', band, px(style.paddingBottom));
    add('filter-strip.height', band, band.getBoundingClientRect().height);
  }
  // The main column's side padding (`--page-pad-inline`).
  for (const main of all('[data-main-column]')) {
    const style = getComputedStyle(main);
    add('main.padding-x', main, px(style.paddingLeft));
    add('main.padding-x', main, px(style.paddingRight));
  }
  // Content rhythm: the gap between consecutive sections of the content band.
  for (const region of all('[data-page-content]')) {
    let previous: Element | undefined;
    for (const child of Array.from(region.children).filter(visible)) {
      if (previous) {
        const above = previous.getBoundingClientRect().bottom;
        add('content.gap', child, child.getBoundingClientRect().top - above);
      }
      previous = child;
    }
  }
  // Slips: the gap between neighbouring slips, and where their content
  // starts — the ink, not the CSS, because the same 16 can sit on the slip or
  // on a child.
  const boxes = '.surface-slip';
  // A Callout or an icon tile is a drawn box of its own: its edge is the ink, not its text.
  const isContent = (element: Element) =>
    element.matches('[data-callout-tone], [data-icon-tile]') ||
    (!element.parentElement?.closest('[data-callout-tone]') &&
      (element.matches('button, input, select, textarea, svg, img, [role="combobox"]') ||
        Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )));
  // A state nested in a container shares that container's surface and inset
  // (globals.css), so it is not a box of its own.
  const nestedState = (element: Element) =>
    element.matches('[data-state-block]') &&
    element.parentElement?.closest(`${boxes}, [role="dialog"], .table-frame`) != null;
  for (const box of all(boxes)) {
    if (nestedState(box)) continue;
    const boxStyle = getComputedStyle(box);
    add('slip.padding', box, px(boxStyle.paddingTop));
    add('slip.radius', box, px(boxStyle.borderTopLeftRadius));
    // A slip that is its list item's one child neighbours the next item's slip.
    const item = box.parentElement;
    const listed = item?.matches('li') && item.childElementCount === 1;
    const next = listed
      ? (item.nextElementSibling?.firstElementChild ?? null)
      : box.nextElementSibling;
    if (
      next?.matches(boxes) &&
      visible(next) &&
      !box.parentElement?.matches('[data-page-content]')
    ) {
      const a = box.getBoundingClientRect();
      const b = next.getBoundingClientRect();
      if (b.top >= a.bottom) add('slip.gap', next, b.top - a.bottom);
      else if (b.left >= a.right) add('slip.gap', next, b.left - a.right);
    }
    if (box.querySelector('table')) continue;
    const ink = Array.from(box.querySelectorAll('*'))
      // Visually hidden text (a clipped 1px box) is announced, not drawn.
      .filter(
        (element) =>
          visible(element) &&
          isContent(element) &&
          !element.closest('svg *') &&
          getComputedStyle(element).clipPath === 'none' &&
          getComputedStyle(element).clip !== 'rect(0px, 0px, 0px, 0px)',
      )
      .map((element) => element.getBoundingClientRect());
    if (ink.length === 0) continue;
    // Measured from the inside of the box's border, if it has one.
    const edge = box.getBoundingClientRect();
    const top = edge.top + Number.parseFloat(boxStyle.borderTopWidth);
    const left = edge.left + Number.parseFloat(boxStyle.borderLeftWidth);
    add('slip.inset-top', box, Math.min(...ink.map((rect) => rect.top)) - top);
    add('slip.inset-left', box, Math.min(...ink.map((rect) => rect.left)) - left);
  }
  for (const element of all('[data-state-block]:not([data-state-block-inline])')) {
    if (!element.matches('[data-state-frame]') && !nestedState(element))
      add('query-state.padding', element, px(getComputedStyle(element).paddingTop));
  }
  // A DataTable's title-and-toolbar row, whatever it holds; the caption under it is not part of it.
  for (const element of all('[data-data-table-header]'))
    add('data-table-header.height', element, element.getBoundingClientRect().height);
  // A FigureStrip: every cell's padding and its two-line height (a two-line
  // label or a sub line adds to it), and the cells of one strip at one
  // height (the spread between the tallest and the shortest).
  for (const element of all('[data-figure-cell]')) {
    add('figure-cell.padding-y', element, px(getComputedStyle(element).paddingTop));
    if (element.matches('[data-label-lines="2"], [data-sub-line]')) continue;
    add('figure-cell.height', element, element.getBoundingClientRect().height);
  }
  for (const row of all('dl[data-figure-strip]')) {
    const heights = Array.from(row.children)
      .filter(visible)
      .map((cell) => cell.getBoundingClientRect().height);
    if (heights.length > 1)
      add('figure-strip.height-spread', row, Math.max(...heights) - Math.min(...heights));
  }
  // The Icon atom: one glyph size beside any text, in both axes.
  for (const element of all('svg[data-icon]')) {
    const rect = element.getBoundingClientRect();
    add('icon.size', element, rect.width);
    add('icon.size', element, rect.height);
  }
  for (const element of all('[data-icon-tile]')) {
    const rect = element.getBoundingClientRect();
    add('icon-tile.size', element, rect.width);
    add('icon-tile.size', element, rect.height);
  }
  // A ControlRow's and an IdentityRow's parts: the drawn space between the
  // leading mark and the text, and (ControlRow) the gap the row keeps open
  // between the text and its controls.
  for (const row of all('[data-control-row], [data-identity-row]')) {
    const [lead] = Array.from(row.children).filter(visible);
    const parts = lead ? Array.from(lead.children).filter(visible) : [];
    const [media, text] = parts;
    if (media && text && parts.length === 2)
      add(
        'row-part.gap',
        row,
        text.getBoundingClientRect().left - media.getBoundingClientRect().right,
      );
    add('row-part.gap', row, px(getComputedStyle(row).columnGap));
  }
  // A ruled fact list: each rule has 8 on both sides — below every fact but
  // the last, above every fact but the first (the list's ends sit flush).
  for (const list of all('[data-fact-list="ruled"]')) {
    const facts = Array.from(list.children).filter(visible);
    for (const [index, fact] of facts.entries()) {
      const style = getComputedStyle(fact);
      if (index > 0) add('fact-row.padding-y', fact, px(style.paddingTop));
      if (index < facts.length - 1) add('fact-row.padding-y', fact, px(style.paddingBottom));
    }
  }
  // A field's end target, in both axes.
  for (const element of all('[data-field-end-target]')) {
    const rect = element.getBoundingClientRect();
    add('field-end-target.size', element, rect.width);
    add('field-end-target.size', element, rect.height);
  }
  for (const element of all('[data-code-token]')) {
    const style = getComputedStyle(element);
    add('code-token.padding-x', element, px(style.paddingLeft));
    add('code-token.padding-y', element, px(style.paddingTop));
  }
  // Rows only: a DataTable's state row holds a StateBlock, measured above. A
  // row of a title over its caption has its own height.
  for (const row of all('tbody tr:not([data-table-state])')) {
    if (row.querySelector('[data-cell-lines] > :nth-child(2)'))
      add('table-row.height.two-lines', row, row.getBoundingClientRect().height);
    const cell = row.querySelector('td');
    if (cell) add('table-cell.padding-y', cell, px(getComputedStyle(cell).paddingTop));
  }
  // A head label is never cut: its column's floor fits it (screen-reader-only
  // labels and the select-all box are not drawn text).
  for (const head of all('.table-frame thead th')) {
    const drawn = [head, ...head.querySelectorAll('*')].filter(
      (node) => node.clientWidth > 1 && !node.closest('[role="checkbox"]'),
    );
    add(
      'table-head.cut',
      head,
      Math.max(0, ...drawn.map((node) => node.scrollWidth - node.clientWidth)),
    );
  }
  return records;
}

/**
 * The owner's viewport and a wide one. Each settled page is loaded at the
 * first and measured at both: a reader resizing the window is shown the same
 * page, and one load per page state keeps the census affordable.
 */
const WIDTHS = [982, 1280] as const;

async function census(
  page: Page,
  route: string,
  { label = route, prepare }: { label?: string; prepare?: (page: Page) => Promise<void> } = {},
): Promise<Box[]> {
  await page.setViewportSize({ width: WIDTHS[0], height: 900 });
  await page.goto(fixtureProjectPath(route));
  await expect(page.getByRole('heading', { level: 1 })).toBeAttached();
  // Unstubbed reads answer 404, so a route that never idles is re-reading a
  // failed read forever: a product bug to fix, never a timeout to raise.
  await page.waitForLoadState('networkidle');
  await prepare?.(page);
  const records: Box[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // A resize re-renders whatever listens for it; measure the next painted frame.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(page.locator('[data-state-block="loading"], [data-skeleton]')).toHaveCount(0);
    records.push(...(await page.evaluate(measure, { route: `${label} @${width}` })));
  }
  return records;
}

/** The distinct values one role rendered, with where each came from. */
function valuesOf(records: readonly Box[], role: string) {
  const values = new Map<number, string[]>();
  for (const record of records.filter((entry) => entry.role === role)) {
    const where = values.get(record.value) ?? [];
    where.push(`${record.route} "${record.label}"`);
    values.set(record.value, where);
  }
  return values;
}

function expectOneValue(records: readonly Box[], role: string, expected: number) {
  const values = valuesOf(records, role);
  const offenders = [...values.entries()]
    .filter(([value]) => value !== expected)
    .map(([value, where]) => `${value}px: ${where.slice(0, 6).join(', ')}`);
  expect.soft(offenders, `${role} renders only ${expected}px`).toEqual([]);
  expect.soft(values.size, `${role} was measured`).toBeGreaterThan(0);
}

const RUNS = [
  { id: '44444444-4444-4444-8444-444444444441', status: 'completed', failed_count: 0 },
  { id: '44444444-4444-4444-8444-444444444442', status: 'failed', failed_count: 3 },
  { id: '44444444-4444-4444-8444-444444444443', status: 'completed', failed_count: 0 },
].map(({ id, status, failed_count }) => ({
  id,
  workspace_id: FIXTURE_PROJECT.workspace_id,
  project_id: FIXTURE_PROJECT.id,
  status,
  cancelable: false,
  benchmark_mode: 'consumer_like',
  repetitions: 3,
  random_seed: '7',
  requested_count: 3,
  completed_count: 3 - failed_count,
  failed_count,
  error_message: '',
  engine_snapshots: [],
  market: { id: null, country_code: 'US', language_code: 'en' },
  launch_id: null,
  not_applicable_engines: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  started_at: '2026-01-01T00:00:05Z',
  completed_at: '2026-01-01T00:10:00Z',
}));

/** The Owner and one member, so Settings draws the roster table with its search. */
const MEMBERS = [
  {
    id: '66666666-6666-4666-8666-666666666661',
    user_id: '22222222-2222-4222-8222-222222222222',
    email: 'shell@example.com',
    role: 'owner',
    is_self: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '66666666-6666-4666-8666-666666666662',
    user_id: '66666666-6666-4666-8666-666666666663',
    email: 'analyst@example.com',
    role: 'member',
    is_self: false,
    created_at: '2026-01-02T00:00:00Z',
  },
];

/** A Search Console connection, so Settings draws its integration slips. */
const CONNECTIONS = [
  {
    id: '55555555-5555-4555-8555-555555555551',
    workspace_id: FIXTURE_PROJECT.workspace_id,
    grant_id: '55555555-5555-4555-8555-555555555552',
    provider: 'gsc',
    label: 'example.com GSC',
    account_ref: 'sc-domain:example.com',
    grant_status: 'connected',
    granted_scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    last_synced_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

// One theme, at both widths (WIDTHS). The dark theme rebinds colour and
// shadow tokens only (globals.css), neither of which moves a box, so a
// second pass in it measured the same geometry again.
test.describe('light theme', () => {
  test.use({ deviceScaleFactor: 1, colorScheme: 'light' });

  test('every product route renders one value per geometric role', async ({ page }) => {
    test.setTimeout(240_000);
    // With no stored choice the theme follows the emulated device scheme.
    await expectOneGeometry(page);
  });
});

async function expectOneGeometry(page: Page) {
  await stubAuthedShell(page);
  const records: Box[] = [];
  for (const route of ROUTES) records.push(...(await census(page, route)));

  // A list route with rows, so table rows and status marks are measured.
  await stubAuthedShell(page, [[/\/api\/v1\/audits(\?.*)?$/, RUNS]]);
  records.push(...(await census(page, '/runs', { label: '/runs (rows)' })));

  // One run's detail, so a FigureStrip (the run's progress figures) is measured.
  const [run] = RUNS;
  if (!run) throw new Error('the runs fixture has a first run');
  await stubAuthedShell(page, [
    [new RegExp(String.raw`/api/v1/audits/${run.id}$`), run],
    [new RegExp(String.raw`/api/v1/audits/${run.id}/executions(\?.*)?$`), []],
  ]);
  records.push(...(await census(page, `/runs/${run.id}`, { label: '/runs/:id (detail)' })));

  // Neighbouring slips, so the slip → slip gap is measured, not assumed.
  await stubAuthedShell(page, [[/\/api\/v1\/integrations(\?.*)?$/, CONNECTIONS]]);
  records.push(
    ...(await census(page, '/settings?tab=integrations', {
      label: '/settings integrations (cards)',
    })),
  );

  // The member roster: a DataTable whose header row holds its search, so the
  // header is measured now that list titles sit in their card's head.
  const workspace = FIXTURE_PROJECT.workspace_id;
  await stubAuthedShell(page, [
    [new RegExp(String.raw`/api/v1/workspaces/${workspace}/members(\?.*)?$`), MEMBERS],
    [new RegExp(String.raw`/api/v1/workspaces/${workspace}/invitations(\?.*)?$`), []],
  ]);
  records.push(
    ...(await census(page, '/settings?tab=workspace', { label: '/settings workspace (roster)' })),
  );

  // Two skills in one group, so neighbouring slips are measured.
  const [skill] = skills.skills;
  if (!skill) throw new Error('the skills fixture has a skill');
  await stubAuthedShell(page, [
    [
      /\/api\/v1\/agent\/skills$/,
      { ...skills, skills: [skill, { ...skill, id: 'gsc_titles', label: 'Title rewrites' }] },
    ],
  ]);
  records.push(...(await census(page, '/agent/skills', { label: '/agent/skills (slips)' })));

  // A search holding a value, so its end target (Clear search) is drawn. The
  // library needs a prompt: an empty or failed one draws no search at all.
  await stubAuthedShell(page, [['**/api/v1/prompt-sets?*', PROMPT_SETS]]);
  records.push(
    ...(await census(page, '/prompts', {
      label: '/prompts (searched)',
      prepare: async (current) => {
        await current.getByRole('searchbox').first().fill('pricing');
        await expect(current.getByRole('button', { name: 'Clear search' })).toBeVisible();
      },
    })),
  );

  // The account menu open, so its ThemeSwitch (the one control-sm atom) is drawn.
  records.push(
    ...(await census(page, '/projects', {
      label: '/projects (account menu)',
      prepare: async (current) => {
        await current.getByRole('button', { name: /^Account menu/ }).click();
        await expect(
          current.getByRole('button', { name: /^Switch to (?:light|dark) theme$/ }),
        ).toBeVisible();
        // The menu grows from 96% as it opens: measure it at rest, not mid-scale.
        await current
          .getByRole('menu')
          .evaluate((menu) => Promise.all(menu.getAnimations().map((motion) => motion.finished)));
      },
    })),
  );

  // The project edit panel open, so its mention-rule Switch is drawn.
  records.push(
    ...(await census(page, '/agent/context?tab=competitors', {
      label: '/agent/context (edit panel)',
      prepare: async (current) => {
        await current.getByRole('button', { name: 'Edit competitors' }).click();
        // An ordinary brand name keeps its mention rule behind a disclosure.
        await current.locator('summary', { hasText: 'Mention rule' }).first().click();
        await expect(current.getByRole('switch').first()).toBeVisible();
      },
    })),
  );

  expectOneValue(records, 'button.height', CONTROL_HEIGHT);
  expectOneValue(records, 'switch.height', SWITCH_HEIGHT);
  expectOneValue(records, 'tree-row.height', TREE_ROW_HEIGHT);
  expectOneValue(records, 'figure-target.gap', 0);
  expectOneValue(records, 'input.height', CONTROL_HEIGHT);
  expectOneValue(records, 'select.height', CONTROL_HEIGHT);
  expectOneValue(records, 'page-tab.height', PAGE_TABS_HEIGHT);
  expectOneValue(records, 'segmented.height', CONTROL_HEIGHT);
  expectOneValue(records, 'nav-row.height', NAV_ROW_HEIGHT);
  expectOneValue(records, 'header-cluster.height', CONTROL_HEIGHT);
  expectOneValue(records, 'control.font-size', 14);
  expectOneValue(records, 'tag.height', TAG_HEIGHT);
  expectOneValue(records, 'button.padding-x.text', TEXT_CONTROL_PADDING_X);
  expectOneValue(records, 'button.padding-x.icon', ICON_CONTROL_PADDING_X);
  expectOneValue(records, 'tab.padding-x', TAB_PADDING_X);
  expectOneValue(records, 'tab.gap', TAB_GAP);
  expectOneValue(records, 'segment.gap', SEGMENT_GAP);
  expectOneValue(records, 'sidebar-ident.height', SIDEBAR_IDENT_HEIGHT);
  expectOneValue(records, 'masthead.bottom', MASTHEAD_HEIGHT);
  expectOneValue(records, 'band.gap', BAND_GAP);
  expectOneValue(records, 'body.top-gap', BODY_TOP_GAP);
  expectOneValue(records, 'tabs-strip.top', TABS_STRIP_TOP);
  expectOneValue(records, 'tabs-strip.height', TABS_STRIP_HEIGHT);
  expectOneValue(records, 'filter-strip.padding-y', FILTER_STRIP_PADDING_Y);
  expectOneValue(records, 'filter-strip.height', FILTER_STRIP_HEIGHT);
  expectOneValue(records, 'main.padding-x', PAGE_PAD_INLINE);
  expectOneValue(records, 'content.gap', CONTENT_GAP);
  expectOneValue(records, 'slip.gap', SLIP_GAP);
  expectOneValue(records, 'slip.padding', SLIP_INSET);
  expectOneValue(records, 'slip.radius', SLIP_RADIUS);
  expectOneValue(records, 'slip.inset-top', SLIP_INSET);
  expectOneValue(records, 'slip.inset-left', SLIP_INSET);
  expectOneValue(records, 'query-state.padding', QUERY_STATE_PADDING);
  expectOneValue(records, 'table-row.height.two-lines', TABLE_ROW_HEIGHT_TWO_LINES);
  expectOneValue(records, 'table-cell.padding-y', TABLE_CELL_PADDING_Y);
  expectOneValue(records, 'table-head.cut', 0);
  expectOneValue(records, 'data-table-header.height', DATA_TABLE_HEADER_HEIGHT);
  expectOneValue(records, 'figure-cell.padding-y', FIGURE_CELL_PADDING_Y);
  expectOneValue(records, 'figure-strip.height-spread', FIGURE_STRIP_HEIGHT_SPREAD);
  expectOneValue(records, 'figure-cell.height', FIGURE_CELL_HEIGHT);
  expectOneValue(records, 'icon.size', ICON_SIZE);
  expectOneValue(records, 'icon-tile.size', ICON_TILE_SIZE);
  expectOneValue(records, 'row-part.gap', ROW_PART_GAP);
  expectOneValue(records, 'fact-row.padding-y', FACT_ROW_PADDING_Y);
  expectOneValue(records, 'field-end-target.size', FIELD_END_TARGET_SIZE);
  expectOneValue(records, 'code-token.padding-x', CODE_TOKEN_PADDING_X);
  expectOneValue(records, 'code-token.padding-y', CODE_TOKEN_PADDING_Y);
}
