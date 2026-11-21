import { it } from "@effect/vitest";
import { expect, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import { playVoiceReply, stopVoiceReply } from "./voiceReply.ts";

const electron = vi.hoisted(() => ({
  create: vi.fn(),
  allSpaces: vi.fn(),
  showInactive: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("electron", () => ({
  screen: {
    getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } }),
  },
  BrowserWindow: vi.fn(function (options) {
    electron.create(options);
    return {
      isDestroyed: () => false,
      destroy: () => {},
      on: () => {},
      setAlwaysOnTop: () => {},
      setVisibleOnAllWorkspaces: electron.allSpaces,
      showInactive: electron.showInactive,
      loadURL: async () => {},
      webContents: { executeJavaScript: electron.execute },
    };
  }),
}));

it.effect.each(["darwin", "win32", "linux"] as const)(
  "shows voice replies without activating %s or switching workspaces",
  (platform) =>
    Effect.gen(function* () {
      electron.create.mockClear();
      electron.allSpaces.mockClear();
      electron.showInactive.mockClear();
      electron.execute.mockReset().mockResolvedValue(undefined);
      const event = { sender: { id: 1 } };
      yield* playVoiceReply.handler(new Uint8Array([1, 2, 3]), event);
      expect(electron.create).toHaveBeenCalledWith(
        expect.objectContaining({
          focusable: false,
          show: false,
          alwaysOnTop: true,
          skipTaskbar: true,
        }),
      );
      expect(electron.allSpaces).toHaveBeenCalledWith(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
      expect(electron.showInactive).toHaveBeenCalledTimes(1);
      yield* stopVoiceReply.handler(undefined, event);
      const avatar = "data:image/png;base64,aGVsbG8=";
      yield* playVoiceReply.handler({ audio: new Uint8Array([1]), avatar }, event);
      expect(electron.execute).toHaveBeenLastCalledWith(expect.stringContaining(avatar));
      yield* stopVoiceReply.handler(undefined, event);
    }).pipe(
      Effect.provideService(HostProcess.Platform, platform),
      Effect.provide(
        Layer.mock(ElectronWindow.ElectronWindow)({
          main: Effect.succeedSome({ webContents: { id: 1 } }) as never,
        }),
      ),
    ),
);
