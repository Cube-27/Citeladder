import { describe, expect, it, vi } from 'vite-plus/test';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Prompt } from '@citeladder/contracts';

import { PromptTable } from './prompt-table';

function makePrompt(n: number, overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    prompt_set_id: '11111111-1111-4111-8111-111111111111',
    text: `Prompt number ${n}`,
    theme: 'Comfort',
    intent: 'discovery',
    branded: false,
    enabled: true,
    status: 'active',
    origin: 'manual',
    ...overrides,
  } as Prompt;
}

const TOPIC_ID = '22222222-2222-4222-8222-222222222222';

const ANSWER = { auditId: '33333333-3333-4333-8333-333333333333', promptIndex: 0 };

const NO_OP_ACTIONS = { onEdit: () => {}, onDelete: () => {}, onToggleEnabled: () => {} };

function renderTable(prompts: Prompt[]) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <PromptTable prompts={prompts} actions={NO_OP_ACTIONS} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('PromptTable pagination', () => {
  it('says a Commerce prompt has no per-prompt figures while a brand prompt shows its own', () => {
    const COMMERCE_SET = '44444444-4444-4444-8444-444444444444';
    const brandPrompt = makePrompt(1);
    const shelfPrompt = makePrompt(2, { prompt_set_id: COMMERCE_SET });
    render(
      <MemoryRouter>
        <TooltipProvider>
          <PromptTable
            prompts={[brandPrompt, shelfPrompt]}
            commerceSetIds={new Set([COMMERCE_SET])}
            measurements={
              new Map([
                [
                  brandPrompt.id,
                  {
                    visibilityRate: 0.5,
                    ownedCitationRate: 0.25,
                    change: { kind: 'first' },
                    position: 2,
                    shareOfVoice: null,
                    sentiment: null,
                    webSearch: undefined,
                    answer: ANSWER,
                    mentions: 0,
                    brands: [],
                    named: [],
                    sources: [],
                  },
                ],
              ])
            }
          />
        </TooltipProvider>
      </MemoryRouter>,
    );

    const [, brandRow, shelfRow] = screen.getAllByRole('row');
    expect(within(brandRow!).getAllByRole('cell')[1]!.textContent).toBe('50.0%');
    // Not "not measured": no run will ever measure it one prompt at a time.
    // One cell spans the figures and says it once; the reason is in the head.
    const shelfCells = within(shelfRow!).getAllByRole('cell');
    expect(shelfCells[1]!.getAttribute('colspan')).toBe('8');
    expect(shelfCells[1]!.textContent).toBe('Measured with Shopping');
    expect(shelfRow!.querySelectorAll('[data-absence="not_applicable"]')).toHaveLength(1);
    expect(shelfCells).toHaveLength(within(brandRow!).getAllByRole('cell').length - 7);
    expect(within(shelfRow!).queryByText('Not measured')).toBeNull();
  });

  it('shows each question without tags, captioning only a prompt that audits skip', () => {
    renderTable([
      makePrompt(1, { branded: true, buyer_stage: 'consideration', topic_id: TOPIC_ID }),
      makePrompt(2, { over_plan_limit: true }),
    ]);

    const [, measured, overLimit] = screen.getAllByRole('row');
    expect(within(measured!).getAllByRole('cell')[0]!.textContent).toBe('Prompt number 1');
    // Kept after a downgrade, but audits skip it until a slot frees.
    expect(within(overLimit!).getAllByRole('cell')[0]!.textContent).toBe(
      'Prompt number 2Not measured: beyond the plan limit',
    );
  });

  it('carries the whole question in a tooltip when the row cuts it', async () => {
    // jsdom lays nothing out; report the question as wider than its line and
    // the table as fitting its frame, so the frame takes no tab stop.
    const scrollWidth = vi
      .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-scroll-content') ? 0 : 1000;
      });
    renderTable([makePrompt(1)]);

    await userEvent.setup().tab();
    expect(screen.getByRole('link', { name: 'Prompt number 1' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Prompt number 1');
    scrollWidth.mockRestore();
  });

  it('opens each question on its history and shows its measured rates and named brands', () => {
    const prompt = makePrompt(7);
    const unnamed = makePrompt(8);
    const brand = (name: string, kind: 'brand' | 'competitor') => ({
      kind,
      name,
      responses: 1,
      logo_url: null,
      website: null,
    });
    render(
      <MemoryRouter>
        <TooltipProvider>
          <PromptTable
            prompts={[prompt, unnamed]}
            actions={NO_OP_ACTIONS}
            measurements={
              new Map([
                [
                  prompt.id,
                  {
                    visibilityRate: 0.5,
                    ownedCitationRate: 0.25,
                    change: { kind: 'first' },
                    position: 2,
                    shareOfVoice: 0.4,
                    sentiment: {
                      mentions: 31,
                      classified: 30,
                      positive: 20,
                      negative: 5,
                      net_sentiment: 50,
                    },
                    webSearch: { searched: 3, reported: 4, share: 0.75 },
                    answer: ANSWER,
                    mentions: 4,
                    brands: [
                      brand('Acme', 'brand'),
                      brand('Globex', 'competitor'),
                      brand('Initech', 'competitor'),
                    ],
                    named: [],
                    sources: [],
                  },
                ],
                [
                  unnamed.id,
                  {
                    visibilityRate: 0,
                    ownedCitationRate: 0,
                    change: { kind: 'not_compared', reason: 'changed_context' },
                    position: null,
                    shareOfVoice: 0,
                    // Classified, but fewer than the minimum: too few, not a zero.
                    sentiment: {
                      mentions: 6,
                      classified: 4,
                      positive: 2,
                      negative: 2,
                      net_sentiment: 0,
                    },
                    webSearch: { searched: 0, reported: 0, share: null },
                    answer: ANSWER,
                    mentions: 0,
                    brands: [],
                    named: [],
                    sources: [],
                  },
                ],
              ])
            }
          />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Prompt number 7/ })).toHaveAttribute(
      'href',
      '/prompts/00000000-0000-4000-8000-000000000007',
    );
    const [header, row, unnamedRow] = screen.getAllByRole('row');
    const columns = within(header!)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(columns.slice(0, 10)).toEqual([
      'Prompt',
      'Visibility',
      'Change',
      expect.stringMatching(/^Mentions/),
      expect.stringMatching(/^Citations/),
      expect.stringMatching(/^Sources/),
      expect.stringMatching(/^Position/),
      expect.stringMatching(/^Share of voice/),
      expect.stringMatching(/^Sentiment/),
      expect.stringMatching(/^Web search/),
    ]);
    const cells = within(row!).getAllByRole('cell');
    const unnamedCells = within(unnamedRow!).getAllByRole('cell');
    expect([1, 7, 8, 9].map((index) => cells[index]!.textContent)).toEqual([
      '50.0%',
      '40.0%',
      '+50',
      '75.0%',
    ]);
    // Measured zero share, too few classified, and no engine reporting search
    // are three different readings, none of them a zero sentiment or 0% search.
    expect(unnamedCells.slice(7, 10).map((cell) => cell.textContent)).toEqual([
      '0.0%',
      'Too few',
      'Not available',
    ]);
    // Three marks, each named for a screen reader, then the fourth as overflow.
    expect(cells[3]).toHaveTextContent('AcmeAGlobexGInitechI+1 more');
    expect(cells[4]!.textContent).toBe('25.0%');
    // An average position keeps its decimal; it is not a rank.
    expect(cells[6]!.textContent).toBe('2.0');
    // Measured, and no brand named: zero, not the "not measured" mark.
    expect(unnamedCells[3]!.textContent).toBe('None');
    // No change is never a zero: a first measurement has nothing to compare, and
    // a pair measured differently is not compared.
    expect(cells[2]!.querySelector('[data-absence]')).toHaveAttribute(
      'data-absence',
      'not_applicable',
    );
    expect(unnamedCells[2]!.querySelector('[data-absence]')).toHaveAttribute(
      'data-absence',
      'unavailable',
    );
  });

  it('pages through rows with the page indicator and ghost buttons', async () => {
    const user = userEvent.setup();
    const prompts = Array.from({ length: 12 }, (_, i) => makePrompt(i + 1));
    renderTable(prompts);

    const table = screen.getByRole('table');
    // Page 1 shows the first 10 rows with the mono page indicator.
    expect(within(table).getByText('Prompt number 1')).toBeInTheDocument();
    expect(within(table).queryByText('Prompt number 11')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'OUTPUT' &&
          el.textContent?.replace(/\s+/g, ' ').trim() === '1–10 of 12 prompts',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(within(table).queryByText('Prompt number 1')).not.toBeInTheDocument();
    expect(within(table).getByText('Prompt number 11')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'OUTPUT' &&
          el.textContent?.replace(/\s+/g, ' ').trim() === '11–12 of 12 prompts',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(within(table).getByText('Prompt number 1')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'OUTPUT' &&
          el.textContent?.replace(/\s+/g, ' ').trim() === '1–10 of 12 prompts',
      ),
    ).toBeInTheDocument();
  });

  it('clamps the current page when the list shrinks instead of resetting', async () => {
    const user = userEvent.setup();
    const prompts = Array.from({ length: 12 }, (_, i) => makePrompt(i + 1));
    const { rerender } = render(
      <MemoryRouter>
        <TooltipProvider>
          <PromptTable prompts={prompts} actions={NO_OP_ACTIONS} />
        </TooltipProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'OUTPUT' &&
          el.textContent?.replace(/\s+/g, ' ').trim() === '11–12 of 12 prompts',
      ),
    ).toBeInTheDocument();

    // A refetch/filter shrinking the list clamps the page into range.
    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <PromptTable prompts={prompts.slice(0, 5)} actions={NO_OP_ACTIONS} />
        </TooltipProvider>
      </MemoryRouter>,
    );
    // Five prompts fit on one page, so the table shows them with no pager.
    expect(screen.getByText('Prompt number 1')).toBeInTheDocument();
    expect(screen.getByText('Prompt number 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('states the enabled state without offering a control when the reader may not edit', () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <PromptTable prompts={[makePrompt(1), makePrompt(2, { enabled: false })]} />
        </TooltipProvider>
      </MemoryRouter>,
    );

    const [, first, second] = screen.getAllByRole('row');
    expect(
      within(first!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Prompt number 1', 'Yes']);
    expect(within(second!).getAllByRole('cell')[1]!.textContent).toBe('No');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prompt actions' })).toBeNull();
  });

  it('keeps row actions wired on paginated rows', async () => {
    const user = userEvent.setup();
    const onToggleEnabled = vi.fn();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <PromptTable prompts={[makePrompt(1)]} actions={{ ...NO_OP_ACTIONS, onToggleEnabled }} />
        </TooltipProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('switch', { name: 'Disable prompt' }));
    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
  });
});
