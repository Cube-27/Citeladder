import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { CellMeter } from './meter';

describe('CellMeter', () => {
  it('draws nothing over a zero maximum and the clamped share otherwise', () => {
    render(
      <>
        <CellMeter label="Empty" value={0} max={0} valueText="0 of 0" tone="ink" />
        <CellMeter label="Half" value={2} max={4} valueText="2 of 4" tone="ink" />
        <CellMeter label="Over" value={9} max={4} valueText="9 of 4" tone="negative" />
      </>,
    );
    const share = (name: string) =>
      screen
        .getByRole('meter', { name })
        .querySelector<HTMLElement>('span')
        ?.style.getPropertyValue('--share') ?? null;
    expect([share('Empty'), share('Half'), share('Over')]).toEqual([null, '50%', '100%']);
  });
});
