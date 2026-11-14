import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Fork v0.0.96 shipped this as migration 86, so those databases already have the column.
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;
  if (columns.some((column) => column.name === "product_project_ids_json")) return;
  // Null on ordinary projects; a JSON array of member project ids on products.
  yield* sql`ALTER TABLE projection_projects ADD COLUMN product_project_ids_json TEXT`;
});
