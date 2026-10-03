import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CONTACT_API_PATH,
  CONTACT_EMAIL,
  CONTACT_LIMITS,
  CONTACT_REQUEST_TIMEOUT_MS,
  contactSubmissionSchema,
} from '@/lib/config/contact';
import { trackContactSubmitted } from '@/components/analytics/google-analytics';
import { CONTACT_PAGE } from '@/lib/marketing-content/legal-billing';
import { Linkify } from '../primitives/linkify';
import { Section } from '../primitives/section';
import { PageHero } from '../primitives/page-hero';

type FormState = 'idle' | 'sending' | 'success' | 'error';
type FormErrors = Partial<Record<'name' | 'email' | 'company' | 'message', string>>;

function ContactForm() {
  const form = useRef<HTMLFormElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const sent = useRef(false);
  const [state, setState] = useState<FormState>('idle');
  const [errors, setErrors] = useState<FormErrors>({});
  useEffect(() => {
    if (state === 'success' || state === 'error') status.current?.focus();
    if (state === 'idle' && sent.current)
      form.current?.querySelector<HTMLElement>('[name="name"]')?.focus();
  }, [state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const parsed = contactSubmissionSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      const fields = Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
      );
      setErrors(fields);
      const first = parsed.error.issues[0]?.path[0];
      form.current?.querySelector<HTMLElement>(`[name="${String(first)}"]`)?.focus();
      return;
    }
    pending.current = true;
    setErrors({});
    setState('sending');
    try {
      const response = await fetch(CONTACT_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(CONTACT_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error('Send failed');
      sent.current = true;
      setState('success');
      trackContactSubmitted();
    } catch {
      setState('error');
    } finally {
      pending.current = false;
    }
  }

  if (state === 'success')
    return (
      <section
        ref={status}
        tabIndex={-1}
        aria-labelledby="contact-sent-title"
        aria-live="polite"
        className="grid gap-4"
      >
        <h2 id="contact-sent-title" className="website-section-heading">
          Message sent
        </h2>
        <p className="website-body text-muted">
          Thanks for reaching out. We&apos;ll get back to you at the email address you provided.
        </p>
        <Button variant="secondary" onClick={() => setState('idle')}>
          Send another message
        </Button>
      </section>
    );

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      className="grid gap-6"
      aria-busy={state === 'sending'}
    >
      <Field label="Name" required error={errors.name}>
        {(props) => (
          <Input
            {...props}
            name="name"
            autoComplete="name"
            maxLength={CONTACT_LIMITS.name}
            size="lg"
          />
        )}
      </Field>
      <Field label="Work email" required error={errors.email}>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={CONTACT_LIMITS.email}
            size="lg"
          />
        )}
      </Field>
      <Field label="Company" hint="Optional" error={errors.company}>
        {(props) => (
          <Input
            {...props}
            name="company"
            autoComplete="organization"
            maxLength={CONTACT_LIMITS.company}
            size="lg"
          />
        )}
      </Field>
      <Field label="How can we help?" required error={errors.message}>
        {(props) => (
          <Textarea
            {...props}
            name="message"
            rows={5}
            minLength={CONTACT_LIMITS.messageMin}
            maxLength={CONTACT_LIMITS.message}
            placeholder="Tell us what you're looking to accomplish."
          />
        )}
      </Field>
      <div hidden aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          maxLength={CONTACT_LIMITS.company}
        />
      </div>
      {state === 'error' && (
        <div ref={status} tabIndex={-1} role="alert" className="website-body text-danger-text">
          We couldn&apos;t send your message. Please try again, or email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          .
        </div>
      )}
      <Button type="submit" size="marketing" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}

export function ContactPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Contact"
        title="Let's talk about CiteLadder"
        lead="Have a question, want to see CiteLadder in action, or want to discuss how it could fit your team? Send us a note and we'll get back to you."
      >
        <p className="website-body mt-6">
          Prefer email?{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-accent-text underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </PageHero>
      <Section rhythm="tight">
        <div className="w-full max-w-xl">
          <ContactForm />
        </div>
        <noscript>
          <p className="website-body">
            Please email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to get in touch.
          </p>
        </noscript>
        <details className="border-border-subtle w-full max-w-3xl border-t pt-6">
          <summary className="website-label cursor-pointer">
            Company, support and grievance details
          </summary>
          <div className="grid gap-6 pt-6">
            {CONTACT_PAGE.sections.map((section) => (
              <section key={section.id} id={section.id} className="grid gap-3">
                <h2 className="website-feature-heading">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="website-body text-muted">
                    <Linkify text={paragraph} />
                  </p>
                ))}
              </section>
            ))}
          </div>
        </details>
      </Section>
    </main>
  );
}
