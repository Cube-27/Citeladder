'use client';

import { useRef, useState } from 'react';

import { cycled } from '@/lib/utils';

import { EngineLogo, type OfficialEngineKey } from '../primitives/engine-logo';
import { useAutoplay } from './use-autoplay';

const ENGINES = [
  ['openai', 'ChatGPT'],
  ['gemini', 'Gemini'],
  ['claude', 'Claude'],
] as const satisfies readonly (readonly [OfficialEngineKey, string])[];

const ROTOR_INTERVAL_MS = 2400;

type Rotation = { index: number; previous: number | null };

function RotorItem({ index, state }: Readonly<{ index: number; state?: 'in' | 'out' | 'sizer' }>) {
  const [engine, name] = cycled(ENGINES, index);
  return (
    <span className="lp-rotor-item" data-state={state}>
      <EngineLogo engine={engine} className="lp-rotor-logo" />
      {name}
    </span>
  );
}

/**
 * The hero headline's answer-engine rotor. The server renders ChatGPT, so the
 * headline reads whole without hydration; the heading's accessible name comes
 * from its visually hidden sentence, so the rotor stays out of the tree.
 */
export function EngineRotor() {
  const slot = useRef<HTMLSpanElement>(null);
  const [{ index, previous }, setRotation] = useState<Rotation>({ index: 0, previous: null });

  useAutoplay({
    target: slot,
    intervalMs: ROTOR_INTERVAL_MS,
    onTick: () =>
      setRotation((rotation) => ({
        index: (rotation.index + 1) % ENGINES.length,
        previous: rotation.index,
      })),
  });

  // Hidden copies of every name size the slot to the widest, so the line
  // never shifts; the live items are re-keyed each step so enter and exit replay.
  return (
    <span ref={slot} className="lp-rotor" aria-hidden>
      {ENGINES.map(([engine], sizer) => (
        <RotorItem key={engine} index={sizer} state="sizer" />
      ))}
      {previous === null ? null : <RotorItem key={`out-${index}`} index={previous} state="out" />}
      <RotorItem key={index} index={index} state={previous === null ? undefined : 'in'} />
    </span>
  );
}
