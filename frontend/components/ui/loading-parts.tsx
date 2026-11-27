import { cn } from '@/lib/utils';
import { SkeletonBlock, type SkeletonWidth } from '@/components/ui/skeleton-block';
import { textRoleClass, type TextRole } from '@/components/ui/text-role';

const LINE_WIDTH = {
  short: '32',
  medium: '48',
  long: '64',
} as const satisfies Record<string, SkeletonWidth>;

export function TextLineSkeleton({
  text,
  width,
}: Readonly<{ text: TextRole; width: keyof typeof LINE_WIDTH }>) {
  return (
    <span aria-hidden className={cn(textRoleClass(text), 'flex h-lh items-center')}>
      <SkeletonBlock width={LINE_WIDTH[width]} />
    </span>
  );
}
