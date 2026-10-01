import { expect, it } from 'vitest';
import { auditSlots } from '../src/audits/freeze.ts';

// Outputs of CPython random.Random(int(seed)).shuffle for the historical slot traversal.
it.each([
  ['0', [1, 9, 8, 5, 10, 2, 3, 7, 4, 0, 11, 6]],
  ['42', [7, 5, 2, 8, 9, 6, 11, 3, 4, 0, 1, 10]],
  ['18446744073709551615', [1, 8, 6, 9, 2, 11, 4, 7, 10, 5, 3, 0]],
] as const)('preserves the historical schedule for seed %s', (seed, expected) => {
  const slots = auditSlots(2, ['chatgpt', 'claude'], 3, seed);
  expect(slots.map((s) => s.prompt * 6 + (s.engine === 'chatgpt' ? 0 : 3) + s.repetition)).toEqual(
    expected,
  );
});
