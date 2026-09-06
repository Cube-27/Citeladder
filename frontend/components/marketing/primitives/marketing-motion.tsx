'use client';

import { LazyMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * The marketing tree's one animation boundary.
 *
 * **`m` components had no features.** `m` is the lightweight motion element:
 * it is created WITHOUT the feature bundle and without a visual-element factory
 * (`createMotionComponent(C, opts)` versus `motion`'s
 * `createMotionComponent(C, opts, featureBundle, createDomVisualElement)`), and
 * gets both from a `LazyMotion` ancestor. There was no such ancestor, so every
 * `m` in the marketing tree rendered as an inert element — the nav's `layout`
 * animation silently did nothing while still paying for `motion-dom` in the
 * bundle.
 * `domMax` rather than `domAnimation` because the nav animates `layout`, which
 * only `domMax` carries.
 *
 * The feature bundle is loaded through a FUNCTION, not imported eagerly: that is
 * what keeps it in its own async chunk instead of the initial payload.
 *
 * Scroll reveals are CSS scroll-driven animations (see `globals.css`) and need
 * no JavaScript at all — this boundary exists only for the nav's `m` elements.
 */
const loadMotionFeatures = () => import('motion/react').then((mod) => mod.domMax);

export function MarketingMotion({ children }: Readonly<{ children: ReactNode }>) {
  return <LazyMotion features={loadMotionFeatures}>{children}</LazyMotion>;
}
