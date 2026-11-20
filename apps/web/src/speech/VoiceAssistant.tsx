import { useAtomValue } from "@effect/atom-react";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentId, KeybindingCommand } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { msg, useGT } from "gt-react";
import { useEffect, useRef, useState } from "react";

import { ComposerSpeechRecordingPill } from "~/components/chat/ComposerSpeechButton";
import { VoiceInputSetup } from "~/components/chat/VoiceInputSetup";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { composerDraftHasUserContent, useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useScratchProject } from "~/hooks/useScratchProject";
import { getClientSettings, useClientSettings } from "~/hooks/useSettings";
import { m } from "~/i18n/messages";
import { useStableCallback } from "~/hooks/useStableCallback";
import { readProjects, readThreadShell } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { buildThreadRouteParams } from "~/threadRoutes";
import { recentSpokenReply } from "./spokenReplies";
import { useDictationShortcut } from "./useDictationShortcut";
import { useEnvironmentSpeechInput } from "./useEnvironmentSpeechInput";
import { requestVoiceAutoSend, resolveVoiceAssistantProject } from "./voiceAssistant.logic";

type SpokenReply = NonNullable<ReturnType<typeof recentSpokenReply>>;

export function VoiceAssistant() {
  const enabled = useClientSettings((settings) => settings.voiceAssistantEnabled);
  const { scratchEnvironmentId } = useScratchProject();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = scratchEnvironmentId(null) ?? primaryEnvironmentId;
  return enabled && environmentId ? (
    <VoiceAssistantSession key={environmentId} environmentId={environmentId} />
  ) : null;
}

function VoiceAssistantSession({ environmentId }: { environmentId: EnvironmentId }) {
  const router = useRouter();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { openScratchProject, scratchWorkspaceRootFor } = useScratchProject();
  const handleNewThread = useNewThreadHandler();
  const gt = useGT();
  const [opening, setOpening] = useState(false);
  const [replyTo, setReplyTo] = useState<SpokenReply>();
  // Started from the menu bar or a system-wide chord, so it records in the floating panel.
  const [startedOutside, setStartedOutside] = useState(false);
  const openTranscript = useStableCallback(function openTranscript(
    text: string,
    target: SpokenReply | undefined = replyTo,
  ) {
    if (!text.trim() || opening) return;
    setOpening(true);
    const href = router.state.location.href;
    const reply = async (thread: SpokenReply) => {
      const threadRef = scopeThreadRef(thread.environmentId, thread.threadId);
      const drafts = useComposerDraftStore.getState();
      if (composerDraftHasUserContent(drafts.getComposerDraft(threadRef)))
        throw new Error("That thread has an unsent draft. Send or clear it first.");
      drafts.setPrompt(threadRef, text);
      requestVoiceAutoSend(scopedThreadKey(threadRef));
      await router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    };
    const open = async () => {
      const destination = resolveVoiceAssistantProject(text, readProjects());
      if (destination.kind === "error") throw new Error(destination.message);
      const project =
        destination.kind === "project"
          ? destination.project
          : await openScratchProject(environmentId);
      if (!project) throw new Error("This environment could not open a No project thread.");
      if (router.state.location.href !== href)
        throw new Error("The page changed before the voice draft could open.");
      const memory = getClientSettings().voiceAssistantMemoryInstructions.trim();
      const prompt = memory ? `${memory}\n\n${text}` : text;
      const opened = await handleNewThread(scopeProjectRef(project.environmentId, project.id), {
        prompt,
      });
      if (
        !opened ||
        useComposerDraftStore.getState().getComposerDraft(opened.draftId)?.prompt !== prompt
      )
        throw new Error("The voice draft could not open without replacing another draft.");
      requestVoiceAutoSend(opened.draftId);
    };
    void (target === undefined ? open() : reply(target))
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: m(msg("Could not send voice request")),
            description: `${error instanceof Error ? error.message : String(error)}\n\n${text}`,
            timeout: 0,
            actionProps: { children: m(msg("Retry")), onClick: () => openTranscript(text, target) },
          }),
        );
      })
      .finally(() => setOpening(false));
  });
  const speech = useEnvironmentSpeechInput({
    environmentId,
    ownerKey: `voice-assistant:${environmentId}`,
    disabled: opening,
    // Project routing must see the spoken words, without a cleanup model rewriting the cue.
    cleanup: false,
    readDraft: () => ({ text: "", selection: { start: 0, end: 0 } }),
    commitDraft: (text) => void openTranscript(text),
  });
  const beforeStart = (command: KeybindingCommand) => {
    if (command !== "voice.reply") {
      setReplyTo(undefined);
      return true;
    }
    const recent = recentSpokenReply();
    if (!recent)
      toastManager.add({
        type: "info",
        title: m(msg("No spoken reply in the last minute to answer.")),
      });
    setReplyTo(recent);
    return recent !== undefined;
  };
  const describeReply = (reply: SpokenReply) => {
    const shell = readThreadShell(scopeThreadRef(reply.environmentId, reply.threadId));
    const project = readProjects().find(
      (entry) => entry.environmentId === reply.environmentId && entry.id === shell?.projectId,
    );
    return {
      title: gt("Replying to {thread}", { thread: shell?.title ?? gt("this thread") }),
      project:
        !project || isScratchProject(project, scratchWorkspaceRootFor(reply.environmentId))
          ? gt("No project")
          : project.title,
    };
  };
  const recordingActive =
    opening || (speech.state.phase !== "idle" && speech.state.phase !== "error");
  const sending = opening || speech.state.phase === "transcribing";
  const floating =
    window.desktopBridge?.showVoiceRecording !== undefined &&
    (replyTo !== undefined || startedOutside);
  const pressOutside = useStableCallback((command: KeybindingCommand) => {
    if (speech.state.phase === "recording") return void speech.stop();
    if (recordingActive || !speech.available || !beforeStart(command)) return;
    setStartedOutside(true);
    void speech.start();
  });
  const finishFromPanel = useStableCallback(() => {
    if (speech.state.phase === "recording") void speech.stop();
    else if (speech.state.phase === "preparing") speech.cancel();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the desktop's system-wide voice chords, menu bar items, and the floating panel's Finish button
  useEffect(() => {
    const bridge = window.desktopBridge;
    const unsubscribe = [
      bridge?.onVoiceAssistantShortcut?.(() => pressOutside("composer.dictation")),
      bridge?.onVoiceReplyShortcut?.(() => pressOutside("voice.reply")),
      bridge?.onVoiceRecordingStop?.(finishFromPanel),
    ];
    return () => unsubscribe.forEach((off) => off?.());
  }, [finishFromPanel, pressOutside]);
  const panelOpen = floating && recordingActive;
  const describePanel = useStableCallback(() =>
    replyTo
      ? describeReply(replyTo)
      : { title: gt("New voice request"), project: gt("No project") },
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- shows the desktop's floating recording panel while a recording runs outside the app
  useEffect(() => {
    if (!panelOpen) return;
    void window.desktopBridge?.showVoiceRecording?.(describePanel());
    return () => void window.desktopBridge?.hideVoiceRecording?.();
  }, [describePanel, panelOpen]);
  const levelSentAt = useRef(0);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- streams the microphone level to the floating panel, at most ~15 times a second
  useEffect(() => {
    if (!panelOpen) return;
    const now = performance.now();
    if (!sending && now - levelSentAt.current < 66) return;
    levelSentAt.current = now;
    void window.desktopBridge?.updateVoiceRecording?.({ level: speech.level, sending });
  }, [panelOpen, sending, speech.level]);
  const shortcutLabel = useDictationShortcut({
    keybindings,
    speech,
    assistant: true,
    commands: ["composer.dictation", "voice.reply"],
    beforeStart: (command) => {
      setStartedOutside(false);
      return beforeStart(command);
    },
    disabled: opening,
    terminalOpen: false,
    modelPickerOpen: false,
  });
  return (
    <>
      {(speech.state.phase !== "idle" || opening) && !floating ? (
        <div
          className="fixed right-4 bottom-4 z-50 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2 rounded-xl border bg-background p-3 shadow-lg"
          role="region"
          aria-label={gt("Voice assistant")}
        >
          {replyTo ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{describeReply(replyTo).title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {describeReply(replyTo).project}
              </p>
            </div>
          ) : (
            <span className="text-sm font-medium">
              {opening ? gt("Sending…") : gt("Voice assistant · No project")}
            </span>
          )}
          {speech.preview ? (
            <p className="text-sm" role="status">
              {speech.preview.committed}
              {speech.preview.tentative}
            </p>
          ) : null}
          <ComposerSpeechRecordingPill
            state={speech.state}
            progress={null}
            level={speech.level}
            finishShortcutLabel={shortcutLabel}
            onStart={() => void speech.start()}
            onStop={() => void speech.stop()}
            onCancel={speech.cancel}
            onSkipPostProcessing={speech.skipPostProcessing}
          />
        </div>
      ) : null}
      <VoiceInputSetup
        environmentId={speech.transcriptionEnvironmentId}
        open={speech.setup.open}
        step={speech.setup.step}
        status={speech.status}
        model={speech.setup.model}
        language={speech.setup.language}
        downloading={speech.setup.downloading}
        error={speech.setup.error}
        onOpenChange={speech.setup.setOpen}
        onRetryCatalog={speech.setup.retryCatalog}
        onDownload={() => void speech.setup.download()}
        onCancelDownload={() => void speech.setup.cancelDownload()}
        onStartRecording={() => void speech.setup.startRecording()}
      />
    </>
  );
}
