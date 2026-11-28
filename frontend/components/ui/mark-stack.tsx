import { BrandMark, type LogoSource } from '@/components/ui/brand-mark';
import { Inline } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { Tooltip } from '@/components/ui/tooltip';
import { Text } from '@/components/ui/typography';

export type StackedMark = Readonly<{ key: string; tip: string; mark: LogoSource }>;

export function MarkStack({
  marks,
  more,
}: Readonly<{ marks: readonly StackedMark[]; more: number }>) {
  return (
    <Inline as="span" gap="tight">
      {marks.map(({ key, tip, mark }) => (
        <Tooltip key={key} content={tip}>
          <Pressable box="inline">
            <span className="sr-only">{mark.name}</span>
            <BrandMark {...mark} placement="inline" />
          </Pressable>
        </Tooltip>
      ))}
      {more > 0 ? (
        <Text variant="caption" numeric>
          +{more}
          <span className="sr-only"> more</span>
        </Text>
      ) : null}
    </Inline>
  );
}
