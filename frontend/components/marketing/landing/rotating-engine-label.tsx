'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

import { EngineLogo, type OfficialEngineKey } from '../primitives/engine-logo';

const ENGINE_ORDER: readonly {
  key: OfficialEngineKey;
  label: string;
  logoClass: string;
}[] = [
  { key: 'openai', label: 'ChatGPT', logoClass: 'text-mkt-engine-openai' },
  { key: 'claude', label: 'Claude', logoClass: 'text-mkt-engine-claude' },
  { key: 'gemini', label: 'Gemini', logoClass: 'text-mkt-engine-gemini' },
];

const CHANGE_INTERVAL_MS = 2200;

/** Cycles through engines in one stable node so neither width nor opacity flashes. */
export function RotatingEngineLabel() {
  const reduceMotion = useReducedMotion();
  const [engineIndex, setEngineIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;

    const interval = window.setInterval(() => {
      setEngineIndex((current) => (current + 1) % ENGINE_ORDER.length);
    }, CHANGE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [reduceMotion]);

  const engine = ENGINE_ORDER[engineIndex];

  return (
    <span className="inline-flex min-w-[7.5rem] items-center gap-2 align-bottom">
      <EngineLogo engine={engine.key} className={`${engine.logoClass} size-6 shrink-0`} />
      <span>{engine.label}</span>
    </span>
  );
}
