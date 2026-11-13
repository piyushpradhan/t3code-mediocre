import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { expect } from "vite-plus/test";
import * as SkillSuggestions from "./SkillSuggestions.ts";

it.live("keeps a worker resident, validates its decisions and handles unavailable runtimes", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-skill-model-" });
    const binary = `${directory}/model`;
    yield* fs.writeFileString(
      binary,
      `#!/usr/bin/env node
const rl = require('node:readline').createInterface({ input: process.stdin });
let count = 0;
rl.on('line', line => {
 const input = JSON.parse(line);
 count++;
 const name = input.prompt === 'unknown' ? 'invented-skill' : count === 1 ? input.candidates[0].name : null;
 process.stdout.write(JSON.stringify({ name, available: true }) + '\\n');
});
`,
    );
    yield* fs.chmod(binary, 0o755);
    const input = {
      prompt: "review code",
      candidates: [{ name: "review", description: "Code review" }],
    };
    yield* Effect.gen(function* () {
      const service = yield* SkillSuggestions.SkillSuggestions;
      expect(yield* service.suggest(input)).toEqual({ name: "review", available: true });
      expect(yield* service.suggest(input)).toEqual({ name: null, available: true });
      expect(yield* service.suggest({ ...input, prompt: "unknown" })).toEqual({
        name: null,
        available: false,
      });
    }).pipe(
      Effect.provide(
        SkillSuggestions.layer.pipe(
          Layer.provide(NodeServices.layer),
          Layer.provide(Layer.succeed(HostProcess.Environment)({ T3CODE_SKILL_PYTHON: binary })),
        ),
      ),
    );
    yield* Effect.gen(function* () {
      const service = yield* SkillSuggestions.SkillSuggestions;
      expect(yield* service.suggest(input)).toEqual({ name: null, available: false });
    }).pipe(
      Effect.provide(
        SkillSuggestions.layer.pipe(
          Layer.provide(NodeServices.layer),
          Layer.provide(
            Layer.succeed(HostProcess.Environment)({ T3CODE_SKILL_PYTHON: `${directory}/missing` }),
          ),
        ),
      ),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
