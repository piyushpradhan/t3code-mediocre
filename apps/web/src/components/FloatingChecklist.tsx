"use client";

import { useState } from "react";
import { ListChecksIcon, PlusIcon, XIcon } from "lucide-react";

import { cn } from "~/lib/utils";

import { useChecklistStore } from "../checklistStore";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";

export function FloatingChecklist({ threadKey }: { threadKey: string | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const items = useChecklistStore((state) =>
    threadKey ? (state.itemsByThreadKey[threadKey] ?? []) : [],
  );
  const addItem = useChecklistStore((state) => state.addItem);
  const toggleItem = useChecklistStore((state) => state.toggleItem);
  const removeItem = useChecklistStore((state) => state.removeItem);

  if (threadKey === null) return null;

  const remaining = items.filter((item) => !item.done).length;

  const submit = () => {
    if (draft.trim().length === 0) return;
    addItem(threadKey, draft);
    setDraft("");
  };

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-30 flex flex-col items-end gap-2">
      {open ? (
        <div className="floating-surface-motion pointer-events-auto flex w-72 flex-col overflow-hidden rounded-xl border border-border bg-popover text-foreground shadow-lg/5">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-semibold">Tasks</span>
            <div className="flex items-center gap-1">
              {remaining > 0 ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {remaining}
                </span>
              ) : null}
              <Button
                aria-label="Close checklist"
                size="icon-micro"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          </div>

          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto p-2">
            {items.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">No tasks yet.</li>
            ) : (
              items.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50"
                >
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={() => toggleItem(threadKey, item.id)}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
                      item.done && "text-muted-foreground line-through",
                    )}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete task"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => removeItem(threadKey, item.id)}
                  >
                    <XIcon className="size-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="flex items-center gap-1.5 border-t border-border p-2">
            <input
              autoFocus
              className="h-7 w-full min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-placeholder focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Add a task…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <Button aria-label="Add task" size="icon-micro" variant="default" onClick={submit}>
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        aria-label="Toggle checklist"
        className="pointer-events-auto"
        size="icon-sm"
        variant="glass"
        onClick={() => setOpen((value) => !value)}
      >
        <ListChecksIcon className="size-4" />
        {remaining > 0 ? (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
            {remaining}
          </span>
        ) : null}
      </Button>
    </div>
  );
}
