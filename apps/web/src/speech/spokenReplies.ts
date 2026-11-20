import { synthesizeEnvironmentSpeech } from "@t3tools/client-runtime/voice-input";
import {
  type EnvironmentId,
  type ThreadId,
  type EnvironmentSpeechSynthesisRequest,
  SpeechSynthesisError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { msg } from "gt-react";

import { toastManager } from "../components/ui/toast";
import { m } from "../i18n/messages";
import { readPreparedConnection } from "../state/session";
import { unlockedAudioContext } from "../threadNotifications";
import { runEnvironmentSpeech } from "./runEnvironmentSpeech";

const isSynthesisError = Schema.is(SpeechSynthesisError);
let playing: AudioBufferSourceNode | undefined;
let lastReply: { environmentId: EnvironmentId; threadId: ThreadId; at: number } | undefined;
const REPLY_WINDOW_MS = 60_000;

/** The thread whose reply was read aloud within the last minute, which the reply shortcut answers. */
export function recentSpokenReply() {
  return lastReply && Date.now() - lastReply.at <= REPLY_WINDOW_MS ? lastReply : undefined;
}
// Bumped by every stop, so audio that arrives for a superseded request is dropped.
let generation = 0;

export function stopSpeaking() {
  generation += 1;
  playing?.stop();
  playing = undefined;
  void window.desktopBridge?.stopVoiceReply?.().catch(() => undefined);
}

/**
 * Reads text, or a run's reply, aloud through the environment's speech server, replacing whatever
 * is playing. Rejects when the audio cannot be produced or played.
 */
export async function speak(
  environmentId: EnvironmentId,
  request: typeof EnvironmentSpeechSynthesisRequest.Type,
): Promise<void> {
  stopSpeaking();
  const mine = generation;
  const floating = window.desktopBridge?.playVoiceReply;
  const context = floating ? null : unlockedAudioContext();
  const prepared = readPreparedConnection(environmentId);
  if (!floating && !context)
    throw new Error("This browser hasn’t allowed audio yet. Click the page first.");
  if (!prepared) throw new Error("The environment isn’t connected.");
  const audio = await runEnvironmentSpeech(synthesizeEnvironmentSpeech(prepared, request));
  if (mine !== generation) return;
  if ("threadId" in request)
    lastReply = { environmentId, threadId: request.threadId, at: Date.now() };
  if (floating) return floating(audio);
  if (!context) return;
  const buffer = await context.decodeAudioData(audio.slice().buffer);
  if (mine !== generation) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const toastId = toastManager.add({
    type: "info",
    title: m(msg("Reading reply aloud")),
    timeout: 0,
    actionProps: {
      children: m(msg("Stop", { $context: "verb, stops audio playback" })),
      onClick: stopSpeaking,
    },
    data: { hideCopyButton: true },
  });
  source.addEventListener("ended", () => {
    toastManager.close(toastId);
    if (playing === source) playing = undefined;
  });
  playing = source;
  source.start();
}

/** A reply with nothing to say stays silent; every other failure is shown. */
export function reportSpeechFailure(error: unknown) {
  if (isSynthesisError(error) && error.reason === "nothing-to-say") return;
  toastManager.add({
    type: "error",
    title: m(msg("Couldn’t read the reply aloud")),
    description:
      error instanceof Error ? error.message : m(msg("The speech server didn’t respond.")),
  });
}
