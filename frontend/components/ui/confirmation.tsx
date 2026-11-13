import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { cardClasses } from './card';
import { Icon } from './icon';
import { Inline, Stack } from './layout';
import { textRole } from './typography';

export type ConfirmationState = 'requested' | 'accepted';

/**
 * Confirmation — something an assistant proposed for the person to confirm
 * (the AI Elements Confirmation pattern): a titled request with its actions,
 * shown as accepted once it is done. Nothing happens until the person acts.
 */
export function Confirmation({
  title,
  state,
  actions,
  children,
}: Readonly<{
  title: string;
  state: ConfirmationState;
  /** The controls, kept in both states so the card keeps its size once accepted. */
  actions?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <section aria-label={title} className={cardClasses()}>
      <Stack gap="compact">
        <Inline gap="tight">
          {state === 'accepted' ? <Icon icon={CheckCircle2} className="shrink-0" /> : null}
          <h3 className={textRole('itemTitle', 'min-w-0 break-words')}>{title}</h3>
        </Inline>
        {children}
        {actions ? <Inline className="flex-wrap">{actions}</Inline> : null}
      </Stack>
    </section>
  );
}
