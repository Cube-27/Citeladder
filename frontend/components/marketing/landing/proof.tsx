'use client';

import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

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
      className={`rounded-mkt-lg hover:bg-mkt-surface/80 relative p-5 transition-all duration-300 ${className}`}
    >
      {/* Radial cursor spotlight glow */}
      <div
        className="rounded-mkt-lg pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(400px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), color-mix(in srgb, var(--color-mkt-proof) 12%, transparent), transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
}

/**
 * The "so how is this real" beat, enhanced with GSAP ScrollTrigger timeline
 * and cursor spotlight cards.
 */
export function Proof() {
  const { proof } = LANDING_CONTENT;
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = sectionRef.current;
      if (!el) return;

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      gsap.fromTo(
        el.querySelectorAll('.proof-connector'),
        { scaleX: 0 },
        {
          scaleX: 1,
          transformOrigin: 'left center',
          duration: 0.8,
          stagger: 0.2,
          ease: 'power3.out',
          clearProps: 'transform',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            once: true,
          },
        },
      );
    },
    { scope: sectionRef },
  );

  return (
    <Section id="how-it-works" tone="sunken" rhythm="loose" aria-labelledby="proof-title">
      <div ref={sectionRef}>
        <SectionHeader
          kicker={proof.kicker}
          title={proof.title}
          intro={proof.intro}
          headingId="proof-title"
        />
        <StaggerGroup className="grid gap-8 md:grid-cols-3">
          {proof.steps.map((step, index) => (
            <StaggerItem key={step.num} className="relative">
              <SpotlightCard className="h-full">
                {/* Connecting line between steps */}
                {index > 0 && (
                  <span
                    aria-hidden
                    className="proof-connector bg-mkt-proof/40 absolute top-8 -left-4 hidden h-0.5 w-8 md:block"
                  />
                )}
                <p className="text-mkt-meta text-mkt-ink-muted font-mono uppercase">
                  {step.num} / {step.kicker}
                </p>
                <h3 className="font-mkt-display text-mkt-ink text-mkt-d5 mt-3">{step.title}</h3>
                <p className="text-mkt-sm text-mkt-ink-soft mt-3 max-w-[36ch]">{step.body}</p>
              </SpotlightCard>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <Reveal className="mt-12">
          <p className="text-mkt-body text-mkt-ink border-mkt-proof max-w-[52ch] border-l-2 pl-5 font-semibold">
            {proof.standard}
          </p>
        </Reveal>
      </div>
    </Section>
  );
}
