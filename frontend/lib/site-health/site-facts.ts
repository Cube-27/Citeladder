/** Narrow persisted facts only; bot labels and purposes arrive from the catalog writer. */
import { robotsFactsSchema } from '@citeladder/contracts/site-health';
import { z } from 'zod';

const schema = z.object({
  robots: robotsFactsSchema,
  llms_txt: z.object({
    fetched: z.boolean(),
    present: z.boolean(),
    url: z.string(),
    status_code: z.number().nullable(),
  }),
});
export type SiteFactsView = z.infer<typeof schema>;
export function readSiteFacts(facts: unknown): SiteFactsView | null {
  const parsed = schema.safeParse(facts);
  return parsed.success ? parsed.data : null;
}
