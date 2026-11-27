import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ancestorRuleFindings } from '../../frontend/scripts/design-system-composition.mjs';

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
