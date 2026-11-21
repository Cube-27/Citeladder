import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { mountCardRail } from './card-rail';
import { CardRail, RailCard } from './rail-cards';

function renderRail({ scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  const { container } = render(
    <CardRail
      label="modules"
      items={['Site Health', 'Keyword Research'].map((name) => ({
        key: name,
        content: (
          <RailCard
            href={`/platform/${name.toLowerCase().replace(' ', '-')}`}
            label={name}
            title={`${name} in one line`}
            body={`What ${name} does`}
            media={null}
            page={null}
          />
        ),
      }))}
    />,
  );
  const track = screen.getByRole('list', { name: 'modules' });
  Object.defineProperty(track, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: clientWidth });
  track.scrollTo = () => {};
  track.scrollBy = () => {};
  for (const item of track.children) {
    Object.defineProperty(item, 'offsetWidth', { configurable: true, value: 400 });
  }
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

  it('announces the card each button brings to the start', () => {
    const { track, prev, next } = renderRail({ scrollWidth: 1200, clientWidth: 400 });
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');

    fireEvent.click(next);
    expect(status).toHaveTextContent('Keyword Research, 2 of 2');

    track.scrollLeft = 400;
    fireEvent.click(prev);
    expect(status).toHaveTextContent('Site Health, 1 of 2');
  });

  it('opens one card in place at a time and closes it again', () => {
    renderRail({ scrollWidth: 1200, clientWidth: 400 });
    expect(screen.queryByRole('link', { name: 'Explore Site Health' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More about Site Health' }));
    expect(screen.getByRole('link', { name: 'Explore Site Health' })).toHaveAttribute(
      'href',
      '/platform/site-health',
    );

    fireEvent.click(screen.getByRole('button', { name: 'More about Keyword Research' }));
    expect(screen.queryByRole('link', { name: 'Explore Site Health' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Explore Keyword Research' })).toHaveAttribute(
      'href',
      '/platform/keyword-research',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Keyword Research' }));
    expect(screen.queryByRole('link', { name: 'Explore Keyword Research' })).toBeNull();
  });

  it('leaves a card closed when its headline link is pressed', () => {
    renderRail({ scrollWidth: 1200, clientWidth: 400 });

    fireEvent.click(screen.getByRole('link', { name: 'Site Health in one line' }));

    expect(screen.getByRole('button', { name: 'More about Site Health' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
