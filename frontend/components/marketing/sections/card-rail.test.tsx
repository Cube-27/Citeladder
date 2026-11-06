import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { mountCardRail } from './card-rail';
import { CardRail } from './features';

function renderRail({ scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  const { container } = render(
    <CardRail
      label="modules"
      items={[
        { key: 'a', content: 'First' },
        { key: 'b', content: 'Second' },
      ]}
    />,
  );
  const track = screen.getByRole('list', { name: 'modules' });
  Object.defineProperty(track, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: clientWidth });
  const rail = container.querySelector<HTMLElement>('[data-card-rail]');
  if (!rail) throw new Error('CardRail rendered no rail');
  mountCardRail(rail);
  return {
    track,
    prev: screen.getByRole('button', { name: 'Previous modules' }),
    next: screen.getByRole('button', { name: 'Next modules' }),
  };
}

describe('mountCardRail', () => {
  it('disables both buttons when every card already fits', () => {
    const { prev, next } = renderRail({ scrollWidth: 800, clientWidth: 800 });

    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
  });

  it('allows only the way the row can still move as it scrolls', () => {
    const { track, prev, next } = renderRail({ scrollWidth: 1200, clientWidth: 400 });

    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    track.scrollLeft = 800;
    fireEvent.scroll(track);

    expect(prev).toBeEnabled();
    expect(next).toBeDisabled();
  });
});
