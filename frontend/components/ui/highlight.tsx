import type { ReactNode } from 'react';

export function Highlight({ children }: Readonly<{ children: ReactNode }>) {
  return <mark className="cl-mark">{children}</mark>;
}
