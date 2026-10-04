import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { expect, it } from 'vite-plus/test';

import { LLMS_TXT } from './llms';

it('parses every public resource and policy entry as a named Markdown link', () => {
  const { container } = render(<ReactMarkdown>{LLMS_TXT}</ReactMarkdown>);
  for (const heading of container.querySelectorAll('h2')) {
    if (!['Public pages', 'Policies'].includes(heading.textContent ?? '')) continue;
    let list = heading.nextElementSibling;
    while (list && list.tagName !== 'UL') list = list.nextElementSibling;
    expect(list).not.toBeNull();
    const entries = list!.querySelectorAll('li');
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const link = entry.querySelector('a');
      expect(link, entry.textContent ?? '').not.toBeNull();
      expect(link!.textContent).toBeTruthy();
      expect(link!.textContent).not.toBe(link!.getAttribute('href'));
      expect(new URL(link!.getAttribute('href')!).protocol).toBe('https:');
    }
  }
});
