import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import {
  ProviderInstanceId,
  RunId,
  ServerProvider,
  TextGenerationError,
  ThreadId,
  type ModelSelection,
} from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, vi } from "vite-plus/test";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as SpeechSynthesis from "./SpeechSynthesis.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";

const decodeProvider = Schema.decodeUnknownSync(ServerProvider);

it.effect("speaks a run's last reply through the configured server only", () => {
  const getProviders = vi.fn(() =>
    Effect.succeed([
      decodeProvider({
        instanceId: "codex",
        driver: "codex",
        enabled: true,
        installed: true,
        status: "ready",
        version: null,
        auth: { status: "authenticated" },
        checkedAt: "2026-11-21T00:00:00.000Z",
        models: [{ slug: "gpt-6-luna", name: "Luna", isCustom: false, capabilities: null }],
      }),
    ]),
  );
  const getThreadRecords = vi.fn((..._args: ReadonlyArray<unknown>) =>
    Effect.succeed({
      messages: [
        { role: "user", text: "Fix the auth bug." },
        { role: "assistant", text: "Looking into it." },
        {
          role: "assistant",
          text: `Fixed \`auth.ts\`. ${"x".repeat(300)}.\n\`\`\`ts\nconst secret = 1;\n\`\`\``,
        },
        { role: "assistant", text: "  " },
      ],
    }),
  );
  const generateTranscriptionPostProcessing = vi.fn(
    (_input: { prompt: string; modelSelection: ModelSelection }) =>
      Effect.succeed({ transcription: "I fixed the **auth** bug, so you can sign in again." }),
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
      speechPostProcessingModelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-6.2-astra",
      },
    });
    expect(yield* failure({ text: "```\ncode only\n```" })).toBe("nothing-to-say");
    expect(upstream).not.toHaveBeenCalled();

    expect(yield* speak()).toEqual(new Uint8Array([1, 2, 3]));
    expect(generateTranscriptionPostProcessing.mock.calls[0]![0].modelSelection).toEqual({
      instanceId: "codex",
      model: "gpt-6-luna",
    });
    expect(getThreadRecords).toHaveBeenCalledWith(reply.threadId, ["messages"], {
      messageRoles: ["assistant", "user"],
      messageRunIds: [reply.runId],
    });
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:8880/v1/audio/speech");
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(JSON.parse(new TextDecoder().decode(init?.body as Uint8Array))).toEqual({
      input: "I fixed the auth bug, so you can sign in again.",
      response_format: "mp3",
      model: "kokoro",
      voice: "af_heart",
    });
    expect(generateTranscriptionPostProcessing.mock.calls[0]![0].prompt).toContain("const secret");
    expect(generateTranscriptionPostProcessing.mock.calls[0]![0].prompt).toContain(
      "Fix the auth bug.",
    );

    generateTranscriptionPostProcessing.mockReturnValueOnce(
      Effect.fail(
        new TextGenerationError({
          operation: "generateTranscriptionPostProcessing",
          detail: "down",
        }),
      ) as never,
    );
    yield* speak();
    expect(
      JSON.parse(new TextDecoder().decode(upstream.mock.calls[1]![1]?.body as Uint8Array)).input,
    ).toBe("Fixed auth.ts.");

    yield* settings.updateSettings({ cloudSpeechCredentials: { synthesis: "chosen" } });
    upstream.mockResolvedValueOnce(new Response("upstream diagnostic", { status: 401 }));
    expect(yield* failure({ text: "Hello." })).toBe("rejected-key");
    expect(new Headers(upstream.mock.calls[2]![1]?.headers).get("authorization")).toBe(
      "Bearer chosen",
    );
    generateTranscriptionPostProcessing.mockReturnValueOnce(
      Effect.succeed({ transcription: "word ".repeat(150) }),
    );
    yield* speak();
    const brief = JSON.parse(
      new TextDecoder().decode(upstream.mock.calls[3]![1]?.body as Uint8Array),
    ).input;
    expect(brief.trim().split(/\s+/u)).toHaveLength(100);
    generateTranscriptionPostProcessing.mockReturnValueOnce(
      Effect.succeed({ transcription: "VERBOSE\n" + "word ".repeat(150) }),
    );
    getThreadRecords.mockReturnValueOnce(
      Effect.succeed({
        messages: [
          { role: "user", text: "Give a verbose response." },
          { role: "assistant", text: "word ".repeat(200) },
        ],
      }),
    );
    yield* speak();
    const verbose = JSON.parse(
      new TextDecoder().decode(upstream.mock.calls[4]![1]?.body as Uint8Array),
    ).input;
    expect(verbose).not.toContain("VERBOSE");
    expect(verbose.trim().split(/\s+/u)).toHaveLength(150);
    getProviders.mockReturnValueOnce(Effect.succeed([]));
    yield* speak();
    expect(
      JSON.parse(new TextDecoder().decode(upstream.mock.calls[5]![1]?.body as Uint8Array)).input,
    ).toBe("Fixed auth.ts.");
  }).pipe(
    Effect.provide(
      SpeechSynthesis.layer.pipe(
        Layer.provideMerge(ServerSettings.ServerSettingsService.layerTest()),
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(
          Layer.mock(ProviderRegistry.ProviderRegistry)({
            getProviders: Effect.suspend(getProviders),
          }),
        ),
        Layer.provide(NodeServices.layer),
        Layer.provide(
          Layer.mock(TextGeneration.TextGeneration)({
            generateTranscriptionPostProcessing: generateTranscriptionPostProcessing as never,
          }),
        ),
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
