import { useRef, useState } from "react";
import { useGT } from "gt-react";
import {
  prepareVoiceReplyAvatar,
  readVoiceReplyAvatar,
  useVoiceReplyAvatar,
} from "../../speech/voiceReplyAvatar";
import { Button } from "../ui/button";
import { Alert } from "../ui/alert";
import { SettingsRow } from "./settingsLayout";

export function VoiceReplyAvatarSettings() {
  const gt = useGT();
  const [avatar, setAvatar] = useVoiceReplyAvatar();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const save = (image: string | null) => {
    setAvatar(image);
    setError(readVoiceReplyAvatar() !== image);
  };
  async function choose(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    const image = await prepareVoiceReplyAvatar(file).catch(() => null);
    if (image) save(image);
    else setError(true);
    setBusy(false);
  }
  return (
    <SettingsRow
      devicePreference
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void choose(event.dataTransfer.files[0]);
      }}
      title={gt("Voice avatar")}
      description={gt(
        "Drop a PNG, JPEG, or WebP under 5 MB. A transparent square PNG works best. Saved on this device for the desktop voice panel.",
      )}
      control={
        <div className="flex items-center gap-2">
          {avatar ? (
            <img
              src={avatar}
              alt={gt("Voice avatar")}
              className="size-9 rounded-full object-cover"
            />
          ) : null}
          <input
            ref={input}
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={gt("Choose avatar")}
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void choose(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-busy={busy}
            onClick={() => input.current?.click()}
          >
            {gt("Choose avatar")}
          </Button>
          {avatar ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(null)}>
              {gt("Remove")}
            </Button>
          ) : null}
        </div>
      }
    >
      {error ? (
        <Alert variant="error">
          {gt("Could not save the avatar. Choose a valid image or free device storage.")}
        </Alert>
      ) : null}
    </SettingsRow>
  );
}
