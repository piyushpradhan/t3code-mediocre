import { it } from "@effect/vitest";
import { RunId, ThreadId } from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, vi } from "vite-plus/test";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as SpeechSynthesis from "./SpeechSynthesis.ts";

it.effect("speaks a run's last reply through the configured server only", () => {
  const getThreadRecords = vi.fn((..._args: ReadonlyArray<unknown>) =>
    Effect.succeed({
      messages: [
        { text: "Looking into it." },
        { text: "Fixed `auth.ts`.\n```ts\nconst secret = 1;\n```" },
        { text: "  " },
      ],
    }),
  );
  return Effect.gen(function* () {
    const upstream = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1, 2, 3])));
    const settings = yield* ServerSettings.ServerSettingsService;
    const service = yield* SpeechSynthesis.SpeechSynthesis;
    const reply = { threadId: ThreadId.make("thread-1"), runId: RunId.make("run-1") };
    const speak = (request: Parameters<typeof service.speak>[0] = reply) =>
      service.speak(request).pipe(Effect.provideService(FetchHttpClient.Fetch, upstream));
    const failure = (request?: Parameters<typeof service.speak>[0]) =>
      Effect.flip(speak(request)).pipe(
        Effect.map((error) => (error._tag === "SpeechSynthesisError" ? error.reason : error._tag)),
      );

    expect(yield* failure()).toBe("not-configured");
    yield* settings.updateSettings({
      speechSynthesis: { baseUrl: "http://localhost:8880/v1/", model: "kokoro", voice: "af_heart" },
    });
    expect(yield* failure({ text: "```\ncode only\n```" })).toBe("nothing-to-say");
    expect(upstream).not.toHaveBeenCalled();

    expect(yield* speak()).toEqual(new Uint8Array([1, 2, 3]));
    expect(getThreadRecords).toHaveBeenCalledWith(reply.threadId, ["messages"], {
      messageRoles: ["assistant"],
      messageRunIds: [reply.runId],
    });
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:8880/v1/audio/speech");
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(JSON.parse(new TextDecoder().decode(init?.body as Uint8Array))).toEqual({
      input: "Fixed auth.ts.",
      response_format: "mp3",
      model: "kokoro",
      voice: "af_heart",
    });

    yield* settings.updateSettings({ cloudSpeechCredentials: { synthesis: "chosen" } });
    upstream.mockResolvedValueOnce(new Response("upstream diagnostic", { status: 401 }));
    expect(yield* failure({ text: "Hello." })).toBe("rejected-key");
    expect(new Headers(upstream.mock.calls[1]![1]?.headers).get("authorization")).toBe(
      "Bearer chosen",
    );
  }).pipe(
    Effect.provide(
      SpeechSynthesis.layer.pipe(
        Layer.provideMerge(ServerSettings.ServerSettingsService.layerTest()),
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(Layer.mock(SecretResolver.SecretResolver)({})),
        Layer.provide(
          Layer.mock(ThreadManagementService.ThreadManagementService)({
            getThreadRecords: getThreadRecords as never,
          }),
        ),
      ),
    ),
  );
});
