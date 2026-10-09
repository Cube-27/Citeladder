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

type FormState = 'idle' | 'sending' | 'success' | 'error' | 'rate-limited';
type FormErrors = Partial<Record<'name' | 'email' | 'company' | 'message', string>>;

function ContactForm() {
  const form = useRef<HTMLFormElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const sent = useRef(false);
  const [state, setState] = useState<FormState>('idle');
  const [errors, setErrors] = useState<FormErrors>({});
  useEffect(() => {
    if (state === 'success' || state === 'error' || state === 'rate-limited')
      status.current?.focus();
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
      if (response.status === 429) {
        setState('rate-limited');
        return;
      }
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
        <h2 id="contact-sent-title" className="website-feature-heading text-foreground">
          Message sent
        </h2>
        <p className="website-body">
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
      {(state === 'error' || state === 'rate-limited') && (
        <div ref={status} tabIndex={-1} role="alert" className="website-body text-danger-text">
          {state === 'rate-limited'
            ? 'Too many enquiries right now. Please wait a minute and try again, or email us at '
            : "We couldn't send your message. Please try again, or email us at "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          {'.'}
        </div>
      )}
      <Button type="submit" size="marketing" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}

/**
 * What happens after a message is sent. These describe the reply process,
 * not a response-time commitment.
 */
const NEXT_STEPS = [
  {
    title: 'Tell us what you need',
    body: 'A few lines on your team, your category and what you want to measure is enough.',
  },
  {
    title: 'We reply by email',
    body: 'We get back to you at the work email you provide.',
  },
  {
    title: 'We show you the product',
    body: 'If a demo helps, we walk through your own prompts, competitors and sources.',
  },
] as const;

export function ContactPage() {
  return (
    <main id="main">
      <Section className="cm-contact">
        <div className="cm-contact-grid">
          <div className="cm-contact-copy">
            <header className="grid gap-5">
              <h1 className="website-page-title text-foreground">Talk to the CiteLadder team.</h1>
              <p className="website-lead">
                Ask a question, book a demo or check whether CiteLadder fits your team.
              </p>
            </header>
            <div className="grid gap-5">
              <h2 className="website-feature-heading text-foreground">What happens next</h2>
              <ol className="cm-steps">
                {NEXT_STEPS.map((step) => (
                  <li key={step.title}>
                    <h3 className="website-feature-heading text-foreground">{step.title}</h3>
                    <p className="website-body">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
            <p className="website-body">
              Prefer email?{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="mk-text-link">
                {CONTACT_EMAIL}
              </a>
            </p>
            <details className="cm-legal">
              <summary className="website-label">Company, support and grievance details</summary>
              <div className="grid gap-6 pt-6">
                {CONTACT_PAGE.sections.map((section) => (
                  <section key={section.id} id={section.id} className="grid gap-3">
                    <h2 className="website-feature-heading text-foreground">{section.title}</h2>
                    {section.paragraphs?.map((paragraph) => (
                      <p key={paragraph} className="website-body">
                        <Linkify text={paragraph} />
                      </p>
                    ))}
                  </section>
                ))}
              </div>
            </details>
          </div>
          <div className="cm-contact-panel">
            <ContactForm />
            <noscript>
              <p className="website-body mt-6">
                Please email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to get in
                touch.
              </p>
            </noscript>
          </div>
        </div>
      </Section>
    </main>
  );
}
