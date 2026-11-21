import { VoiceReplyAvatar } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { readLocalStorageValue, useLocalStorage } from "../hooks/useLocalStorage";
import { createComposerImageThumbnail } from "../lib/imageCompression";

const KEY = "t3code:voice-reply-avatar:v1";
const isAvatar = Schema.is(VoiceReplyAvatar);

export const readVoiceReplyAvatar = () => readLocalStorageValue(KEY, null, VoiceReplyAvatar);
export const useVoiceReplyAvatar = () => useLocalStorage(KEY, null, VoiceReplyAvatar);

export async function prepareVoiceReplyAvatar(file: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Unsupported voice avatar.");
  }
  const image = await createComposerImageThumbnail(file);
  if (!image || !isAvatar(image)) throw new Error("Unreadable voice avatar.");
  return image;
}
