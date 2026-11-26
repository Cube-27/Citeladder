import { Stack } from '@/components/ui/layout';

const MIX = 'color-mix(in oklch, var(--color-accent), transparent)';
const PANEL = 'gap-2 rounded-card';

export function Canary({ tone }: { tone: string }) {
  return (
    <Stack className="gap-[13px]">
      <div className="flex min-w-0 items-center justify-between">layout only</div>
      <div className="text-ink-2 gap-2">spacing and tone</div>
      <span className={tone}>unreadable</span>
      <p className={PANEL}>one hop</p>
      <p className="text-red-500">palette</p>
      <p style={{ width: 13 }}>inline</p>
      <p className="z-10 opacity-50">survivors</p>
      <p className="border-white">monochrome</p>
      <p className="[[data-public-surface]_&]:rounded-card">variant</p>
      <p className="no-such-class bg-ink font-medium">unknown</p>
      <Stack className={tone}>dynamic</Stack>
      <Stack className="rounded-card">restyle</Stack>
      <p title={MIX}>colour</p>
    </Stack>
  );
}
