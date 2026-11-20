import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { useSyncExternalStore } from "react";

import type { DraftId } from "../composerDraftStore";

type VoiceProject = Pick<EnvironmentProject, "id" | "environmentId" | "title" | "archivedAt">;

export function resolveVoiceAssistantProject(text: string, projects: readonly VoiceProject[]) {
  const cue = /^(?:in|for)\s+(?:the\s+)?project\s+/i.exec(text.trim());
  if (!cue) return { kind: "scratch" } as const;
  const requested = text.trim().slice(cue[0].length).toLowerCase();
  const matches = projects
    .filter((project) => {
      const title = project.title.trim().toLowerCase();
      const suffix = requested.slice(title.length);
      return (
        project.archivedAt == null &&
        title.length > 0 &&
        requested.startsWith(title) &&
        (suffix === "" || /^[\s,.:;!?—-]/.test(suffix))
      );
    })
    .sort((a, b) => b.title.trim().length - a.title.trim().length);
  const project = matches[0];
  if (!project)
    return {
      kind: "error",
      message: "The spoken project was not found. Use ‘In project [name], …’.",
    } as const;
  if (matches[1]?.title.trim().length === project.title.trim().length)
    return {
      kind: "error",
      message: "More than one project has that name. Choose the project manually.",
    } as const;
  return { kind: "project", project } as const;
}

// Drafts the voice assistant opened, which ChatView sends once its composer can.
const autoSendDraftIds = new Set<DraftId>();
const autoSendListeners = new Set<() => void>();
const emitAutoSend = () => autoSendListeners.forEach((listener) => listener());

export function requestVoiceAutoSend(draftId: DraftId) {
  autoSendDraftIds.add(draftId);
  emitAutoSend();
}

export function takeVoiceAutoSend(draftId: DraftId) {
  if (!autoSendDraftIds.delete(draftId)) return false;
  emitAutoSend();
  return true;
}

const subscribeAutoSend = (listener: () => void) => {
  autoSendListeners.add(listener);
  return () => autoSendListeners.delete(listener);
};

export function useVoiceAutoSend(draftId: DraftId | null | undefined) {
  return useSyncExternalStore(subscribeAutoSend, () => !!draftId && autoSendDraftIds.has(draftId));
}
