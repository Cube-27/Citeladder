import { ProjectLink } from '@/components/ui/project-link';
import { Button } from '@/components/ui/button';
import { Inline } from '@/components/ui/layout';
import { PROMPTS_GENERATE_HREF, PROMPTS_HREF } from '@/lib/prompts/routes';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';

/**
 * Shown on Overview while the project tracks no active prompts. Onboarding
 * creates none, so this is where a new project starts: the user chooses what
 * to measure before any visibility number exists.
 */
export function PromptSetupCard() {
  return (
    <Section aria-labelledby="prompt-setup-heading">
      <SectionHeader>
        <SectionTitle id="prompt-setup-heading">
          Choose the questions you want to track
        </SectionTitle>
        <SectionDescription>
          Generate buyer questions from your confirmed offerings, or add your own.
        </SectionDescription>
      </SectionHeader>
      <Inline as={SectionContent} className="flex-wrap">
        <Button asChild variant="primary">
          <ProjectLink href={PROMPTS_GENERATE_HREF}>Generate prompts</ProjectLink>
        </Button>
        <Button asChild variant="secondary">
          <ProjectLink href={PROMPTS_HREF}>Add or import prompts</ProjectLink>
        </Button>
      </Inline>
    </Section>
  );
}
