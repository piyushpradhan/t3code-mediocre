import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Null on ordinary projects; a JSON array of member project ids on products.
  yield* sql`ALTER TABLE projection_projects ADD COLUMN product_project_ids_json TEXT`;
});
