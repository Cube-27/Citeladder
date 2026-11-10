import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders as render } from '@/test/render';

import { SourceUrlPageCard } from './source-url-page';

type Page = NonNullable<Parameters<typeof SourceUrlPageCard>[0]['page']>;

const ACTION = '44444444-4444-4444-8444-444444444444';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const REQUEST =
  'Draft a request to be listed on https://review.example/best-crm, alongside Globex.';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function page(overrides: Partial<Page> = {}): Page {
  return {
    state: 'inspected',
    reason: null,
    read_at: '2026-10-01T00:00:00Z',
    extracted_chars: 4200,
    page_format: 'listicle',
    page_format_method: 'heading_evidence',
    source_class: 'editorial_third_party',
    entities: [
      {
        entity_kind: 'brand',
        entity_name: 'Acme Corp',
        match_count: 0,
        presence: 'not_detected',
        match_method: 'none',
        passages: [],
      },
      {
        entity_kind: 'competitor',
        entity_name: 'Globex',
        match_count: 2,
        presence: 'present',
        match_method: 'exact_alias',
        passages: ['Globex leads the list for small teams.'],
      },
    ],
    standing: 'gap',
    action_id: ACTION,
    ...overrides,
  };
}

const URL = 'https://review.example/best-crm';

describe('what a cited page means for you', () => {
  it('names the competitors listed where you are not, with their lines, and opens the Action', async () => {
    mswServer.use(
      http.get(`/api/v1/actions/${ACTION}`, () =>
        HttpResponse.json({
          id: ACTION,
          project_id: PROJECT,
          target_kind: 'earned_page',
          target_label: URL,
          target_url: URL,
          target_prompt_id: null,
          origin: 'evidence',
          status: 'open',
          priority_score: 40,
          families: ['sources'],
          approach: 'earned_placement',
          skill_id: 'earned_authority',
          member_count: 1,
          handoff: { context: 'action', message: REQUEST },
          evidence_cleared_at: null,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
          diagnosis: {},
          members: [],
          member_measurement: {},
          declarable_since: '2026-09-01T00:00:00Z',
          declaration: null,
        }),
      ),
    );
    render(<SourceUrlPageCard url={URL} page={page()} loading={false} />);

    expect(screen.getByText('Competitors are listed on this page and you are not.')).toBeVisible();
    const listed = screen.getByText('Listed here').parentElement!;
    expect(within(listed).getByText('Globex', { selector: '[data-badge-tone]' })).toBeVisible();
    const quote = screen.getByRole('blockquote');
    expect(quote).toHaveTextContent('Globex leads the list for small teams.');
    expect(within(quote).getByText('Globex', { selector: 'mark' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open the Action' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/agent/actions/${ACTION}`),
    );
    expect(
      screen.getByText('Searched 4,200 characters of readable text; no form of the name matched.'),
    ).toBeVisible();
    // The request opens New chat on the Action with its own message written.
    const draft = await screen.findByRole('link', { name: 'Draft the request' });
    const chat = new globalThis.URL(draft.getAttribute('href')!, 'https://app.test');
    expect(chat.pathname).toBe('/agent');
    expect(chat.searchParams.get('action_id')).toBe(ACTION);
    expect(chat.searchParams.get('prompt')).toBe(REQUEST);
  });

  it('says a page was never read instead of reporting anyone absent', () => {
    render(
      <SourceUrlPageCard
        url={URL}
        page={page({
          read_at: null,
          state: 'blocked',
          entities: [],
          standing: 'blocked',
          action_id: null,
        })}
        loading={false}
      />,
    );

    expect(
      screen.getByText('The publisher blocks automated access, so this page has not been read.'),
    ).toBeVisible();
    expect(screen.queryByText(/not found on the page/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /Action|request/ })).toBeNull();
  });

  it("offers nothing to do on a competitor's own page", () => {
    render(
      <SourceUrlPageCard
        url={URL}
        page={page({ source_class: 'competitor_owned', standing: 'competitor' })}
        loading={false}
      />,
    );

    expect(
      screen.getByText("This is a competitor's own page, so it cannot list you."),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Open the Action' })).toBeNull();
  });
});
