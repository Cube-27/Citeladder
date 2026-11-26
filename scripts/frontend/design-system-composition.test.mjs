import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ancestorRuleFindings,
  compositionFindings,
} from '../../frontend/scripts/design-system-composition.mjs';

test('flags globals rules keyed on a section or dialog ancestor, not the element itself', () => {
  const css = [
    "[role='dialog'] .x { color: red; }",
    ":where(.card, [role='dialog']) .table-frame { border: 0; }",
    ".x:not(:where([data-section='framed'], .y) *) { padding: 0; }",
    "[role='dialog'][data-state='open'] { opacity: 1; }",
    "[data-section='framed'] { padding: 0; }",
  ].join('\n');
  assert.deepEqual(
    ancestorRuleFindings('g.css', css).map((finding) => finding.split(':')[1]),
    ['1', '2', '3'],
  );
});

test('counts layout faces and negative margins in feature code only', () => {
  const source = [
    "import { wellClasses } from '@/components/ui/well';",
    '<div className={wellClasses()} />',
    '<div className="-mx-4 mx-2 -mt-[var(--x)]" />',
  ].join('\n');
  assert.deepEqual(
    compositionFindings('components/runs/a.tsx', source).map((finding) => finding.split(': ')[1]),
    [
      'negative margin -mx-4 outside components/ui',
      'negative margin -mt-[var(--x)] outside components/ui',
      'wellClasses used as a layout card',
    ],
  );
  assert.deepEqual(compositionFindings('components/ui/a.tsx', source), []);
});
