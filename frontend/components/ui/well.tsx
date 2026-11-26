import type { ReactNode } from 'react';

import { wellClasses } from '@/components/ui/slip';

export function CodeWell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <pre
      className={wellClasses(
        'text-code font-mono text-ink overflow-x-auto break-all whitespace-pre-wrap',
      )}
    >
      {children}
    </pre>
  );
}

export function TextWell({ children }: Readonly<{ children: ReactNode }>) {
  return <p className={wellClasses('text-body text-ink')}>{children}</p>;
}

export function AnchorMark({ children }: Readonly<{ children: ReactNode }>) {
  return <mark className="bg-accent-wash text-accent-text rounded-mark px-0.5">{children}</mark>;
}
