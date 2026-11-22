import { z } from 'zod';
import type { Actor } from '../auth/actor.ts';
import { authorize, type Authorized, type Permission } from '../commands/permission.ts';
import type { ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { operatorTransaction } from '../db/operator-transaction.ts';

export type PreparedChange = Readonly<{ id: string; projectId: string }>;
type ChangeResult = Readonly<{ summary: string }> & Record<string, unknown>;
export const changePreviewSchema = z.strictObject({
  title: z.string(),
  rows: z.array(z.strictObject({ label: z.string(), value: z.string() })),
  spend: z.string().nullable(),
  opens: z.strictObject({ label: z.string(), path: z.string() }).nullable(),
});
export type ChangePreview = z.infer<typeof changePreviewSchema>;
export type PreviewContext = Readonly<{
  db: Database;
  config: ServiceConfig;
  workspaceId: string;
  projectId: string;
}>;

type Execute<S extends z.ZodType, P extends Permission> = (
  trx: Database,
  config: ServiceConfig,
  actor: Authorized<P>,
  change: PreparedChange,
  payload: z.output<S>,
) => Promise<ChangeResult>;

type Draft<S extends z.ZodType, D extends z.ZodType> = Readonly<{
  schema: D;
  complete: (context: PreviewContext, draft: z.output<D>) => Promise<z.input<S>>;
}>;

export function changeKind<
  S extends z.ZodType,
  P extends Permission,
  D extends z.ZodType = S,
>(entry: {
  permission: P;
  payload: S;
  purpose: string;
  execute: Execute<S, P>;
  preview: (context: PreviewContext, payload: z.output<S>) => Promise<ChangePreview>;
  draft?: Draft<S, D>;
}) {
  return {
    permission: entry.permission,
    payload: entry.payload,
    purpose: entry.purpose,
    proposal: entry.draft?.schema ?? entry.payload,
    execute: entry.execute,
    async rehearse<T>(
      db: Database,
      config: ServiceConfig,
      actor: Authorized<P>,
      change: PreparedChange,
      input: z.input<S>,
      inspect: (trx: Database) => Promise<T>,
    ) {
      const payload = entry.payload.parse(input);
      const inspected = await operatorTransaction(db, false, async (trx) => {
        await entry.execute(trx, config, actor, change, payload);
        return inspect(trx);
      });
      return { payload, inspected };
    },
    async stage(context: PreviewContext, actor: Actor, change: PreparedChange, proposed: unknown) {
      const authorized = authorize(actor, entry.permission);
      const input = entry.draft
        ? await entry.draft.complete(context, entry.draft.schema.parse(proposed))
        : proposed;
      const payload = entry.payload.parse(input);
      const preview = await operatorTransaction(context.db, false, async (trx) => {
        const shown = await entry.preview({ ...context, db: trx }, payload);
        await entry.execute(trx, context.config, authorized, change, payload);
        return shown;
      });
      return { payload, preview };
    },
    confirm(
      trx: Database,
      config: ServiceConfig,
      actor: Actor,
      change: PreparedChange,
      stored: unknown,
    ) {
      return entry.execute(
        trx,
        config,
        authorize(actor, entry.permission),
        change,
        entry.payload.parse(stored),
      );
    },
  };
}

export const quoted = (texts: readonly string[]) => texts.map((text) => `“${text}”`).join(', ');
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;
export const rowsOf = (label: string, values: readonly string[]) =>
  values.map((value) => ({ label, value }));
