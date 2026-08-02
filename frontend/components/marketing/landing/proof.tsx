'use client';

import { useRef, useState } from 'react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';

function SpotlightCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
    if (opacity !== 1) setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`rounded-mkt-lg hover:bg-mkt-surface/80 p-mkt-20 relative transition-all duration-300 ${className}`}
    >
      {/* Radial cursor spotlight glow */}
      <div
        className="rounded-mkt-lg pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(400px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), color-mix(in srgb, var(--color-mkt-indigo) 12%, transparent), transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
}

/**
 * The "so how is this real" beat — the three steps as cursor-spotlight cards.
 */
export function Proof() {
  const { proof } = LANDING_CONTENT;

  return (
    <Section id="how-it-works" tone="sunken" rhythm="base" aria-labelledby="proof-title">
      <SectionHeader
        eyebrow={proof.kicker}
        title={proof.title}
        lead={proof.intro}
        headingId="proof-title"
      />
      <StaggerGroup className="gap-mkt-30 grid md:grid-cols-3">
        {proof.steps.map((step) => (
          <StaggerItem key={step.num} className="relative">
            <SpotlightCard className="h-full">
              <p className="text-mkt-xs text-mkt-ink-soft font-mono uppercase">
                {step.num} / {step.kicker}
              </p>
              <h3 className="font-mkt-display text-mkt-ink text-mkt-hsm mt-mkt-14">{step.title}</h3>
              <p className="text-mkt-sm text-mkt-ink-soft mt-mkt-14 max-w-[50ch]">{step.body}</p>
            </SpotlightCard>
          </StaggerItem>
        ))}
      </StaggerGroup>
      <Reveal className="mt-mkt-50">
        <p className="text-mkt-body text-mkt-ink border-mkt-indigo pl-mkt-20 max-w-[80ch] border-l-2 font-semibold">
          {proof.standard}
        </p>
      </Reveal>
    </Section>
  );
}
