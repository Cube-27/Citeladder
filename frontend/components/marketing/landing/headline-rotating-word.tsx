'use client';

import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

const WORDS = ['ChatGPT', 'Claude', 'Gemini'] as const;

export function HeadlineRotatingWord() {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % WORDS.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  const current = WORDS[index];

  if (reduceMotion) {
    return <span className="mkt-keyword font-mkt-display not-italic">ChatGPT</span>;
  }

  return (
    <span
      style={{ perspective: '800px' }}
      className="relative inline-grid items-center justify-items-center overflow-hidden px-1 text-center align-baseline"
    >
      {/* Invisible spacer locking width permanently to max word size so layout shifting is impossible */}
      <span className="font-mkt-display invisible col-start-1 row-start-1 select-none">
        ChatGPT
      </span>

      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={current}
          initial={{ rotateX: -90, opacity: 0, y: 14 }}
          animate={{ rotateX: 0, opacity: 1, y: 0 }}
          exit={{ rotateX: 90, opacity: 0, y: -14 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: 'center center -10px' }}
          className="mkt-keyword font-mkt-display col-start-1 row-start-1 transform-gpu not-italic"
        >
          {current}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
