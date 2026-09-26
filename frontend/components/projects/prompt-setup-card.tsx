'use client';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { PROMPTS_GENERATE_HREF, PROMPTS_MANAGE_HREF } from '@/lib/prompts/routes';

/**
 * Shown on Overview while the project tracks no active prompts. Onboarding
 * creates none, so this is where a new project starts: the user chooses what
 * to measure before any visibility number exists.
 */
export function PromptSetupCard() {
  return (
    <Card
      tone="recommendation"
      className="grid gap-4 p-[var(--card-padding)]"
      aria-labelledby="prompt-setup-heading"
    >
      <Stack gap="tight">
        <h2 id="prompt-setup-heading" className={textRole('sectionTitle')}>
          Choose the questions you want to track
        </h2>
        <p className={textRole('meta')}>
          Generate buyer questions from your confirmed offerings, or add your own.
        </p>
      </Stack>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="primary" size="md">
          <ProjectLink href={PROMPTS_GENERATE_HREF}>Generate prompts</ProjectLink>
        </Button>
        <Button asChild variant="secondary" size="md">
          <ProjectLink href={PROMPTS_MANAGE_HREF}>Add or import prompts</ProjectLink>
        </Button>
      </div>
    </Card>
  );
}
