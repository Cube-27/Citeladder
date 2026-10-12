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
  // Steps taken so far; `cycled` maps a step to its engine.
  const [step, setStep] = useState(0);

  useAutoplay({
    target: slot,
    intervalMs: ROTOR_INTERVAL_MS,
    onTick: () => setStep((taken) => taken + 1),
  });

  // Hidden copies of every name size the slot to the widest, so the line
  // never shifts; the live items are re-keyed each step so enter and exit replay.
  return (
    <span ref={slot} className="lp-rotor" aria-hidden>
      {ENGINES.map(([engine], sizer) => (
        <RotorItem key={engine} index={sizer} state="sizer" />
      ))}
      {step === 0 ? null : <RotorItem key={`out-${step}`} index={step - 1} state="out" />}
      <RotorItem key={step} index={step} state={step === 0 ? undefined : 'in'} />
    </span>
  );
}
