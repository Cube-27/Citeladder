import { useCallback, useRef, useState } from 'react';
import { TURNSTILE_FLEXIBLE_MIN_WIDTH_PX, TURNSTILE_SCRIPT_URL } from '@/lib/config/turnstile';

/** Flexible fills its slot from 300px up, 65px tall; compact is 150px by 140px. */
export type TurnstileSize = 'flexible' | 'compact';

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: TurnstileSize;
      'response-field': boolean;
      callback(token: string): void;
      'expired-callback'(): void;
      'error-callback'(): void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile is unavailable.'));
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile failed to load.'));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Renders the Turnstile widget into the element given `container` as its ref,
 * for as long as that element is mounted, and keeps the latest token.
 * `solved` re-renders the form when a token arrives or lapses; `failed` when
 * no widget can render at all (no site key, or the script would not load).
 * Tokens are single-use: call `reset` after every submission.
 *
 * `size` is the widget size the element's width allows, measured when the
 * element mounts and before the first paint, so a slot sized from it is
 * already the widget's height when the widget arrives. A rendered widget keeps
 * its size; so does the slot.
 *
 * The site key is public and baked in at build (`PUBLIC_TURNSTILE_SITE_KEY`
 * for each of the marketing and product builds). Without one no widget
 * renders, no token arrives, and a form that requires one stays held.
 */
export function useTurnstile(action: string) {
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const token = useRef('');
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState<TurnstileSize>('flexible');

  const container = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const fits = element.getBoundingClientRect().width >= TURNSTILE_FLEXIBLE_MIN_WIDTH_PX;
      const chosen: TurnstileSize = fits ? 'flexible' : 'compact';
      setSize(chosen);
      const sitekey = process.env.PUBLIC_TURNSTILE_SITE_KEY ?? '';
      if (!sitekey) {
        setFailed(true);
        return;
      }
      let mounted = true;
      const settle = (value: string) => {
        token.current = value;
        setSolved(Boolean(value));
      };
      loadTurnstile()
        .then((api) => {
          if (!mounted) return;
          // A widget error shows inside the widget, which retries by itself.
          const id = api.render(element, {
            sitekey,
            action,
            size: chosen,
            'response-field': false,
            callback: settle,
            'expired-callback': () => settle(''),
            'error-callback': () => settle(''),
          });
          widget.current = { api, id };
        })
        // Without the widget the server refuses the request; the form says so.
        .catch(() => {
          if (mounted) setFailed(true);
        });
      return () => {
        mounted = false;
        widget.current?.api.remove(widget.current.id);
        widget.current = null;
        token.current = '';
      };
    },
    [action],
  );

  const reset = useCallback(() => {
    token.current = '';
    setSolved(false);
    if (widget.current) widget.current.api.reset(widget.current.id);
  }, []);

  return { container, token: () => token.current, solved, failed, size, reset };
}

export type Turnstile = ReturnType<typeof useTurnstile>;
