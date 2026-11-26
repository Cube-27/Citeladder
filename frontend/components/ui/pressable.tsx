import type { ButtonHTMLAttributes, Ref } from 'react';

import { textRole, toneClass, type TextRole, type TextTone } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export type PressableProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  tone?: TextTone;
  text?: TextRole;
  numeric?: boolean;
};

export function Pressable({
  className,
  type = 'button',
  tone,
  text,
  numeric = false,
  ref,
  ...props
}: Readonly<PressableProps>) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'focus-ring w-full rounded-control text-left transition-[background-color] duration-fast ease-standard disabled:pointer-events-none disabled:bg-well disabled:text-ink-2 disabled:border-rule',
        toneClass(tone),
        text && textRole(text),
        numeric && 'tabular-nums',
        className,
      )}
      {...props}
    />
  );
}
