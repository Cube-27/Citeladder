import { Pressable } from '@/components/ui/pressable';

export function WorkRowsMore({
  onClick,
  disabled,
  children,
}: Readonly<{ onClick: () => void; disabled: boolean; children: string }>) {
  return (
    <Pressable
      data-tree-row=""
      onClick={onClick}
      disabled={disabled}
      text="body"
      numeric
      look="more"
      tone="ink-2"
    >
      {children}
    </Pressable>
  );
}
