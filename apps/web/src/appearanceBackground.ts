import * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

import {
  readLocalStorageValue,
  removeLocalStorageItem,
  setLocalStorageItem,
  subscribeLocalStorageKey,
} from "./hooks/useLocalStorage";

const STORAGE_KEY = "t3code:appearance-background:v1";
const MAX_DATA_URL_LENGTH = 1_500_000;
const BackgroundSchema = Schema.NullOr(
  Schema.Struct({
    dataUrl: Schema.String.check(
      Schema.isPattern(/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/),
      Schema.isMaxLength(MAX_DATA_URL_LENGTH),
    ),
    accent: Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/i)),
    useColors: Schema.Boolean,
  }),
);
type AppearanceBackground = typeof BackgroundSchema.Type;
let snapshot: AppearanceBackground = null;
let loaded = false;
const listeners = new Set<() => void>();

export function getAppearanceBackground(): AppearanceBackground {
  if (!loaded && typeof window !== "undefined") {
    snapshot = readLocalStorageValue(STORAGE_KEY, null, BackgroundSchema);
    loaded = true;
  }
  return snapshot;
}

export function setAppearanceBackground(value: AppearanceBackground): void {
  if (value === null) removeLocalStorageItem(STORAGE_KEY);
  else setLocalStorageItem(STORAGE_KEY, value, BackgroundSchema);
  snapshot = value;
  loaded = true;
  for (const listener of listeners) listener();
}

export function subscribeAppearanceBackground(onChange: () => void): () => void {
  listeners.add(onChange);
  const unsubscribe = subscribeLocalStorageKey(STORAGE_KEY, () => {
    loaded = false;
    onChange();
  });
  return () => {
    listeners.delete(onChange);
    unsubscribe();
  };
}

export function useAppearanceBackground() {
  return useSyncExternalStore(subscribeAppearanceBackground, getAppearanceBackground, () => null);
}

export function imageAccent(pixels: Uint8ClampedArray): string {
  const buckets = new Map<string, { weight: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const alpha = (pixels[i + 3] ?? 0) / 255;
    if (alpha < 0.5) continue;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const weight = alpha * (1 + (Math.max(r, g, b) - Math.min(r, g, b)) / 64);
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += weight;
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!dominant) return "#808080";
  return `#${[dominant.r, dominant.g, dominant.b]
    .map((channel) =>
      Math.round(channel / dominant.weight)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export async function prepareAppearanceBackground(file: File) {
  if (!/^image\/(png|jpeg|webp|avif|gif)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error("Unsupported background image.");
  }
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable.");
    canvas.width = 32;
    canvas.height = 32;
    context.drawImage(image, 0, 0, 32, 32);
    const accent = imageAccent(context.getImageData(0, 0, 32, 32).data);
    for (const size of [1920, 1280]) {
      const scale = Math.min(1, size / image.width, size / image.height);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/webp", 0.8);
      if (dataUrl.length <= MAX_DATA_URL_LENGTH) return { dataUrl, accent, useColors: false };
    }
    throw new Error("Background image is too large.");
  } finally {
    image.close();
  }
}
