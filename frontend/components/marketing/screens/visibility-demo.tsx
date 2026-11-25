import type { ChartHeight } from '@/components/ui/chart';
import { TrendChart } from '@/components/ui/trend-chart';

import { BRANDS, TREND, WEEKS } from './demo-data';
import { ScreenDelta, ScreenSite, ScreenTable, type ScreenColumn } from './screen-parts';

export const percent = (value: number) => `${value.toFixed(1)}%`;

export function VisibilityTrend({
  height,
  fallbackWidth,
}: Readonly<{ height?: ChartHeight; fallbackWidth?: number }>) {
  return (
    <TrendChart
      label="Visibility by week, Acme Analytics against Northwind and Lumen"
      name="Acme Analytics"
      data={WEEKS.map((week, index) => ({ label: week, value: TREND.acme[index] ?? null }))}
      series={[
        { label: 'Northwind', values: TREND.northwind },
        { label: 'Lumen', values: TREND.lumen },
      ]}
      {...(height ? { height } : {})}
      {...(fallbackWidth ? { fallbackWidth } : {})}
      yMin={0}
      yMax={50}
      yFormat={(value) => `${value}%`}
      format={percent}
    />
  );
}

const BRAND_COLUMNS: readonly ScreenColumn<(typeof BRANDS)[number]>[] = [
  { header: 'Brand', cell: (brand) => <ScreenSite label={brand.name} /> },
  { header: 'Visibility', width: 'sm', numeric: true, cell: (brand) => percent(brand.visibility) },
  {
    header: 'Change',
    width: 'sm',
    numeric: true,
    cell: (brand) => <ScreenDelta change={brand.change} />,
  },
];

export function BrandTable() {
  return (
    <ScreenTable
      caption="Visibility by brand this week"
      rows={BRANDS}
      rowKey={(brand) => brand.name}
      own={(brand) => brand.own === true}
      columns={BRAND_COLUMNS}
    />
  );
}
