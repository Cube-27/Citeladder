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

/** A request-bound worker consumes existing work; its lease/settlement writes
 * must not launch another runner. Creation already owns the recovery wake-up.
 */
export function withoutWorkObservation<T>(run: () => Promise<T>): Promise<T> {
  return requests.exit(run);
}

/** A request owns observation; workers and offline operators never start more jobs. */
export function observeCommittedWork(run: () => Promise<void>, wake: () => Promise<void>) {
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

class ConnectionWork {
  transaction = false;
  failed = false;
  pending = false;
  savepoints: { name: string; pending: boolean }[] = [];

  reset(transaction: boolean) {
    this.transaction = transaction;
    this.failed = false;
    this.pending = false;
    this.savepoints = [];
  }

  control(statement: string): boolean {
    const command = statement.trim();
    const lower = command.toLowerCase();
    if (/^(?:begin|start transaction)\b/u.test(lower)) {
      this.reset(true);
      return true;
    }
    if (lower === 'commit' || lower === 'rollback') {
      const state = requests.getStore();
      if (lower === 'commit' && this.pending && !this.failed && state) state.committed = true;
      this.reset(false);
      return true;
    }
    const prefix = /^(savepoint|rollback to(?: savepoint)?|release(?: savepoint)?)\s+/iu.exec(
      command,
    );
    if (!prefix) return false;
    const name = command.slice(prefix[0].length).trim();
    const identifier = name.startsWith('"') ? name : name.toLowerCase();
    this.savepoint(prefix[1]!.toLowerCase(), identifier);
    return true;
  }

  savepoint(action: string, name: string) {
    if (action === 'savepoint') {
      this.savepoints.push({ name, pending: this.pending });
      return;
    }
    const index = this.savepoints.findLastIndex((item) => item.name === name);
    if (index < 0) return;
    const rollback = action.startsWith('rollback');
    if (rollback) {
      this.pending = this.savepoints[index]!.pending;
      this.failed = false;
    }
    this.savepoints = this.savepoints.slice(0, index + (rollback ? 1 : 0));
  }

  mutation() {
    const state = requests.getStore();
    if (!state) return;
    if (this.transaction) this.pending = true;
    else state.committed = true;
  }
}

/** Observe successful statements without network I/O while a connection is held. */
export function observeConnection(connection: DatabaseConnection): void {
  const execute = connection.executeQuery.bind(connection);
  const work = new ConnectionWork();
  connection.executeQuery = async <R>(
    query: CompiledQuery,
    options?: AbortableOperationOptions,
  ) => {
    let result;
    try {
      result = await execute<R>(query, options);
    } catch (error) {
      // PostgreSQL turns COMMIT into ROLLBACK in an aborted transaction.
      if (work.transaction) work.failed = true;
      throw error;
    }
    if (
      !work.control(query.sql) &&
      requests.getStore() &&
      (result.numAffectedRows ?? 0n) > 0n &&
      writesWork(query.query)
    )
      work.mutation();
    return result;
  };
}
