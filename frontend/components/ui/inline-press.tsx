import type { ButtonHTMLAttributes, Ref } from 'react';

import { toneClass, type TextTone } from '@/components/ui/text-role';
import { cn } from '@/lib/utils';

export function InlinePress({
  tone,
  type = 'button',
  ref,
  ...props
}: Readonly<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> & {
    ref?: Ref<HTMLButtonElement>;
    tone?: TextTone;
  }
>) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cn(toneClass(tone), 'rounded-mark focus-ring')}
    />
  );
}
