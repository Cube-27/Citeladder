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
 * whose padding differs from its neighbour's, and those are what made the app
 * look inconsistent. So each test loads one product page state at the owner's
 * viewport (982×900, DPR 1), measures it there and at 1280×900, and asserts
 * role-level invariants: one value per role, controls one height with the
 * shell's own, strips flush and one height, a box's content at its padding,
 * nothing cut or overflowing, and the geometry still two frames later. The
 * design's pixel values live in the tokens; this file holds none of them.
 *
 * The shell fixture answers every unstubbed read with a 404, so most routes
 * settle into their read-error state; the stubbed states below draw rows,
 * figures, neighbouring slips, a searched field and an open panel.
 */

/** Roles the shell draws on every product route. */
const SHELL_ROLES = [
  'masthead.bottom',
  'nav-row.height',
  'header-cluster.height',
  'main.padding-x',
  'button.height',
] as const;
/** Every control is one height: the shell's masthead cluster sets it for the page. */
const CONTROL_ROLES = [
  'header-cluster.height',
  'button.height',
  'input.height',
  'select.height',
  'segmented.height',
  'scroll-step.height',
  'data-table-header.height',
] as const;
/** Masthead, tab strip and filter strip stack flush, each strip one height, its tabs filling it. */
const STRIP_ROLES = ['page-tab.height', 'tabs-strip.height', 'filter-strip.height'] as const;
/** A slip's content starts at its padding, on both axes. */
const SLIP_INSET_ROLES = ['slip.padding', 'slip.inset-top', 'slip.inset-left'] as const;
/**
 * Roles whose only right value is none: flush bands, square icon-only
 * controls, frameless states, whole-cell figure targets, one-height figure
 * strips, uncut head labels and no sideways page scroll.
 */
const NONE_ROLES = [
  'band.gap',
  'tabs-strip.top',
  'button.padding-x.icon',
  'query-state.padding',
  'figure-target.gap',
  'figure-strip.height-spread',
  'table-head.cut',
  'page.overflow-x',
] as const;
/** WCAG 2.5.8's minimum target, for a field's end target (clear, reveal). */
const MIN_TARGET_SIZE = 24;

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
    // A wide table's pair of sideways steppers are 28px glyph buttons
    // (`ScrollSteppers`, components/ui/scroll-edges.tsx), measured as
    // `scroll-step.height`; a tab row's edge steppers are 28 controls.
    if (element.matches('[data-scroll-steppers] > [data-scroll-step]')) {
      add('scroll-step.height', element, element.getBoundingClientRect().height);
      continue;
    }
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
    // A record page's trail is a line of text links in the masthead, not a nav row.
    if (element.closest('nav[aria-label="Breadcrumb"]')) continue;
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
    // A view shares the strip's one row (owner, 2026-11-19), so every strip is one height.
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
  // Setting rows: each rule has 12 on both sides; the list's ends sit flush.
  for (const list of all('[data-setting-rows]')) {
    const rows = Array.from(list.children).filter(visible);
    for (const [index, row] of rows.entries()) {
      const style = getComputedStyle(row);
      if (index > 0) add('setting-row.padding-y', row, px(style.paddingTop));
      if (index < rows.length - 1) add('setting-row.padding-y', row, px(style.paddingBottom));
    }
  }
  // A field's end target, in both axes.
  for (const element of all('[data-field-end-target]')) {
    const rect = element.getBoundingClientRect();
    add('field-end-target.size', element, rect.width);
    add('field-end-target.size', element, rect.height);
    // Its tap area (`hit-area`): the drawn size here, 44 for touch (surface-layout-actions).
    const hit = getComputedStyle(element, '::before');
    add('field-end-target.hit', element, px(hit.width));
    add('field-end-target.hit', element, px(hit.height));
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
  // The page never scrolls sideways; a wide table scrolls inside its own frame.
  const root = document.documentElement;
  add('page.overflow-x', root, root.scrollWidth - root.clientWidth);
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
  const nextFrame = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  const records: Box[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // A resize re-renders whatever listens for it; measure the next painted frame.
    await nextFrame();
    await expect(page.locator('[data-state-block="loading"], [data-skeleton]')).toHaveCount(0);
    const route = `${label} @${width}`;
    const settled = await page.evaluate(measure, { route });
    // A settled page holds still: nothing shifts once it has painted.
    await nextFrame();
    expect.soft(await page.evaluate(measure, { route }), `${route} holds still`).toEqual(settled);
    records.push(...settled);
  }
  return records;
}

/** The distinct values one role rendered, with where each came from. */
function valuesOf(records: readonly Box[], roles: readonly string[]) {
  const values = new Map<number, string[]>();
  for (const record of records.filter((entry) => roles.includes(entry.role))) {
    const where = values.get(record.value) ?? [];
    where.push(`${record.role} ${record.route} "${record.label}"`);
    values.set(record.value, where);
  }
  return values;
}

const describeValues = (values: ReadonlyMap<number, string[]>) =>
  [...values.entries()].map(([value, where]) => `${value}px: ${where.slice(0, 4).join(', ')}`);

/** The roles render one value between them, at both widths. */
function expectOneValue(records: readonly Box[], roles: readonly string[]) {
  const values = valuesOf(records, roles);
  if (values.size > 1)
    expect.soft(describeValues(values), `${roles.join(' = ')} render one value`).toEqual([]);
}

function expectNone(records: readonly Box[], role: string) {
  const values = valuesOf(records, [role]);
  values.delete(0);
  expect.soft(describeValues(values), `${role} is always 0`).toEqual([]);
}

/** Every invariant over one page state; `required` names the roles the state exists to draw. */
function expectRoleInvariants(records: readonly Box[], required: readonly string[] = []) {
  const measured = new Set(records.map((entry) => entry.role));
  const missing = [...SHELL_ROLES, ...required].filter((role) => !measured.has(role));
  expect.soft(missing, 'every expected role was measured').toEqual([]);
  for (const role of measured) expectOneValue(records, [role]);
  expectOneValue(records, CONTROL_ROLES);
  expectOneValue(records, STRIP_ROLES);
  expectOneValue(records, SLIP_INSET_ROLES);
  expectOneValue(records, ['field-end-target.size', 'field-end-target.hit']);
  for (const role of NONE_ROLES) expectNone(records, role);
  const small = [...valuesOf(records, ['field-end-target.size']).keys()].filter(
    (value) => value < MIN_TARGET_SIZE,
  );
  expect.soft(small, `a field end target is at least ${MIN_TARGET_SIZE}px`).toEqual([]);
}

/** The latest figures for the fixture's one prompt (`PROMPT_SETS`). */
const PROMPT_METRIC = {
  id: '44444444-4444-4444-8444-000000000003',
  audit_id: '44444444-4444-4444-8444-444444444441',
  prompt_id: '44444444-4444-4444-8444-000000000002',
  prompt_index: 0,
  prompt_text: 'Best pricing tools for small teams',
  cohort: 'core',
  composite_score: null,
  previous_score: null,
  immediate_delta: null,
  rolling_four: [],
  per_engine_scores: {},
  components: {},
  engine_agreement: 1,
  repetition_agreement: 1,
  evidence_coverage: 1,
  trend_confidence: 1,
  decline_confirmed: false,
  analyzer_version: 'v1',
  scoring_rule_version: 'v1',
  created_at: '2026-08-01T00:00:00Z',
  visibility_rate: 0.5,
  owned_citation_rate: 0.25,
  avg_position: null,
  visibility_delta: null,
  mentions: 0,
  brands: [],
};

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

type PageState = Readonly<{
  route: string;
  label?: string;
  stubs?: Parameters<typeof stubAuthedShell>[1];
  /** Roles this state exists to draw, beyond the shell's own. */
  required?: readonly string[];
  prepare?: (page: Page) => Promise<void>;
}>;

const [run] = RUNS;
const [skill] = skills.skills;
const workspace = FIXTURE_PROJECT.workspace_id;

/**
 * Each product page state, by route group. Unstubbed reads settle into their
 * read-error state; a stubbed state draws what its comment names.
 */
const ROUTE_GROUPS: Readonly<Record<string, readonly PageState[]>> = {
  projects: [
    { route: '/projects' },
    {
      // The account menu open, so its ThemeSwitch is drawn.
      route: '/projects',
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
    },
  ],
  'site health and search': [
    { route: '/site' },
    { route: '/issues' },
    { route: '/search-intelligence' },
    { route: '/performance' },
    { route: '/products' },
  ],
  visibility: [
    { route: '/prompts' },
    { route: '/visibility' },
    {
      // A search holding a value, so its end target (Clear search) is drawn. The
      // library needs a prompt: an empty or failed one draws no search at all.
      route: '/prompts',
      label: '/prompts (searched)',
      stubs: [['**/api/v1/prompt-sets?*', PROMPT_SETS]],
      required: ['field-end-target.size'],
      prepare: async (current) => {
        await current.getByRole('searchbox').first().fill('pricing');
        await expect(current.getByRole('button', { name: 'Clear search' })).toBeVisible();
      },
    },
    {
      // A measured prompt: the figure and mark columns' floors pass the 982
      // column, so the table scrolls sideways behind its steppers.
      route: '/prompts',
      label: '/prompts (measured)',
      stubs: [
        ['**/api/v1/prompt-sets?*', PROMPT_SETS],
        [/\/visibility\/prompts(\?.*)?$/, [PROMPT_METRIC]],
      ],
      required: ['scroll-step.height'],
    },
  ],
  runs: [
    { route: '/runs' },
    {
      // Rows, so table rows and status marks are measured.
      route: '/runs',
      label: '/runs (rows)',
      stubs: [[/\/api\/v1\/audits(\?.*)?$/, RUNS]],
      required: ['table-cell.padding-y', 'tag.height'],
    },
    {
      // One run's detail, so a FigureStrip (its progress figures) is measured.
      route: `/runs/${run?.id}`,
      label: '/runs/:id (detail)',
      stubs: [
        [new RegExp(String.raw`/api/v1/audits/${run?.id}$`), run],
        [new RegExp(String.raw`/api/v1/audits/${run?.id}/executions(\?.*)?$`), []],
      ],
      required: ['figure-cell.padding-y', 'figure-strip.height-spread'],
    },
  ],
  'ai traffic': [
    { route: '/ai-traffic' },
    { route: '/ai-traffic?tab=crawlers' },
    { route: '/ai-traffic?tab=activity' },
    { route: '/ai-traffic?tab=pages' },
  ],
  settings: [
    { route: '/settings' },
    { route: '/settings?tab=integrations' },
    { route: '/settings?tab=providers' },
    { route: '/settings?tab=connections' },
    { route: '/billing' },
    {
      // A connection, so neighbouring slips are measured, not assumed.
      route: '/settings?tab=integrations',
      label: '/settings integrations (cards)',
      stubs: [[/\/api\/v1\/integrations(\?.*)?$/, CONNECTIONS]],
      required: ['slip.gap'],
    },
    {
      // The member roster: a DataTable whose header row holds its search.
      route: '/settings?tab=workspace',
      label: '/settings workspace (roster)',
      stubs: [
        [new RegExp(String.raw`/api/v1/workspaces/${workspace}/members(\?.*)?$`), MEMBERS],
        [new RegExp(String.raw`/api/v1/workspaces/${workspace}/invitations(\?.*)?$`), []],
      ],
      required: ['data-table-header.height', 'input.height'],
    },
  ],
  agent: [
    { route: '/actions' },
    { route: '/agent/skills' },
    { route: '/agent/context' },
    {
      // Two skills in one group, so neighbouring slips are measured.
      route: '/agent/skills',
      label: '/agent/skills (slips)',
      stubs: [
        [
          /\/api\/v1\/agent\/skills$/,
          { ...skills, skills: [skill, { ...skill, id: 'gsc_titles', label: 'Title rewrites' }] },
        ],
      ],
      required: ['slip.gap'],
    },
    {
      // The project edit panel open, so its mention-rule Switch is drawn.
      route: '/agent/context?tab=competitors',
      label: '/agent/context (edit panel)',
      required: ['switch.height'],
      prepare: async (current) => {
        await current.getByRole('button', { name: 'Edit competitors' }).click();
        // An ordinary brand name keeps its mention rule behind a disclosure.
        await current.locator('summary', { hasText: 'Mention rule' }).first().click();
        await expect(current.getByRole('switch').first()).toBeVisible();
      },
    },
  ],
};

// One theme, at both widths (WIDTHS). The dark theme rebinds colour and
// shadow tokens only (globals.css), neither of which moves a box. With no
// stored choice the theme follows the emulated device scheme.
test.use({ deviceScaleFactor: 1, colorScheme: 'light' });

for (const [group, states] of Object.entries(ROUTE_GROUPS)) {
  test.describe(`geometry: ${group}`, () => {
    for (const { route, label = route, stubs, required, prepare } of states) {
      test(`${label} keeps its role invariants`, async ({ page }) => {
        await stubAuthedShell(page, stubs);
        expectRoleInvariants(await census(page, route, { label, prepare }), required);
      });
    }
  });
}
