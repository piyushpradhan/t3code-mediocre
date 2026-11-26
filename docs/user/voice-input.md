# Voice input

Dictate into the composer, citation comments, diff/file annotations, PR comments, and desktop browser annotations. Transcripts land in your draft for review—nothing is sent to an agent until you submit.

## Choose where audio goes

- **Web and desktop**: Nothing is recorded or sent until you choose a destination in **Settings → Voice → Transcribe with**:
  - **On this Mac (Apple Speech)** (macOS 26+ desktop): Transcribes locally on your Mac (silence filtering and filler removal unavailable; dictionary applies only with cleanup enabled).
  - **A connected environment**: Sends audio over your authenticated connection to transcribe locally on that host and discards the audio. Never silently fails over to another host.
  - **Cloud providers (OpenAI, Grok Voice Transcribe, OpenRouter)**: Configure an API key (or [secret reference](./secrets.md)) on an environment to forward recordings to that provider. OpenRouter lets each user pick a model from its live STT catalog and requests zero data retention.
- **Mobile (iOS and Android)**: Transcribes on-device by default (iOS 26+ or Android 12+ with compatible Google speech services; first use may download a speech model, then works offline). To transcribe on a paired environment or cloud provider instead, configure **Settings → Voice → Transcribe on**. Keep T3 Code open while dictating on Android.

## Set up a local transcription model

In **Settings → Voice → Transcription**, filter by language, download a model, and select **Use model** (reuses matching files from Handy or the Hugging Face cache, or link an existing file via **Use existing**—Core ML/ONNX/MLX builds aren't supported).

- **Advanced**: Configure GPU/CPU (**Auto** falls back to CPU once on GPU error), idle unload timeout, and **Streaming transcription** (disable if live preview lags).

## Dictate and shortcuts

- Press the microphone button to dictate into that editor (`Esc` discards; max recording length: **5 minutes**).
- On web and desktop, `mod+shift+d` starts the **voice assistant** from anywhere: finishing the recording sends a new **No project** thread. Begin with "In project [name], …" or "For project [name], …" to pick a project. Turn off **Settings → Voice → Voice assistant shortcut** to have the shortcut dictate into the focused editor (or the composer) instead.
- Press `ctrl+alt+shift+r` within a minute of a reply read aloud to answer it; press again to send to the thread that spoke. On desktop this works from any app. If that thread has an unsent draft, the answer stays in the error notice for copying.
- On macOS, the desktop app adds a menu bar microphone and listens from any app for `ctrl+option+shift+v` (new voice request) and `ctrl+option+shift+r` (reply). Closing the window keeps it running; quit from the menu bar or with `cmd+q`.
- **Settings → Voice → Persistent memory** sets instructions sent with every voice assistant request (by default, read your Notion memory; the agent must already have access). Saved on this device.
- Configure tap vs. hold behavior in **Settings → Voice → Dictation shortcut** (**Auto**, **Hold**, or **Toggle**), or remap the chord in [Keybindings](./keybindings.md).
- Pressing **Send** (or Save/Comment/Submit) while recording finishes transcription and submits automatically.

## Improve recognition and cleanup

- **Language & translation**: Pick a language or **Auto** (plus **Translate to English** where supported).
- **Personal & project dictionaries**: Add custom terms and common misspelling aliases in **Settings → Voice** (device-level) or scoped to a project/environment (up to 100 combined entries; project entries take priority).
- **Silence filtering & filler removal**: Skip silence (on by default) and strip hesitation words.
- **Transcript cleanup** (off by default): Sends the finished transcript and surrounding draft text (never audio) to your [text generation model](./text-generation.md) (or a dedicated **Cleanup model**) to fix punctuation, numbers, and spoken self-corrections (optionally using a custom **Correction cue** like "scratch that"). Press **Skip** during cleanup to insert raw text.

## Hear replies

Turn on **Settings → Voice → Spoken replies → Read replies aloud** to have this device play the reply when the open thread finishes a run. Long replies are summarized by a low-cost provider model (up to 100 words unless you ask for detail; code, tables, and link addresses are skipped). On desktop, replies play in a floating panel with a visualizer; in a browser, a notice shows. Starting dictation or **Stop** ends playback.

- **Voice avatar**: Replace the desktop panel's face with a PNG, JPEG, or WebP under 5 MB (saved on this device).
- **Speech server**: Set per environment. Any OpenAI-compatible speech API works, such as a local [Kokoro](https://github.com/remsky/Kokoro-FastAPI) or Piper server (`http://localhost:8880/v1`) or a hosted one; enter model, voice, and optional API key, then **Test voice**. A hosted server sees what your agents write.

## Microphones and testing

- **Microphone priority**: Rank built-in, wired, Bluetooth, and CarPlay (iOS) devices in **Settings → Voice**—T3 Code uses the first connected device in the list.
- **Test**: Use **Test microphone** (local 10-second loopback, no transcription) to verify input, and **Test model** to preview raw transcription without cleanup.
- Browser recording requires **HTTPS** or `localhost`—for plain-HTTP remote servers, use the desktop app.
