import type { ReactNode } from 'react';

import { Text } from '@/components/ui/typography';

export function TitleCaption({
  title,
  caption,
}: Readonly<{ title: ReactNode; caption?: ReactNode }>) {
  return (
    <span className="grid min-w-0 flex-1">
      <span className="truncate">{title}</span>
      {caption ? <Text variant="caption">{caption}</Text> : null}
    </span>
  );
}
