'use client';

import { useReducedMotion, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * The hero's on-load entrance. This is the ONE place the marketing surface
 * animates above the fold, and it is deliberately client-side: the scroll
 * `view()` reveals (marketing-motion.css) are CSS-only and never fire here
 * because the hero is already past its entry range at load.
 *
 * The flash that gutted the old JS reveal came from server-rendering an
 * opacity-0 node and swapping it on hydration. This component avoids that by
 * rendering the children UNGATED (fully visible, finished state) and only
 * wrapping them in a motion node once mounted on the client — so the SSR HTML
 * and the no-JS / reduced-motion / unsupported-browser paths all show the
 * settled page, and the entrance is purely additive over content that is
 * already there. Motion is never load-bearing.
 */
export function HeroEntrance({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Before mount (and on the server) the children render UNWRAPPED and fully
  // visible. Wrapping them in a motion node during SSR would ship an
  // opacity-0 hero in the HTML and swap it on hydration — the exact flash that
  // gutted the old JS reveal. The entrance is additive over a page that is
  // already there.
  if (!mounted || reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
