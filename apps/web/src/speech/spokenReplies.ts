import { synthesizeEnvironmentSpeech } from "@t3tools/client-runtime/voice-input";
import {
  type EnvironmentId,
  type EnvironmentSpeechSynthesisRequest,
  SpeechSynthesisError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { toastManager } from "../components/ui/toast";
import { readPreparedConnection } from "../state/session";
import { unlockedAudioContext } from "../threadNotifications";
import { runEnvironmentSpeech } from "./runEnvironmentSpeech";

const isSynthesisError = Schema.is(SpeechSynthesisError);
let playing: AudioBufferSourceNode | undefined;
// Bumped by every stop, so audio that arrives for a superseded request is dropped.
let generation = 0;

export function stopSpeaking() {
  generation += 1;
  playing?.stop();
  playing = undefined;
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
  const context = unlockedAudioContext();
  const prepared = readPreparedConnection(environmentId);
  if (!context) throw new Error("This browser hasn’t allowed audio yet. Click the page first.");
  if (!prepared) throw new Error("The environment isn’t connected.");
  const audio = await runEnvironmentSpeech(synthesizeEnvironmentSpeech(prepared, request));
  const buffer = await context.decodeAudioData(audio.slice().buffer);
  if (mine !== generation) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const toastId = toastManager.add({
    type: "info",
    title: "Reading reply aloud",
    timeout: 0,
    actionProps: { children: "Stop", onClick: stopSpeaking },
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
    title: "Couldn’t read the reply aloud",
    description: error instanceof Error ? error.message : "The speech server didn’t respond.",
  });
}
