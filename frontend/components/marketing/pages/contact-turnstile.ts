import { useCallback, useRef } from 'react';
import { TURNSTILE_SCRIPT_URL } from '@/lib/config/contact';

/** Baked in at build; empty in tests and builds without a widget. */
const TURNSTILE_SITE_KEY = process.env.PUBLIC_TURNSTILE_SITE_KEY ?? '';

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: 'flexible';
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
 * Tokens are single-use: call `reset` after every submission.
 */
export function useTurnstile(action: string) {
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const token = useRef('');

  const container = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !TURNSTILE_SITE_KEY) return;
      let mounted = true;
      loadTurnstile()
        .then((api) => {
          if (!mounted) return;
          const id = api.render(element, {
            sitekey: TURNSTILE_SITE_KEY,
            action,
            size: 'flexible',
            'response-field': false,
            callback: (value) => {
              token.current = value;
            },
            'expired-callback': () => {
              token.current = '';
            },
            'error-callback': () => {
              token.current = '';
            },
          });
          widget.current = { api, id };
        })
        // Without the widget the server rejects the send, and the form offers email instead.
        .catch(() => {});
      return () => {
        mounted = false;
        widget.current?.api.remove(widget.current.id);
        widget.current = null;
        token.current = '';
      };
    },
    [action],
  );

  return {
    container,
    token: () => token.current,
    reset() {
      token.current = '';
      if (widget.current) widget.current.api.reset(widget.current.id);
    },
  };
}
