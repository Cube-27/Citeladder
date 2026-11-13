/**
 * The Copy behaviour of `CodeBlock.astro`: one delegated listener copies a
 * block's code and reports the outcome in the status region beside the
 * button, whose own name stays "Copy". "Copied" shows for 1.6s, only after the
 * clipboard accepted the write; a refused write or a missing clipboard API
 * (permissions policy, insecure origin) reads "Couldn't copy" until the next press.
 */
const RESET_MS = 1600;
const timers = new WeakMap<HTMLElement, number>();

type ClipboardWriter = Pick<Clipboard, 'writeText'>;

function report(button: HTMLButtonElement, copied: boolean) {
  const status = button.parentElement?.querySelector<HTMLElement>('[data-code-copy-status]');
  button.toggleAttribute('data-copied', copied);
  if (status) {
    status.textContent = copied ? 'Copied' : 'Couldn’t copy';
    status.toggleAttribute('data-failed', !copied);
  }
  window.clearTimeout(timers.get(button));
  if (!copied) return;
  timers.set(
    button,
    window.setTimeout(() => {
      delete button.dataset.copied;
      if (status) status.textContent = '';
    }, RESET_MS),
  );
}

/** Copy the code of the block holding `button`, then report whether it worked. */
export async function copyCodeBlock(
  button: HTMLButtonElement,
  clipboard: ClipboardWriter | undefined = navigator.clipboard,
): Promise<void> {
  const code = button.closest('.cl-code')?.querySelector('code')?.textContent;
  if (code == null) return;
  if (!clipboard) {
    report(button, false);
    return;
  }
  try {
    await clipboard.writeText(code);
    report(button, true);
  } catch {
    report(button, false);
  }
}

/** Install the delegated listener once per page. */
export function installCodeCopy(root: Document = document) {
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-code-copy]');
    if (button) void copyCodeBlock(button);
  });
}
