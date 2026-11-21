import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { VoiceReplyAvatar } from "@t3tools/contracts";

import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopWindow from "../../window/DesktopWindow.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import {
  HIDE_VOICE_RECORDING_CHANNEL,
  PLAY_VOICE_REPLY_CHANNEL,
  SHOW_VOICE_RECORDING_CHANNEL,
  STOP_VOICE_REPLY_CHANNEL,
  UPDATE_VOICE_RECORDING_CHANNEL,
  VOICE_ASSISTANT_SHORTCUT_CHANNEL,
  VOICE_RECORDING_STOP_CHANNEL,
  VOICE_REPLY_SHORTCUT_CHANNEL,
} from "../channels.ts";

const WIDTH = 252;
const HEIGHT = 52;
const RECORDING_WIDTH = 300;
const MARGIN = 16;
// Rarely bound by other apps, so registering them system-wide steals nothing common.
const REPLY_ACCELERATOR = "Control+Alt+Shift+R";
const ASSISTANT_ACCELERATOR = "Control+Alt+Shift+V";
const TRAY_ICON = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAyklEQVR4nKySQQrCMBBFm+pWdOUFXHsBN7bXELr3EqJexr1eoJ5AF15AcCeI6FrRH/iBJMykBf3wmDQzf5g0ybMf1UnkhmAOJuACnlKRSZhPjFZXMGYMlCsNKs/sGlZSYVf2Z72We+oErfX3Bh9QNHiCGu0fHIS9I1hxvdcmsIkl2IEFeBG73oIpWPuG+B0UoGajMsrVzJeZN4H0kFwTqzN4gxG/A7N0BHcMw1FvYECjic3aBL42jDOtQLsFJ3tl91RB0wR9xodW8AUAAP//PTYkWAAAAAZJREFUAwCGnyGODoDGgAAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABcklEQVR4nOyWQU7DMBBFfwsSR0BCArHkFrhXQMCaG7CAfcuGbmADJ2AN4gaoRhVHYMOOPWdomCGTZoqw44kjVUh50ldG1ow9mXFiD7Fmhlgz/zaBY9KctBDNZczMBuxck+5Ie6SBiO1T0hbpxTDXT7AFfsvHBp8T0hMSsbbgvCOfJdYKLBJiChhebBM2Bh35LOn/A30CsQQcusGhRQKONEP5STnkLR6dJ6UFTtlFgn8RiHVomcChst8S/EM+/q/B2E+jUIEjsa1nQdG0VqwCXp4Odfl44mkkZop68YkavwoFxI7jT9KZ2PukB7H5uH0n7ZB2ZYzLfkG6V/EzZb+iRQuqSZzYHnUrmtBx/PaTkGPTJtSlcyh7Oon4u1+LMz7in3RyOayWs4KTOxB7W/lqRl0kUE3MGif6e5QJ+ibH1PuAx+pk49yFK6w3Is0Nyp3P3JIu0QLrjUjzEbBN9PeBnBZ8BWwTOZuQOZLnM1qSm0A23wAAAP//W3Dv8wAAAAZJREFUAwCKhEBHynsVWwAAAABJRU5ErkJggg==",
] as const;

const RECORDING_HTML = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;user-select:none}
#pill{position:absolute;inset:0;display:flex;align-items:center;gap:10px;padding:0 8px 0 16px;border-radius:999px;background:#18181b;-webkit-app-region:drag}
#dot{flex:none;width:8px;height:8px;border-radius:999px;background:#ef4444}
#pill[data-sending] #dot{background:rgba(255,255,255,.4)}
#copy{flex:1;min-width:0;line-height:15px}
#title,#project{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#title{color:#fff;font-size:12px;font-weight:600}
#project{color:rgba(255,255,255,.55);font-size:11px}
canvas{flex:none;width:48px;height:24px}
button{-webkit-app-region:no-drag;flex:none;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:999px;background:rgba(255,255,255,.12);cursor:pointer}
button:hover{background:rgba(255,255,255,.2)}
button span{width:11px;height:11px;border-radius:2px;background:#fff}
</style>
<div id="pill"><span id="dot"></span><div id="copy"><div id="title"></div><div id="project"></div></div><canvas id="bars" aria-hidden="true"></canvas><button id="stop" title="Finish" aria-label="Finish"><span></span></button></div>
<script>
document.getElementById("stop").onclick=()=>window.close();
const canvas=document.getElementById("bars"),g=canvas.getContext("2d"),ratio=devicePixelRatio,levels=new Array(8).fill(0);
canvas.width=canvas.clientWidth*ratio;canvas.height=canvas.clientHeight*ratio;g.fillStyle="#fff";
const bar=(canvas.width-3*ratio*7)/8;
window.describe=(title,project)=>{document.getElementById("title").textContent=title;document.getElementById("project").textContent=project};
window.update=(level,sending)=>{
  document.getElementById("pill").toggleAttribute("data-sending",sending);
  levels.shift();levels.push(sending?0:level);
  g.clearRect(0,0,canvas.width,canvas.height);
  levels.forEach((value,i)=>{const h=Math.max(bar,Math.min(1,value)*canvas.height);g.beginPath();g.roundRect(i*(bar+3*ratio),(canvas.height-h)/2,bar,h,bar/2);g.fill()});
};
window.update(0,false);
</script>`;

// The panel plays the audio itself, so its visualizer reads the real signal without streaming levels over IPC.
const OVERLAY_HTML = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;user-select:none}
#pill{position:absolute;inset:0;display:flex;align-items:center;gap:10px;padding:0 8px;border-radius:999px;background:#18181b;-webkit-app-region:drag}
#face{position:relative;flex:none;width:36px;height:36px;border-radius:999px;background:linear-gradient(145deg,#a78bfa,#6366f1)}
#face img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
#face:has(img){background:transparent}
.eye{position:absolute;top:13px;width:4px;height:6px;border-radius:2px;background:#fff}
#mouth{position:absolute;left:13px;top:23px;width:10px;height:2px;border-radius:5px;background:#fff}
canvas{flex:1;min-width:0;height:28px}
button{-webkit-app-region:no-drag;flex:none;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:999px;background:rgba(255,255,255,.12);cursor:pointer}
button:hover{background:rgba(255,255,255,.2)}
button span{width:11px;height:11px;border-radius:2px;background:#fff}
</style>
<div id="pill"><div id="face" aria-hidden="true"><span class="eye" style="left:11px"></span><span class="eye" style="left:21px"></span><span id="mouth"></span></div><canvas id="bars" aria-hidden="true"></canvas><button id="stop" title="Stop reading" aria-label="Stop reading"><span></span></button></div>
<script>
const stop=()=>window.close();
document.getElementById("stop").onclick=stop;
window.play=async (base64,avatar)=>{
  if(avatar){const image=document.createElement("img");image.src=avatar;image.alt="";document.getElementById("face").replaceChildren(image)}
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const audio=new AudioContext();
  const source=audio.createBufferSource();
  source.buffer=await audio.decodeAudioData(bytes.buffer);
  const analyser=audio.createAnalyser();
  analyser.fftSize=64;
  analyser.smoothingTimeConstant=.75;
  source.connect(analyser);
  analyser.connect(audio.destination);
  source.onended=stop;
  source.start();
  const canvas=document.getElementById("bars"),g=canvas.getContext("2d"),ratio=devicePixelRatio;
  canvas.width=canvas.clientWidth*ratio;canvas.height=canvas.clientHeight*ratio;
  const data=new Uint8Array(analyser.frequencyBinCount),count=24,gap=3*ratio,bar=(canvas.width-gap*(count-1))/count;
  const eyes=document.querySelectorAll(".eye"),mouth=document.getElementById("mouth")?.style;
  g.fillStyle="#fff";
  const draw=time=>{
    analyser.getByteFrequencyData(data);
    const level=(data[1]+data[2]+data[3]+data[4])/1020;
    if(mouth)mouth.height=2+level*9+"px";
    for(const eye of eyes)eye.style.transform=(time%3600)<120?"scaleY(.2)":"";
    g.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<count;i++){
      const h=Math.max(bar,(data[1+Math.round(Math.abs(i-(count-1)/2))]/255)*canvas.height);
      g.beginPath();g.roundRect(i*(bar+gap),(canvas.height-h)/2,bar,h,bar/2);g.fill();
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
};
</script>`;

class VoiceReplyError extends Schema.TaggedError<VoiceReplyError>()("VoiceReplyError", {
  cause: Schema.Defect(),
}) {
  override get message() {
    return "Couldn’t play the reply in the floating panel.";
  }
}

let overlay: Electron.BrowserWindow | undefined;
let recording: Electron.BrowserWindow | undefined;

function closeOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = undefined;
}

function closeRecording() {
  const window = recording;
  recording = undefined;
  if (window && !window.isDestroyed()) window.destroy();
}

function createPanel(width: number, platform: NodeJS.Platform, title: string) {
  const area = Electron.screen.getDisplayNearestPoint(
    Electron.screen.getCursorScreenPoint(),
  ).workArea;
  const window = new Electron.BrowserWindow({
    x: area.x + area.width - width - MARGIN,
    y: area.y + area.height - HEIGHT - MARGIN,
    width,
    height: HEIGHT,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    focusable: false,
    frame: false,
    fullscreenable: false,
    hasShadow: false,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    title,
    transparent: true,
    ...(platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setAlwaysOnTop(true, "floating");
  // Transforming the app to a foreground process can activate its previous macOS Space.
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  return window;
}

const sendToWindows = (channel: string) => {
  for (const window of Electron.BrowserWindow.getAllWindows())
    if (!window.isDestroyed()) window.webContents.send(channel);
};

async function openRecording(
  { title, project }: typeof RecordingDescription.Type,
  platform: NodeJS.Platform,
) {
  closeRecording();
  const window = createPanel(RECORDING_WIDTH, platform, "T3 Code Voice Recording");
  recording = window;
  // Closed by its own Finish button rather than by the renderer, so tell the renderer to stop.
  window.on("closed", () => {
    if (recording !== window) return;
    recording = undefined;
    sendToWindows(VOICE_RECORDING_STOP_CHANNEL);
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(RECORDING_HTML)}`);
  if (window.isDestroyed()) return;
  await window.webContents.executeJavaScript(
    `describe(${JSON.stringify(title)},${JSON.stringify(project)})`,
  );
  if (!window.isDestroyed()) window.showInactive();
}

async function openOverlay(
  audio: Uint8Array,
  platform: NodeJS.Platform,
  avatar: typeof VoiceReplyAvatar.Type = null,
) {
  closeOverlay();
  const window = createPanel(WIDTH, platform, "T3 Code Voice Reply");
  overlay = window;
  window.on("closed", () => {
    if (overlay === window) overlay = undefined;
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_HTML)}`);
  if (window.isDestroyed()) return;
  await window.webContents.executeJavaScript(
    `play(${JSON.stringify(Buffer.from(audio).toString("base64"))},${JSON.stringify(avatar)})`,
  );
  if (!window.isDestroyed()) window.showInactive();
}

const fromMainWindow = Effect.fn("desktop.ipc.voiceReply.fromMainWindow")(function* (
  event: DesktopIpc.DesktopIpcInvokeEvent | undefined,
) {
  const main = yield* (yield* ElectronWindow.ElectronWindow).main;
  return (
    event !== undefined && Option.isSome(main) && main.value.webContents.id === event.sender.id
  );
});

export const playVoiceReply = DesktopIpc.makeIpcMethod({
  channel: PLAY_VOICE_REPLY_CHANNEL,
  payload: Schema.Union([
    Schema.Uint8Array,
    Schema.Struct({ audio: Schema.Uint8Array, avatar: VoiceReplyAvatar }),
  ]),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voiceReply.play")(function* (audio, event) {
    if (!(yield* fromMainWindow(event))) return;
    const platform = yield* HostProcess.Platform;
    yield* Effect.tryPromise({
      try: () =>
        audio instanceof Uint8Array
          ? openOverlay(audio, platform)
          : openOverlay(audio.audio, platform, audio.avatar),
      catch: (cause) => new VoiceReplyError({ cause }),
    }).pipe(Effect.tapError(() => Effect.sync(closeOverlay)));
  }),
});

const RecordingDescription = Schema.Struct({
  title: Schema.String.check(Schema.isMaxLength(500)),
  project: Schema.String.check(Schema.isMaxLength(500)),
});

export const showVoiceRecording = DesktopIpc.makeIpcMethod({
  channel: SHOW_VOICE_RECORDING_CHANNEL,
  payload: RecordingDescription,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voiceReply.showRecording")(function* (description, event) {
    if (!(yield* fromMainWindow(event))) return;
    // A hidden main window would throttle the timers that stream the recording.
    if (event) Electron.webContents.fromId(event.sender.id)?.setBackgroundThrottling(false);
    const platform = yield* HostProcess.Platform;
    yield* Effect.tryPromise({
      try: () => openRecording(description, platform),
      catch: (cause) => new VoiceReplyError({ cause }),
    }).pipe(Effect.tapError(() => Effect.sync(closeRecording)));
  }),
});

export const updateVoiceRecording = DesktopIpc.makeIpcMethod({
  channel: UPDATE_VOICE_RECORDING_CHANNEL,
  payload: Schema.Struct({ level: Schema.Finite, sending: Schema.Boolean }),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voiceReply.updateRecording")(function* (update, event) {
    if (!(yield* fromMainWindow(event)) || !recording || recording.isDestroyed()) return;
    recording.webContents
      .executeJavaScript(`update(${update.level},${update.sending})`)
      .catch(() => undefined);
  }),
});

export const hideVoiceRecording = DesktopIpc.makeIpcMethod({
  channel: HIDE_VOICE_RECORDING_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voiceReply.hideRecording")(function* (_payload, event) {
    if (!(yield* fromMainWindow(event))) return;
    closeRecording();
    if (event) Electron.webContents.fromId(event.sender.id)?.setBackgroundThrottling(true);
  }),
});

let tray: Electron.Tray | undefined;

function createTray(revealApp: () => void) {
  const icon = Electron.nativeImage.createEmpty();
  TRAY_ICON.forEach((dataURL, index) =>
    icon.addRepresentation({ scaleFactor: index + 1, dataURL }),
  );
  icon.setTemplateImage(true);
  tray = new Electron.Tray(icon);
  tray.setToolTip("T3 Code voice");
  tray.setContextMenu(
    Electron.Menu.buildFromTemplate([
      {
        label: "Start Voice Request",
        accelerator: ASSISTANT_ACCELERATOR,
        registerAccelerator: false,
        click: () => sendToWindows(VOICE_ASSISTANT_SHORTCUT_CHANNEL),
      },
      {
        label: "Reply to Spoken Reply",
        accelerator: REPLY_ACCELERATOR,
        registerAccelerator: false,
        click: () => sendToWindows(VOICE_REPLY_SHORTCUT_CHANNEL),
      },
      { type: "separator" },
      { label: "Open T3 Code", click: revealApp },
      { label: "Quit T3 Code", click: () => Electron.app.quit() },
    ]),
  );
}

/**
 * System-wide voice chords and a menu bar item that forward to the app, so a request or a reply
 * can start from any app. The main window hides on close on macOS, so its renderer stays to record.
 */
export const installVoiceShortcuts = Effect.fn("desktop.ipc.installVoiceShortcuts")(function* () {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  const platform = yield* HostProcess.Platform;
  const runFork = Effect.runForkWith(yield* Effect.context<never>());
  yield* Effect.sync(() => {
    Electron.globalShortcut.register(ASSISTANT_ACCELERATOR, () =>
      sendToWindows(VOICE_ASSISTANT_SHORTCUT_CHANNEL),
    );
    Electron.globalShortcut.register(REPLY_ACCELERATOR, () =>
      sendToWindows(VOICE_REPLY_SHORTCUT_CHANNEL),
    );
    if (platform === "darwin") createTray(() => void runFork(desktopWindow.revealOrCreateMain));
  });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      Electron.globalShortcut.unregister(ASSISTANT_ACCELERATOR);
      Electron.globalShortcut.unregister(REPLY_ACCELERATOR);
      tray?.destroy();
      tray = undefined;
      closeRecording();
    }),
  );
});

export const stopVoiceReply = DesktopIpc.makeIpcMethod({
  channel: STOP_VOICE_REPLY_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voiceReply.stop")(function* (_payload, event) {
    if (yield* fromMainWindow(event)) closeOverlay();
  }),
});
