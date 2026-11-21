import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { copyCodeBlock } from './code-copy';

function block() {
  document.body.innerHTML = `
    <figure class="cl-code">
      <figcaption class="cl-code-bar">
        <output class="cl-code-status" data-code-copy-status></output>
        <button type="button" class="cl-code-copy" data-code-copy>Copy</button>
      </figcaption>
      <pre class="cl-code-pre"><code>npx citeladder connect</code></pre>
    </figure>`;
  return {
    button: document.querySelector<HTMLButtonElement>('[data-code-copy]')!,
    status: document.querySelector<HTMLElement>('output')!,
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('code block Copy', () => {
  it('confirms in the status only after the clipboard accepted the code, then clears it', async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const { button, status } = block();
    await copyCodeBlock(button, { writeText: async (value) => void writes.push(value) });
    expect(writes).toEqual(['npx citeladder connect']);
    expect(status.textContent).toBe('Copied');
    expect(button.textContent).toBe('Copy');
    expect(button.hasAttribute('data-copied')).toBe(true);
    vi.advanceTimersByTime(1600);
    expect(status.textContent).toBe('');
    expect(button.hasAttribute('data-copied')).toBe(false);
  });

  it('keeps a refused write or a missing clipboard visible as a failure', async () => {
    vi.useFakeTimers();
    const { button, status } = block();
    await copyCodeBlock(button, {
      writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    });
    expect(status.textContent).toBe('Couldn’t copy');
    expect(status.hasAttribute('data-failed')).toBe(true);
    expect(button.hasAttribute('data-copied')).toBe(false);
    vi.advanceTimersByTime(1600);
    expect(status.textContent).toBe('Couldn’t copy');

    const other = block();
    await copyCodeBlock(other.button, undefined);
    expect(other.status.textContent).toBe('Couldn’t copy');

    await copyCodeBlock(other.button, { writeText: async () => undefined });
    expect(other.status.textContent).toBe('Copied');
    expect(other.status.hasAttribute('data-failed')).toBe(false);
  });
});
