// Type declarations for the built-in `node:sqlite` module (Node >= 22.5).
// Only the subset used by src/lib/sqlite-adapter.ts is declared.
// @types/node 20 does not ship these types yet.
declare module "node:sqlite" {
  interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    run(...anonymousParameters: unknown[]): StatementResultingChanges;
    get(...anonymousParameters: unknown[]): unknown;
    all(...anonymousParameters: unknown[]): unknown[];
    iterate(...anonymousParameters: unknown[]): IterableIterator<unknown>;
    finalize(): void;
    columns(): { column: string | null; database: string | null; name: string; table: string | null; type: string | null }[];
  }

  interface DatabaseSyncOptions {
    open?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
  }

  class DatabaseSync {
    constructor(
      location: string,
      options?: DatabaseSyncOptions | undefined
    );
    open(): void;
    close(): void;
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    isOpen(): boolean;
  }
}
