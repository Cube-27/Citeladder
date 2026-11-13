/**
 * Browser reports to the API's logs. `POST /api/v1/client-errors` takes an
 * error or a slow interaction: what failed or lagged and on which screen,
 * never what the reader typed or viewed. The body is strict, so an extra field
 * is refused rather than logged; who reported it comes from the session, never
 * from here. `CSP_REPORTS_PATH` takes the Reporting API's policy violations.
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
  script: 512,
  invoker: 128,
} as const;

/** The scripts a slow interaction report names, longest first. */
export const SLOW_INTERACTION_SCRIPT_LIMIT = 3;

const limits = CLIENT_ERROR_FIELD_LIMITS;
const noQuery = /^[^?#\s]*$/u;
const milliseconds = z.number().int().min(0).max(600_000);

/** The screen's path: no query string or fragment. */
const route = z
  .string()
  .max(limits.route)
  .regex(/^\/[^?#\s]*$/u);
/** The build that reported it: a commit SHA, or `development`. */
const release = z
  .string()
  .min(1)
  .max(limits.release)
  .regex(/^[\w.-]+$/u);

const errorReportSchema = z.strictObject({
  kind: z.enum(CLIENT_ERROR_KINDS),
  message: z.string().min(1).max(limits.message),
  stack: z.string().max(limits.stack).nullable(),
  route,
  release,
  /** The boundary that caught it, such as `chart`. */
  component: z
    .string()
    .min(1)
    .max(limits.component)
    .regex(/^[\w-]+$/u)
    .optional(),
});

/**
 * The page load's slowest interaction (Interaction to Next Paint), with its
 * phases and the scripts that ran in the frames it spanned. `target` is the
 * element's tag name only, never its text or attributes.
 */
const slowInteractionReportSchema = z.strictObject({
  kind: z.literal('slow_interaction'),
  route,
  release,
  event: z.string().regex(/^[a-z]{1,32}$/u),
  target: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/u)
    .nullable(),
  duration_ms: milliseconds,
  input_delay_ms: milliseconds,
  processing_ms: milliseconds,
  presentation_ms: milliseconds,
  scripts: z
    .array(
      z.strictObject({
        source: z.string().max(limits.script).regex(noQuery),
        /** Such as `BUTTON#send.onclick` or `Window.setTimeout`. */
        invoker: z
          .string()
          .max(limits.invoker)
          .regex(/^[^?\s]*$/u),
        duration_ms: milliseconds,
      }),
    )
    .max(SLOW_INTERACTION_SCRIPT_LIMIT),
});
export type SlowInteractionReport = z.infer<typeof slowInteractionReportSchema>;

export const clientReportSchema = z.discriminatedUnion('kind', [
  errorReportSchema,
  slowInteractionReportSchema,
]);
export type ClientReport = z.infer<typeof clientReportSchema>;

/** Where the product's policies send Reporting API violation reports. */
export const CSP_REPORTS_PATH = '/api/v1/client-errors/csp-reports';

/** The most reports one Reporting API delivery may carry. */
export const CSP_REPORT_BATCH_LIMIT = 20;

const reportUrl = z.string().max(2048);

/**
 * One `csp-violation` report as the Reporting API sends it. Fields a browser
 * adds beyond these are dropped. Of `sample`, which can hold page text or
 * code, only a Trusted Types sink name (the part before `|`) is kept.
 */
const cspViolationSchema = z.object({
  type: z.literal('csp-violation'),
  body: z.object({
    documentURL: reportUrl,
    blockedURL: reportUrl.optional(),
    effectiveDirective: z.string().max(64),
    disposition: z.enum(['enforce', 'report']),
    sourceFile: reportUrl.nullish(),
    lineNumber: z.number().int().nonnegative().nullish(),
    columnNumber: z.number().int().nonnegative().nullish(),
    sample: z
      .string()
      .max(256)
      .optional()
      .transform((value) =>
        value?.includes('|') ? value.slice(0, value.indexOf('|')).slice(0, 64) : undefined,
      ),
  }),
});

/** Another report type sent to the same endpoint, which the sink ignores. */
const otherReportSchema = z.object({
  type: z
    .string()
    .max(64)
    .refine((type) => type !== 'csp-violation'),
});

/** A Reporting API delivery (`application/reports+json`). */
export const cspReportBatchSchema = z
  .array(z.union([cspViolationSchema, otherReportSchema]))
  .min(1)
  .max(CSP_REPORT_BATCH_LIMIT);

/**
 * Text with every URL's query string and fragment removed, since either can
 * carry what a reader searched for or a token a link handed them. Absolute,
 * root-relative and relative URLs all count: a word is treated as a URL when
 * the part before its `?` or `#` holds a `/` (or a scheme), or what follows
 * is a `key=value` query. A stack frame's trailing `:line:column` stays.
 */
export function withoutQueryStrings(text: string): string {
  return text.replaceAll(/[^\s'"`()<>]+/gu, (word) => {
    const position = /(?::\d+){1,2}$/u.exec(word)?.[0] ?? '';
    const address = word.slice(0, word.length - position.length);
    const cut = address.search(/[?#]/u);
    if (cut === -1) return word;
    const head = address.slice(0, cut);
    const urlLike = head.includes('/') || address.slice(cut + 1).includes('=');
    return urlLike ? head + position : word;
  });
}
