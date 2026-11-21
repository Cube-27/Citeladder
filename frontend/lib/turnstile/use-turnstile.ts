import { useCallback, useRef, useState } from 'react';
import { TURNSTILE_FLEXIBLE_MIN_WIDTH_PX, TURNSTILE_SCRIPT_URL } from '@/lib/config/turnstile';
import { useTheme, type Theme } from '@/lib/theme/theme';

/** Flexible fills its slot from 300px up, 65px tall; compact is 150px by 140px. */
export type TurnstileSize = 'flexible' | 'compact';

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: TurnstileSize;
      theme: Theme;
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

export function useTurnstile(action: string) {
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const token = useRef('');
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState<TurnstileSize>('flexible');
  const theme = useTheme();

  const container = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      // The container must fill its slot (`w-full`): an empty shrink-wrapped
      // box measures 0px and would always pick the 150×140 compact widget.
      const fits = element.getBoundingClientRect().width >= TURNSTILE_FLEXIBLE_MIN_WIDTH_PX;
      const chosen: TurnstileSize = fits ? 'flexible' : 'compact';
      setSize(chosen);
      const sitekey = process.env.PUBLIC_TURNSTILE_SITE_KEY ?? '';
      if (!sitekey) {
        setFailed(true);
        return;
      }
      const unmounted = new AbortController();
      const settle = (value: string) => {
        token.current = value;
        setSolved(Boolean(value));
      };
      loadTurnstile()
        .then((api) => {
          if (unmounted.signal.aborted) return;
          // A widget error shows inside the widget, which retries by itself.
          const id = api.render(element, {
            sitekey,
            action,
            size: chosen,
            theme,
            'response-field': false,
            callback: settle,
            'expired-callback': () => settle(''),
            'error-callback': () => settle(''),
          });
          widget.current = { api, id };
        })
        .catch(() => {
          if (!unmounted.signal.aborted) setFailed(true);
        });
      return () => {
        unmounted.abort();
        widget.current?.api.remove(widget.current.id);
        widget.current = null;
        token.current = '';
        setSolved(false);
      };
    },
    [action, theme],
  );

  const reset = useCallback(() => {
    token.current = '';
    setSolved(false);
    if (widget.current) widget.current.api.reset(widget.current.id);
  }, []);

  return { container, token: () => token.current, solved, failed, size, reset };
}

export type Turnstile = ReturnType<typeof useTurnstile>;
