import type { ReactNode } from 'react';

import { wellClasses } from '@/components/ui/slip';

export function UserBubble({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className={wellClasses(
        'text-body text-ink flex max-w-bubble min-w-0 flex-col gap-2 px-4 py-3',
      )}
    >
      {children}
    </div>
  );
}
