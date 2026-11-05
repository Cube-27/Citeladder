import { describe, expect, it } from 'vitest';
import { fieldRows, referenceRow } from './json-schema';

describe('reference table rows', () => {
  it('lists an enumeration as values with its default beside a plain type', () => {
    expect(
      referenceRow(
        'cohort',
        {
          type: 'string',
          enum: ['core', 'comparison'],
          default: 'core',
          description: 'Which prompts.',
        },
        false,
      ),
    ).toEqual({
      name: 'cohort',
      type: [{ text: 'string' }],
      required: false,
      description: 'Which prompts.',
      values: ['core', 'comparison'],
      defaultValue: '"core"',
    });
  });

  it('follows an object field with its inline fields and links named schemas', () => {
    const rows = fieldRows({
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        engines: {
          type: 'array',
          items: { properties: { name: { type: 'string' } }, required: ['name'] },
        },
        project: { $ref: '#/components/schemas/Project' },
      },
    });
    expect(rows.map(({ name, type, required }) => [name, type, required])).toEqual([
      ['id', [{ text: 'string (uuid)' }], true],
      ['engines', [{ text: '[]' }], false],
      ['engines.name', [{ text: 'string' }], true],
      ['project', [{ text: 'Project', schema: 'Project' }], false],
    ]);
  });
});
