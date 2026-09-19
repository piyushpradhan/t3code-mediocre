"use client";

import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  NotebookPenIcon,
  StrikethroughIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "./ui/button";

export interface FloatingNoteProps {
  threadKey: string | null;
  /** Server-persisted rich text HTML for the thread, or null when empty. */
  note: string | null;
  /** Persist a note edit. Call with null to clear the note. */
  onSave: (note: string | null) => void;
}

/** Strip dangerous markup from stored note HTML before it is edited again. */
function sanitizeNoteHtml(html: string): string {
  if (html.length === 0) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const forbid = template.content.querySelectorAll(
    "script, iframe, object, embed, link, meta, form, [onerror], [onload], [onclick]",
  );
  for (const node of Array.from(forbid)) {
    node.remove();
  }
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
}

export function FloatingNote({ threadKey, note, onSave }: FloatingNoteProps) {
  const [open, setOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<string | null>(null);
  const latestNoteRef = useRef(note);
  // Set once the user types, so a stale server echo cannot clobber their
  // in-progress edits after the panel is reopened mid-save.
  const editedRef = useRef(false);

  useEffect(() => {
    latestNoteRef.current = note;
  }, [note]);

  // Load the stored note into the editor when the panel opens or the note
  // arrives (thread detail loads asynchronously). While the user is typing,
  // external note changes (save echoes) must not clobber the caret.
  useEffect(() => {
    if (!open || editedRef.current) return;
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const stored = note ?? "";
    if (editor.innerHTML !== stored) {
      editor.innerHTML = sanitizeNoteHtml(stored);
    }
  }, [note, open]);

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending !== null && pending !== (latestNoteRef.current ?? "")) {
      onSave(pending.length === 0 ? null : pending);
    }
  }, [onSave]);

  const scheduleSave = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editedRef.current = true;
    pendingSaveRef.current = editor.innerHTML;
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending !== null && pending !== (latestNoteRef.current ?? "")) {
        onSave(pending.length === 0 ? null : pending);
      }
    }, 600);
  }, [onSave]);

  // Flush the debounced save when the widget unmounts or switches threads.
  useEffect(() => flushPendingSave, [flushPendingSave]);

  const runCommand = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus({ preventScroll: true });
      document.execCommand(command, false, value);
      scheduleSave();
    },
    [scheduleSave],
  );

  const formatBlock = useCallback(
    (tag: string) => {
      editorRef.current?.focus({ preventScroll: true });
      document.execCommand("formatBlock", false, tag);
      scheduleSave();
    },
    [scheduleSave],
  );

  if (threadKey === null) return null;

  const hasNote = note != null && note.length > 0;

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-30 flex flex-col items-end gap-2">
      {open ? (
        <div className="floating-surface-motion pointer-events-auto flex w-72 flex-col overflow-hidden rounded-xl border border-border bg-popover text-foreground shadow-lg/5">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-semibold">Note</span>
            <div className="flex items-center gap-1">
              <Button
                aria-label="Close note"
                size="icon-micro"
                variant="ghost"
                onClick={() => {
                  flushPendingSave();
                  setOpen(false);
                }}
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5">
            <Button
              aria-label="Bold"
              size="icon-micro"
              variant="ghost"
              onClick={() => runCommand("bold")}
            >
              <BoldIcon className="size-3" />
            </Button>
            <Button
              aria-label="Italic"
              size="icon-micro"
              variant="ghost"
              onClick={() => runCommand("italic")}
            >
              <ItalicIcon className="size-3" />
            </Button>
            <Button
              aria-label="Strikethrough"
              size="icon-micro"
              variant="ghost"
              onClick={() => runCommand("strikeThrough")}
            >
              <StrikethroughIcon className="size-3" />
            </Button>
            <Button
              aria-label="Inline code"
              size="icon-micro"
              variant="ghost"
              onClick={() => runCommand("insertHTML", "<code>&nbsp;</code>")}
            >
              <CodeIcon className="size-3" />
            </Button>
            <div className="mx-0.5 h-3.5 w-px bg-border" aria-hidden="true" />
            <Button
              aria-label="Bullet list"
              size="icon-micro"
              variant="ghost"
              onClick={() => runCommand("insertUnorderedList")}
            >
              <ListIcon className="size-3" />
            </Button>
            <Button
              aria-label="Numbered list"
              size="icon-micro"
              variant="ghost"
              onClick={() => runCommand("insertOrderedList")}
            >
              <ListOrderedIcon className="size-3" />
            </Button>
            <Button
              aria-label="Heading"
              size="icon-micro"
              variant="ghost"
              onClick={() => formatBlock("<h3>")}
            >
              <span className="text-[10px] font-bold">H</span>
            </Button>
          </div>

          <div
            ref={editorRef}
            contentEditable
            spellCheck
            role="textbox"
            aria-multiline="true"
            aria-label="Thread note"
            className="floating-note-editor max-h-64 min-h-24 overflow-y-auto px-3 py-2 text-xs leading-relaxed outline-none"
            data-placeholder="Write a note…"
            onInput={scheduleSave}
            onBlur={flushPendingSave}
          />
        </div>
      ) : null}

      <Button
        aria-label="Toggle note"
        className="pointer-events-auto"
        size="icon-sm"
        variant="glass"
        onClick={() => {
          flushPendingSave();
          setOpen((value) => !value);
        }}
      >
        <NotebookPenIcon className="size-4" />
        {hasNote ? (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
            ✓
          </span>
        ) : null}
      </Button>
    </div>
  );
}
