/** Offline measurement fixtures call the production scorer without any provider or database. */
import { z } from 'zod';
import { scoringConfig, scoreExecution } from '../analysis/scoring.ts';

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const object = z.record(z.string(), z.unknown());
const request = z
  .object({
    configuration: object,
    items: z.array(
      z.object({
        answerText: z.string(),
        promptText: z.string(),
        searchUsed: z.boolean(),
        searchEvents: z.array(object),
        citations: z.array(object),
      }),
    ),
  })
  .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
const config = scoringConfig(request.configuration);
process.stdout.write(
  JSON.stringify(
    request.items.map((item) =>
      scoreExecution({
        ...item,
        config,
        queryTextAvailable: true,
      }),
    ),
  ) + '\n',
);
