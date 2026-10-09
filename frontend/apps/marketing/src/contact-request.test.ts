// @vitest-environment node
import { describe, expect, it, vi } from 'vite-plus/test';
import { handleContactRequest as handleRequest, type ContactRateLimits } from './contact-request';
import { CONTACT_MAX_BODY_BYTES } from '@/lib/config/contact';

const valid = {
  name: ' Ada <Team> ',
  email: ' ADA@Example.COM ',
  company: ' Example ',
  message: ' Please show us CiteLadder. ',
};
function request(payload: unknown, origin = 'https://citeladder.com') {
  return new Request('https://citeladder.com/api/v1/contact', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.10',
    },
    body: JSON.stringify(payload),
  });
}

function allowedLimits() {
  return {
    ip: { limit: vi.fn().mockResolvedValue({ success: true }) },
    burst: { limit: vi.fn().mockResolvedValue({ success: true }) },
  };
}

function handleContactRequest(
  input: Request,
  send: (submission: unknown) => Promise<boolean>,
  limits: ContactRateLimits = allowedLimits(),
) {
  return handleRequest(input, send, limits);
}

describe('contact intake', () => {
  it('accepts a JSON media type in any letter case', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const upper = request(valid);
    upper.headers.set('Content-Type', 'Application/JSON; charset=utf-8');
    expect((await handleContactRequest(upper, send)).status).toBe(200);
  });

  it('limits a trusted client across changed enquiries before reaching the mail provider', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const limits = allowedLimits();
    limits.ip.limit.mockResolvedValueOnce({ success: true }).mockResolvedValue({ success: false });
    expect((await handleContactRequest(request(valid), send, limits)).status).toBe(200);
    const retry = request({
      ...valid,
      email: 'another@example.com',
      message: 'A different enquiry.',
    });
    retry.headers.set('X-Forwarded-For', '198.51.100.99');
    const denied = await handleContactRequest(retry, send, limits);
    expect(denied.status).toBe(429);
    expect(await denied.json()).toEqual({ outcome: 'rate_limited' });
    expect(limits.ip.limit.mock.calls).toEqual([[{ key: '192.0.2.10' }], [{ key: '192.0.2.10' }]]);
    expect(limits.burst.limit).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('blocks aggregate bursts and fails closed on missing identity, bindings or limiter failures', async () => {
    const send = vi.fn();
    const denied = allowedLimits();
    denied.burst.limit.mockResolvedValue({ success: false });
    expect((await handleContactRequest(request(valid), send, denied)).status).toBe(429);
    const missingIp = request(valid);
    missingIp.headers.delete('CF-Connecting-IP');
    missingIp.headers.set('X-Forwarded-For', '198.51.100.99');
    expect((await handleContactRequest(missingIp, send, allowedLimits())).status).toBe(403);
    expect((await handleContactRequest(request(valid), send, {})).status).toBe(503);
    const failed = allowedLimits();
    failed.ip.limit.mockRejectedValue(new Error('private failure'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await handleContactRequest(request(valid), send, failed)).status).toBe(503);
    } finally {
      log.mockRestore();
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('normalizes a valid enquiry before delivery and accepts an omitted company', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const response = await handleContactRequest(request(valid), send);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: 'success' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(send).toHaveBeenCalledExactlyOnceWith({
      name: 'Ada <Team>',
      email: 'ada@example.com',
      company: 'Example',
      message: 'Please show us CiteLadder.',
      website: '',
    });
    const { company: _company, ...withoutCompany } = valid;
    await handleContactRequest(request(withoutCompany), send);
    expect(send.mock.calls[1]?.[0].company).toBe('');
  });

  it.each([
    {},
    { ...valid, name: '   ' },
    { ...valid, email: 'invalid' },
    { ...valid, message: 'short' },
    { ...valid, message: 'x'.repeat(5_001) },
    { ...valid, name: 'Injected\r\nSubject: Header' },
    { ...valid, from: 'attacker@example.com' },
    { ...valid, to: 'attacker@example.com', replyTo: 'attacker@example.com', html: '<script />' },
    [],
    null,
  ])('rejects invalid fields and unexpected payloads without sending', async (payload) => {
    const send = vi.fn();
    const response = await handleContactRequest(request(payload), send);
    expect(response.status).toBe(400);
    expect((await response.json()).outcome).toBe('validation_error');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects honeypots and cross-origin requests before delivery', async () => {
    const send = vi.fn();
    for (const input of [
      request({ ...valid, website: 'bot' }),
      request(valid, 'https://other.example'),
      request(valid, ''),
    ]) {
      expect((await handleContactRequest(input, send)).status).toBe(403);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('returns errors only for editable enquiry fields', async () => {
    const send = vi.fn();
    const response = await handleContactRequest(
      request({ ...valid, name: ' ', email: 'invalid', website: 'x'.repeat(201), extra: true }),
      send,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      outcome: 'validation_error',
      fields: { name: 'Enter your name.', email: 'Enter a valid email address.' },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('bounds streamed bodies and rejects malformed JSON and unsupported methods', async () => {
    const send = vi.fn();
    const headers = { Origin: 'https://citeladder.com', 'Content-Type': 'application/json' };
    for (const body of ['{', ' '.repeat(CONTACT_MAX_BODY_BYTES + 1)]) {
      expect(
        (
          await handleContactRequest(
            new Request('https://citeladder.com/api/v1/contact', { method: 'POST', headers, body }),
            send,
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (await handleContactRequest(new Request('https://citeladder.com/api/v1/contact'), send))
        .status,
    ).toBe(405);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['returned', 'thrown'])('conceals delivery failures (%s)', async (mode) => {
    const send =
      mode === 'returned'
        ? vi.fn().mockResolvedValue(false)
        : vi.fn().mockRejectedValue(new Error('private provider details'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await handleContactRequest(request(valid), send);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ outcome: 'send_failed' });
    } finally {
      log.mockRestore();
    }
  });
});
