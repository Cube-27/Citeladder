import { render } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';
import { Linkify } from './linkify';

it('links URLs and internal paths and leaves trailing sentence punctuation in the prose', () => {
  const { container } = render(
    <Linkify text="Read https://example.com/policy?). Then see /pricing, or ask us." />,
  );

  const links = [...container.querySelectorAll('a')].map((link) => [
    link.getAttribute('href'),
    link.getAttribute('target'),
  ]);
  expect(links).toEqual([
    ['https://example.com/policy', '_blank'],
    ['/pricing', null],
  ]);
  expect(container.textContent).toBe(
    'Read https://example.com/policy?). Then see /pricing, or ask us.',
  );
});

it('leaves a slash inside a word as prose and still links a path after punctuation', () => {
  const { container } = render(
    <Linkify text="Use either and/or both (see /docs/setup) at 60 km/h." />,
  );

  expect([...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
    '/docs/setup',
  ]);
  expect(container.textContent).toBe('Use either and/or both (see /docs/setup) at 60 km/h.');
});
