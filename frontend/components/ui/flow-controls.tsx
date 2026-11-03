'use client';

import type { ComponentProps } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
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
  'size' | 'width' | 'startContent' | 'containerClassName' | 'className'
>;

/** A full-width 44px field: label above, placeholder inside, no glyph. */
export function FlowInput(props: Readonly<FlowInputProps>) {
  return <Input {...props} containerClassName={FLOW_FIELD_FRAME} className={FLOW_FIELD_TEXT} />;
}

/** A full-width 44px action: the primary submit or the secondary "Continue with Google". */
export function FlowButton(props: Readonly<Omit<ButtonProps, 'size' | 'className' | 'asChild'>>) {
  return <Button {...props} size="marketing" className="w-full" />;
}
