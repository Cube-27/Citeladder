import type { ReactNode } from 'react';

export const THREAD_OPENING = 'max-w-chat mx-auto my-auto flex w-full flex-col gap-section';

export function ThreadOpening({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={THREAD_OPENING}>{children}</div>;
}
