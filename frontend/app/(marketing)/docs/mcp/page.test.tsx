import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Page from './page';

describe('MCP documentation page', () => {
  it('publishes the hosted read-only endpoint and client setup', () => {
    render(<Page />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /connect your ai assistant to citeladder/i,
    );
    // NEXT_PUBLIC_SITE_URL is unset in test (and in every environment until the
    // production domain is approved), so the endpoint degrades to a placeholder
    // host rather than naming one deployment for every reader.
    expect(screen.getByText('https://<your-citeladder-host>/mcp')).toBeInTheDocument();
    expect(screen.getByText('get_project_business_context')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ChatGPT' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claude and Claude Code' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Codex' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Perplexity' })).toBeInTheDocument();
    expect(screen.getByText(/server requests only the/)).toHaveTextContent('citeladder:read');
    expect(screen.getByText(/api keys are not used/i)).toBeInTheDocument();
  });
});
