import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { handleContactRequest } from '../../../contact-request';
import { sendContactEmail } from '../../../contact-mail';

export const ALL: APIRoute = ({ request }) =>
  handleContactRequest(request, async (submission) => {
    const apiKey = getSecret('RESEND_API_KEY');
    if (!apiKey) {
      console.error('Contact email is not configured.');
      return false;
    }
    return sendContactEmail(submission, apiKey);
  });
