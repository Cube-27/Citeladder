// Written by the study pipeline from reviewed API drafts; edit the drafts, not this file.
import type { StudyIndex } from './index-types';

export const STUDY_INDEXES = {
  aiCrawlers: {
    path: '/ai-crawlers',
    updated: '2026-11-07',
    title: 'AI crawlers',
    metaTitle: 'AI Crawler Directory | CiteLadder',
    description:
      'A directory of AI and search crawlers: what each bot does, how to allow or block it in robots.txt, how to verify it, and how top sites treat it.',
    heroTitle: 'AI and search crawler directory',
    lead: 'One page per crawler, covering what it is, the robots.txt rules that control it, how to verify its requests, and how the 10,000 most popular sites treat it.',
    groups: [
      {
        title: 'AI training crawlers',
        description: 'Bots that collect web content to train AI models.',
      },
      {
        title: 'AI search crawlers',
        description: 'Bots that index pages so AI assistants can find and cite them in answers.',
      },
      {
        title: 'User-triggered AI fetchers',
        description: 'Agents that load a page when a person asks an AI assistant about it.',
      },
      {
        title: 'Search engine crawlers',
        description:
          'Traditional search bots whose access also affects how AI features can use your content.',
      },
    ],
  },
  buyerPrompts: {
    path: '/buyer-prompts',
    updated: '2026-11-07',
    title: 'Buyer prompts',
    metaTitle: 'Buyer prompts by brand | CiteLadder',
    description:
      "Buyer questions drafted by CiteLadder's Prompt Builder for each brand on four Claude models at three effort levels, shown side by side.",
    heroTitle: 'Buyer prompts by brand',
    lead: 'Each page shows the buyer questions Prompt Builder drafted for one brand on Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.1 at low, medium and high effort. The outputs sit side by side with simple measurements, so you can judge quality yourself.',
    groups: [
      {
        title: 'Business software',
        description:
          'Buyer questions drafted for Notion, HubSpot and Shopify, compared across four Claude models and three effort levels.',
      },
      {
        title: 'Consumer brands',
        description:
          'Buyer questions drafted for Nike, IKEA, Airbnb, Duolingo and Wise, compared across four Claude models and three effort levels.',
      },
    ],
  },
  research: {
    path: '/research',
    updated: '2026-11-07',
    title: 'Research',
    metaTitle: 'Research on AI Crawlers and AI Answers | CiteLadder',
    description:
      'Original CiteLadder research on AI crawlers and AI answers, starting with how the 10,000 most popular websites treat AI crawlers in robots.txt.',
    heroTitle: 'CiteLadder research',
    lead: 'Original studies based on data we collect ourselves. Our first report reviews robots.txt files from the Tranco Q2VV4, 2026-11-06 list, with more studies on how AI assistants answer buyer questions to follow.',
    groups: [
      {
        title: 'AI crawlers',
        description:
          'How the 10,000 most popular websites treat AI crawlers in robots.txt, based on 6130 sites with a readable policy, where 15.5% block GPTBot.',
      },
      {
        title: 'Website files for AI',
        description:
          'How many of the 10,000 most popular websites publish an llms.txt file, based on 6943 sites checked, where 12.4% have a valid one.',
      },
      {
        title: 'Prompt Builder models',
        description:
          'How the choice of Claude model and effort level changes the buyer questions Prompt Builder drafts, compared across four models at low, medium and high effort.',
      },
    ],
  },
} as const satisfies Record<string, StudyIndex>;
