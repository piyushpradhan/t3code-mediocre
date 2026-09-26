import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Databases that ran the thread note as migration 54, before upstream took
// that slot for auto_settle_disabled_at, already have `note` and never ran the
// upstream 54. Both columns are checked so either history ends in one schema.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  if (!columns.some((column) => column.name === "note")) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN note TEXT`;
  }
  if (!columns.some((column) => column.name === "auto_settle_disabled_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN auto_settle_disabled_at TEXT
    `;
  }
});
