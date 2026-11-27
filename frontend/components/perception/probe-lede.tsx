import { PageTabEnd } from '@/components/templates/page-tab-end';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { Section, SectionHeader } from '@/components/ui/section';
import { Text } from '@/components/ui/typography';
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
          <Text as="p" variant="caption" box="shrink" wrap="truncate">
            From the market probe · {formatDisplayDate(createdAt, timeZone)}
          </Text>
        </PageTabEnd>
        <Text as="h2" variant="heading">
          {headline}
        </Text>
      </SectionHeader>
      <FigureStrip label={label} segments={segments} subLine textValues={textValues} />
    </Section>
  );
}
