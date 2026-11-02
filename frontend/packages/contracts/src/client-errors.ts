/**
 * A browser error report (`POST /api/v1/client-errors`): what failed and on
 * which screen, never what the reader typed or viewed. The body is strict, so
 * an extra field is refused rather than logged; who reported it comes from the
 * session, never from here.
 */
import { z } from 'zod';

const CLIENT_ERROR_KINDS = ['chunk_load', 'render', 'route', 'unhandled'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

/** Field lengths, in characters; the reporter truncates to them before sending. */
export const CLIENT_ERROR_FIELD_LIMITS = {
  message: 500,
  stack: 4000,
  route: 512,
  release: 64,
  component: 64,
} as const;

const limits = CLIENT_ERROR_FIELD_LIMITS;

export const clientErrorReportSchema = z.strictObject({
  kind: z.enum(CLIENT_ERROR_KINDS),
  message: z.string().min(1).max(limits.message),
  stack: z.string().max(limits.stack).nullable(),
  /** The screen's path: no query string or fragment. */
  route: z
    .string()
    .max(limits.route)
    .regex(/^\/[^?#\s]*$/u),
  /** The build that reported it: a commit SHA, or `development`. */
  release: z
    .string()
    .min(1)
    .max(limits.release)
    .regex(/^[\w.-]+$/u),
  /** The boundary that caught it, such as `chart`. */
  component: z
    .string()
    .min(1)
    .max(limits.component)
    .regex(/^[\w-]+$/u)
    .optional(),
});
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

/**
 * Text with every URL's query string and fragment removed, since either can
 * carry what a reader searched for or a token a link handed them. A stack
 * frame's trailing `:line:column` stays.
 */
export function withoutQueryStrings(text: string): string {
  return text.replaceAll(/\b[a-z][\w+.-]*:\/\/[^\s'"`)]+/giu, (url) => {
    const position = /(?::\d+){1,2}$/u.exec(url)?.[0] ?? '';
    const address = url.slice(0, url.length - position.length);
    const cut = address.search(/[?#]/u);
    return cut === -1 ? url : address.slice(0, cut) + position;
  });
}
