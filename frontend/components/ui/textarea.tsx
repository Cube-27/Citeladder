import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '@/lib/utils';

const textareaClasses =
  'focus-input min-h-[var(--textarea-min-height)] w-full resize-y rounded-[var(--radius-control)] shadow-smudge bg-input p-2.5 text-field leading-[var(--text-role-body--line-height)] text-foreground transition-[box-shadow] placeholder:text-muted hover:shadow-smudge-hover aria-invalid:shadow-smudge-danger disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The composer lift — see `Input`. A brief box or agent prompt keeps its deeper
 * edge at rest and on hover, so the field the screen exists for reads as the
 * surface in front of the paper rather than as one more control on it.
 */
const raisedClasses = 'shadow-raised hover:shadow-raised';

export function Textarea({
  className,
  raised = false,
  ref,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'textarea'> & {
    /** The composer treatment — for a field that is the point of its screen. */
    raised?: boolean;
    ref?: Ref<HTMLTextAreaElement>;
  }
>) {
  return (
    <textarea
      ref={ref}
      className={cn(textareaClasses, raised && raisedClasses, className)}
      {...props}
    />
  );
}
