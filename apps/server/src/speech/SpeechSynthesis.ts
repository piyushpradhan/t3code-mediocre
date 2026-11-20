import {
  type EnvironmentSpeechSynthesisRequest,
  isSecretReference,
  type ServerSettingsError,
  SpeechSynthesisError,
} from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import { resolveSpeechPostProcessingModelSelection } from "@t3tools/shared/serverSettings";
import { speakableText } from "@t3tools/shared/speech";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import type * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import { requireSettingsSecret } from "../secrets/settingsSecretValue.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";

type Reason = SpeechSynthesisError["reason"];
const fail = (reason: Reason) => new SpeechSynthesisError({ reason });
const RUN_BRIEF_MAX_CHARS = 240;

const replyGistPrompt = (
  reply: string,
) => `Turn this coding agent's reply into what it would say out loud to the person who asked: one or two short, conversational sentences that capture the gist of the whole reply, including the outcome and anything the person needs to do. No markdown, code, file paths, commands, or technical detail unless it is the point. Speak in first person as the agent.

<reply>
${reply}
</reply>

Return only the spoken sentences.`;

export class SpeechSynthesis extends Context.Service<
  SpeechSynthesis,
  {
    /** Audio of the text, or of a run's last assistant message, from the configured speech server. */
    readonly speak: (
      request: typeof EnvironmentSpeechSynthesisRequest.Type,
    ) => Effect.Effect<
      Uint8Array,
      SpeechSynthesisError | ServerSettingsError | Orchestrator.OrchestratorV2Error
    >;
  }
>()("t3/speech/SpeechSynthesis") {}

export const layer = Layer.effect(
  SpeechSynthesis,
  Effect.gen(function* () {
    const settings = yield* ServerSettings.ServerSettingsService;
    const resolver = yield* SecretResolver.SecretResolver;
    const threads = yield* ThreadManagementService.ThreadManagementService;
    const http = yield* HttpClient.HttpClient;
    const textGeneration = yield* TextGeneration.TextGeneration;
    const fileSystem = yield* FileSystem.FileSystem;

    // ponytail: reuses the dictation cleanup op as a generic prompt-to-text call, falling back to the opening sentences.
    const replyGist = (reply: string) => {
      const prose = speakableText(reply, Number.MAX_SAFE_INTEGER);
      if (prose.length <= RUN_BRIEF_MAX_CHARS) return Effect.succeed(prose);
      const opening = speakableText(reply, RUN_BRIEF_MAX_CHARS);
      return Effect.gen(function* () {
        const current = yield* settings.getSettings;
        // Providers run in a working directory; a summary must not read a checkout.
        const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-spoken-reply-" });
        const generated = yield* textGeneration.generateTranscriptionPostProcessing({
          cwd,
          prompt: replyGistPrompt(reply),
          modelSelection: resolveSpeechPostProcessingModelSelection(current),
        });
        return speakableText(generated.transcription) || opening;
      }).pipe(
        Effect.scoped,
        Effect.orElseSucceed(() => opening),
      );
    };

    const speak = Effect.fn("SpeechSynthesis.speak")(
      function* (request: typeof EnvironmentSpeechSynthesisRequest.Type) {
        const { speechSynthesis, cloudSpeechCredentials } = yield* settings.getSettings;
        const baseUrl = speechSynthesis.baseUrl.trim().replace(/\/+$/, "");
        if (!baseUrl) return yield* fail("not-configured");
        if (!/^https?:\/\//i.test(baseUrl) || !URL.canParse(baseUrl))
          return yield* fail("unavailable");
        const input =
          "text" in request
            ? speakableText(request.text)
            : yield* replyGist(
                (yield* threads.getThreadRecords(request.threadId, ["messages"], {
                  messageRoles: ["assistant"],
                  messageRunIds: [request.runId],
                })).messages.findLast((message) => !message.workflowScript && message.text.trim())
                  ?.text ?? "",
              );
        if (!input) return yield* fail("nothing-to-say");
        const source = cloudSpeechCredentials.synthesis;
        // A vault that locked since the last reply must not authorize sending this one.
        if (isSecretReference(source)) yield* resolver.invalidate([source]);
        const key = source
          ? yield* requireSettingsSecret(resolver, source).pipe(
              Effect.mapError(() => fail("unreadable-key")),
            )
          : "";
        const model = speechSynthesis.model.trim();
        const voice = speechSynthesis.voice.trim();
        const response = yield* http
          .execute(
            HttpClientRequest.post(`${baseUrl}/audio/speech`).pipe(
              key ? HttpClientRequest.bearerToken(Redacted.make(key)) : (plain) => plain,
              HttpClientRequest.bodyJsonUnsafe({
                input,
                response_format: "mp3",
                ...(model ? { model } : {}),
                ...(voice ? { voice } : {}),
              }),
            ),
          )
          .pipe(
            // Reply text and the key never follow a redirect to another host.
            Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
            Effect.provideService(HttpClient.TracerPropagationEnabled, false),
            Effect.mapError(() => fail("unavailable")),
          );
        if (response.status < 200 || response.status >= 300)
          return yield* fail(
            response.status === 401 || response.status === 403 ? "rejected-key" : "unavailable",
          );
        const audio = yield* response.arrayBuffer.pipe(Effect.mapError(() => fail("unavailable")));
        if (audio.byteLength === 0) return yield* fail("unavailable");
        return new Uint8Array(audio);
      },
      Effect.timeoutOrElse({
        duration: "1 minute",
        orElse: () => Effect.fail(fail("unavailable")),
      }),
    );
    return SpeechSynthesis.of({ speak });
  }),
);
