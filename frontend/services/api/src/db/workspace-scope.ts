/**
 * Workspace-scoped query entry points (invariant: every project-owned read and
 * write is workspace-authorized).
 *
 * A `WorkspaceScope` exists only after membership was verified (see
 * `auth/workspace.ts`), and product tables are reached through it so the
 * `workspace_id` predicate cannot be forgotten. Only tables that carry a
 * `workspace_id` column are accepted, which the compiler enforces.
 */
import {
  sql,
  type DeleteQueryBuilder,
  type DeleteResult,
  type SelectQueryBuilder,
  type SqlBool,
  type UpdateQueryBuilder,
  type UpdateResult,
} from 'kysely';

import type { Database } from './database.ts';
import type { DB } from '../generated/db-schema.ts';

export type WorkspaceTable = {
  [Table in keyof DB]: 'workspace_id' extends keyof DB[Table] ? Table : never;
}[keyof DB];

export class WorkspaceScope {
  readonly workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  // Kysely cannot resolve its builder overloads for a generic table name, so
  // each entry point widens to the table union once and narrows back.
  selectFrom<Table extends WorkspaceTable>(db: Database, table: Table) {
    const query = db.selectFrom(table as WorkspaceTable).where(this.predicate(table));
    return query as unknown as SelectQueryBuilder<DB, Table, Record<never, never>>;
  }

  updateTable<Table extends WorkspaceTable>(db: Database, table: Table) {
    const query = db.updateTable(table as WorkspaceTable).where(this.predicate(table));
    return query as unknown as UpdateQueryBuilder<DB, Table, Table, UpdateResult>;
  }

  deleteFrom<Table extends WorkspaceTable>(db: Database, table: Table) {
    const query = db.deleteFrom(table as WorkspaceTable).where(this.predicate(table));
    return query as unknown as DeleteQueryBuilder<DB, Table, DeleteResult>;
  }

  private predicate(table: WorkspaceTable) {
    return sql<SqlBool>`${sql.ref(`${table}.workspace_id`)} = ${this.workspaceId}`;
  }
}
