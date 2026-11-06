import type { ChartHeight } from '@/components/ui/chart';
import { TrendChart } from '@/components/ui/trend-chart';

import { TREND, WEEKS } from './demo-data';

const percent = (value: number) => `${value.toFixed(1)}%`;

/** The demo brand's weekly visibility against two competitors, as the app's TrendChart draws it. */
export function VisibilityTrend({ height }: Readonly<{ height?: ChartHeight }>) {
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
      yMin={0}
      yMax={50}
      yFormat={(value) => `${value}%`}
      format={percent}
    />
  );
}
