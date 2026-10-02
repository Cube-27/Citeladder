/** Optional search transports. Candidate pages are acquired by Site Health. */
import { z } from 'zod';
import { policy, resolveSettingSpec } from '../config.ts';
import { discoverySettings } from '../projects/discovery-inputs.ts';
import { createResearchClient, ResearchBudget } from '../projects/research-evidence.ts';

const p = policy.commerce.discovery;
const result = z.object({ url: z.string(), title: z.string(), content: z.string().default('') });
export type SearchResult = z.infer<typeof result>;
export type SearchOutcome = {
  status: 'succeeded' | 'failed' | 'unavailable';
  errorCode: string;
  retry: boolean;
  results: SearchResult[];
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
          results: body.results.slice(0, p.provider_result_limit).flatMap((item) => {
            const parsed = result.safeParse(item);
            return parsed.success ? [parsed.data] : [];
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
      const client = createResearchClient(research, new ResearchBudget(1), transport);
      const items = await client.search(query, null, p.provider_result_limit, 'commerce');
      return {
        status: 'succeeded',
        errorCode: '',
        retry: false,
        results: items.map((item) => ({
          url: item.source_url,
          title: item.title,
          content: item.text,
        })),
      };
    } catch {
      return { status: 'failed', errorCode: 'provider_failed', retry: true, results: [] };
    }
  };
}
