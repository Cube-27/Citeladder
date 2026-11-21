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

export function installCodeCopy(root: Document = document) {
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-code-copy]');
    if (button) void copyCodeBlock(button);
  });
}
