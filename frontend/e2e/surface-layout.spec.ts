import { expect, test } from '@playwright/test';

import { FIXTURE_PROJECT, fixtureProjectPath, stubAuthedShell } from './helpers/app-fixture';

const evidence = {
  state: 'observed',
  observed_at: '2026-09-26T10:00:00Z',
  freshness: 'current',
  coverage: ['gsc'],
  limitations: [],
};
const overview = {
  project: FIXTURE_PROJECT,
  facts: {
    industry: 'Software',
    description: 'Analytics for growth teams',
    positioning: 'Evidence-led analytics',
    // A long offering must cut inside its chip, never widen the page.
    products_services: [
      'AI Visibility tracking (brand mentions, position, sentiment and competitors across AI answers and search engines)',
      'Analytics',
    ],
    target_audience: 'Growth teams',
    competitors: [],
  },
  loop: {
    connected: evidence,
    analyzed: evidence,
    acted: { ...evidence, state: 'not_run', observed_at: null, coverage: [], freshness: 'unknown' },
    tracked: evidence,
  },
  next_action: {
    kind: 'monitor',
    title: 'No open Action — watch the trend',
    href: '/visibility?tab=trends',
    opportunity_id: null,
  },
  track: {
    citation_share: { value: 32.5, delta: 2.1 },
    engine_coverage: 2,
    observed_at: evidence.observed_at,
    limitations: [],
  },
  // A measured run, so Overview draws its widgets rather than the start card.
  measurement: {
    audit_id: '33333333-3333-4333-8333-333333333333',
    completed_at: evidence.observed_at,
    benchmark_mode: 'consumer_like',
    logical_engines: ['chatgpt', 'perplexity'],
    comparable_audit_id: null,
    comparison_status: 'no_baseline',
    comparison_answers: null,
    metric_snapshot_id: null,
    analyzer_version: null,
    scoring_rule_version: null,
  },
  state: {
    visibility: { value: 72.5, delta: 4.2 },
    share_of_voice: { value: 48.1, delta: 3.1 },
    brand_rank: { value: 2, delta: -1 },
  },
  movements: [
    { label: 'visibility', direction: 'positive', current: 72.5, previous: 68.3, delta: 4.2 },
  ],
  active_prompt_count: 1,
  actions: [],
  action_order_version: 0,
  resolved_actions: { since_audit_id: null, count: 0, titles: [] },
  report_available: false,
  stale: false,
};
// The default layout, so Overview lays out today's sections.
const layout = {
  widgets: [
    { key: 'project_state', size: 'half' },
    { key: 'citation_share', size: 'half' },
    { key: 'movement', size: 'half' },
    { key: 'next_action', size: 'half' },
    { key: 'missing_prompts', size: 'full' },
    { key: 'ranked_actions', size: 'half' },
    { key: 'progress_proof', size: 'half' },
    { key: 'company_facts', size: 'full' },
  ],
  version: 0,
  customized: false,
  updated_at: null,
};
const catalog = {
  maximum_competitors: 5,
  industries: ['General'],
  subindustries: { General: [] },
};

test('working surfaces preserve their actions without viewport overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 1024, 982, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/projects', '/onboarding', '/agent']) {
      await stubAuthedShell(
        page,
        [
          [`**/api/v1/projects/${FIXTURE_PROJECT.id}/command-center`, overview],
          [`**/api/v1/projects/${FIXTURE_PROJECT.id}/overview/layout`, layout],
          ['**/api/v1/brand-discovery-catalog', catalog],
        ],
        route === '/onboarding' ? [] : [FIXTURE_PROJECT],
      );
      await page.goto(route === '/onboarding' ? route : fixtureProjectPath(route));
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toBeVisible();
      if (route === '/projects')
        await expect(page.getByText('No open Action — watch the trend')).toBeVisible();
      if (route === '/onboarding') {
        await expect(page.getByLabel(/^Brand name/)).toBeVisible();
        const logo = await page.getByRole('link', { name: 'CiteLadder home' }).boundingBox();
        const progress = await page.getByRole('region', { name: 'Setup progress' }).boundingBox();
        expect(
          logo &&
            progress &&
            (logo.x + logo.width <= progress.x || logo.y + logo.height <= progress.y),
        ).toBeTruthy();
      }
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${route} at ${width}px must fit the viewport`,
      ).toBe(true);
    }
  }
});

test('long segments stay on one row and keyboard focus reveals the selected option', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAuthedShell(page, [
    [
      `**/api/v1/projects/${FIXTURE_PROJECT.id}/performance?*`,
      {
        project_id: FIXTURE_PROJECT.id,
        range: 'last_synced',
        granularity: 'day',
        compare: 'none',
        selected: {
          snapshot_id: null,
          window_start: '',
          window_end: '',
          evidence_state: 'not_run',
          totals: {
            clicks: null,
            impressions: null,
            ctr: null,
            position: null,
            sessions: null,
            key_events: null,
          },
          series: { clicks: [], impressions: [], ctr: [], position: [] },
        },
        comparison: null,
        // Imported history, so the range controls draw (before any history the
        // empty state holds the one step and there is no range to choose).
        coverage: { earliest_date: '2026-01-01', latest_date: '2026-01-28', covered_days: 28 },
        dimension_counts: {
          query: 0,
          page: 0,
          country: 0,
          device: 0,
          search_appearance: 0,
          day: 0,
          bing_query: 0,
          bing_page: 0,
        },
        unavailable_dimensions: ['search_appearance'],
        formula_version: 'traffic-formula-1',
        normalization_version: 'traffic-normalization-1',
      },
    ],
  ]);
  await page.goto(fixtureProjectPath('/performance'));
  const options = page.getByRole('radiogroup', { name: 'Date range' }).getByRole('radio');
  await expect(options).toHaveCount(3);
  // Stress the existing control with longer labels without changing product copy.
  await options.evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.firstChild!.textContent += ' reporting interval';
    }),
  );
  await options.first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(options.last()).toBeFocused();
  await expect(options.last()).toHaveAttribute('aria-checked', 'true');
  const geometry = await options.last().evaluate((node) => {
    const track = node.parentElement!.parentElement!;
    const option = node.getBoundingClientRect();
    const rail = track.getBoundingClientRect();
    return {
      visible: option.left >= rail.left && option.right <= rail.right,
      scrolled: track.scrollLeft > 0,
    };
  });
  expect(geometry).toEqual({ visible: true, scrolled: true });
  const tops = await options.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().top),
  );
  expect(new Set(tops).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('choosing a filter never moves the table below it', async ({ page }) => {
  await page.setViewportSize({ width: 982, height: 900 });
  await stubAuthedShell(page, [
    [
      `**/api/v1/projects/${FIXTURE_PROJECT.id}/actions?*`,
      {
        items: [],
        next_cursor: null,
        status_counts: { open: 1, in_progress: 2 },
        group_counts: { fix_site: 0, own_pages: 0, earned: 0, products: 0 },
      },
    ],
  ]);
  await page.goto(fixtureProjectPath('/actions'));
  const table = page.getByRole('region', { name: 'Actions' });
  await expect(table.getByText('No open Actions')).toBeVisible();
  const top = async () => Math.round((await table.boundingBox())!.y);
  const before = await top();
  await page.getByRole('button', { name: /^Priority/ }).click();
  await page.getByRole('menuitemradio', { name: 'High' }).click();
  await expect(table.getByText('No Actions match these filters')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('priority')).toBe('high');
  expect(await top()).toBe(before);
});

test('on a phone the Actions table fills its card and the row title link fills its cell', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const action = {
    id: '00000000-0000-4000-8000-0000000000a1',
    project_id: FIXTURE_PROJECT.id,
    target_kind: 'earned_page',
    target_label: 'example.org/tools/best-coffee-subscriptions-for-beginners',
    target_url: 'https://example.org/tools/best-coffee-subscriptions-for-beginners',
    target_prompt_id: null,
    origin: 'evidence',
    status: 'open',
    priority_score: 140,
    priority_band: 'high',
    families: ['sources'],
    approach: 'earned_placement',
    group: 'earned',
    skill_id: 'earned_authority',
    member_count: 1,
    declarable_member_count: 1,
    handoff: { context: 'action', message: 'Draft a request to be listed.' },
    evidence_cleared_at: null,
    created_at: '2026-08-28T00:00:00Z',
    updated_at: '2026-08-28T00:00:00Z',
  };
  await stubAuthedShell(page, [
    [
      `**/api/v1/projects/${FIXTURE_PROJECT.id}/actions?*`,
      {
        items: [action],
        next_cursor: null,
        status_counts: { open: 1 },
        group_counts: { fix_site: 0, own_pages: 0, earned: 1, products: 0 },
      },
    ],
  ]);
  await page.goto(fixtureProjectPath('/actions'));
  const card = page.getByRole('region', { name: 'Actions' });
  await expect(card.getByRole('link', { name: /^example\.org\/tools/ })).toBeVisible();
  const geometry = await card.evaluate((section) => {
    const table = section.querySelector('table')!;
    const cell = table.querySelector('tbody td:has(a[href])')!;
    // The goal strip and tree headers put the first row below a phone's fold;
    // `elementFromPoint` only sees the viewport.
    cell.scrollIntoView({ block: 'center' });
    const box = cell.getBoundingClientRect();
    const title = cell.querySelector('[data-row-title]')!;
    // The cell's bottom padding at its far end, clear of the link's text and of
    // the card's rounded corner, still opens the Action.
    const corner = document.elementFromPoint(box.right - 16, box.bottom - 3);
    return {
      tableWidth: Math.round(table.getBoundingClientRect().width),
      cardInner: section.clientWidth,
      cornerIsLink: corner?.closest('a[href]') != null,
      titleLines: Math.round(
        title.getBoundingClientRect().height /
          Number.parseFloat(getComputedStyle(title).lineHeight),
      ),
      cellAtLeast44: box.height >= 44,
    };
  });
  expect(geometry).toEqual({
    tableWidth: geometry.cardInner,
    cardInner: geometry.cardInner,
    cornerIsLink: true,
    titleLines: 2,
    cellAtLeast44: true,
  });
});

test('invalid field edges survive keyboard focus in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubAuthedShell(page, [['**/api/v1/brand-discovery-catalog', catalog]], []);
  await page.goto('/onboarding');
  const field = page.getByLabel(/^Brand name/);
  await expect(field).toBeVisible();
  // A script focus shows the caret only (input-modality.ts); the reader's Tab draws the ring.
  const tabInto = async () => {
    await field.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(field).toBeFocused();
  };
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await field.evaluate((node) => {
      node.removeAttribute('aria-invalid');
      node.blur();
    });
    const ordinaryEdge = await field.evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished));
      return getComputedStyle(node).borderColor;
    });
    await tabInto();
    const ordinaryRing = await field.evaluate((node) => getComputedStyle(node).outlineColor);
    expect(await field.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
    // Isolate the primitive's rendering contract from form validation policy.
    await field.evaluate((node) => {
      node.setAttribute('aria-invalid', 'true');
      node.blur();
    });
    const edge = await field.evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished));
      return getComputedStyle(node).borderColor;
    });
    expect(edge).not.toBe(ordinaryEdge);
    expect(await field.evaluate((node) => getComputedStyle(node).borderStyle)).not.toBe('none');
    await tabInto();
    const focused = await field.evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished));
      const style = getComputedStyle(node);
      return {
        edge: style.borderColor,
        outline: style.outlineStyle,
        width: style.outlineWidth,
        offset: style.outlineOffset,
        ring: style.outlineColor,
        halo: style.boxShadow,
      };
    });
    // The danger edge survives focus inside the one focus treatment every
    // field shares: the 2px ink ring 2px outside it,
    // never crimson and never a halo.
    expect(focused.edge).toBe(edge);
    expect(focused).toMatchObject({ outline: 'solid', width: '2px', offset: '2px' });
    expect(focused.ring).toBe(ordinaryRing);
    expect(focused.ring).not.toBe(edge);
    expect(focused.halo).toBe('none');
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await field.focus();
  expect(await field.evaluate((node) => getComputedStyle(node).borderStyle)).toBe('solid');
});

test('password and Agent text entry paint one focus boundary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: { message: 'Not authenticated' } } }),
  );
  await page.goto('/login');
  const password = page.getByLabel(/^Password/);
  const frame = password.locator('..');
  const restingEdge = await frame.evaluate((node) => getComputedStyle(node).borderColor);
  await password.click();
  await expect(password).toBeFocused();
  // One boundary: the frame draws the 2px ink ring around the input and its
  // end target; the input inside draws no ring of its own, and nothing a halo.
  const ring = await frame.evaluate((node) => {
    const style = getComputedStyle(node);
    return { outline: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
  expect(ring).toMatchObject({ outline: 'solid', width: '2px' });
  expect(await password.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
  expect(await frame.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
  await page.keyboard.press('Tab');
  const reveal = page.getByRole('button', { name: 'Show Password' });
  await expect(reveal).toBeFocused();
  // The end target keeps a ring of its own.
  expect(await reveal.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');

  // A framed invalid field keeps its danger edge while it holds focus.
  await password.evaluate((node) => node.setAttribute('aria-invalid', 'true'));
  const invalidEdge = await frame.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished));
    return getComputedStyle(node).borderColor;
  });
  expect(invalidEdge).not.toBe(restingEdge);
  await password.focus();
  await expect(password).toBeFocused();
  await expect(async () => {
    expect(await frame.evaluate((node) => getComputedStyle(node).borderColor)).toBe(invalidEdge);
  }).toPass();
  expect(await frame.evaluate((node) => getComputedStyle(node).outlineColor)).toBe(ring.color);
  await password.evaluate((node) => node.removeAttribute('aria-invalid'));

  await stubAuthedShell(page);
  await page.goto(fixtureProjectPath('/agent'));
  const prompt = page.locator('textarea');
  const form = prompt.locator('xpath=ancestor::form');
  const inputEdge = await prompt.evaluate((node) => getComputedStyle(node).borderColor);
  await prompt.click();
  await expect(prompt).toBeFocused();
  // The composer is the box: its frame takes the same ink ring as the
  // password frame above.
  expect(await form.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
  expect(await form.evaluate((node) => getComputedStyle(node).outlineColor)).toBe(ring.color);
  expect(await form.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
  // One boundary: the field inside draws no edge, halo or outline of its own.
  expect(await prompt.evaluate((node) => getComputedStyle(node).borderColor)).toBe(inputEdge);
  expect(await prompt.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
  expect(await prompt.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
});
