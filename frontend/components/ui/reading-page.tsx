import { useId, type ReactNode } from 'react';

import { Stack } from '@/components/ui/layout';
import {
  Section,
  SectionBleed,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { textRole, type TextRole } from '@/components/ui/typography';

export function ReadingColumn({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="gap-section pb-page-end flex min-h-dvh w-full min-w-0 flex-col">{children}</div>
  );
}

export function ReadingTools({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export const READING_SECTION_TITLE = 'subheading' satisfies TextRole;

export function Labelled({
  title,
  caption,
  bare = false,
  children,
}: Readonly<{
  title: string;
  caption?: string | null;
  bare?: boolean;
  children: ReactNode;
}>) {
  const id = useId();
  return (
    <Section aria-labelledby={id}>
      <SectionHeader>
        <SectionTitle id={id}>{title}</SectionTitle>
        {caption ? <SectionDescription>{caption}</SectionDescription> : null}
      </SectionHeader>
      {bare ? (
        children
      ) : (
        <SectionContent>
          <Stack gap="item">{children}</Stack>
        </SectionContent>
      )}
    </Section>
  );
}

export function Prose({ children }: Readonly<{ children: ReactNode }>) {
  return <p className={textRole('body', 'break-words')}>{children}</p>;
}

export type DetailFact = Readonly<{ label: string; value: ReactNode }>;

export function DetailsFacts({ facts }: Readonly<{ facts: readonly DetailFact[] }>) {
  const id = useId();
  return (
    <Section aria-labelledby={id}>
      <SectionHeader>
        <SectionTitle id={id}>Details</SectionTitle>
      </SectionHeader>
      <SectionBleed as="dl" rows>
        {facts.map((fact) => (
          <div key={fact.label} className="flex">
            <dt className={textRole('body', 'text-ink-2 w-30 shrink-0')}>{fact.label}</dt>
            <dd className={textRole('body', 'flex min-w-0 flex-1 items-center gap-2')}>
              {fact.value}
            </dd>
          </div>
        ))}
      </SectionBleed>
    </Section>
  );
}

export function StepList({ items }: Readonly<{ items: readonly string[] }>) {
  return (
    <ul className="flex list-disc flex-col gap-1 ps-5">
      {items.map((item) => (
        <li key={item} className={textRole('body', 'min-w-0 break-words')}>
          {item}
        </li>
      ))}
    </ul>
  );
}
