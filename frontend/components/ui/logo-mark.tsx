import Image from 'next/image';

const LOGO = { src: '/citeladder-logo.png', width: 1182, height: 205 } as const;

/** The canonical CiteLadder logo lockup. The product is light-only. */
export function LogoMark({ size = 16 }: Readonly<{ size?: number }>) {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-xs"
      style={{ width: size * (LOGO.width / LOGO.height), height: size }}
      aria-hidden="true"
    >
      <Image
        src={LOGO.src}
        alt=""
        width={LOGO.width}
        height={LOGO.height}
        loading="eager"
        className="size-full object-contain"
      />
    </span>
  );
}
