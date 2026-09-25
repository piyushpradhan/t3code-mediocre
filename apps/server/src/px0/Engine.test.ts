import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import * as Net from "@t3tools/shared/Net";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { FetchHttpClient } from "effect/unstable/http";
import { describe, expect } from "vite-plus/test";

import * as Px0Engine from "./Engine.ts";

/**
 * A minimal px0-compatible server run as a fake binary. It answers the read
 * endpoints the engine proxies so the spawn → port → decode path is exercised
 * without depending on a real Go binary.
 */
const FAKE_PX0_SOURCE = `#!/usr/bin/env node
const http = require("node:http");
const args = process.argv.slice(2);
const portIdx = args.indexOf("-port");
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 7777;
const json = (res, body) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};
http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/api/meta") {
      return json(res, {
        root: "/fake", name: "fake", files: 1, ready: true, git: false,
        gitChanges: 0, gitFiles: [], lspServers: [], version: "0.0.0-test",
      });
    }
    if (u.pathname === "/api/tree") {
      return json(res, {
        dir: u.searchParams.get("dir") || "",
        children: [{ name: "a.go", path: "a.go", dir: false, size: 12 }],
      });
    }
    if (u.pathname === "/api/file") {
      return json(res, {
        path: u.searchParams.get("path"), lang: "Go", total: 1, maxCols: 4,
        start: 0, lines: ["<i class=k>hi</i>"], size: 12, exact: true,
        refine: false, markdown: false, diffAvailable: false,
        lsp: { server: "", state: "off" },
      });
    }
    res.statusCode = 404;
    res.end("{}");
  })
  .listen(port, "127.0.0.1");
`;

const makeFakeBinary = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-px0-fake-" });
  const bin = path.join(dir, "fake-px0");
  yield* fs.writeFileString(bin, FAKE_PX0_SOURCE);
  yield* fs.chmod(bin, 0o755);
  return { bin, dir };
});

const withPx0Binary = (bin: string) =>
  Effect.gen(function* () {
    const original = process.env["PX0_BINARY"];
    process.env["PX0_BINARY"] = bin;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (original === undefined) delete process.env["PX0_BINARY"];
        else process.env["PX0_BINARY"] = original;
      }),
    );
  });

const testLayer = Px0Engine.layer.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(Net.layer),
  Layer.provideMerge(FetchHttpClient.layer),
);

const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(testLayer));

describe("Px0Engine", () => {
  effectIt.live("spawns px0 and proxies meta, tree, and file", () =>
    run(
      Effect.gen(function* () {
        const { bin, dir } = yield* makeFakeBinary;
        yield* withPx0Binary(bin);
        const engine = yield* Px0Engine.Px0Engine;

        const meta = yield* engine.meta({ cwd: dir });
        expect(meta.ready).toBe(true);
        expect(meta.name).toBe("fake");
        expect(meta.version).toBe("0.0.0-test");

        const tree = yield* engine.tree({ cwd: dir, dir: "" });
        expect(tree.children).toEqual([{ name: "a.go", path: "a.go", dir: false, size: 12 }]);

        const file = yield* engine.file({ cwd: dir, path: "a.go" });
        expect(file.lang).toBe("Go");
        expect(file.lines).toEqual(["<i class=k>hi</i>"]);
        expect(file.diffAvailable).toBe(false);
      }),
    ),
  );

  effectIt.live("fails cleanly when the binary cannot be spawned", () =>
    run(
      Effect.gen(function* () {
        const { dir } = yield* makeFakeBinary;
        yield* withPx0Binary("/nonexistent/px0-does-not-exist");
        const engine = yield* Px0Engine.Px0Engine;

        const error = yield* engine.meta({ cwd: dir }).pipe(Effect.flip);
        expect(error._tag).toBe("Px0Error");
        expect(error.operation).toBe("spawn");
      }),
    ),
  );
});
