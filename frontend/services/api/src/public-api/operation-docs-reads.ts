/** Page text of the public read operations; see `operation-docs.ts`. */
import type { OperationDoc } from './operation-docs.ts';

export const readDocs: Readonly<Record<string, OperationDoc>> = {
  'GET /v1/projects': {
    summary: 'List projects',
    description:
      'Returns the projects the key can reach, one page at a time. A key limited to some projects lists only those. Start here to find the project_id every other path needs.',
  },
  'GET /': {
    summary: 'Get a project',
    description:
      "Returns one project: its brand, website, markets, owned domains, competitors, prompt sets and the defaults its audits start from. A project outside the key's reach answers 404.",
  },
  'GET /markets': {
    summary: 'List markets',
    description:
      'Lists the markets a project measures, each a country and language pair. The default market is flagged, and visibility reads that take a market filter accept these ids.',
  },
  'GET /business-map': {
    summary: 'Get the business map',
    description:
      'Returns the project’s business map: the offerings CiteLadder found for the business and those still available to add.',
  },
  'GET /prompt-sets': {
    summary: 'List prompt sets',
    description:
      'Lists the project’s prompt sets. A prompt set is the group of prompts an audit runs together.',
  },
  'GET /prompt-sets/{prompt_set_id}': {
    summary: 'Get a prompt set',
    description:
      'Returns one prompt set with its prompts. Each prompt carries its latest measurement, which is measured, not measured or unavailable; none of these is zero.',
  },
  'GET /prompt-sets/{prompt_set_id}/candidates': {
    summary: 'List prompt candidates',
    description:
      'Lists the candidate prompts a generation run proposed and nobody has accepted or rejected yet. Review them with the candidate review operation.',
  },
  'GET /prompt-sets/{prompt_set_id}/generation-runs': {
    summary: 'List prompt generation runs',
    description:
      'Lists the prompt generation runs of a prompt set, newest first, one page at a time.',
  },
  'GET /prompts': {
    summary: 'List prompts',
    description:
      'Lists the project’s prompts, one page at a time. Filter by prompt set, topic or status. Each prompt carries its latest measurement, which is measured, not measured or unavailable.',
  },
  'GET /topics': {
    summary: 'List topics',
    description: 'Lists the topics that organise the project’s prompts, including nested topics.',
  },
  'GET /competitors': {
    summary: 'List competitors',
    description:
      'Lists the competitors the project tracks, with the names, aliases and domains used to recognise them in answers.',
  },
  'GET /competitor-suggestions': {
    summary: 'List competitor suggestions',
    description:
      'Lists companies that AI answers mentioned alongside the brand and that are not tracked competitors yet. Accept one to start tracking it.',
  },
  'GET /audits': {
    summary: 'List audits',
    description: 'Lists the project’s audits, newest first, one page at a time.',
  },
  'GET /audits/{audit_id}': {
    summary: 'Get an audit',
    description:
      'Returns one audit with its status and progress. A launched audit is queued and runs on its own, so poll this to see it finish.',
  },
  'POST /audits/estimate': {
    summary: 'Estimate an audit',
    description:
      'Returns the number of answers an audit would ask for and its maximum attempt count, without creating anything. Pass the maximum as max_attempts when launching to cap the cost. It needs only the read scope.',
    request: { prompt_set_id: '00000000-0000-4000-8000-000000000001', engines: ['chatgpt'] },
  },
  'GET /audit-schedules': {
    summary: 'List audit schedules',
    description: 'Lists the schedules that launch the project’s audits automatically.',
  },
  'GET /audit-schedules/{schedule_id}': {
    summary: 'Get an audit schedule',
    description: 'Returns one audit schedule with its cadence, time zone and engines.',
  },
  'GET /visibility': {
    summary: 'Get visibility',
    description:
      'Returns the visibility projection for a selection of audits, optionally compared with a baseline. Rates are null when a run could not determine them; null is not zero.',
  },
  'GET /visibility/prompts': {
    summary: 'List prompt metrics',
    description:
      'Returns per-prompt visibility metrics for a selection, splitting each prompt’s answers into mentioned and cited, mentioned only, cited only or neither.',
  },
  'GET /visibility/prompts/{prompt_id}/history': {
    summary: 'Get a prompt’s history',
    description: 'Returns how one prompt’s visibility changed across audits.',
  },
  'GET /visibility/trends': {
    summary: 'Get visibility trends',
    description:
      'Returns visibility over time for the project, bucketed by the granularity you choose. Filter by market, engine and cohort.',
  },
  'GET /visibility/fanout': {
    summary: 'Get query fan-out',
    description:
      'Returns the follow-up searches AI engines ran while answering your prompts, grouped by query, with the answers that used them.',
  },
  'GET /visibility/sources': {
    summary: 'List cited sources',
    description:
      'Lists the domains and pages AI answers cited, with how often and whether each is owned, a competitor or a third party. Use as_of to read a past selection.',
  },
  'GET /visibility/markets': {
    summary: 'List visibility markets',
    description:
      'Lists the markets that have visibility data, for the market filter of the other reads.',
  },
  'GET /visibility/ads': {
    summary: 'List ads in answers',
    description:
      'Lists the ads that appeared in AI answers for a selection, with a summary of the creatives and the answers they appeared in.',
  },
  'GET /visibility/perception': {
    summary: 'Get answer perception',
    description:
      'Returns how AI answers describe the brand: a summary of themes and the quotes behind them, for a selection of audits.',
  },
  'GET /site-health': {
    summary: 'Get Site Health',
    description:
      'Returns the Site Health dashboard for a crawl: scores, issue counts and what changed since the crawl before it. Pass crawl_id to read an earlier crawl.',
  },
  'GET /site-crawls/{crawl_id}/pages': {
    summary: 'List crawled pages',
    description:
      'Lists the pages one site crawl found, one page at a time, with filters for status, page kind and monitoring.',
  },
  'GET /site-crawls/{crawl_id}/issues': {
    summary: 'List Site Health issues',
    description:
      'Lists the issue groups one crawl found, with severity, category and how many pages each affects.',
  },
  'GET /site-crawls/{crawl_id}/issues/{group_id}': {
    summary: 'Get a Site Health issue',
    description:
      'Returns one issue group of a crawl with the pages it affects and the evidence for each.',
  },
  'GET /ai-traffic/overview': {
    summary: 'Get AI traffic overview',
    description:
      'Returns visits from AI bots and assistants over a date range, split by purpose and verification status.',
  },
  'GET /ai-traffic/pages': {
    summary: 'List AI traffic pages',
    description:
      'Lists the pages AI bots requested, with request counts, for a date range and filters.',
  },
  'GET /ai-traffic/coverage': {
    summary: 'Get AI crawl coverage',
    description:
      'Returns which of the site’s pages AI bots reached and which they did not, for a date range.',
  },
  'GET /performance': {
    summary: 'Get performance',
    description:
      'Returns search performance for a date range, optionally compared with another range, as a series and a selected snapshot.',
  },
  'GET /performance/table': {
    summary: 'Get the performance table',
    description:
      'Returns the rows behind a performance snapshot for one dimension, one page at a time, optionally compared with another snapshot.',
  },
  'GET /search-intelligence/runs': {
    summary: 'List search intelligence runs',
    description: 'Lists the project’s search intelligence runs, newest first.',
  },
  'GET /search-intelligence/datasets/{dataset_id}/rows': {
    summary: 'List search dataset rows',
    description:
      'Lists the rows of one search intelligence dataset, one page at a time, with sort, search and volume filters.',
  },
  'GET /actions': {
    summary: 'List actions',
    description:
      'Lists the actions CiteLadder recommends, one page at a time. Filter by status, priority, approach, topic and more.',
  },
  'GET /actions/tree': {
    summary: 'Get the action tree',
    description:
      'Returns the project’s actions grouped by goal and category, with the same filters as the list.',
  },
  'GET /actions/{action_id}': {
    summary: 'Get an action',
    description: 'Returns one action with its findings and the evidence behind them.',
  },
  'GET /actions/{action_id}/urls': {
    summary: 'List an action’s URLs',
    description: 'Lists the pages one action applies to, one page at a time.',
  },
  'GET /urls/{site_url_id}/actions': {
    summary: 'List a URL’s actions',
    description: 'Lists the actions that apply to one page of the site.',
  },
};
