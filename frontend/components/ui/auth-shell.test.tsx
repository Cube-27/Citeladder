import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { AuthCard, AuthShell, AuthSignInCard, AuthSplitShell } from './auth-shell';
import { ChecklistField } from './checklist-field';
import { OnboardingShell, OnboardingStep } from './onboarding-shell';

afterEach(() => vi.unstubAllEnvs());

describe('AuthShell', () => {
  it('links the logo to the website home and offers the theme beside it', () => {
    vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://citeladder.com');
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(
      <AuthShell mainLabel="Account access">
        <AuthCard title="Welcome back">form</AuthCard>
      </AuthShell>,
    );

    expect(screen.getByRole('link', { name: 'CiteLadder home' })).toHaveAttribute(
      'href',
      'https://citeladder.com/',
    );
    // The link carries the name; the drawn lockup inside it is not announced again.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
    const main = screen.getByRole('main', { name: 'Account access' });
    expect(within(main).getByRole('region', { name: 'Welcome back' })).toHaveTextContent('form');
  });
});

describe('AuthSplitShell', () => {
  it('puts the logo inside the sign-in card beside the product showcase', () => {
    vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://citeladder.com');
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(
      <AuthSplitShell footer="© CiteLadder">
        <AuthSignInCard title="Welcome back">form</AuthSignInCard>
      </AuthSplitShell>,
    );

    const main = screen.getByRole('main', { name: 'Account access' });
    const card = within(main).getByRole('region', { name: 'Welcome back' });
    expect(within(card).getByRole('link', { name: 'CiteLadder home' })).toHaveAttribute(
      'href',
      'https://citeladder.com/',
    );
    expect(card).toHaveTextContent('form');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'CiteLadder features' })).toHaveTextContent(
      'Ask your AI assistant about your visibility.',
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent('© CiteLadder');
  });
});

describe('OnboardingShell', () => {
  it('names the current step and counts it against the whole setup', () => {
    render(
      <OnboardingShell
        mainLabel="Project setup"
        steps={['Basics', 'Research', 'Confirm']}
        current={1}
      >
        <OnboardingStep title="Finding what to track" next={<button type="button">Review</button>}>
          steps
        </OnboardingStep>
      </OnboardingShell>,
    );

    const progress = screen.getByRole('region', { name: 'Setup progress' });
    expect(progress).toHaveTextContent('Step 2 of 3');
    expect(within(progress).getByRole('progressbar', { name: 'Research' })).toHaveAttribute(
      'value',
      '2',
    );
    // A done step shows a check, the current and later steps their numbers.
    const stepItems = within(progress).getAllByRole('listitem');
    expect(stepItems.map((item) => item.textContent)).toEqual(['Basics', '2Research', '3Confirm']);
    expect(stepItems[1]).toHaveAttribute('aria-current', 'step');
    expect(stepItems[0]).not.toHaveAttribute('aria-current');

    const main = screen.getByRole('main', { name: 'Project setup' });
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Finding what to track' }),
    ).toBeVisible();
    expect(within(main).getByRole('region', { name: 'Finding what to track' })).toHaveTextContent(
      'steps',
    );
    expect(within(main).getByRole('button', { name: 'Review' })).toBeVisible();
  });

  it('leaves the stepper out of a one-screen setup', () => {
    render(
      <OnboardingShell mainLabel="Workspace setup">
        <OnboardingStep title="Set up your workspace">name</OnboardingStep>
      </OnboardingShell>,
    );

    expect(screen.queryByRole('region', { name: 'Setup progress' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Set up your workspace' })).toHaveTextContent('name');
  });
});

describe('ChecklistField', () => {
  it('saves an edited row with its trimmed values and leaves edit mode', async () => {
    const saved = vi.fn();
    const editing = vi.fn();
    render(
      <ChecklistField
        label="Competitors"
        count="1 of 5"
        empty="None"
        items={[{ id: 'a', label: 'Acme', checked: true, editable: true }]}
        onToggle={vi.fn()}
        editingId="a"
        onEditingChange={editing}
        editor={{
          fields: [{ key: 'name', label: () => 'Competitor name', placeholder: 'Name' }],
          values: () => ({ name: 'Acme' }),
          onSave: saved,
          editLabel: (item) => `Edit ${item.label}`,
        }}
      />,
    );

    const user = userEvent.setup();
    const field = screen.getByRole('textbox', { name: 'Competitor name' });
    await user.clear(field);
    await user.type(field, '  Acme Corp  {Enter}');
    expect(saved).toHaveBeenCalledWith('a', { name: 'Acme Corp' });
    expect(editing).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('group', { name: 'Competitors' })).toHaveTextContent('1 of 5');
  });
});
