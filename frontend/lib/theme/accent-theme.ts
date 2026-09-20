export const ACCENT_OPTIONS = [
  { value: 'chili', label: 'Chili' },
  { value: 'blue', label: 'Blue' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'violet', label: 'Violet' },
  { value: 'amber', label: 'Amber' },
] as const;

export type AccentTheme = (typeof ACCENT_OPTIONS)[number]['value'];

const STORAGE_KEY = 'citeladder.accent';
const CHANGE_EVENT = 'citeladder:accent-change';

export function isAccentTheme(value: string | null | undefined): value is AccentTheme {
  return ACCENT_OPTIONS.some((option) => option.value === value);
}

export function currentAccentTheme(): AccentTheme {
  const value = document.documentElement.dataset.accent;
  return isAccentTheme(value) ? value : 'emerald';
}

export function setAccentTheme(value: AccentTheme) {
  if (value === 'emerald') {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = value;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // The current document can still use the selected palette.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeAccentTheme(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (
      event.storageArea !== window.localStorage ||
      (event.key !== STORAGE_KEY && event.key !== null)
    )
      return;
    if (isAccentTheme(event.newValue) && event.newValue !== 'emerald') {
      document.documentElement.dataset.accent = event.newValue;
    } else {
      delete document.documentElement.dataset.accent;
    }
    callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
