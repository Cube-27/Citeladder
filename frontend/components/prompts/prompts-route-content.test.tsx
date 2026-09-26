import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vite-plus/test';

import { PromptsRouteContent } from './prompts-route-content';

vi.mock('./prompt-library', () => ({
  PromptLibrary: ({ generateRequest }: { generateRequest?: number }) => (
    <p>generate requests: {generateRequest ?? 0}</p>
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
      <Link to="/prompts?mode=manage&generate=1">Generate prompts</Link>
    </MemoryRouter>,
  );
}

describe('PromptsRouteContent', () => {
  it('requests the Generate dialog once when arriving with the generate parameter', async () => {
    renderAt('/prompts?mode=manage&generate=1&project=p1');

    expect(await screen.findByText('generate requests: 1')).toBeInTheDocument();
    // The request is consumed so a reload or back navigation does not reopen it.
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/prompts?mode=manage&project=p1'),
    );
    expect(screen.getByText('generate requests: 1')).toBeInTheDocument();
  });

  it('requests the dialog for each in-page navigation to the generate URL', async () => {
    const user = userEvent.setup();
    renderAt('/prompts?mode=manage');
    expect(await screen.findByText('generate requests: 0')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Generate prompts' }));
    expect(await screen.findByText('generate requests: 1')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/prompts\?mode=manage$/),
    );

    await user.click(screen.getByRole('link', { name: 'Generate prompts' }));
    expect(await screen.findByText('generate requests: 2')).toBeInTheDocument();
  });
});
