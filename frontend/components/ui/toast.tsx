import type { CSSProperties, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { POP_FACE } from '@/components/ui/slip';

type ToastTone = 'neutral' | 'positive' | 'negative';

type ToastOptions = Readonly<{
  tone?: ToastTone;
  /** The one next step ("Undo", "Retry now"), a small secondary button under the text. */
  action?: Readonly<{ label: string; onClick: () => void }>;
}>;

/** `open` turns false when the toast closes; it leaves once its close animation ends. */
type ToastMessage = ToastOptions & {
  id: number;
  open: boolean;
  title: string;
  description?: string;
};
type ToastApi = { notify: (title: string, description?: string, options?: ToastOptions) => void };

const ToastContext = createContext<ToastApi>({ notify: () => undefined });

/**
 * Neutral and positive toasts close after 6s unless hovered or focused;
 * negative ones, and any with an action, stay until dismissed.
 */
const TOAST_DURATION_MS = 6000;
/** Never more than three at once: the oldest leaves first. */
const MAX_TOASTS = 3;
/** The space between toasts when the stack opens into a list. */
const STACK_GAP_PX = 8;

const TONE_ICON = {
  neutral: { Icon: Info, className: 'text-ink-2', word: 'Notice' },
  positive: { Icon: CheckCircle2, className: 'text-positive', word: 'Success' },
  negative: { Icon: AlertCircle, className: 'text-negative', word: 'Error' },
} as const;

type StackVars = CSSProperties & Record<`--${string}`, string | number>;

/** Each toast's own height, measured so the collapsed stack fits the front one. */
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

/** Each open toast's offset in the opened list (newest first) and the list's height. */
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

/**
 * Toast — a brief message about something that just happened, top-right under
 * the masthead (clear of a composer docked at the foot): the pop face
 * (`raised`, 1px `rule` edge, radius 8, `shadow-pop`), 400px. The newest is
 * the front of a stack; up to two older ones peek behind it with their content
 * hidden, and the stack opens into a list on hover or focus (ui-motion.css).
 * The tone shows only in the 16px icon plus a screen-reader word; negative
 * toasts are announced assertively and stay until dismissed, as does a toast
 * with an action.
 */
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

  // Newest first: an open toast's place in the stack; a closing one takes its place among all.
  const newestFirst = [...messages].reverse();
  const shown = newestFirst.filter((message) => message.open);
  const { offsets, listHeight } = stackLayout(shown, heights);
  const stackVars: StackVars = {
    '--toast-count': shown.length,
    '--stack-height': `${listHeight}px`,
  };
  const frontHeight = shown[0] ? heights[shown[0].id] : undefined;
  if (frontHeight !== undefined) stackVars['--front-height'] = `${frontHeight}px`;

  return (
    <ToastContext value={value}>
      <ToastPrimitive.Provider swipeDirection="right" label="Notifications">
        {children}
        {messages.map((message) => {
          const tone = message.tone ?? 'neutral';
          const { Icon, className, word } = TONE_ICON[tone];
          const place = message.open ? shown.indexOf(message) : newestFirst.indexOf(message);
          const height = heights[message.id];
          const vars: StackVars = {
            '--toast-index': place,
            '--toast-offset': `${offsets[place] ?? 0}px`,
          };
          if (height !== undefined) vars['--toast-height'] = `${height}px`;
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
              style={vars}
              className={cn(POP_FACE, 'toast-panel overflow-hidden')}
            >
              <div ref={measure(message.id)} className="flex items-start gap-3 py-3 ps-4 pe-3">
                <span className={cn('inline-flex h-5 shrink-0 items-center', className)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <ToastPrimitive.Title className="text-body-sm text-ink font-medium">
                    <span className="sr-only">{`${word}: `}</span>
                    {message.title}
                  </ToastPrimitive.Title>
                  {message.description ? (
                    <ToastPrimitive.Description className="text-body-sm text-ink-2 mt-0.5">
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
                  className="focus-ring text-ink-2 not-disabled:hover:overlay-hover not-disabled:hover:text-ink rounded-control -m-1 grid size-[var(--control-md)] shrink-0 place-items-center"
                  aria-label="Dismiss notification"
                >
                  <X className="size-4" aria-hidden />
                </ToastPrimitive.Close>
              </div>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          style={stackVars}
          className="toast-stack focus-ring z-toast fixed top-[calc(var(--masthead-block-size,var(--masthead-height))+8px)] right-4 w-100 max-w-[calc(100vw-2rem)]"
        />
      </ToastPrimitive.Provider>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
