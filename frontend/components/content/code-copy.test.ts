import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { copyCodeBlock } from './code-copy';

function block() {
  document.body.innerHTML = `
    <figure class="cl-code">
      <figcaption class="cl-code-bar">
        <button type="button" class="cl-code-copy" aria-label="Copy code" data-code-copy>
          <span aria-hidden="true">Copy</span>
        </button>
      </figcaption>
      <pre class="cl-code-pre"><code>npx citeladder connect</code></pre>
    </figure>`;
  return document.querySelector<HTMLButtonElement>('[data-code-copy]')!;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('code block Copy', () => {
  it('confirms only after the clipboard accepted the code, then resets', async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const button = block();
    await copyCodeBlock(button, { writeText: async (value) => void writes.push(value) });
    expect(writes).toEqual(['npx citeladder connect']);
    expect(button.getAttribute('aria-label')).toBe('Copied');
    expect(button.textContent?.trim()).toBe('Copied');
    expect(button.hasAttribute('data-copied')).toBe(true);
    vi.advanceTimersByTime(1600);
    expect(button.getAttribute('aria-label')).toBe('Copy code');
    expect(button.textContent?.trim()).toBe('Copy');
  });

  it('reports a refused write and a missing clipboard as a failure', async () => {
    const button = block();
    await copyCodeBlock(button, {
      writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    });
    expect(button.getAttribute('aria-label')).toBe('Copy failed');
    expect(button.textContent?.trim()).toBe('Copy failed');
    expect(button.hasAttribute('data-copied')).toBe(false);

    const other = block();
    await copyCodeBlock(other, undefined);
    expect(other.getAttribute('aria-label')).toBe('Copy failed');
  });
});
