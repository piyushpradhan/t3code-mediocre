import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import "../../index.css";
import { render } from "../../../test/render";
import { VoiceReplyAvatarSettings } from "./VoiceReplyAvatarSettings";
import { prepareVoiceReplyAvatar, readVoiceReplyAvatar } from "../../speech/voiceReplyAvatar";

it("saves a square transparent avatar and restores the default on removal", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "red";
  context.fillRect(150, 100, 100, 100);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  await using screen = await render(<VoiceReplyAvatarSettings />);
  const input = screen.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await userEvent.upload(input, new File([blob!], "avatar.png", { type: "image/png" }));
  await expect.element(screen.getByRole("img", { name: "Voice avatar" })).toBeVisible();
  const image = await createImageBitmap(await (await fetch(readVoiceReplyAvatar()!)).blob());
  try {
    expect([image.width, image.height]).toEqual([256, 256]);
    const sample = document.createElement("canvas");
    sample.width = 256;
    sample.height = 256;
    const ctx = sample.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    expect(ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0);
  } finally {
    image.close();
  }
  await screen.getByRole("button", { name: "Remove" }).click();
  expect(readVoiceReplyAvatar()).toBeNull();
  await expect(
    prepareVoiceReplyAvatar(new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })),
  ).rejects.toThrow();
  await userEvent.upload(input, new File(["bad"], "bad.png", { type: "image/png" }));
  await expect.element(screen.getByRole("alert")).toBeVisible();
});
