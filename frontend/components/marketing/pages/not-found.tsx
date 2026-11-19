import { ButtonLink } from '../primitives/button';
import { RelatedCards } from '../sections/cards';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';

type Link = Readonly<{ label: string; href: string }>;

/**
 * The 404 page: Home and Contact lead as buttons and the other recovery links
 * follow as cards. The links come from the worker's not-found module, which
 * also writes the Markdown 404 for agents, so both list the same pages.
 */
export function NotFoundPage({ links }: Readonly<{ links: readonly Link[] }>) {
  const suggested = links
    .filter((link) => link.href !== '/' && link.href !== '/contact')
    .map((link) => ({ href: link.href, title: link.label, linkLabel: 'Open' }));
  return (
    <main id="main">
      <PageHero
        title="We couldn't find that page"
        lead="It may have moved, or the link may be wrong. Try one of these pages instead."
        actions={
          <>
            <ButtonLink href="/">Home</ButtonLink>
            <ButtonLink href="/contact" variant="soft">
              Contact
            </ButtonLink>
          </>
        }
      />
      <PageSection spacing="compact" label="Suggested pages" labelHeading>
        <RelatedCards items={suggested} />
      </PageSection>
    </main>
  );
}
