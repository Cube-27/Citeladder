import { expect, test } from '@playwright/test';

import { FIXTURE_PROJECT, fixtureProjectPath, stubAuthedShell } from './helpers/app-fixture';

/**
 * Content screen stubbed e2e (Task 5).
 *
 * All backend calls are stubbed at the network layer (mirrors
 * `providers.spec.ts`) so the spec runs without a live backend. Covers: the
 * live "Content" nav link, the enqueue → poll → rendered-Markdown happy path,
 * and the cancel flow. Markdown SANITISATION is not proved here — the fixture
 * output is benign; `lib/content/markdown.test.tsx` pins it against hostile
 * input, and `content-integration.spec.ts` proves it end-to-end against a real
 * worker + mock provider + disposable DB.
 */
const PROJECT_ID = FIXTURE_PROJECT.id;
const GEN_ID = '33333333-3333-4333-8333-333333333333';

function generation(overrides: Record<string, unknown> = {}) {
  return {
    id: GEN_ID,
    project_id: PROJECT_ID,
    status: 'queued',
    skill_id: 'article',
    opportunity_id: null,
    skill_version: 1,
    feedback: null,
    feedback_reason: '',
    feedback_at: null,
    context_status: 'included',
    requested_model: 'mistral-small-latest',
    returned_model: null,
    provider: 'mistral',
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
    completed_at: null,
    error_code: '',
    instruction_preview: 'Write an about page',
    user_instruction: 'Write an about page for Acme.',
    context_summary: {
      version: 'content-context-v1',
      crawl_page_count: 3,
      crawl_urls: ['https://acme.test/', 'https://acme.test/pricing', 'https://acme.test/about'],
      crawl_completed_at: '2026-07-15T00:00:00Z',
      brand_memory: true,
      brand_fields: ['description'],
      target_url: null,
      issue_count: 0,
      related_page_count: 3,
      omissions: [],
    },
    finish_reason: null,
    output_truncated: false,
    output_text: null,
    usage: null,
    latency_ms: null,
    error_detail: '',
    generator_version: 'content-v3',
    ...overrides,
  };
}

const succeeded = generation({
  status: 'succeeded',
  returned_model: 'mistral-small-2506',
  finish_reason: 'stop',
  output_text: '# About Acme\n\nWe make excellent things.',
  usage: { total_tokens: 30 },
  latency_ms: 420,
  completed_at: '2026-07-15T00:01:00Z',
});

test('content nav link is live and the enqueue → output flow renders sanitised markdown', async ({
  page,
}) => {
  let enqueued = false;
  let detailCalls = 0;

  await stubAuthedShell(page);
  await page.route('**/api/v1/content/generations?*', (route) =>
    route.fulfill({ json: enqueued ? [succeeded] : [] }),
  );
  await page.route('**/api/v1/content/generations', (route) => {
    if (route.request().method() === 'POST') {
      enqueued = true;
      return route.fulfill({ status: 201, json: generation() });
    }
    return route.fulfill({ json: enqueued ? [succeeded] : [] });
  });
  await page.route(`**/api/v1/content/generations/${GEN_ID}`, (route) => {
    detailCalls += 1;
    return route.fulfill({ json: detailCalls < 2 ? generation() : succeeded });
  });
  await page.route('**/api/v1/content/context-preview?*', (route) =>
    route.fulfill({
      json: {
        brand_memory: true,
        target_page: null,
        issue_count: 0,
        related_page_count: 3,
      },
    }),
  );

  await page.goto(fixtureProjectPath('/visibility'));
  const navLink = page.getByRole('link', { name: 'Content', exact: true });
  await expect(navLink).toBeVisible();
  await navLink.click();
  await expect(page).toHaveURL(fixtureProjectPath('/content'));

  const promptBox = page.getByRole('textbox', { name: 'Your instruction' });
  // One quiet summary of the server-built context; it may still be checking
  // while the preview query settles, so accept either state before Generate.
  const contextIndicator = page.locator('[data-component-id="content-context-indicator"]');
  await expect(contextIndicator).toBeVisible();
  await expect(contextIndicator).toContainText(/brand memory|checking context/i);
  await expect(contextIndicator).toContainText(/3 related pages|checking context/i);
  await promptBox.fill('Write an about page for Acme.');
  await page.getByRole('button', { name: 'Generate' }).click();

  // The queued state may resolve before the browser paints; assert the durable result.
  await expect(page.getByRole('heading', { name: 'About Acme' })).toBeVisible({
    timeout: 10_000,
  });
  // Model ids are provenance on the row, not something the writer needs on the
  // page; the footer now says only what the draft was grounded with.
  await expect(page.getByText(/returned model/i)).toHaveCount(0);
  await expect(page.getByText(/context used: website crawl · 3 pages/i)).toBeVisible();
});
