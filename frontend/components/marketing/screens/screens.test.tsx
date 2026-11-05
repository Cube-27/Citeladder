import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { ProductFrame } from './product-frame';
import { ScreenAgentBrief } from './screens-agent';
import { ScreenDemand } from './screens-search';
import { ScreenSiteHealth } from './screens-site';
import { ScreenAnswer, ScreenSources } from './screens-visibility';

describe('ProductFrame', () => {
  it('shows a screen as one named picture with no tab stops, captioned underneath', () => {
    render(
      <ProductFrame label="Answer record" title="One answer" caption="Its sources and brands.">
        <ScreenAnswer />
      </ProductFrame>,
    );

    const picture = screen.getByRole('img', { name: 'Answer record' });
    expect(picture.firstElementChild).toHaveAttribute('inert');
    expect(screen.getByRole('figure').textContent).toMatch(/One answer\s*Its sources and brands\./);
  });
});

describe('screens', () => {
  it('highlights the passage that names the tracked brand in an answer', () => {
    render(<ScreenAnswer />);

    expect(screen.getByText('the easiest place to start').tagName).toBe('MARK');
  });

  it('reads every week of a vignette chart as text', () => {
    render(<ScreenDemand />);

    expect(
      screen.getByText(
        'Weekly clicks from Google Search, acme.com: 8 Sep 701, 15 Sep 734, 22 Sep 768, 29 Sep 752, 6 Oct 801, 13 Oct 822, 20 Oct 864, 27 Oct 925',
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['Site Health', <ScreenSiteHealth key="health" />, 'Run new crawl'],
    ['Agent brief', <ScreenAgentBrief key="brief" />, 'Export'],
    ['Sources', <ScreenSources key="sources" />, 'All sources'],
  ])(
    'draws the %s controls without a real control, so a linked card can hold it',
    (_, node, control) => {
      render(node);

      expect(screen.getByText(control)).toBeVisible();
      expect(screen.queryAllByRole('button')).toEqual([]);
      expect(screen.queryAllByRole('textbox')).toEqual([]);
    },
  );
});
