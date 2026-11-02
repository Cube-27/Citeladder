'use client';

import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';

/**
 * The account-access controls (sign-in, sign-up and the mailbox screens): the
 * 44px touch rung of the control ladder, one form each. The product's 32px
 * `Input` and `Button` stay as they are; only these screens compose these.
 */

const FLOW_FIELD_FRAME = 'h-[var(--control-height-xl)]';
const FLOW_FIELD_TEXT = 'leading-[calc(var(--control-height-xl)_-_2px)]';

type FlowInputProps = Omit<
  ComponentProps<typeof Input>,
  'size' | 'width' | 'raised' | 'startContent' | 'containerClassName' | 'className'
> & {
  /** The leading glyph that names the field's kind (mail, lock). */
  icon: LucideIcon;
};

/** A full-width 44px field with a leading glyph. */
export function FlowInput({ icon, ...props }: Readonly<FlowInputProps>) {
  return (
    <Input
      {...props}
      startContent={<Icon icon={icon} />}
      containerClassName={FLOW_FIELD_FRAME}
      className={FLOW_FIELD_TEXT}
    />
  );
}

/** A full-width 44px action: the primary submit or the secondary "Continue with Google". */
export function FlowButton(props: Readonly<Omit<ButtonProps, 'size' | 'className' | 'asChild'>>) {
  return <Button {...props} size="marketing" className="w-full" />;
}
