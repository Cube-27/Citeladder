import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type Ref,
} from 'react';

import { FIELD_EDGE } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const textareaClasses =
  'text-ink placeholder:text-ink-placeholder text-body block w-full rounded-control border disabled:cursor-not-allowed';

const fieldClasses = cn(
  'focus-input disabled:bg-raised-2 disabled:text-ink-2 app:disabled:opacity-disabled field-sizing-content min-h-field-rows-min max-h-field-rows-max resize-none px-3 py-2 transition-field duration-fast app:duration-fast',
  FIELD_EDGE,
);

const composerClasses =
  'field-sizing-content min-h-composer-rows-min min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2 py-1 wrap-anywhere max-h-composer-rows-max';

const sizesItself = () => globalThis.CSS?.supports('field-sizing', 'content') ?? false;

export function Textarea({
  className,
  placement = 'field',
  rows: rowsProp,
  maxRows = 8,
  numeric = false,
  style,
  ref,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'textarea'> & {
    placement?: 'field' | 'composer';
    maxRows?: number;
    numeric?: boolean;
    ref?: Ref<HTMLTextAreaElement>;
  }
>) {
  const rows = rowsProp ?? 4;
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
  const growStyle: CSSProperties & Record<'--field-max-rows' | '--field-min-rows', number> = {
    ...style,
    '--field-max-rows': maxRows,
    '--field-min-rows': grows && rowsProp === undefined ? 1 : rows,
  };
  const { value } = props;
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
      style={growStyle}
      className={cn(
        textareaClasses,
        grows ? composerClasses : fieldClasses,
        numeric && 'tabular-nums',
        className,
      )}
      {...props}
    />
  );
}
