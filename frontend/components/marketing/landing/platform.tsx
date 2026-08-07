import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { AgentConsole, AgentGuarantees } from './agent-console';
import { Reveal } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';

/**
 * Product architecture, shown as the system actually behaves: three intelligence
 * layers stream evidence along a converging bus into the Growth Agent, and the
 * agent answers in a live transcript. The stage is a client island
 * (`agent-console.tsx`) because the conversation runs on timers; everything
 * around it stays server-rendered.
 */
export function Platform() {
  const { platform } = LANDING_CONTENT;

  return (
    <Section id="platform" tone="paper" rhythm="base" aria-labelledby="platform-title">
      <SectionHeader
        eyebrow={platform.kicker}
        title={platform.title}
        lead={platform.lead}
        align="center"
        headingId="platform-title"
      />

      <Reveal className="mx-auto w-full max-w-[1200px]">
        <AgentConsole />
      </Reveal>

      <Reveal>
        <AgentGuarantees />
      </Reveal>
    </Section>
  );
}
