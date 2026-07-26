import { ArrowRight, CalendarDays, Mail } from 'lucide-react';
import type { Metadata } from 'next';

import { ButtonLink } from '@/components/marketing/primitives/button';
import { PageHero } from '@/components/marketing/primitives/page-hero';
import { Section } from '@/components/marketing/primitives/section';

export const metadata: Metadata = {
  title: 'Book an enterprise demo — Searchify',
  description:
    'Discuss Searchify Enterprise volumes, deployment, security review, and support with the team.',
};

function safeBookingUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function DemoPage() {
  const bookingUrl = safeBookingUrl(process.env.DEMO_BOOKING_URL);
  const salesEmail = process.env.PUBLIC_SALES_EMAIL?.trim();
  const actionHref = bookingUrl ?? (salesEmail ? `mailto:${salesEmail}` : null);

  return (
    <main>
      <PageHero
        centered
        eyebrow="Enterprise demo"
        title="Bring your category."
        accent="Leave with a concrete rollout path."
        lead="We’ll cover your answer-engine measurement goals, workspace volume, deployment constraints, security review, and the evidence your team needs to trust the output."
      >
        <div className="mt-9 flex justify-center">
          {actionHref ? (
            <ButtonLink
              href={actionHref}
              target={bookingUrl ? '_blank' : undefined}
              rel={bookingUrl ? 'noreferrer' : undefined}
            >
              {bookingUrl ? (
                <CalendarDays className="size-4" aria-hidden />
              ) : (
                <Mail className="size-4" aria-hidden />
              )}
              {bookingUrl ? 'Schedule demo' : 'Email sales'}
              <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          ) : (
            <p className="text-mkt-sm text-mkt-ink-muted max-w-[52ch]">
              Demo scheduling is being configured. No contact details are collected on this page;
              please check back after the public sales address is published.
            </p>
          )}
        </div>
      </PageHero>

      <Section divided rhythm="tight" aria-label="What to expect">
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
          {[
            ['Your measurement plan', 'Prompts, engines, repetitions, evidence, and reporting.'],
            [
              'Your operating model',
              'Seats, projects, cadence, retention, and support expectations.',
            ],
            [
              'Your deployment path',
              'Managed cloud or self-hosted, including security review needs.',
            ],
          ].map(([title, description]) => (
            <section
              key={title}
              className="border-mkt-line bg-mkt-surface rounded-mkt-lg border p-6"
            >
              <h2 className="font-mkt-display text-mkt-ink font-semibold">{title}</h2>
              <p className="text-mkt-sm text-mkt-ink-soft mt-2">{description}</p>
            </section>
          ))}
        </div>
        <p className="text-mkt-sm text-mkt-ink-muted mx-auto mt-8 max-w-3xl text-center">
          Searchify does not store demo-lead details on this page. If scheduling is enabled, the
          approved booking provider’s privacy terms apply at the external destination.
        </p>
      </Section>
    </main>
  );
}
