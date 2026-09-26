import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vite-plus/test';

import { PromptsRouteContent } from './prompts-route-content';

vi.mock('./prompt-library', () => ({
  PromptLibrary: ({ openGenerate }: { openGenerate?: boolean }) => (
    <p>{openGenerate ? 'generate dialog requested' : 'library'}</p>
  ),
}));
vi.mock('./your-prompts', () => ({ YourPrompts: () => <p>read view</p> }));

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PromptsRouteContent />
      <Location />
    </MemoryRouter>,
  );
}

describe('PromptsRouteContent', () => {
  it('opens the Generate dialog once when arriving with the generate request', async () => {
    renderAt('/prompts?mode=manage&generate=1&project=p1');

    expect(await screen.findByText('generate dialog requested')).toBeInTheDocument();
    // The request is consumed so a reload or back navigation does not reopen it.
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/prompts?mode=manage&project=p1'),
    );
    expect(screen.getByText('generate dialog requested')).toBeInTheDocument();
  });

  it('opens the library without the dialog on a plain manage visit', async () => {
    renderAt('/prompts?mode=manage');

    expect(await screen.findByText('library')).toBeInTheDocument();
  });
});
