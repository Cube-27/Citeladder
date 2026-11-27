import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';

const MIX = 'color-mix(in oklch, var(--color-accent), transparent)';
const PANEL = 'gap-2 rounded-card';

export function Canary({ tone }: Readonly<{ tone: string }>) {
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
      <p className={LAYOUT[tone === 'row' ? 'row' : 'column']}>layout map</p>
      <img src="/logo.png" alt="" />
      <svg aria-hidden viewBox="0 0 24 24" className="size-6 shrink-0" />
      <Box className="text-accent p-3">component</Box>
      <p {...{ className: tone }}>spread</p>
      <div style={{ '--spacing-card': '40px' }}>role style</div>
      <Button className="mt-7 w-78">ui steps</Button>
      <i className={`flex ${LAYOUT.row}`}>template</i>
      <div className="grid @[517px]:grid-flow-col">breakpoint</div>
      <Frame>forwarded</Frame>
      <Box {...BAG}>constant spread</Box>
    </Stack>
  );
}

const LAYOUT = { row: 'flex', column: 'grid' } as const;
const BAG = { className: 'flex' } as const;

function Box(props: Readonly<{ className: string; children: string }>) {
  return <Stack {...props} />;
}

function Frame(props: Readonly<{ children: string }>) {
  return <div {...props} />;
}
