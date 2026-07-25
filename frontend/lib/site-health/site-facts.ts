/**
 * Site Health `site_facts` narrowing (v2 P2) — PURE.
 *
 * The SINGLE place that narrows the untyped `site_facts` record (zod
 * `z.record(z.string(), z.unknown()).nullable()`, mirroring the backend's
 * `dict | None`) into the display view the dashboard "AI crawler access"
 * panel renders. The worker builds the blob in `_crawl_setup`
 * (backend/app/workers/site_health_worker.py ~940–1026) and persists it on
 * `SiteCrawl.site_facts`; it is never Free-redacted:
 *
 *   robots   = { fetched, url, status_code, ai_crawlers: {bot: stance}, sitemaps }
 *   llms_txt = { fetched, url, status_code, present }
 *   sitemap  = { fetched, files }
 *
 * No transport, no React.
 */

/**
 * The AI crawlers whose robots.txt stance the panel reports, in display
 * order. Mirrors `AI_CRAWLER_BOTS` (backend/app/core/config/site_health.py
 * ~395–400) — the one frontend owner of the vocabulary + ordering.
 */
export const AI_CRAWLER_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'] as const;

export type AiCrawlerBot = (typeof AI_CRAWLER_BOTS)[number];

/** Humanized answer-engine label per bot — the one shared mapping. */
export const AI_CRAWLER_ENGINE_LABELS: Record<AiCrawlerBot, string> = {
  GPTBot: 'ChatGPT',
  ClaudeBot: 'Claude',
  PerplexityBot: 'Perplexity',
  'Google-Extended': 'Gemini / AI Overviews',
};

/**
 * Stance vocabulary: the backend's `AI_CRAWLER_STANCE_ALLOW` /
 * `AI_CRAWLER_STANCE_BLOCK` tokens, plus `unknown` for anything else the
 * record holds (a vocabulary the frontend has not caught up with, a missing
 * entry, or a robots.txt that was never read).
 */
export type SiteFactsStance = 'allow' | 'block' | 'unknown';

/** One bot's stance row, in `AI_CRAWLER_BOTS` order. */
export type SiteFactsBotStance = { bot: string; stance: SiteFactsStance };

/**
 * The parsed, display-ready view of one crawl's `site_facts` blob. The URL
 * and llms.txt status fields are required (nullable, never absent) — the
 * panel displays the checked URLs and the llms.txt status code.
 */
export type SiteFactsView = {
  robotsFetched: boolean;
  robotsStatus: number | null;
  robotsUrl: string | null;
  bots: SiteFactsBotStance[];
  llmsTxtFetched: boolean;
  llmsTxtPresent: boolean;
  llmsTxtStatus: number | null;
  llmsTxtUrl: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStatusCode(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readUrl(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readStance(value: unknown): SiteFactsStance {
  if (value === 'allow') return 'allow';
  if (value === 'block') return 'block';
  return 'unknown';
}

/**
 * Narrow the untyped `site_facts` record into the display view. Returns null
 * when the blob — or either of its `robots` / `llms_txt` sub-records — is
 * absent or malformed: the panel hides itself rather than rendering partial
 * guesses. Scalar fields inside the sub-records are coerced defensively
 * (missing status → null, missing URL → null, unrecognized stance token →
 * 'unknown') so one drifted field cannot sink the whole panel.
 *
 * Stance semantics: a missing/failed robots fetch is recorded FAIL-OPEN
 * ('allow') server-side. With no robots.txt actually read there is no real
 * stance, so every bot reports 'unknown' unless `robots.fetched` is true.
 */
export function readSiteFacts(facts: unknown): SiteFactsView | null {
  if (!isRecord(facts)) return null;
  const robots = facts.robots;
  const llmsTxt = facts.llms_txt;
  if (!isRecord(robots) || !isRecord(llmsTxt)) return null;

  const robotsFetched = robots.fetched === true;
  const aiCrawlers = isRecord(robots.ai_crawlers) ? robots.ai_crawlers : {};
  const bots: SiteFactsBotStance[] = AI_CRAWLER_BOTS.map((bot) => ({
    bot,
    stance: robotsFetched ? readStance(aiCrawlers[bot]) : 'unknown',
  }));

  return {
    robotsFetched,
    robotsStatus: readStatusCode(robots.status_code),
    robotsUrl: readUrl(robots.url),
    bots,
    llmsTxtFetched: llmsTxt.fetched === true,
    llmsTxtPresent: llmsTxt.present === true,
    llmsTxtStatus: readStatusCode(llmsTxt.status_code),
    llmsTxtUrl: readUrl(llmsTxt.url),
  };
}
