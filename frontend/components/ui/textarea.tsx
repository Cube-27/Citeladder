import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type Ref,
} from 'react';

import { FIELD_EDGE, FIELD_HOVER } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Textarea — the multi-line field in the shared field frame (`FIELD_EDGE`):
 * 8/12px padding, `body` text, at least two control heights tall, resizing
 * vertically only. Focus and error come from the shared `.focus-input` rule.
 */
const textareaClasses =
  'text-ink placeholder:text-ink-2 type-body block w-full rounded-control border disabled:cursor-not-allowed disabled:opacity-60';

const fieldClasses = cn(
  'focus-input min-h-[calc(var(--control-md)*2)] resize-y px-3 py-2',
  FIELD_EDGE,
  FIELD_HOVER,
);

/**
 * Inside the Agent composer the composer is the box and draws the one focus
 * boundary (its `focus-frame`): the field drops its edge, fill, resize
 * handle, resting height and focus treatment. It starts one line tall and
 * grows with its text to `maxRows` lines (its 4px padding and 1px edge on
 * top), then scrolls inside. `field-sizing` does the growing where the
 * browser has it; elsewhere the layout effect below measures.
 */
const composerClasses =
  'field-sizing-content min-h-0 resize-none border-transparent bg-transparent px-2 py-1 max-h-[calc(var(--field-max-rows)*1lh+0.5rem+2px)]';

/** Chrome 123, Safari 26.2 and Firefox 152 size the field to its text themselves. */
const sizesItself = () => globalThis.CSS?.supports('field-sizing', 'content') ?? false;

export function Textarea({
  className,
  placement = 'field',
  rows = 4,
  maxRows = 8,
  style,
  ref,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'textarea'> & {
    /** `composer`: the message field inside the Agent composer, one line that grows. */
    placement?: 'field' | 'composer';
    /** The composer field's tallest height, in lines. */
    maxRows?: number;
    ref?: Ref<HTMLTextAreaElement>;
  }
>) {
  const grows = placement === 'composer';
  const own = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      own.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const growStyle: CSSProperties & Record<'--field-max-rows', number> = {
    ...style,
    '--field-max-rows': maxRows,
  };
  const { value } = props;
  // Fits the field to its text after each change, before paint, so it never flickers.
  useLayoutEffect(() => {
    const field = own.current;
    if (!grows || !field || sizesItself()) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }, [grows, value]);
  return (
    <textarea
      ref={setRef}
      rows={grows ? 1 : rows}
      style={grows ? growStyle : style}
      className={cn(textareaClasses, grows ? composerClasses : fieldClasses, className)}
      {...props}
    />
  );
}
