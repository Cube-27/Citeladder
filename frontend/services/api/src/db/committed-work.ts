import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  AbortableOperationOptions,
  CompiledQuery,
  DatabaseConnection,
  OperationNode,
} from 'kysely';
import { executionTables } from '../config/execution.ts';

type RequestWork = { committed: boolean };
const requests = new AsyncLocalStorage<RequestWork>();

/** A request owns observation; workers and offline operators never start more jobs. */
export async function observeCommittedWork(run: () => Promise<void>, wake: () => Promise<void>) {
  const state: RequestWork = { committed: false };
  return requests.run(state, async () => {
    try {
      await run();
    } finally {
      if (state.committed) await wake();
    }
  });
}

function targetTable(node: unknown): boolean {
  if (node === null || typeof node !== 'object' || !('kind' in node)) return false;
  const value = node as OperationNode & Record<string, unknown>;
  if (value.kind === 'TableNode') {
    const table = value.table as { identifier: { name: string } };
    return executionTables.has(table.identifier.name);
  }
  if (value.kind === 'AliasNode') return targetTable(value.node);
  if (value.kind === 'FromNode') return (value.froms as unknown[]).some(targetTable);
  return false;
}

function writesWork(node: OperationNode): boolean {
  const value = node as OperationNode & Record<string, unknown>;
  if (['ValueNode', 'PrimitiveValueListNode'].includes(value.kind)) return false;
  if (['InsertQueryNode', 'UpdateQueryNode'].includes(value.kind)) {
    if (targetTable(value.into ?? value.table)) return true;
  }
  return Object.values(value).some((child) => {
    if (Array.isArray(child))
      return child.some(
        (item: unknown) =>
          item !== null &&
          typeof item === 'object' &&
          'kind' in item &&
          writesWork(item as OperationNode),
      );
    return (
      child !== null &&
      typeof child === 'object' &&
      'kind' in child &&
      writesWork(child as OperationNode)
    );
  });
}

/** Observe actual successful statements, including COMMIT and manual savepoints.
 * No callback performs network I/O while a pooled connection is held.
 */
export function observeConnection(connection: DatabaseConnection): void {
  const execute = connection.executeQuery.bind(connection);
  let transaction = false;
  let failed = false;
  let pending = false;
  let savepoints: { name: string; pending: boolean }[] = [];
  connection.executeQuery = async <R>(
    query: CompiledQuery,
    options?: AbortableOperationOptions,
  ) => {
    let result;
    try {
      result = await execute<R>(query, options);
    } catch (error) {
      // PostgreSQL turns COMMIT into ROLLBACK in an aborted transaction.
      if (transaction) failed = true;
      throw error;
    }
    const command = query.sql.trim().toLowerCase();
    if (/^(?:begin|start transaction)\b/u.test(command)) {
      transaction = true;
      failed = false;
      pending = false;
      savepoints = [];
    } else if (command === 'commit') {
      const state = requests.getStore();
      if (pending && !failed && state) state.committed = true;
      transaction = false;
      pending = false;
      savepoints = [];
    } else if (command === 'rollback') {
      transaction = false;
      pending = false;
      savepoints = [];
    } else {
      const savepoint =
        /^(savepoint|rollback to(?: savepoint)?|release(?: savepoint)?)\s+(.+)$/u.exec(command);
      if (savepoint) {
        const name = savepoint[2]!;
        if (savepoint[1] === 'savepoint') savepoints.push({ name, pending });
        else {
          const index = savepoints.findLastIndex((item) => item.name === name);
          if (index >= 0) {
            if (savepoint[1]!.startsWith('rollback')) {
              pending = savepoints[index]!.pending;
              failed = false;
            }
            savepoints = savepoints.slice(
              0,
              index + (savepoint[1]!.startsWith('rollback') ? 1 : 0),
            );
          }
        }
      } else if (
        requests.getStore() &&
        (result.numAffectedRows ?? 0n) > 0n &&
        writesWork(query.query)
      ) {
        if (transaction) pending = true;
        else requests.getStore()!.committed = true;
      }
    }
    return result;
  };
}
