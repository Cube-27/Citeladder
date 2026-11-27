import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';

import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Info, X } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { POP_FACE } from '@/components/ui/slip';
import { Icon } from '@/components/ui/icon';

type ToastTone = 'neutral' | 'positive' | 'negative';

type ToastOptions = Readonly<{
  tone?: ToastTone;
  action?: Readonly<{ label: string; onClick: () => void }>;
}>;

type ToastMessage = ToastOptions & {
  id: number;
  open: boolean;
  title: string;
  description?: string;
};
type ToastApi = { notify: (title: string, description?: string, options?: ToastOptions) => void };

const ToastContext = createContext<ToastApi>({ notify: () => undefined });

const TOAST_DURATION_MS = 6000;
const MAX_TOASTS = 3;
const STACK_GAP_PX = 8;

const TONE_ICON = {
  neutral: { glyph: Info, className: 'text-ink-2', word: 'Notice' },
  positive: { glyph: CheckCircle2, className: 'text-positive', word: 'Success' },
  negative: { glyph: AlertCircle, className: 'text-negative', word: 'Error' },
} as const;

function useToastHeights() {
  const [heights, setHeights] = useState<Readonly<Record<number, number>>>({});
  const measure = useCallback(
    (id: number) => (node: HTMLDivElement | null) => {
      const frame = node?.parentElement;
      if (!node || !frame) return;
      const record = () => {
        const height = node.offsetHeight + frame.offsetHeight - frame.clientHeight;
        setHeights((current) => (current[id] === height ? current : { ...current, [id]: height }));
      };
      record();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(record);
      observer.observe(node);
      return () => observer.disconnect();
    },
    [],
  );
  return { heights, measure };
}

function stackLayout(
  shown: readonly ToastMessage[],
  heights: Readonly<Record<number, number>>,
): { offsets: number[]; listHeight: number } {
  const offsets: number[] = [];
  let total = 0;
  for (const message of shown) {
    offsets.push(total);
    total += (heights[message.id] ?? 0) + STACK_GAP_PX;
  }
  return { offsets, listHeight: Math.max(0, total - STACK_GAP_PX) };
}

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const { heights, measure } = useToastHeights();
  const nextMessageId = useRef(0);
  const notify = useCallback((title: string, description?: string, options?: ToastOptions) => {
    nextMessageId.current += 1;
    const id = nextMessageId.current;
    setMessages((current) => {
      const shown = current.filter((message) => message.open);
      if (shown.some((message) => message.title === title && message.description === description))
        return current;
      const closing = new Set(
        shown.slice(0, Math.max(0, shown.length + 1 - MAX_TOASTS)).map(({ id }) => id),
      );
      return [
        ...current.map((message) =>
          closing.has(message.id) ? { ...message, open: false } : message,
        ),
        { ...options, id, open: true, title, description },
      ];
    });
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);

  const newestFirst = [...messages].reverse();
  const shown = newestFirst.filter((message) => message.open);
  const { offsets, listHeight } = stackLayout(shown, heights);
  const frontHeight = shown[0] ? heights[shown[0].id] : undefined;

  return (
    <ToastContext value={value}>
      <ToastPrimitive.Provider swipeDirection="right" label="Notifications">
        {children}
        {messages.map((message) => {
          const tone = message.tone ?? 'neutral';
          const { glyph, className, word } = TONE_ICON[tone];
          const place = message.open ? shown.indexOf(message) : newestFirst.indexOf(message);
          const height = heights[message.id];
          return (
            <ToastPrimitive.Root
              key={message.id}
              type={tone === 'negative' ? 'foreground' : 'background'}
              duration={tone === 'negative' || message.action ? Infinity : TOAST_DURATION_MS}
              forceMount
              open={message.open}
              onOpenChange={(open) => {
                if (!open)
                  setMessages((current) =>
                    current.map((item) =>
                      item.id === message.id ? { ...item, open: false } : item,
                    ),
                  );
              }}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && !message.open)
                  setMessages((current) => current.filter((item) => item.id !== message.id));
              }}
              data-front={message.open && place === 0 ? '' : undefined}
              style={{
                '--toast-index': place,
                '--toast-offset': `${offsets[place] ?? 0}px`,
                '--toast-height': height === undefined ? undefined : `${height}px`,
              }}
              className={cn(POP_FACE, 'toast-panel overflow-hidden')}
            >
              <div ref={measure(message.id)} className="flex items-start gap-3 py-3 ps-4 pe-3">
                <span className={cn('inline-flex h-5 shrink-0 items-center', className)}>
                  <Icon icon={glyph} size="flush" />
                </span>
                <div className="min-w-0 flex-1">
                  <ToastPrimitive.Title className="text-label text-ink">
                    <span className="sr-only">{`${word}: `}</span>
                    {message.title}
                  </ToastPrimitive.Title>
                  {message.description ? (
                    <ToastPrimitive.Description className="text-body text-ink-2 mt-0.5">
                      {message.description}
                    </ToastPrimitive.Description>
                  ) : null}
                  {message.action ? (
                    <div className="mt-3 flex gap-2">
                      <ToastPrimitive.Action asChild altText={message.action.label}>
                        <Button onClick={message.action.onClick}>{message.action.label}</Button>
                      </ToastPrimitive.Action>
                    </div>
                  ) : null}
                </div>
                <ToastPrimitive.Close
                  className="focus-ring press hit-area text-ink-2 rounded-control not-disabled:hover:text-ink bg-state-fill not-disabled:hover:bg-state-fill-hover press-firm grid size-6 shrink-0 place-items-center"
                  aria-label="Dismiss notification"
                >
                  <Icon icon={X} size="flush" />
                </ToastPrimitive.Close>
              </div>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          style={{
            '--toast-count': shown.length,
            '--stack-height': `${listHeight}px`,
            '--front-height': frontHeight === undefined ? undefined : `${frontHeight}px`,
          }}
          className="toast-stack focus-ring z-toast top-toast-top max-w-viewport-fit fixed right-4 w-100"
        />
      </ToastPrimitive.Provider>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
