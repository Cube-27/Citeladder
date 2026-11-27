import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vite-plus/test';
import type { SearchIntelligenceDataset } from '@/lib/api/search-intelligence';
import { SearchIntelligenceCollection } from './search-intelligence-collection';
import { useSearchCollection } from './search-intelligence-collection-state';
import { AllFiltersMenu } from '@/components/ui/filter-bar';
import { openFilterRow } from '@/test/all-filters';
import { CollectionViewControl, collectionFilters } from './search-intelligence-controls';

vi.mock('./search-intelligence-dataset-view', () => ({
  SearchIntelligenceDatasetView: ({ dataset }: { dataset: SearchIntelligenceDataset }) => (
    <p>Dataset {dataset.id}</p>
  ),
}));

const saved = {
  id: 'first',
  dataset_kind: 'missing_keywords',
  comparison_origin: 'https://rival.test',
  target_origin: 'https://owned.test',
  target_hostname: 'owned.test',
} as SearchIntelligenceDataset;

function Tab({
  tab,
  datasets,
  open,
}: Readonly<{
  tab: 'keywords' | 'backlinks';
  datasets: SearchIntelligenceDataset[];
  open?: SearchIntelligenceDataset;
}>) {
  const { collection, openComparison } = useSearchCollection({
    tab,
    datasets,
    competitors: [],
    ownedOrigins: ['https://owned.test'],
  });
  if (!collection) return null;
  return (
    <>
      {open ? <button onClick={() => openComparison(open)}>Open comparison</button> : null}
      <CollectionViewControl collection={collection} />
      <AllFiltersMenu filters={collectionFilters(collection)} />
      <SearchIntelligenceCollection
        collection={collection}
        datasets={datasets}
        backlinkFigures={[]}
      />
    </>
  );
}

it('opens a competitor comparison inside Keywords and keeps that competitor across views', async () => {
  const ranking = {
    ...saved,
    id: 'ranking',
    dataset_kind: 'ranking_keywords',
    comparison_origin: '',
  };
  const otherMissing = { ...saved, id: 'other-missing', comparison_origin: 'https://other.test' };
  const shared = { ...saved, id: 'shared', dataset_kind: 'shared_keywords' };
  const otherShared = { ...otherMissing, id: 'other-shared', dataset_kind: 'shared_keywords' };
  render(
    <Tab
      tab="keywords"
      datasets={[ranking, otherMissing, saved, otherShared, shared]}
      open={saved}
    />,
  );
  expect(screen.getByText('Dataset ranking')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open comparison' }));
  expect(screen.getByText('Dataset first')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: 'Shared keywords' }));
  expect(screen.getByText('Dataset shared')).toBeInTheDocument();
});

it('shows your website first when competitors have saved results too', () => {
  const rival = {
    ...saved,
    id: 'rival-links',
    dataset_kind: 'backlinks',
    comparison_origin: '',
    target_origin: 'https://rival.test',
    target_hostname: 'rival.test',
  };
  const owned = { ...saved, id: 'owned-links', dataset_kind: 'backlinks', comparison_origin: '' };
  render(<Tab tab="backlinks" datasets={[rival, owned]} />);
  expect(screen.getByText('Dataset owned-links')).toBeInTheDocument();
  expect(screen.queryByText('Dataset rival-links')).toBeNull();
});

it('offers the keyword filters only while a keyword dataset is on screen', async () => {
  const ranking = { ...saved, id: 'ranking', dataset_kind: 'ranking_keywords' };
  const pages = { ...saved, id: 'pages', dataset_kind: 'organic_pages' };
  render(<Tab tab="keywords" datasets={[ranking, pages]} />);
  const user = userEvent.setup();
  expect(screen.getByText('Dataset ranking')).toBeInTheDocument();
  expect(await openFilterRow(user, 'Min. search volume', 'Any volume')).toBeVisible();
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('radio', { name: 'Top pages' }));
  expect(screen.getByText('Dataset pages')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^All filters/ }));
  expect(await screen.findByRole('menuitem', { name: /^Website/ })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: /^Min. search volume/ })).not.toBeInTheDocument();
});
