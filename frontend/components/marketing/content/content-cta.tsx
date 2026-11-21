import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageSection } from '../sections/page-section';
import { CtaBand } from '../sections/steps-faq-cta';

export function ContentCta({
  title,
  lead,
  secondary,
}: Readonly<{
  title: string;
  lead?: string;
  secondary: Readonly<{ href: string; label: string }>;
}>) {
  return (
    <PageSection label="Get started">
      <CtaBand
        title={title}
        lead={lead}
        actions={
          <>
            <DemoButtonLink />
            <ButtonLink href={secondary.href} variant="soft">
              {secondary.label}
            </ButtonLink>
          </>
        }
      />
    </PageSection>
  );
}
