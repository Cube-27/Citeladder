import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vite-plus/test';

import { Tag } from './tag';

it('removes a tag from its named remove button', async () => {
  const user = userEvent.setup();
  const onRemove = vi.fn();
  render(
    <Tag kind="removable" onRemove={onRemove}>
      ChatGPT
    </Tag>,
  );
  await user.click(screen.getByRole('button', { name: 'Remove ChatGPT' }));
  expect(onRemove).toHaveBeenCalledTimes(1);
});

it('carries a long label in full in its tooltip', () => {
  // The cut itself is geometry; e2e/surface-layout.spec.ts holds the page to
  // the viewport with this label at 982px.
  const long =
    'AI Visibility tracking (brand mentions, position, sentiment and competitors across AI answers)';
  render(<Tag>{long}</Tag>);
  expect(screen.getByTitle(long)).toHaveTextContent(long);
});
