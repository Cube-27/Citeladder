import { PageTabEnd } from '@/components/templates/page-tab-end';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { Section, SectionHeader } from '@/components/ui/section';
import { textRole } from '@/components/ui/typography';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate } from '@/lib/format';

export function ProbeLede({
  createdAt,
  headline,
  label,
  segments,
  textValues = false,
}: Readonly<{
  createdAt: string;
  headline: string;
  label: string;
  segments: readonly FigureSegment[];
  textValues?: boolean;
}>) {
  const timeZone = useDisplayTimeZone();
  return (
    <Section>
      <SectionHeader>
        <PageTabEnd>
          <p className={textRole('caption', 'text-ink-2 min-w-0 truncate')}>
            From the market probe · {formatDisplayDate(createdAt, timeZone)}
          </p>
        </PageTabEnd>
        <h2 className={textRole('heading')}>{headline}</h2>
      </SectionHeader>
      <FigureStrip label={label} segments={segments} subLine textValues={textValues} />
    </Section>
  );
}
