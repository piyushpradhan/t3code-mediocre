"use client";

import { MoveDiagonal2Icon, NotebookPenIcon, XIcon } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "./ui/button";

const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 520;
const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 320;

// Module-level so the memoized preview never sees a new plugin identity.
const NOTE_REMARK_PLUGINS = [remarkGfm, remarkBreaks];

export interface FloatingNoteProps {
  threadKey: string | null;
  /** Server-persisted markdown note for the thread, or null when empty. */
  note: string | null;
  /** Persist a note edit. Call with null to clear the note. */
  onSave: (note: string | null) => void;
}

const NoteMarkdownPreview = memo(function NoteMarkdownPreview({
  markdown,
}: {
  readonly markdown: string;
}) {
  return (
    <div className="floating-note-preview min-h-0 flex-1 overflow-y-auto px-3 py-2">
      {markdown.length === 0 ? (
        <span className="text-[color:var(--color-placeholder)]">Preview appears here…</span>
      ) : (
        <ReactMarkdown remarkPlugins={NOTE_REMARK_PLUGINS} skipHtml>
          {markdown}
        </ReactMarkdown>
      )}
    </div>
  );
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function FloatingNote({ threadKey, note, onSave }: FloatingNoteProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<string | null>(null);
  const latestNoteRef = useRef(note);
  // Set once the user types, so a stale server echo cannot clobber their
  // in-progress edits after the panel is reopened mid-save.
  const editedRef = useRef(false);
  const sizeRef = useRef(size);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);
  // Rendering the preview trails the keystrokes, so typing stays smooth even
  // for long notes.
  const deferredText = useDeferredValue(text);

  useEffect(() => {
    latestNoteRef.current = note;
  }, [note]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // Load the stored note into the editor when the panel opens or the note
  // arrives (thread detail loads asynchronously). While the user is typing,
  // external note changes (save echoes) must not clobber their text.
  useEffect(() => {
    if (!open || editedRef.current) return;
    setText(note ?? "");
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

  const scheduleSave = useCallback(
    (value: string) => {
      editedRef.current = true;
      pendingSaveRef.current = value;
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
    },
    [onSave],
  );

  // Flush the debounced save when the widget unmounts or switches threads.
  useEffect(() => flushPendingSave, [flushPendingSave]);

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const current = sizeRef.current;
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      width: current.width,
      height: current.height,
    };
  }, []);

  const moveResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeRef.current;
    if (start === null) return;
    event.preventDefault();
    setSize({
      width: clamp(start.width + (event.clientX - start.startX), MIN_WIDTH, MAX_WIDTH),
      height: clamp(start.height + (event.clientY - start.startY), MIN_HEIGHT, MAX_HEIGHT),
    });
  }, []);

  const endResize = useCallback(() => {
    resizeRef.current = null;
  }, []);

  if (threadKey === null) return null;

  const hasNote = note != null && note.length > 0;

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-30 flex flex-col items-end gap-2">
      {open ? (
        <div
          className="floating-surface-motion pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-foreground shadow-lg/5"
          style={{ width: size.width, height: size.height }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-semibold">Note</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Markdown</span>
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

          <div className="flex min-h-0 flex-1">
            <textarea
              value={text}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setText(value);
                scheduleSave(value);
              }}
              onBlur={flushPendingSave}
              spellCheck
              aria-label="Thread note"
              className="floating-note-editor min-h-0 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 outline-none"
              placeholder="Write a note in Markdown…"
            />
            <div className="w-px shrink-0 bg-border" aria-hidden="true" />
            <NoteMarkdownPreview markdown={deferredText} />
          </div>

          <div
            aria-hidden="true"
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className="absolute right-0 bottom-0 z-10 flex size-4 cursor-nwse-resize touch-none items-center justify-center text-muted-foreground/50 hover:text-muted-foreground"
          >
            <MoveDiagonal2Icon className="size-3" />
          </div>
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
