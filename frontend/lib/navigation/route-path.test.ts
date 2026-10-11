import { describe, expect, it } from 'vite-plus/test';
import { routePath } from './route-path';

describe('routePath', () => {
  it('drops every trailing slash and lower-cases the path', () => {
    expect(routePath('/Invitations/Accept///')).toBe('/invitations/accept');
    expect(routePath('/verify-email')).toBe('/verify-email');
  });

  it('keeps inner slashes and reduces a slash-only path to empty', () => {
    expect(routePath('//a//b/')).toBe('//a//b');
    expect(routePath('///')).toBe('');
  });
});
