import { expect, test } from '@playwright/test';

import { stubAuthedShell } from './helpers/app-fixture';

const DISCOVERY_ID = '33333333-3333-4333-8333-333333333333';

const catalog = {
  business_types: ['b2b', 'b2c', 'both'],
  price_tiers: ['unknown'],
  required_fields: [],
  optional_fields: [],
  capture_methods: [],
  maximum_competitors: 5,
  industries: ['General', 'Education', 'Professional Services'],
  subindustries: { General: [], Education: [], 'Professional Services': [] },
  prompt_cohorts: ['core', 'brand_diagnostic'],
};

const readyDiscovery = {
  id: DISCOVERY_ID,
  workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  project_id: null,
  status: 'ready',
  progress: {
    phase: 'preparing_review',
    completed_steps: 3,
    total_steps: 4,
    pages_read: 1,
    competitors_found: 2,
    prompts_prepared: 0,
  },
  input_data: {
    brand_name: 'The Asian School',
    website_url: 'https://www.theasianschool.net/',
    industry: 'Education',
    subindustry: '',
    primary_market: 'IN',
    language_code: 'en',
  },
  profile: {
    description: 'A co-educational day cum boarding school in Dehradun, India.',
    positioning: 'A day and boarding school for families in Dehradun.',
    products_services: ['Education'],
    target_audience: 'Families',
    industry: 'Education',
    business_type: 'b2c',
    price_tier: 'unknown',
    field_confidence: {},
  },
  domains: ['theasianschool.net'],
  competitors: [
    {
      name: 'The Doon School',
      aliases: [],
      domains: ['doonschool.com'],
      reasoning: '',
      evidence_urls: [],
      confidence: 0.8,
    },
    {
      name: "Welham Girls' School",
      aliases: [],
      domains: ['welhamgirls.com'],
      reasoning: '',
      evidence_urls: [],
      confidence: 0.8,
    },
  ],
  topics: [
    {
      topic_id: '77777777-7777-4777-8777-777777777771',
      name: 'Day Schools',
      description: '',
      source_refs: ['page-1'],
    },
    {
      topic_id: '77777777-7777-4777-8777-777777777772',
      name: 'Boarding Schools',
      description: '',
      source_refs: ['page-1'],
    },
    {
      topic_id: '77777777-7777-4777-8777-777777777773',
      name: 'School Admissions',
      description: '',
      source_refs: ['page-1'],
    },
  ],
  prompt_suggestions: [],
  evidence: [],
  warnings: [],
  gaps: [],
  error_code: '',
  created_at: '2026-08-09T00:00:00Z',
  updated_at: '2026-08-09T00:00:01Z',
};

test('onboarding advances through a prompt-free review with sequential progress', async ({
  page,
}) => {
  await stubAuthedShell(
    page,
    [
      ['**/api/v1/brand-discovery-catalog', catalog],
      ['**/api/v1/brand-discoveries', readyDiscovery],
      [`**/api/v1/brand-discoveries/${DISCOVERY_ID}`, readyDiscovery],
    ],
    [],
  );

  await page.goto('/onboarding');
  await expect(page.locator('[data-brand-canvas]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Setup progress' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Let's get started" })).toBeVisible();

  await page.getByLabel(/^Brand name/).fill('The Asian School');
  await page.getByLabel(/^Website/).fill('theasianschool.net');
  await page.getByRole('button', { name: 'Continue' }).click();
  const discoveryHeading = page.getByRole('heading', { name: 'Finding what to track' });
  await expect(discoveryHeading).toBeVisible();

  const progress = page.getByRole('progressbar', { name: /steps complete/ });
  await expect(progress).not.toHaveAttribute('aria-valuenow', '4');
  await expect(progress).toHaveAttribute('aria-valuenow', '4', { timeout: 4_000 });

  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
  await expect(page.getByText('Online Footprint & Peers')).toHaveCount(0);
  await expect(page.getByText('AI Discovered')).toHaveCount(0);
  await expect(page.getByText('theasianschool.net')).toBeVisible();
  await expect(page.getByText('The Doon School')).toBeVisible();
  await expect(page.getByText(/Starting Prompts/i)).toHaveCount(0);
});
