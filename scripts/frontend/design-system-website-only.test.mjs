import assert from 'node:assert/strict';
import { test } from 'node:test';

import { websiteOnlyImportViolations } from '../../frontend/scripts/design-system-website-only.mjs';

test('app code may not import a website-only atom; its own atoms and the website may', () => {
  const app = 'components/visibility/overview.tsx';
  const cases = [
    {
      source: "import { Badge } from '@/components/ui/badge';",
      label: app,
      owns: true,
      expected: [`${app}: ui/badge is the website's; the app uses StatusMark or Tag`],
    },
    {
      source: [
        'import { Card } from "@/components/ui/card";',
        "import { TrendChart } from '@/components/ui/trend-chart';",
      ].join('\n'),
      label: app,
      owns: true,
      expected: [
        `${app}: ui/card is the website's; the app uses Section, Slip or Well`,
        `${app}: ui/trend-chart is the website's; the app uses StepChart`,
      ],
    },
    { source: "import { Tag } from '@/components/ui/tag';", label: app, owns: true, expected: [] },
    {
      source: "import { BadgeGroup } from '@/components/ui/badge-group';",
      label: app,
      owns: true,
      expected: [],
    },
    {
      source: "import { Badge } from '@/components/ui/badge';",
      label: 'components/ui/card.tsx',
      owns: true,
      expected: [],
    },
    {
      source: "import { Badge } from '@/components/ui/badge';",
      label: 'components/marketing/hero.tsx',
      owns: false,
      expected: [],
    },
  ];
  for (const { source, label, owns, expected } of cases) {
    assert.deepEqual(websiteOnlyImportViolations(source, label, owns), expected, source);
  }
});
