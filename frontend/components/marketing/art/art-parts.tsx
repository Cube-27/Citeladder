import type { ReactNode } from 'react';

import './art.css';

export type ArtPlace = Readonly<
  Partial<Record<'top' | 'right' | 'bottom' | 'left' | 'width' | 'height', number>>
>;

const PLACED = {
  card: 'div',
  bubble: 'div',
  chips: 'div',
  bars: 'div',
  shelf: 'div',
  pill: 'span',
  link: 'span',
  node: 'span',
} as const;

function percent(value: number | undefined) {
  if (value === undefined) return undefined;
  return value === 0 ? '0' : `${value}%`;
}

export function Placed({
  kind,
  at,
  children,
  ...data
}: Readonly<{
  kind: keyof typeof PLACED;
  at?: ArtPlace;
  children?: ReactNode;
  'data-ghost'?: true;
  'data-picked'?: true;
  'data-ring'?: true;
  'data-align'?: 'center';
  'data-centre'?: 'x' | 'both';
}>) {
  const Tag = PLACED[kind];
  return (
    <Tag
      {...data}
      data-art={kind}
      data-at={at ? '' : undefined}
      style={{
        '--art-top': percent(at?.top),
        '--art-right': percent(at?.right),
        '--art-bottom': percent(at?.bottom),
        '--art-left': percent(at?.left),
        '--art-width': percent(at?.width),
        '--art-height': percent(at?.height),
      }}
    >
      {children}
    </Tag>
  );
}

export function Art({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="cl-art">
      <div className="cl-art-canvas">{children}</div>
    </div>
  );
}

export function Line({
  width,
  tone = 'soft',
  trail = false,
}: Readonly<{ width: number; tone?: 'soft' | 'strong' | 'wash'; trail?: boolean }>) {
  return (
    <span
      className="cl-art-line"
      data-tone={tone}
      data-trail={trail || undefined}
      style={{ '--art-width': `${width}%` }}
    />
  );
}

export function Card({
  at,
  ghost = false,
  picked = false,
  align,
  children,
}: Readonly<{
  at?: ArtPlace;
  ghost?: boolean;
  picked?: boolean;
  align?: 'center';
  children: ReactNode;
}>) {
  return (
    <Placed
      kind="card"
      at={at}
      data-ghost={ghost || undefined}
      data-picked={picked || undefined}
      data-align={align}
    >
      {children}
    </Placed>
  );
}

export function Pill({
  at,
  centre,
  ring = false,
  children,
}: Readonly<{ at?: ArtPlace; centre?: 'x' | 'both'; ring?: boolean; children: ReactNode }>) {
  return (
    <Placed kind="pill" at={at} data-ring={ring || undefined} data-centre={centre}>
      {children}
    </Placed>
  );
}

export function Chips({
  at,
  count,
  children,
}: Readonly<{ at: ArtPlace; count: 2 | 4; children?: ReactNode }>) {
  const half = count / 2;
  const chip = (key: number) => (
    <span key={key} className="cl-art-chip">
      <Line width={100} tone={children ? 'strong' : 'soft'} />
    </span>
  );
  return (
    <Placed kind="chips" at={at}>
      {Array.from({ length: half }, (_, index) => chip(index))}
      {children}
      {Array.from({ length: half }, (_, index) => chip(half + index))}
    </Placed>
  );
}
