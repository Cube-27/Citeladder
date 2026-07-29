'use client';

import { domAnimation, LazyMotion } from 'motion/react';
import type { ReactNode } from 'react';

export function MarketingMotionProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
