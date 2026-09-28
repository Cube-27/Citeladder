import type { ContentPage } from '@citeladder/contracts/site-health';
import { policy } from '../config.ts';
import type { ContentCandidate } from './content-candidates.ts';

export function contentRequest(candidate: ContentCandidate, pages: ContentPage[]) {
  const page = (id: string) => {
    const found = pages.find((value) => value.analysis_id === id);
    if (!found) throw new Error('Content candidate has no frozen page');
    return { title: found.title, url: found.url, excerpt: found.excerpt, headings: found.headings };
  };
  const questionPolicy = policy.content_structure;
  if (candidate.kind === 'topic')
    return {
      state: {
        label: candidate.label,
        label_source: page(candidate.source),
        page: page(candidate.page),
      },
      questions: {
        membership: {
          type: 'noul',
          instructions: questionPolicy.topic_instructions,
          criteria: {
            true: 'Substantive membership in a useful topic',
            false: 'Incidental relevance or unusable label',
          },
        },
        label: {
          type: 'choice',
          instructions: questionPolicy.topic_instructions,
          criteria: {
            label: candidate.label,
            none: 'This label is not a useful specific topic for browsing pages',
          },
        },
      },
    };
  return {
    state: {
      source: page(candidate.source),
      target: page(candidate.target),
      passage: candidate.passage,
    },
    questions: {
      usefulness: {
        type: 'noul',
        instructions: questionPolicy.link_instructions,
        criteria: {
          true: 'Helpful contextual destination',
          false: 'Unhelpful or unrelated destination',
        },
      },
      anchor: {
        type: 'choice',
        instructions: questionPolicy.anchor_instructions,
        criteria: {
          none: 'No suitable existing anchor',
          ...Object.fromEntries(
            candidate.anchors.map((anchor, index) => [String(index), anchor.text]),
          ),
        },
      },
    },
  };
}
