/** Optional search transports. Candidate pages are acquired by Site Health. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { policy, resolveSettingSpec } from '../config.ts';
import { discoverySettings } from '../projects/discovery-inputs.ts';
import { createResearchClient, ResearchBudget } from '../projects/research-evidence.ts';

const p = policy.commerce.discovery;
const result = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string().default(''),
  source_id: z.string().optional(),
  processing_version: z.string().optional(),
  provider: z.string().optional(),
});
export type SearchResult = z.infer<typeof result>;
export type SearchOutcome = {
  status: 'succeeded' | 'failed' | 'unavailable';
  errorCode: string;
  retry: boolean;
  results: SearchResult[];
  providerVersion?: string;
};
export type CompetitorSearch = (query: string, locale: string) => Promise<SearchOutcome>;

export function competitorSearch(
  env: Record<string, string | undefined> = process.env,
  transport: typeof fetch = fetch,
): CompetitorSearch {
  const setting = (name: keyof typeof p.settings) => resolveSettingSpec(p.settings[name], env);
  const key = String(setting('tavily_api_key'));
  const endpoint = String(setting('tavily_endpoint'));
  const timeout = Number(setting('tavily_timeout_seconds'));
  const research = { ...discoverySettings(env), keenable_snippet_max_chars: p.snippet_chars };
  return async (query, locale) => {
    let failed = false;
    if (key) {
      try {
        const url = new URL(endpoint);
        if (
          url.origin !== 'https://api.tavily.com' ||
          url.pathname !== '/search' ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error('Invalid Tavily destination');
        const response = await transport(url, {
          method: 'POST',
          redirect: 'error',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          signal: AbortSignal.timeout(timeout * 1000),
          body: JSON.stringify({
            query: `${query} ${locale}`.trim(),
            search_depth: 'basic',
            max_results: p.provider_result_limit,
            include_answer: false,
            include_raw_content: false,
          }),
        });
        if (!response.ok) throw new Error('Search failed');
        const body = z.object({ results: z.array(z.unknown()) }).parse(await response.json());
        return {
          status: 'succeeded',
          errorCode: '',
          retry: false,
          providerVersion: p.provider_version,
          results: body.results.slice(0, p.provider_result_limit).flatMap((item) => {
            const parsed = result.safeParse(item);
            return parsed.success
              ? [
                  {
                    ...parsed.data,
                    source_id:
                      parsed.data.source_id ??
                      createHash('sha256').update(JSON.stringify(item)).digest('hex'),
                    processing_version: p.provider_version,
                    provider: 'tavily',
                  },
                ]
              : [];
          }),
        };
      } catch {
        failed = true;
      }
    }
    if (!research.keenable_api_key)
      return {
        status: 'unavailable',
        errorCode: failed ? 'provider_failed' : 'provider_unavailable',
        retry: failed,
        results: [],
      };
    try {
      const client = createResearchClient(
        research,
        new ResearchBudget(research.keenable_total_call_cap),
        transport,
      );
      const items = await client.search(query, null, p.provider_result_limit, 'commerce');
      return {
        status: 'succeeded',
        errorCode: '',
        retry: false,
        providerVersion: policy.discovery.constants.keenable_research_version,
        results: items.map((item) => ({
          url: item.source_url,
          title: item.title,
          content: item.text,
          source_id: item.source_id,
          processing_version: item.processing_version,
          provider: item.provider,
        })),
      };
    } catch {
      return { status: 'failed', errorCode: 'provider_failed', retry: true, results: [] };
    }
  };
}
