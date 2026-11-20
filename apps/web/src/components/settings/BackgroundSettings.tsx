import { useRef, useState } from "react";
import { useGT } from "gt-react";

import {
  prepareAppearanceBackground,
  setAppearanceBackground,
  useAppearanceBackground,
} from "../../appearanceBackground";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

export function BackgroundSettings() {
  const gt = useGT();
  const background = useAppearanceBackground();
  const searchableSetting = useSearchableSetting();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  function save(value: Parameters<typeof setAppearanceBackground>[0]) {
    try {
      setAppearanceBackground(value);
      setError(false);
    } catch {
      setError(true);
    }
  }

  return (
    <SettingsSection id="appearance-background" title={gt("Background image")}>
      <SettingsRow
        {...searchableSetting("background-image")}
        devicePreference
        description={gt("Choose a picture for the blurred interface. Saved only on this device.")}
        control={
          <div className="flex items-center gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
              aria-label={gt("Background image")}
              className="hidden"
              disabled={busy}
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                setBusy(true);
                setError(false);
                const prepared = await prepareAppearanceBackground(file).catch(() => null);
                if (prepared) save({ ...prepared, useColors: background?.useColors ?? false });
                else setError(true);
                setBusy(false);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-busy={busy}
              onClick={() => input.current?.click()}
            >
              {gt("Choose image")}
            </Button>
            {background ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(null)}>
                {gt("Remove")}
              </Button>
            ) : null}
          </div>
        }
      />
      {background ? (
        <div className="px-4 pb-3">
          <img
            src={background.dataUrl}
            alt={gt("Background image")}
            className="h-28 w-full rounded-lg object-cover"
          />
        </div>
      ) : null}
      <SettingsRow
        {...searchableSetting("background-image-colors")}
        devicePreference
        description={gt("Tint the interface using colors from your picture.")}
        control={
          <Switch
            aria-label={gt("Use colors from image")}
            checked={background?.useColors ?? false}
            disabled={!background || busy}
            onCheckedChange={(useColors) => background && save({ ...background, useColors })}
          />
        }
      />
      {error ? (
        <Alert variant="error">
          {gt(
            "Could not save the background. Try a PNG, JPEG, WebP, AVIF, or GIF under 20 MB, or free device storage.",
          )}
        </Alert>
      ) : null}
    </SettingsSection>
  );
}
