import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vite-plus/test';
import { KeywordFilters } from './search-intelligence-controls';

function Filters() {
  const [minVolume, setMinVolume] = useState('');
  const [intent, setIntent] = useState('');
  return (
    <>
      <KeywordFilters
        minVolume={minVolume}
        setMinVolume={setMinVolume}
        intent={intent}
        setIntent={setIntent}
      />
      <output>{`${minVolume}|${intent}`}</output>
    </>
  );
}

it('keeps only nonnegative whole minimum volumes', () => {
  render(<Filters />);
  const input = screen.getByRole('spinbutton', { name: 'Minimum search volume' });
  fireEvent.change(input, { target: { value: '-1' } });
  fireEvent.change(input, { target: { value: '1.5' } });
  expect(input).toHaveValue(null);
  fireEvent.change(input, { target: { value: '10' } });
  expect(screen.getByRole('status')).toHaveTextContent('10|');
});

it('names every intent in sentence case and filters on the chosen one', async () => {
  render(<Filters />);
  await userEvent.click(screen.getByRole('combobox', { name: 'Saved keyword intent' }));
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    'Any intent',
    'Informational',
    'Commercial',
    'Navigational',
    'Transactional',
  ]);
  await userEvent.click(screen.getByRole('option', { name: 'Commercial' }));
  expect(screen.getByRole('status')).toHaveTextContent('|commercial');
});
