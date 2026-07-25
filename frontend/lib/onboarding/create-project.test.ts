import { describe, expect, it } from 'vitest';

import { distinctTopicNames } from './create-project';
import type { ReviewPrompt } from './forms';

const prompt = (text: string, theme: string): ReviewPrompt => ({
  text,
  theme,
  intent: '',
  selected: true,
});

describe('distinctTopicNames', () => {
  it('returns each topic once, in first-seen order', () => {
    expect(
      distinctTopicNames([
        prompt('a', 'Everyday basics'),
        prompt('b', 'Homewares'),
        prompt('c', 'Everyday basics'),
      ]),
    ).toEqual(['Everyday basics', 'Homewares']);
  });

  it('treats case variants as one topic and keeps the first spelling', () => {
    // Topic uniqueness is case-insensitive server-side (a functional unique
    // index on lower(name)), so emitting both would 409 on the second create.
    expect(
      distinctTopicNames([prompt('a', 'Basics'), prompt('b', 'basics'), prompt('c', 'BASICS')]),
    ).toEqual(['Basics']);
  });

  it('ignores prompts with no topic rather than creating a blank one', () => {
    expect(distinctTopicNames([prompt('a', ''), prompt('b', '   '), prompt('c', 'Real')])).toEqual([
      'Real',
    ]);
  });

  it('trims surrounding whitespace before comparing', () => {
    expect(distinctTopicNames([prompt('a', ' Basics '), prompt('b', 'Basics')])).toEqual([
      'Basics',
    ]);
  });

  it('is empty for an empty prompt list', () => {
    expect(distinctTopicNames([])).toEqual([]);
  });
});
