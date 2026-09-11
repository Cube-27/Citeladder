import { textRole } from '@/components/ui/typography';

export function OpportunityKvRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-muted shrink-0 text-xs">{label}</span>
      <span className={textRole('body', 'text-right break-words')}>{value}</span>
    </div>
  );
}
