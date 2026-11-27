import { BrandMark } from '@/components/ui/brand-mark';
import { TableCell } from '@/components/ui/table';

export function Passing() {
  const frame = useFrame();
  return (
    <h2 className="flex min-w-0 items-center">
      <BrandMark name="Google" />
      Google
      <svg viewBox="0 0 24 24" aria-hidden />
      <a href="#faq" title="z-0 opacity-0 &#123;" className="@row-wide:grid-flow-col">
        survivor zero
      </a>
      <TableCell className="whitespace-nowrap">layout</TableCell>
      <Glyph className="shrink-0" />
      <span style={{ '--share': '40%' }} className={`flex`} />
      <span {...frame} />
    </h2>
  );
}

function Glyph(_: Readonly<{ className: string }>) {
  return null;
}

function useFrame() {
  return { role: 'group' } as const;
}
