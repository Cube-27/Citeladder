import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { hardNavigate } from './hard-navigate';

describe('hardNavigate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves the SPA via a full-page assignment', () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    } as unknown as Location);

    hardNavigate('https://checkout.example/session/abc');

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('https://checkout.example/session/abc');
  });

  it('passes a relative auth bounce through unchanged', () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    } as unknown as Location);

    hardNavigate('/login?next=/pricing');

    expect(assign).toHaveBeenCalledWith('/login?next=/pricing');
  });
});
