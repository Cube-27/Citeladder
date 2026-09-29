import { z } from 'zod';

/** Parse the one closed JSON block shared by portfolio display and admission. */
export function parsePromptProposal(body: string, maxCount: number) {
  const blocks: { json: string; start: number; end: number }[] = [];
  let open: { lines: string[]; start: number } | null = null;
  let offset = 0;
  for (const line of body.split('\n')) {
    const fence = line.trim().toLowerCase();
    if (open === null) {
      if (fence === '```json') open = { lines: [], start: offset };
    } else if (fence === '```') {
      blocks.push({ json: open.lines.join('\n'), start: open.start, end: offset + line.length });
      open = null;
    } else open.lines.push(line);
    offset += line.length + 1;
  }
  if (blocks.length !== 1) return null;
  const block = blocks[0]!;
  const schema = z.object({
    prompts: z
      .array(
        z.object({
          topic_id: z.uuid(),
          text: z.string(),
          buyer_stage: z.string(),
          prompt_intent: z.string(),
        }),
      )
      .min(1)
      .max(maxCount),
  });
  try {
    const parsed = schema.safeParse(JSON.parse(block.json));
    return parsed.success ? { ...block, rows: parsed.data.prompts } : null;
  } catch {
    return null;
  }
}
