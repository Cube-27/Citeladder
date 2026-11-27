import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RATCHETS,
  baselineDiffFailures,
  baselineRatchetFailures,
  loweredBaseline,
  maxParamsCount,
  nonNullCount,
  typeDisciplineFindings,
} from '../../frontend/scripts/type-discipline-checks.mjs';

const rules = (source, label = 'lib/example.ts') =>
  typeDisciplineFindings(source, label).map(({ rule, line }) => `${rule}@${line}`);

test('flags a key list cast from Object.keys, not one derived from its owner', () => {
  assert.deepEqual(
    rules(
      'const a = Object.keys(LAYOUT) as Key[];\nconst b = DROPS.map((drop) => drop.key);\nconst c = Object.entries(MAP) as [K, V][];',
    ),
    ['keys-cast@1', 'keys-cast@3'],
  );
});

test('flags an asserted first or last element, but never a split part', () => {
  assert.deepEqual(
    rules(
      [
        'const first = rows[0]!;',
        'const last = rows.at(-1)!;',
        "const head = path.split('/')[0]!;",
        "const tail = path.split('/').at(-1)!;",
        'const named = row[key]!;',
        'const checked = rows[0] ?? fallback;',
      ].join('\n'),
    ),
    ['index-non-null@1', 'index-non-null@2'],
  );
});

test('flags a cast in a value-change handler outside the generic controls', () => {
  const source = '<Select value={scope} onValueChange={(next) => setScope(next as Scope)} />';
  assert.deepEqual(rules(source, 'components/settings/scope.tsx'), ['value-change-cast@1']);
  assert.deepEqual(rules(source, 'components/ui/select.tsx'), []);
  assert.deepEqual(rules(source, 'components/ui/filter-row.tsx'), ['value-change-cast@1']);
  assert.deepEqual(
    rules('<Select value={scope} onValueChange={setScope} />', 'components/settings/scope.tsx'),
    [],
  );
});

test('flags a switch on a discriminant unless its default proves exhaustiveness', () => {
  assert.deepEqual(
    rules(
      [
        "function f() { switch (event.kind) { case 'a': return 1; default: return 0; } }",
        "function f() { switch (status) { case 'a': return 1; } }",
        "function f() { switch (phase) { case 'a': return 1; default: { const unhandled: never = phase; return unhandled; } } }",
        "function f() { switch (row.type) { case 'a': break; default: assertNever(row); } }",
        "function f() { switch (name) { case 'a': return 1; default: return 0; } }",
        "function f() { switch (state) { case 'a': return 1; default: return state satisfies never; } }",
        "function f() { switch (kind) { case 'a': return 1; default: { const check = (x: Kind) => x satisfies never; return 0; } } }",
        "function f() { switch (mode) { case 'a': return 1; default: { const empty: never[] = []; return empty.length; } } }",
        "function f() { switch (args.view) { case 'a': return 1; default: return 0; } }",
        "function f() { switch (args.view) { case 'a': return 1; default: return args.view satisfies never; } }",
      ].join('\n'),
    ),
    [
      'exhaustive-switch@1',
      'exhaustive-switch@2',
      'exhaustive-switch@7',
      'exhaustive-switch@8',
      'exhaustive-switch@9',
    ],
  );
});

const [nonNull, maxParams] = RATCHETS;

test('counts non-null assertions', () => {
  assert.equal(
    nonNullCount('const a = map.get(k)!;\nconst b = rows[0]!.id!;\nconst c = d ?? e;', 'x.ts'),
    3,
  );
});

test('counts the functions oxlint max-params flags, except library-shaped callbacks', () => {
  const source = [
    'function four(a: A, b: B, c: C, d: D) {}',
    'function three(a: A, b: B, c: C) {}',
    'const arrow = (a, b, c, d) => a;',
    'const tuple = (...[a, b, c, d]: Four) => a;',
    'declare function ambient(a: A, b: B, c: C, d: D): void;',
    'type Callback = (a: A, b: B, c: C, d: D) => void;',
    'interface Shape { method(a: A, b: B, c: C, d: D): void }',
    'class K { method(a, b, c, d) {} }',
    'useMutation({ onSuccess: (data, vars, result, context) => data, onSettled(a, b, c, d, e) {} });',
    'const handlers = { onPick: (a, b, c, d) => a };',
  ].join('\n');
  assert.equal(maxParamsCount(source, 'x.ts'), 6);
});

test('fails a raised, new or stale baseline entry and passes a matching one', () => {
  assert.deepEqual(
    baselineRatchetFailures({
      counts: { 'lib/a.ts': 3, 'lib/new.ts': 1, 'lib/same.ts': 2, 'lib/stale.ts': 1 },
      baseline: { 'lib/a.ts': 2, 'lib/same.ts': 2, 'lib/stale.ts': 4, 'lib/gone.ts': 1 },
      ratchet: maxParams,
    }),
    [
      'lib/a.ts: 3 functions over 3 parameters, baseline 2; take one object argument',
      'lib/gone.ts: 0 functions over 3 parameters, baseline 1; lower the entry with --write-max-params-baseline',
      'lib/new.ts: 1 functions over 3 parameters, baseline 0; take one object argument',
      'lib/stale.ts: 1 functions over 3 parameters, baseline 4; lower the entry with --write-max-params-baseline',
    ],
  );
  assert.deepEqual(
    baselineRatchetFailures({
      counts: { 'services/api/src/a.ts': 2 },
      baseline: { 'services/api/src/a.ts': 1 },
      ratchet: nonNull,
    }),
    [
      'services/api/src/a.ts: 2 non-null assertions, baseline 1; narrow the value instead of asserting it',
    ],
  );
});

test('fails a baseline key added or raised against the base revision', () => {
  assert.deepEqual(
    baselineDiffFailures({
      base: { 'lib/a.ts': 2, 'lib/b.ts': 3 },
      baseline: { 'lib/a.ts': 3, 'lib/b.ts': 1, 'lib/new.ts': 1 },
      ratchet: maxParams,
    }),
    [
      'max-params-baseline.json: lib/a.ts raised 2 -> 3; the baseline only shrinks',
      'max-params-baseline.json: new entry lib/new.ts; the baseline only shrinks',
    ],
  );
});

test('writing a baseline only lowers or drops entries, never raises or adds them', () => {
  assert.deepEqual(
    loweredBaseline(
      { 'lib/raised.ts': 5, 'lib/lower.ts': 1, 'lib/new.ts': 2 },
      { 'lib/raised.ts': 3, 'lib/lower.ts': 4, 'lib/gone.ts': 2 },
    ),
    { 'lib/raised.ts': 3, 'lib/lower.ts': 1 },
  );
});
