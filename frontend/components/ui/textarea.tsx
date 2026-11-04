import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '@/lib/utils';

/**
 * Textarea — the multi-line field. It looks like Input: `surface`, 1px
 * `line-control`, `radius-md`, 8/12px padding, 14/20 text, at least two
 * control heights tall, resizing vertically only. Focus and error come from
 * the shared `.focus-input` rule.
 */
const textareaClasses =
  'focus-input bg-surface border-line-control text-ink placeholder:text-ink-muted block min-h-[calc(var(--control-md)*2)] w-full resize-y rounded-md border px-3 py-2 text-body-sm transition-[border-color,box-shadow] duration-[var(--motion-fast)] disabled:cursor-not-allowed disabled:opacity-45';

/**
 * Inside the Agent composer the composer is the box: the field drops its
 * edge, fill, resize handle and resting height.
 */
const composerClasses =
  'min-h-0 resize-none border-transparent bg-transparent px-2 py-1 focus-visible:border-transparent focus-visible:shadow-none';

export function Textarea({
  className,
  placement = 'field',
  rows = 4,
  ref,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'textarea'> & {
    /** `composer`: the message field inside the Agent composer. */
    placement?: 'field' | 'composer';
    ref?: Ref<HTMLTextAreaElement>;
  }
>) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(textareaClasses, placement === 'composer' && composerClasses, className)}
      {...props}
    />
  );
}
