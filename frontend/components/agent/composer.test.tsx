import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { Composer } from './composer';

function renderComposer(value: string) {
  return render(
    <Composer
      id="reply"
      label="Reply to the agent"
      value={value}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      pending={false}
      disabled={false}
      placeholder="Ask a follow-up."
    />,
  );
}

describe('Composer', () => {
  it('names its field and lets Send be pressed only with a message', () => {
    const { rerender } = renderComposer('');

    expect(screen.getByRole('textbox', { name: 'Reply to the agent' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    rerender(
      <Composer
        id="reply"
        label="Reply to the agent"
        value="Shorten it."
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
        disabled={false}
        placeholder="Ask a follow-up."
      />,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('starts one line tall and grows with its text', () => {
    // jsdom has no layout: the field's content height stands in for the browser's.
    const content = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(20);
    const { rerender } = renderComposer('');
    const field = screen.getByRole('textbox', { name: 'Reply to the agent' });
    expect(field).toHaveAttribute('rows', '1');
    expect(field.style.height).toBe('20px');

    content.mockReturnValue(140);
    rerender(
      <Composer
        id="reply"
        label="Reply to the agent"
        value={'One\nTwo\nThree\nFour\nFive\nSix\nSeven'}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
        disabled={false}
        placeholder="Ask a follow-up."
      />,
    );
    expect(field.style.height).toBe('140px');
    content.mockRestore();
  });
});
