import { cn } from '@/lib/utils';

export function Switch({
  id,
  checked,
  onCheckedChange,
  label,
  describedBy,
  disabled = false,
  besideText = false,
}: Readonly<{
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  describedBy?: string;
  disabled?: boolean;
  besideText?: boolean;
}>) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'press focus-ring hit-area inline-flex h-switch-h w-switch-w shrink-0 items-center rounded-full disabled:cursor-not-allowed disabled:opacity-disabled',
        checked
          ? 'bg-primary not-disabled:hover:bg-primary-hover'
          : 'bg-control-edge not-disabled:hover:bg-control-edge-hover',
        besideText && 'mt-0.5 pointer-coarse:before:-inset-x-0.5 pointer-coarse:before:-inset-y-3',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'ms-switch-pad h-switch-thumb-h w-switch-thumb-w rounded-full transition-transform duration-slide ease-fluid',
          checked ? 'bg-thumb-checked translate-x-switch-travel' : 'bg-thumb',
        )}
      />
    </button>
  );
}
