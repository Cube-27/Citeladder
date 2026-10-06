import { expect, test } from '@playwright/test';
import { FIXTURE_WORKSPACE_ID, stubAuthedShell, fixtureProjectPath } from './helpers/app-fixture';

test('mailbox confirmation requires explicit password submission and preserves invitation return', async ({
  page,
}) => {
  const token = 'a'.repeat(43);
  const returnTo = '/invitations/accept?token=invitation-token-1234';
  const requests: unknown[] = [];
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 401, json: { detail: 'Sign in' } }),
  );
  await page.route('**/api/v1/auth/verify-email', (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { message: 'Your account is ready. Sign in to continue.' } });
  });
  await page.goto(`/verify-email#${new URLSearchParams({ token, return_to: returnTo })}`);
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page).toHaveURL(/\/verify-email$/u);
  expect(requests).toHaveLength(0);
  await page.getByLabel(/^Signup password/u).fill('chosen-password');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Your account is ready. Sign in to continue.')).toBeVisible();
  expect(requests).toEqual([{ token, password: 'chosen-password' }]);
  const signIn = page.getByRole('link', { name: 'Sign in', exact: true });
  await expect(signIn).toHaveAttribute('href', `/login?return_to=${encodeURIComponent(returnTo)}`);
});

test('expired direct navigation and refresh remain blocked with account recovery available', async ({
  page,
}) => {
  await stubAuthedShell(page, [
    [
      `**/api/v1/workspaces/${FIXTURE_WORKSPACE_ID}/access`,
      { status: 'trial_expired', expires_at: '2026-01-01T00:00:00Z' },
    ],
    [
      '**/api/v1/auth/security',
      { email: 'owner@example.test', email_verified: true, methods: ['password'] },
    ],
  ]);
  await page.goto(fixtureProjectPath('/projects'));
  await expect(page.getByRole('heading', { name: 'Your trial has ended' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your trial has ended' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contact support' })).toBeVisible();
  await page.getByRole('button', { name: 'Account security' }).click();
  await expect(page.getByRole('dialog', { name: 'Account security', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out all sessions' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign out all sessions?' })).toBeVisible();
});

test('old account security URLs open the Account section with inline security controls', async ({
  page,
}) => {
  await stubAuthedShell(page, [
    [
      '**/api/v1/auth/security',
      { email: 'shell@example.com', email_verified: true, methods: ['google'] },
    ],
  ]);
  await page.goto(`/account-security?workspace=${FIXTURE_WORKSPACE_ID}`);
  await expect(page).toHaveURL(
    new RegExp(`/settings\\?workspace=${FIXTURE_WORKSPACE_ID}&tab=account$`, 'u'),
  );
  await expect(page.getByRole('tab', { name: 'Account', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Account security' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email password setup link' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out all sessions' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign out all sessions?' })).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`Terms validation keeps the sign-in card and submit button in place at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/api/v1/**', (route) =>
      route.fulfill({ status: 401, json: { detail: 'Sign in' } }),
    );
    await page.goto('/login');
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const card = page.locator('.flow-content');
    const submit = page.getByRole('button', { name: 'Continue', exact: true });
    const before = { card: await card.boundingBox(), submit: await submit.boundingBox() };
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await card.boundingBox()).toEqual(before.card);
    expect(await submit.boundingBox()).toEqual(before.submit);
    await page.getByRole('checkbox').check();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await card.boundingBox()).toEqual(before.card);
    expect(await submit.boundingBox()).toEqual(before.submit);
  });
}
