'use client';

import { m, useReducedMotion } from 'motion/react';
import { useSyncExternalStore, type ReactNode } from 'react';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * The hero's on-load entrance. Animates purely additive over content that is
 * already server-rendered in its settled state.
 */
export function HeroEntrance({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  const reduceMotion = useReducedMotion();
  const isClient = useIsClient();

  if (!isClient || reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}
