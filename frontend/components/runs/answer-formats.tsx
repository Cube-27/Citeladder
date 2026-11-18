import type { AnswerFormat, AnswerFormats } from '@citeladder/contracts';
import { Absence } from '@/components/ui/absence';
import { Inline } from '@/components/ui/layout';
import { Tag } from '@/components/ui/tag';

const LABELS = {
  shopping: 'Shopping',
  map: 'Map',
  comparison: 'Comparison',
  image: 'Images',
} as const satisfies Record<AnswerFormat, string>;

/** What an answer showed besides text, as tags; each kind of absence keeps its own word. */
export function AnswerFormatTags({ formats }: Readonly<{ formats: AnswerFormats }>) {
  switch (formats.kind) {
    case 'observed':
      if (!formats.formats.length) return <Absence state="none" label="Text only" />;
      return (
        <Inline as="span" gap="tight">
          {formats.formats.map((format) => (
            <Tag key={format}>{LABELS[format]}</Tag>
          ))}
        </Inline>
      );
    case 'not_applicable':
      return <Absence state="not_applicable" reason="This engine doesn't report answer formats." />;
    case 'unavailable':
      return <Absence state="unavailable" reason="This answer's stored page could not be read." />;
    default: {
      const unreachable: never = formats;
      return unreachable;
    }
  }
}
