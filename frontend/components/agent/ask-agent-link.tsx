import type { ReactNode } from 'react';

import { ActionButton } from '@/components/ui/actions';
import { TextLink } from '@/components/ui/text-link';
import { agentHandoffHref, type HandoffInput } from '@/lib/agent/handoff';

/**
 * "Ask agent" from a Dashboard screen: a new Agent chat started from the
 * screen's typed references (ids, a prompt, a skill), never its evidence. The
 * one place such a question leaves a screen, so where it opens is decided
 * here for every caller. As a button it is the `askAgent` preset.
 */
export function AskAgentLink({
  handoff,
  ...props
}: Readonly<
  { handoff: HandoffInput } & (
    | {
        appearance?: 'button';
        /** Adds what it asks about to the name ("Ask agent about this page"). */
        'aria-label'?: string;
      }
    | {
        /** A caption link under one row, naming what it asks about. */
        appearance: 'text';
        children: ReactNode;
      }
  )
>) {
  const href = agentHandoffHref(handoff);
  if (props.appearance === 'text')
    return (
      <TextLink text="caption" className="w-fit" href={href}>
        {props.children}
      </TextLink>
    );
  return <ActionButton action="askAgent" href={href} aria-label={props['aria-label']} />;
}
