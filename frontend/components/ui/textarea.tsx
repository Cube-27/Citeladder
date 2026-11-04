import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '@/lib/utils';

const textareaClasses =
  'focus-input min-h-[var(--textarea-min-height)] w-full resize-y rounded-md border border-line-control bg-surface p-3 text-body-sm text-ink transition-[border-color,background-color] placeholder:text-ink-muted enabled:hover:border-ink-muted aria-invalid:border-negative aria-invalid:enabled:hover:border-negative disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:border-line';

/**
 * Inside a `ComposerFrame` the frame is the box: the field keeps its focus
 * focus but drops its edge, its fill, resize handle and resting height, and takes the
 * frame's tighter inset so its text lines up with the chips above it.
 */
const composerClasses =
  'min-h-0 resize-none border-transparent bg-transparent px-2 py-1 shadow-none hover:border-transparent hover:shadow-none';

export function Textarea({
  className,
  placement = 'field',
  ref,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'textarea'> & {
    /** `composer`: the message field inside a `ComposerFrame`. */
    placement?: 'field' | 'composer';
    ref?: Ref<HTMLTextAreaElement>;
  }
>) {
  return (
    <textarea
      ref={ref}
      className={cn(textareaClasses, placement === 'composer' && composerClasses, className)}
      {...props}
    />
  );
}
