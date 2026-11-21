import {
  type EnvironmentSpeechSynthesisRequest,
  DEFAULT_TEXT_GENERATION_MODEL_BY_PROVIDER,
  isProviderAvailable,
  isProviderTextGenerationCapable,
  isSecretReference,
  type ServerSettingsError,
  SpeechSynthesisError,
} from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import { fallbackTextGenerationModelSelection } from "@t3tools/shared/serverSettings";
import { speakableText } from "@t3tools/shared/speech";
import { exhaustedUsageWindow } from "@t3tools/shared/usageLimits";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
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
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import { spokenReplyPrompt, spokenReplyText } from "./spokenReply.ts";

type Reason = SpeechSynthesisError["reason"];
const fail = (reason: Reason) => new SpeechSynthesisError({ reason });
const RUN_BRIEF_MAX_CHARS = 240;

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
    const providers = yield* ProviderRegistry.ProviderRegistry;

    const replyGist = Effect.fn("SpeechSynthesis.replyGist")(function* (
      reply: string,
      request: string,
    ) {
      const prose = speakableText(reply, Number.MAX_SAFE_INTEGER);
      if (prose.length <= RUN_BRIEF_MAX_CHARS) return spokenReplyText(prose);
      const opening = speakableText(reply, RUN_BRIEF_MAX_CHARS);
      const current = yield* settings.getSettings;
      const snapshots = yield* providers.getProviders;
      const now = DateTime.toEpochMillis(yield* DateTime.now);
      const modelSelection = fallbackTextGenerationModelSelection(
        current.providerInstances,
        (instanceId, driver, model) =>
          snapshots.some(
            (provider) =>
              provider.instanceId === instanceId &&
              provider.enabled &&
              provider.installed &&
              provider.status !== "error" &&
              provider.auth.status !== "unauthenticated" &&
              isProviderAvailable(provider) &&
              isProviderTextGenerationCapable(provider) &&
              !exhaustedUsageWindow(provider, now, model) &&
              DEFAULT_TEXT_GENERATION_MODEL_BY_PROVIDER[driver] === model &&
              provider.models.some(
                (candidate) =>
                  candidate.slug === model && candidate.supportsTextGeneration !== false,
              ),
          ),
      );
      if (!modelSelection) return spokenReplyText(opening);
      // Providers run in a working directory; a summary must not read a checkout.
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-spoken-reply-" });
      const generated = yield* textGeneration.generateTranscriptionPostProcessing({
        cwd,
        prompt: spokenReplyPrompt(reply, request),
        modelSelection,
      });
      return spokenReplyText(generated.transcription) || spokenReplyText(opening);
    }, Effect.scoped);

    const speak = Effect.fn("SpeechSynthesis.speak")(
      function* (request: typeof EnvironmentSpeechSynthesisRequest.Type) {
        const { speechSynthesis, cloudSpeechCredentials } = yield* settings.getSettings;
        const baseUrl = speechSynthesis.baseUrl.trim().replace(/\/+$/, "");
        if (!baseUrl) return yield* fail("not-configured");
        if (!/^https?:\/\//i.test(baseUrl) || !URL.canParse(baseUrl))
          return yield* fail("unavailable");
        let input: string;
        if ("text" in request) input = spokenReplyText(request.text);
        else {
          const { messages } = yield* threads.getThreadRecords(request.threadId, ["messages"], {
            messageRoles: ["assistant", "user"],
            messageRunIds: [request.runId],
          });
          const reply =
            messages.findLast(
              (message) =>
                message.role === "assistant" && !message.workflowScript && message.text.trim(),
            )?.text ?? "";
          input = yield* replyGist(
            reply,
            messages.findLast((message) => message.role === "user")?.text ?? "",
          ).pipe(
            Effect.orElseSucceed(() => spokenReplyText(speakableText(reply, RUN_BRIEF_MAX_CHARS))),
          );
        }
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
