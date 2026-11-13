import { ServerSuggestSkillsInput, ServerSuggestSkillsResult } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

type Reply = typeof ServerSuggestSkillsResult.Type;
type Input = typeof ServerSuggestSkillsInput.Type;
const decodeReply = Schema.decodeUnknownOption(Schema.fromJsonString(ServerSuggestSkillsResult));
const encodeInput = Schema.encodeEffect(Schema.fromJsonString(ServerSuggestSkillsInput));

// A resident worker avoids loading the weights on each keystroke; stdout is JSON-lines only.
const worker = `
import os, sys, json, contextlib
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
with contextlib.redirect_stdout(sys.stderr):
    import laya_mlx
    agent = laya_mlx.load("aac6fef/laya-typed-decisions-mlx")
for line in sys.stdin:
    try:
        request = json.loads(line)
        options = {str(i): s["name"][:80] + ": " + s["description"][:180] for i, s in enumerate(request["candidates"])}
        options["none"] = "No specialized skill is useful for this request."
        with contextlib.redirect_stdout(sys.stderr):
            result = agent.predict(request["prompt"][:1200], {"skill": {"type": "choice", "instructions": "Choose the most useful skill for the user's request, or none.", "criteria": options}})
        answer = result["answers"]["skill"]
        choice = answer["choice"]
        name = request["candidates"][int(choice)]["name"] if choice != "none" else None
        print(json.dumps({"name": name, "available": True}), flush=True)
    except Exception:
        print(json.dumps({"name": None, "available": False}), flush=True)
`;

export class SkillSuggestions extends Context.Service<
  SkillSuggestions,
  {
    readonly suggest: (input: Input) => Effect.Effect<Reply>;
  }
>()("t3/provider/SkillSuggestions") {}

const make = Effect.gen(function* () {
  const environment = yield* HostProcess.Environment;
  const scope = yield* Scope.Scope;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const gate = yield* Semaphore.make(1);
  const requests = yield* Queue.unbounded<Uint8Array>();
  const replies = yield* Queue.unbounded<Reply>();
  const unavailable: Reply = { name: null, available: false };
  let child: ChildProcessSpawner.ChildProcessHandle | undefined;
  let failed = false;
  const start = Effect.fn("SkillSuggestions.start")(function* () {
    const running = yield* spawner
      .spawn(
        ChildProcess.make(environment.T3CODE_SKILL_PYTHON ?? "python3", ["-u", "-c", worker], {
          stdin: Stream.fromQueue(requests),
          stderr: "ignore",
        }),
      )
      .pipe(Effect.provideService(Scope.Scope, scope));
    child = running;
    yield* running.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach((line) => {
        const parsed = decodeReply(line);
        return Queue.offer(replies, parsed._tag === "Some" ? parsed.value : unavailable);
      }),
      Effect.ensuring(Queue.offer(replies, unavailable)),
      Effect.ignore,
      Effect.forkIn(scope),
    );
  });
  const suggest = Effect.fn("SkillSuggestions.suggest")(function* (input: Input) {
    return yield* gate.withPermits(1)(
      Effect.gen(function* () {
        if (!input.prompt.trim() || input.candidates.length === 0 || failed) return unavailable;
        if (!child) yield* start();
        const json = yield* encodeInput(input);
        yield* Queue.offer(requests, new TextEncoder().encode(`${json}\n`));
        const reply = yield* Queue.take(replies);
        return reply.name !== null && !input.candidates.some((skill) => skill.name === reply.name)
          ? unavailable
          : reply;
      }).pipe(
        Effect.timeoutOrElse({ duration: "15 seconds", orElse: () => Effect.succeed(unavailable) }),
        Effect.orElseSucceed(() => unavailable),
        Effect.tap((reply) => {
          if (reply.available) return Effect.void;
          failed = true;
          return child ? child.kill().pipe(Effect.ignore) : Effect.void;
        }),
      ),
    );
  });
  return SkillSuggestions.of({ suggest });
});

export const layer = Layer.effect(SkillSuggestions, make);
