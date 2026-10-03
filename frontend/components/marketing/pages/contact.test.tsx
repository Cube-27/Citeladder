import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { ContactPage } from './contact';
import { writeConsent } from '@/lib/consent/cookie-consent';

afterEach(() => {
  vi.unstubAllGlobals();
  writeConsent('rejected');
  Reflect.deleteProperty(window, 'gtag');
});

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Ada');
  await user.type(screen.getByRole('textbox', { name: /^Work email/ }), 'ada@example.com');
  await user.type(
    screen.getByRole('textbox', { name: /^How can we help/ }),
    'Please show us CiteLadder.',
  );
  return user;
}

it('associates validation errors with fields and focuses the first invalid control', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(<ContactPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
  const name = screen.getByRole('textbox', { name: /^Name/ });
  expect(name).toHaveFocus();
  expect(name).toHaveAccessibleDescription('Enter your name.');
  expect(fetch).not.toHaveBeenCalled();
});

it('prevents duplicate submissions, sends without optional company and announces success without personal analytics', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const gtag = vi.fn();
  writeConsent('accepted');
  Reflect.set(window, 'gtag', gtag);
  render(<ContactPage />);
  const user = await fillForm();
  const button = screen.getByRole('button', { name: 'Send message' });
  await user.click(button);
  expect(button).toBeDisabled();
  fireEvent.submit(button.closest('form')!);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]).toMatchObject(['/api/v1/contact', { method: 'POST' }]);
  resolve(Response.json({ outcome: 'success' }));
  await screen.findByRole('heading', { name: 'Message sent' });
  await waitFor(() => expect(screen.getByRole('region', { name: 'Message sent' })).toHaveFocus());
  expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'contact_form_submitted', {
    source_page: '/contact',
  });
  await user.click(screen.getByRole('button', { name: 'Send another message' }));
  expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('');
});

it('retains the enquiry on delivery failure and supports a consent-free retry', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ outcome: 'send_failed' }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ outcome: 'success' }));
  vi.stubGlobal('fetch', fetch);
  const gtag = vi.fn();
  writeConsent('rejected');
  Reflect.set(window, 'gtag', gtag);
  render(<ContactPage />);
  const user = await fillForm();
  await user.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send your message.");
  expect(screen.getByRole('textbox', { name: /^How can we help/ })).toHaveValue(
    'Please show us CiteLadder.',
  );
  await user.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByRole('heading', { name: 'Message sent' });
  expect(gtag).not.toHaveBeenCalled();
});

it('explains throttling and retains the enquiry for a later retry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ outcome: 'rate_limited' }, { status: 429 })),
  );
  render(<ContactPage />);
  const user = await fillForm();
  await user.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please wait a minute');
  expect(screen.getByRole('textbox', { name: /^How can we help/ })).toHaveValue(
    'Please show us CiteLadder.',
  );
});
