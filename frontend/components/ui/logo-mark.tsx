import Image from 'next/image';

const LOGO = { src: '/citeladder-logo.png', width: 1182, height: 205 } as const;

/**
 * The canonical CiteLadder logo lockup. The product is light-only.
 *
 * `priority` is for the one instance that is the page's first paint (the
 * marketing nav): it adds the `<link rel=preload fetchpriority=high>` that
 * pulls the lockup off the LCP critical path. Every other instance stays
 * eager — never lazy — so chrome logos don't pop in after hydration.
 */
export function LogoMark({
  size = 16,
  priority = false,
}: Readonly<{ size?: number; priority?: boolean }>) {
  // The source is a 1182×205 lockup. Telling the optimizer the width the mark
  // actually renders at keeps it from serving a 1182px-wide candidate for a
  // ~140px slot.
  const renderedWidth = Math.round(size * (LOGO.width / LOGO.height));
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-xs"
      style={{ width: renderedWidth, height: size }}
      aria-hidden="true"
    >
      <Image
        src={LOGO.src}
        alt=""
        width={LOGO.width}
        height={LOGO.height}
        loading="eager"
        priority={priority}
        sizes={`${renderedWidth}px`}
        className="size-full object-contain"
      />
    </span>
  );
}
