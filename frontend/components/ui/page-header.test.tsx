import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { emitResize } from '@/test/resize-observer';

import { PageHeader } from './page-header';

const TITLE = 'https://www.example.com/blog/how-to-choose-a-crm-for-a-small-agency';

describe('PageHeader', () => {
  it('lets a cut title take focus and shows the full title in its tooltip', async () => {
    render(<PageHeader title={TITLE} titleLines={2} />);
    const heading = screen.getByRole('heading', { level: 1, name: TITLE });
    expect(heading).not.toHaveAttribute('tabindex');

    Object.defineProperty(heading, 'clientHeight', { configurable: true, value: 64 });
    Object.defineProperty(heading, 'scrollHeight', { configurable: true, value: 96 });
    act(() => emitResize(heading));
    expect(heading).toHaveAttribute('tabindex', '0');

    act(() => heading.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(TITLE);
  });
});
