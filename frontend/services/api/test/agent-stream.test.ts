import { describe, expect, it, vi } from 'vitest';

import { partialResponse, textEmitter } from '../src/agent/stream.ts';

const step = {
  action: 'respond',
  skill_id: 'content_create',
  reply: 'Here is the "draft" — with a line\nbreak, a tab\tand an emoji 😀.',
  output: {
    title: 'Pricing guide',
    body: '# Pricing\n\nPlans start at the published rate.\\ Backslash kept. 🚀 Done.',
    phase: 'draft',
    format_id: 'article',
  },
};

describe('streamed Agent text', () => {
  it('decodes the reply and document from every prefix of a streamed step', () => {
    const content = JSON.stringify(step);
    for (let end = 0; end <= content.length; end++) {
      const partial = partialResponse(content.slice(0, end));
      // Each prefix shows a prefix of the final text, never a garbled escape.
      expect(step.reply.startsWith(partial.reply ?? '')).toBe(true);
      expect(step.output.title.startsWith(partial.title ?? '')).toBe(true);
      expect(step.output.body.startsWith(partial.body ?? '')).toBe(true);
    }
    expect(partialResponse(content)).toEqual({
      action: 'respond',
      reply: step.reply,
      title: step.output.title,
      body: step.output.body,
    });
  });
  it('decodes \\u escapes, including a surrogate pair that arrives in two chunks', () => {
    const escaped = '{"action":"respond","reply":"Go \\ud83d\\ude80 now"}';
    const cut = escaped.indexOf('\\ude80');
    expect(partialResponse(escaped.slice(0, cut)).reply).toBe('Go ');
    expect(partialResponse(escaped).reply).toBe('Go 🚀 now');
  });
  it('shows nothing for a read step and emits only changed respond text', () => {
    const emit = vi.fn();
    const read = textEmitter(1, emit, 1);
    read(JSON.stringify({ action: 'call_tool', tool: 'read_site_pages', reply: 'ignored' }));
    expect(emit).not.toHaveBeenCalled();
    const respond = textEmitter(2, emit, 1);
    const content = JSON.stringify(step);
    respond(content.slice(0, content.indexOf('break')));
    respond(content);
    respond(`${content} `);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith({
      ordinal: 2,
      reply: step.reply,
      title: step.output.title,
      body: step.output.body,
    });
  });
});
