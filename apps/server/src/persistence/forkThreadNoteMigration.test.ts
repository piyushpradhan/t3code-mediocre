import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "./Migrations.ts";

describe("fork thread note migration", () => {
  it.effect("fork databases that recorded the note as 55 still run OrchestrationV2", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 54 });
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (55, 'ProjectionThreadNote')`;

      const executed = yield* runMigrations();

      assert.deepStrictEqual(executed[0], [55, "OrchestrationV2"]);
      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(projection_threads)`;
      assert.isTrue(columns.some((column) => column.name === "note"));
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("fresh databases get the note column the V1 importer reads", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(projection_threads)`;
      assert.isTrue(columns.some((column) => column.name === "note"));
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
