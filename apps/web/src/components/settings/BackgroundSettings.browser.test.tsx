import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import "../../index.css";
import { render } from "../../../test/render";
import {
  getAppearanceBackground,
  prepareAppearanceBackground,
  setAppearanceBackground,
} from "../../appearanceBackground";
import { useTheme } from "../../hooks/useTheme";
import { applyThemePalette } from "../../themePalette";
import { BackgroundSettings } from "./BackgroundSettings";

function Appearance() {
  useTheme();
  return <BackgroundSettings />;
}

it("uploads, persists and removes a picture, and toggles its palette", async () => {
  using _background = {
    [Symbol.dispose]() {
      setAppearanceBackground(null);
      applyThemePalette("light", "light");
    },
  };
  setAppearanceBackground(null);
  const canvas = document.createElement("canvas");
  canvas.width = 2400;
  canvas.height = 1600;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#cc4488";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  const file = new File([blob!], "background.png", { type: "image/png" });

  await using screen = await render(<Appearance />, { router: "/settings/appearance" });
  const colorSwitch = screen.getByRole("switch", { name: "Use colors from image" });
  await expect.element(colorSwitch).toBeDisabled();
  await userEvent.upload(
    screen.container.querySelector<HTMLInputElement>('input[type="file"]')!,
    file,
  );
  await expect.element(screen.getByRole("button", { name: "Remove" })).toBeVisible();
  const background = getAppearanceBackground()!;
  const stored = window.localStorage.getItem("t3code:appearance-background:v1");
  expect(stored).toContain(background.dataUrl);
  window.dispatchEvent(new StorageEvent("storage", { key: "t3code:appearance-background:v1" }));
  expect(getAppearanceBackground()).toEqual(background);
  const image = await createImageBitmap(await (await fetch(background.dataUrl)).blob());
  try {
    expect([image.width, image.height]).toEqual([1920, 1280]);
  } finally {
    image.close();
  }
  const root = document.documentElement;
  expect(root.dataset.appearanceBackground).toBe("true");
  expect(root.style.getPropertyValue("--appearance-background-image")).toContain(
    background.dataUrl,
  );
  await colorSwitch.click();
  expect(getAppearanceBackground()?.useColors).toBe(true);
  for (const mode of ["light", "dark"] as const) {
    applyThemePalette(mode, mode);
    expect(root.dataset.themeId).toBe("image-background");
    expect(root.style.getPropertyValue("--app-theme-accent")).not.toBe("");
  }
  await colorSwitch.click();
  applyThemePalette("light", "light");
  expect(root.dataset.themeId).toBeUndefined();
  expect(root.dataset.appearanceBackground).toBe("true");

  using _quota = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  await colorSwitch.click();
  await expect.element(screen.getByRole("alert")).toBeVisible();
  expect(getAppearanceBackground()).toEqual(background);
  _quota.mockRestore();
  await screen.getByRole("button", { name: "Remove" }).click();
  expect(getAppearanceBackground()).toBeNull();
  expect(root.dataset.appearanceBackground).toBeUndefined();
  await expect.element(colorSwitch).toBeDisabled();
});

it("rejects unsupported, oversized and undecodable images", async () => {
  await expect(
    prepareAppearanceBackground(new File(["bad"], "bad.txt", { type: "text/plain" })),
  ).rejects.toThrow();
  await expect(
    prepareAppearanceBackground(new File(["bad"], "bad.png", { type: "image/png" })),
  ).rejects.toThrow();
  const oversized = new File(["image"], "large.png", { type: "image/png" });
  Object.defineProperty(oversized, "size", { value: 20 * 1024 * 1024 + 1 });
  await expect(prepareAppearanceBackground(oversized)).rejects.toThrow();
});
