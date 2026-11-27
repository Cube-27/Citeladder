import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DATA_TABLE_POSITIONS = 16;

const STEP_FLOORS = [10, 16, 20, 24];

function positionRules(position) {
  const cell = (token, rows = 'tr:not([data-table-state])') =>
    `[data-c${position}~='${token}'] ${rows} > :nth-child(${position})`;
  const rules = [
    [
      cell('select'),
      'width: var(--data-table-select); min-width: var(--data-table-select); padding-inline-end: var(--data-table-select-gap);',
    ],
    [cell('start'), 'text-align: start;'],
    [cell('end'), 'text-align: end;'],
    [
      cell('rest'),
      'width: var(--data-table-share); max-width: 0; min-width: var(--data-table-identity-min);',
    ],
    [cell('fixed'), 'width: var(--data-table-shrink); white-space: nowrap;'],
    [
      `${cell('fixed')} > :is(.truncate, :has(.truncate))`,
      'width: max-content; max-width: var(--data-table-hug-cap);',
    ],
    ...STEP_FLOORS.map((steps) => [
      cell(`s${steps}`),
      `min-width: calc(var(--spacing) * ${steps});`,
    ]),
    [
      cell('gutter'),
      'padding-inline-start: calc(var(--spacing-cell-x) + var(--data-table-gutter));',
    ],
    [cell('num', 'tbody > tr:not([data-table-state])'), 'font-variant-numeric: tabular-nums;'],
    [cell('hidden', 'tr:not(:has(> [colspan]))'), 'display: none;'],
    [cell('pad-end'), 'padding-inline-end: var(--data-table-edge-pad);'],
  ];
  return rules
    .map(
      ([selector, body]) =>
        `${selector} {\n${body
          .split('; ')
          .map((line) => `  ${line.replace(/;?$/u, ';')}`)
          .join('\n')}\n}\n`,
    )
    .join('');
}

export function positionSheet() {
  return Array.from({ length: DATA_TABLE_POSITIONS }, (_, index) => positionRules(index + 1)).join(
    '',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  writeFileSync(
    new URL('../components/ui/generated/data-table-positions.css', import.meta.url),
    positionSheet(),
  );
