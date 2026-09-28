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
        page: page(candidate.page),
        passage: candidate.passage,
        labels: candidate.labels.map((label) => label.label),
      },
      questions: {
        membership: {
          type: 'noul',
          instructions: questionPolicy.topic_instructions,
          criteria: {
            true: 'At least one offered subject describes this primary content substantively',
            false: 'None of the offered subjects fit except incidentally',
          },
        },
        label: {
          type: 'choice',
          instructions: questionPolicy.label_instructions,
          criteria: {
            none: 'No supplied label is a useful topic for this content',
            ...Object.fromEntries(
              candidate.labels.map((label, index) => [String(index), label.label]),
            ),
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
