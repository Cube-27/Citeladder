import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/text-link';
import { Textarea } from '@/components/ui/textarea';
import {
  CONTACT_API_PATH,
  CONTACT_EMAIL,
  CONTACT_LIMITS,
  CONTACT_REQUEST_TIMEOUT_MS,
  CONTACT_TURNSTILE_ACTION,
  contactSubmissionSchema,
} from '@/lib/config/contact';
import { trackContactSubmitted } from '@/components/analytics/google-analytics';
import { CONTACT_PAGE } from '@/lib/marketing-content/legal-billing';
import { useTurnstile } from '@/lib/turnstile/use-turnstile';

import { Linkify } from '../primitives/linkify';
import { PageHero } from '../sections/heroes';
import { PageForm } from '../sections/page-form';
import { PageSection } from '../sections/page-section';
import { FaqList, Steps } from '../sections/steps-faq-cta';

const FAILURE_COPY = {
  error: "We couldn't send your message. Please try again, or email us at ",
  'rate-limited':
    'Too many enquiries right now. Please wait a minute and try again, or email us at ',
  unverified:
    "We couldn't confirm this browser. Complete the check above and try again, or email us at ",
} as const;
type Failure = keyof typeof FAILURE_COPY;
type FormState = 'idle' | 'sending' | 'success' | Failure;
const isFailure = (state: FormState): state is Failure => state in FAILURE_COPY;
const SUBMIT_LABELS = ['Send message', 'Sending…'] as const;
type FormErrors = Partial<Record<'name' | 'email' | 'company' | 'message', string>>;

function EmailLink() {
  return (
    <TextLink asChild text="inherit">
      <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </TextLink>
  );
}

function ContactForm() {
  const panel = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const sent = useRef(false);
  const [state, setState] = useState<FormState>('idle');
  const [errors, setErrors] = useState<FormErrors>({});
  const { container: turnstileContainer, token, reset } = useTurnstile(CONTACT_TURNSTILE_ACTION);
  const failure = isFailure(state) ? FAILURE_COPY[state] : null;
  useEffect(() => {
    if (state === 'success' || failure) status.current?.focus();
    if (state === 'idle' && sent.current)
      panel.current?.querySelector<HTMLElement>('[name="name"]')?.focus();
  }, [state, failure]);

  function clearError({ target }: FormEvent<HTMLDivElement>) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    setErrors((current) =>
      target.name in current
        ? Object.fromEntries(Object.entries(current).filter(([field]) => field !== target.name))
        : current,
    );
  }

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
      panel.current?.querySelector<HTMLElement>(`[name="${String(first)}"]`)?.focus();
      return;
    }
    pending.current = true;
    setErrors({});
    setState('sending');
    try {
      const response = await fetch(CONTACT_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, turnstile_token: token() }),
        signal: AbortSignal.timeout(CONTACT_REQUEST_TIMEOUT_MS),
      });
      if (response.status === 429) {
        setState('rate-limited');
        return;
      }
      if (response.status === 403) {
        setState('unverified');
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
      reset();
    }
  }

  if (state === 'success')
    return (
      <section
        ref={status}
        tabIndex={-1}
        aria-labelledby="contact-sent-title"
        aria-live="polite"
        className="cl-page-form"
      >
        <header className="cl-page-form-head">
          <h2 id="contact-sent-title" className="cl-page-form-title">
            Message sent
          </h2>
          <p className="cl-page-form-desc">
            Thanks for reaching out. We&apos;ll get back to you at the email address you provided.
          </p>
        </header>
        <div>
          <Button variant="secondary" onClick={() => setState('idle')}>
            Send another message
          </Button>
        </div>
      </section>
    );

  return (
    <div ref={panel} onInput={clearError}>
      <PageForm
        onSubmit={submit}
        busy={state === 'sending'}
        status={
          failure && (
            <div
              ref={(node) => {
                status.current = node;
              }}
              tabIndex={-1}
            >
              <Callout tone="negative">
                {failure}
                <EmailLink />
                {'.'}
              </Callout>
            </div>
          )
        }
        turnstile={<div ref={turnstileContainer} className="w-full" />}
        submit={
          <Button type="submit" variant="primary" disabled={state === 'sending'}>
            <span className="inline-grid justify-items-center">
              {SUBMIT_LABELS.map((reserved) => (
                <span
                  key={reserved}
                  aria-hidden="true"
                  className="invisible col-start-1 row-start-1"
                >
                  {reserved}
                </span>
              ))}
              <span className="col-start-1 row-start-1">
                {state === 'sending' ? 'Sending…' : 'Send message'}
              </span>
            </span>
          </Button>
        }
      >
        <Field label="Name" required error={errors.name}>
          {(props) => (
            <Input {...props} name="name" autoComplete="name" maxLength={CONTACT_LIMITS.name} />
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
      </PageForm>
    </div>
  );
}

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
      <PageHero
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Contact' }]}
        title="Talk to the CiteLadder team"
        lead="Ask a question, book a demo or check whether CiteLadder fits your team."
      />

      <PageSection
        id="enquiry"
        layout="aside"
        split="even"
        title="What happens next"
        aside={
          <div className="grid gap-6">
            <Steps direction="vertical" items={NEXT_STEPS} />
            <p className="cl-body">
              Prefer email? <EmailLink />
            </p>
          </div>
        }
      >
        <ContactForm />
        <noscript>
          <p className="cl-body mt-6">
            Please email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to get in touch.
          </p>
        </noscript>
      </PageSection>

      <PageSection
        id="details"
        layout="aside"
        split="even"
        title="Company, support and grievance details"
      >
        <FaqList
          exclusive
          items={CONTACT_PAGE.sections.map((section) => ({
            id: section.id,
            question: section.title,
            answer: section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>
                <Linkify text={paragraph} />
              </p>
            )),
          }))}
        />
      </PageSection>
    </main>
  );
}
