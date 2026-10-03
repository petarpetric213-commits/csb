// ============================================================================
// NEXORA ERP — Prisma driver adapter for the built-in Node.js SQLite driver
// (`node:sqlite`, Node >= 22.5).
//
// Why this exists: the demo environment cannot download Prisma's native
// engine binaries (offline sandbox). The generated client (Prisma 6,
// `queryCompiler` preview) plans queries with the WASM query compiler that
// ships inside @prisma/client on npm, and delegates SQL execution to a driver
// adapter. This adapter implements the documented SqlDriverAdapter /
// SqlMigrationAwareDriverAdapterFactory interfaces on top of Node's built-in
// SQLite — zero native dependencies, fully offline.
//
// Production (PostgreSQL) deployments swap this for @prisma/adapter-pg:
// only src/lib/db.ts changes. See DATABASE.md.
// ============================================================================

import { DatabaseSync } from "node:sqlite";
import {
  DriverAdapterError,
  ColumnTypeEnum,
  type SqlQuery,
  type SqlResultSet,
  type SqlDriverAdapter,
  type SqlMigrationAwareDriverAdapterFactory,
  type Transaction,
  type ColumnType,
  type IsolationLevel,
} from "@prisma/driver-adapter-utils";

const T = ColumnTypeEnum;

/** Map a SQLite declared column type (statement metadata) to a Prisma ColumnType. */
function mapDeclaredType(declared: string | undefined | null): ColumnType {
  const d = (declared ?? "").toUpperCase();
  if (d.includes("BOOL")) return T.Boolean;
  if (d.includes("INT")) return T.Int64;
  if (d.includes("CHAR") || d.includes("CLOB") || d.includes("TEXT")) return T.Text;
  if (d.includes("BLOB") || d.includes("BIN")) return T.Bytes;
  if (d.includes("DATETIME") || d.includes("TIMESTAMP") || d.includes("DATE") || d.includes("TIME")) return T.DateTime;
  if (d.includes("REAL") || d.includes("FLOA") || d.includes("DOUB") || d.includes("NUM")) return T.Double;
  return T.Text;
}

/** Fallback: infer a ColumnType from a runtime JS value. */
function inferType(value: unknown): ColumnType {
  if (value === null || value === undefined) return T.Text;
  if (typeof value === "number") return Number.isInteger(value) ? T.Int64 : T.Double;
  if (typeof value === "bigint") return T.Int64;
  if (typeof value === "boolean") return T.Boolean;
  if (value instanceof Uint8Array) return T.Bytes;
  if (value instanceof Date) return T.DateTime;
  return T.Text;
}

/** Coerce engine-provided bind values into types node:sqlite accepts. */
function bindable(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

interface ColumnMeta {
  name: string;
  declared: string | null;
}

class NodeSqliteAdapter implements SqlDriverAdapter {
  readonly provider = "sqlite" as const;
  readonly adapterName = "node-sqlite";

  constructor(private db: DatabaseSync) {}

  private columnsOf(sql: string): ColumnMeta[] {
    const stmt = this.db.prepare(sql);
    const cols = stmt.columns() as { column?: string; name?: string; type?: string | null }[];
    return cols.map((c) => ({ name: c.column ?? c.name ?? "?", declared: (c.type as string) ?? null }));
  }

  async queryRaw(params: SqlQuery): Promise<SqlResultSet> {
    try {
      const columns = this.columnsOf(params.sql);
      const stmt = this.db.prepare(params.sql);
      const rows = stmt.all(...params.args.map(bindable)) as Record<string, unknown>[];
      const columnNames = columns.map((c) => c.name);
      const columnTypes = columns.map((c) => mapDeclaredType(c.declared));
      const out: unknown[][] = rows.map((row) => columnNames.map((n) => (n in row ? row[n] : null)));
      for (let i = 0; i < columnTypes.length; i++) {
        if (columns[i].declared) continue;
        const sample = out.find((r) => r[i] !== null && r[i] !== undefined)?.[i];
        columnTypes[i] = inferType(sample);
      }
      return { columnNames, columnTypes, rows: out };
    } catch (e) {
      throw new DriverAdapterError(mapSqliteError(e));
    }
  }

  async executeRaw(params: SqlQuery): Promise<number> {
    try {
      const stmt = this.db.prepare(params.sql);
      const result = stmt.run(...params.args.map(bindable));
      return Number(result.changes);
    } catch (e) {
      throw new DriverAdapterError(mapSqliteError(e));
    }
  }

  async executeScript(script: string): Promise<void> {
    try {
      this.db.exec(script);
    } catch (e) {
      throw new DriverAdapterError(mapSqliteError(e));
    }
  }

  async startTransaction(_isolationLevel?: IsolationLevel): Promise<Transaction> {
    const db = this.db;
    const run = (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        throw new DriverAdapterError(mapSqliteError(e));
      }
    };
    /** COMMIT/ROLLBACK are idempotent: the query compiler issues the closing
     *  statement itself via executeRaw() before calling commit()/rollback(). */
    const close = (statement: "COMMIT" | "ROLLBACK") => {
      try {
        db.exec(statement);
      } catch (e) {
        const msg = (e as Error).message ?? "";
        if (msg.includes("no transaction is active")) return;
        throw new DriverAdapterError(mapSqliteError(e));
      }
    };
    run(() => db.exec("BEGIN"));
    const queryable = {
      provider: "sqlite" as const,
      adapterName: "node-sqlite",
      queryRaw: (p: SqlQuery) => this.queryRaw(p),
      executeRaw: (p: SqlQuery) => this.executeRaw(p),
    };
    return {
      ...queryable,
      options: { usePhantomQuery: false },
      commit: async () => close("COMMIT"),
      rollback: async () => close("ROLLBACK"),
    };
  }

  getConnectionInfo() {
    // The WASM query compiler uses this to decide whether it may emit
    // relational JOINs (SQLite: no — emulate via separate queries).
    return { maxBindValues: 32766, supportsRelationJoins: false };
  }

  async dispose(): Promise<void> {
    // Keep the process-wide connection open (single-writer demo workload).
  }
}

/** Map a node:sqlite error to Prisma's SqliteError shape. */
function mapSqliteError(e: unknown) {
  const errAny = e as { code?: string; errno?: number; message?: string };
  return {
    kind: "sqlite" as const,
    extendedCode: Number(errAny?.errno ?? 1),
    message: errAny?.message ?? "Unknown SQLite error",
    originalCode: errAny?.code,
    originalMessage: errAny?.message,
  };
}

/** Adapter factory: opens (or creates) the SQLite database file. */
export function createNodeSqliteAdapterFactory(url: string): SqlMigrationAwareDriverAdapterFactory {
  let path = url.replace(/^file:/, "").replace(/^sqlite:/, "");
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const db = new DatabaseSync(path || ":memory:");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  const adapter = new NodeSqliteAdapter(db);
  return {
    adapterName: "node-sqlite",
    provider: "sqlite",
    connect: async () => adapter,
    connectToShadowDb: async () => adapter,
  };
}
