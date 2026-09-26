import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";
import migrateThreadNote from "./055_ProjectionThreadNote.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("055_ProjectionThreadNote", (it) => {
  it.effect("repairs a database that ran the note as migration 54", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // The old history: note added in slot 54, upstream's 54 never ran.
      yield* runMigrations({ toMigrationInclusive: 53 });
      yield* sql`ALTER TABLE projection_threads ADD COLUMN note TEXT`;

      yield* migrateThreadNote;

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      const names = columns.map((column) => column.name);
      assert.isTrue(names.includes("note"));
      assert.isTrue(names.includes("auto_settle_disabled_at"));
    }),
  );
});
