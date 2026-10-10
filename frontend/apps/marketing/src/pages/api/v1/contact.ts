import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { env } from 'cloudflare:workers';
import { handleContactRequest } from '../../../contact-request';
import { sendContactEmail } from '../../../contact-mail';
import { turnstileHostnames } from '../../../turnstile';

export const prerender = false;

export const ALL: APIRoute = ({ request }) => {
  const bindings = env;
  return handleContactRequest(
    request,
    async (submission) => {
      const apiKey = getSecret('RESEND_API_KEY');
      if (!apiKey) {
        console.error('Contact email is not configured.');
        return false;
      }
      return sendContactEmail(submission, apiKey);
    },
    { ip: bindings.CONTACT_IP_LIMITER, burst: bindings.CONTACT_BURST_LIMITER },
    {
      secret: getSecret('TURNSTILE_SECRET_KEY'),
      hostnames: turnstileHostnames(getSecret('TURNSTILE_HOSTNAMES')),
    },
  );
};
