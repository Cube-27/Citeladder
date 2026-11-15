import { ClampText } from '@/components/ui/clamp-text';
import { Inline } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';

export function OpportunityKvRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Inline gap="compact" className="items-start justify-between">
      <span className="type-caption shrink-0">{label}</span>
      <ClampText className={textRole('body', 'text-ink-2 min-w-0 text-right')}>{value}</ClampText>
    </Inline>
  );
}
