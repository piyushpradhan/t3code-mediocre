import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import { PLAY_VOICE_REPLY_CHANNEL, STOP_VOICE_REPLY_CHANNEL } from "../channels.ts";

const WIDTH = 252;
const HEIGHT = 52;
const MARGIN = 16;

// The panel plays the audio itself, so its visualizer reads the real signal without streaming levels over IPC.
const OVERLAY_HTML = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;user-select:none}
#pill{position:absolute;inset:0;display:flex;align-items:center;gap:10px;padding:0 8px;border-radius:999px;background:#18181b;-webkit-app-region:drag}
#face{position:relative;flex:none;width:36px;height:36px;border-radius:999px;background:linear-gradient(145deg,#a78bfa,#6366f1)}
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
window.play=async base64=>{
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
  const eyes=document.querySelectorAll(".eye"),mouth=document.getElementById("mouth").style;
  g.fillStyle="#fff";
  const draw=time=>{
    analyser.getByteFrequencyData(data);
    const level=(data[1]+data[2]+data[3]+data[4])/1020;
    mouth.height=2+level*9+"px";
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

function closeOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = undefined;
}

async function openOverlay(audio: Uint8Array, platform: NodeJS.Platform) {
  closeOverlay();
  const area = Electron.screen.getDisplayNearestPoint(
    Electron.screen.getCursorScreenPoint(),
  ).workArea;
  const window = new Electron.BrowserWindow({
    x: area.x + area.width - WIDTH - MARGIN,
    y: area.y + area.height - HEIGHT - MARGIN,
    width: WIDTH,
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
    title: "T3 Code Voice Reply",
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
  overlay = window;
  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.on("closed", () => {
    if (overlay === window) overlay = undefined;
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_HTML)}`);
  if (window.isDestroyed()) return;
  await window.webContents.executeJavaScript(
    `play(${JSON.stringify(Buffer.from(audio).toString("base64"))})`,
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
  payload: Schema.Uint8Array,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voiceReply.play")(function* (audio, event) {
    if (!(yield* fromMainWindow(event))) return;
    const platform = yield* HostProcess.Platform;
    yield* Effect.tryPromise({
      try: () => openOverlay(audio, platform),
      catch: (cause) => new VoiceReplyError({ cause }),
    }).pipe(Effect.tapError(() => Effect.sync(closeOverlay)));
  }),
});

export const stopVoiceReply = DesktopIpc.makeIpcMethod({
  channel: STOP_VOICE_REPLY_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voiceReply.stop")(function* (_payload, event) {
    if (yield* fromMainWindow(event)) closeOverlay();
  }),
});
