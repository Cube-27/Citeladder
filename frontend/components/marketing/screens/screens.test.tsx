import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { ProductFrame } from './product-frame';
import { fourRows } from './screen-vignette';
import { ScreenActions, ScreenContentOptimization } from './screens-agent';
import { ScreenDemand, ScreenReferrals } from './screens-search';
import { ScreenSiteHealth } from './screens-site';
import { ScreenAnswer, ScreenSources } from './screens-visibility';

const rowsOf = (name: string) =>
  within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((row) => row.textContent);

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
    render(<ScreenReferrals />);

    expect(
      screen.getByText(
        'Weekly sessions from AI assistants, acme.com: 8 Sep 300, 15 Sep 320, 22 Sep 335, 29 Sep 354, 6 Oct 410, 13 Oct 440, 20 Oct 480, 27 Oct 516',
      ),
    ).toBeInTheDocument();
  });

  it('shows one Search Demand signal of each kind with its query, page and figure', () => {
    render(<ScreenDemand />);

    expect(rowsOf('Search signals, strongest first')).toEqual([
      'product analytics for startups/pricing · 1,840 impressionsStriking distancePos. 7.4',
      'mixpanel alternatives/compare/northwind · median 4.1%CTR gap1.2% CTR',
      'feature adoption metrics/blog/feature-adoption and /docs/adoptionTwo pages58% / 34%',
      'session replay pricing/pricing · last 14 daysEmerging+212%',
    ]);
  });

  it('lists the four most-cited domains with their share of all citations, leaving out Other', () => {
    render(<ScreenSources />);

    expect(rowsOf('Citations by domain this week')).toEqual([
      'acme.comYour site · 20.3% of citations212',
      'g2.com16.1% of citations168',
      'northwind.io13.5% of citations141',
      'reddit.com11.3% of citations118',
    ]);
    expect(screen.getByText('1,046 citations this week')).toBeVisible();
  });

  it('counts every failed check while listing the worst four with their pages', () => {
    render(<ScreenSiteHealth />);

    expect(screen.getByText('acme.com · 7 failed checks')).toBeVisible();
    expect(rowsOf('Worst failed checks')).toEqual([
      'Search or citation crawlers blockedHigh severity14 pages',
      'Content not present in server HTMLHigh severity3 pages',
      'Slow time to first byteMedium severity6 pages',
      'Missing structured dataMedium severity11 pages',
    ]);
  });

  it('quotes a prompt action and names a page action as it is', () => {
    render(<ScreenActions />);

    expect(rowsOf('Actions, highest priority first')).toEqual([
      'acme.com/docs/setupPage · Fix a technical issueHighOpen',
      'capterra.com/analytics-softwareEarned page · Earn a placementHighOpen',
      'acme.com/pricingPage · Improve the existing pageMediumIn progress',
      '“Cheapest analytics with session replay”Prompt · Create a new pageMediumOpen',
    ]);
  });

  it("lists owned and planned content pages with their lead angle's counts", () => {
    render(<ScreenContentOptimization />);

    expect(rowsOf('Content work, highest priority first')).toEqual([
      'acme.com/blog/session-replay-guideSession replay setup guides · 5 sites · 2 competitors6 prompts',
      'Product analytics pricing comparedPlanned page · 4 sites · 3 competitors5 prompts',
      'acme.com/blog/funnel-analysisFunnel analysis templates · 3 sites · 1 competitor4 prompts',
      'Mobile analytics SDK comparisonPlanned page · 3 sites · 1 competitor3 prompts',
    ]);
    expect(screen.getByText('5 open')).toBeVisible();
  });

  it('takes the first four items of a list as rows and refuses a list shorter than four', () => {
    const toRow = (item: string) => ({ key: item, label: item, value: item.length });

    expect(fourRows(['a', 'bb', 'ccc', 'dddd', 'eeeee'], toRow).map((row) => row.value)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(() => fourRows(['a', 'bb', 'ccc'], toRow)).toThrow(
      'A vignette list needs four rows; it has 3.',
    );
  });
});
