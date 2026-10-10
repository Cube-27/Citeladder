// @vitest-environment node
import { expect, it } from 'vite-plus/test';
import { contactSalesHref } from './contact';

it('moves the Cube27 sales intake to CiteLadder while preserving other catalog destinations', () => {
  expect(contactSalesHref('https://www.cube27.com/contact/')).toBe('/contact');
  expect(
    contactSalesHref('https://cube27.com/contact?source=pricing', 'https://citeladder.com/contact'),
  ).toBe('https://citeladder.com/contact');
  expect(contactSalesHref(null, 'https://citeladder.com/contact')).toBe(
    'https://citeladder.com/contact',
  );
  expect(contactSalesHref('https://www.cube27.com/')).toBe('https://www.cube27.com/');
  expect(contactSalesHref('https://sales.example/contact')).toBe('https://sales.example/contact');
});
