import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { randomHex } from "~/lib/utils";

import { resolveStorage } from "./lib/storage";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface ChecklistStoreState {
  itemsByThreadKey: Record<string, ChecklistItem[]>;
  addItem: (threadKey: string, text: string) => void;
  toggleItem: (threadKey: string, id: string) => void;
  removeItem: (threadKey: string, id: string) => void;
}

const CHECKLIST_STORAGE_KEY = "t3code:checklist:v1";

function checklistStorage() {
  return resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined);
}

export const useChecklistStore = create<ChecklistStoreState>()(
  persist(
    (set) => ({
      itemsByThreadKey: {},
      addItem: (threadKey, text) =>
        set((state) => {
          const trimmed = text.trim();
          if (trimmed.length === 0) return state;
          const items = state.itemsByThreadKey[threadKey] ?? [];
          return {
            itemsByThreadKey: {
              ...state.itemsByThreadKey,
              [threadKey]: [...items, { id: randomHex(8), text: trimmed, done: false }],
            },
          };
        }),
      toggleItem: (threadKey, id) =>
        set((state) => {
          const items = state.itemsByThreadKey[threadKey] ?? [];
          return {
            itemsByThreadKey: {
              ...state.itemsByThreadKey,
              [threadKey]: items.map((item) =>
                item.id === id ? { ...item, done: !item.done } : item,
              ),
            },
          };
        }),
      removeItem: (threadKey, id) =>
        set((state) => {
          const items = (state.itemsByThreadKey[threadKey] ?? []).filter((item) => item.id !== id);
          if (items.length > 0) {
            return {
              itemsByThreadKey: { ...state.itemsByThreadKey, [threadKey]: items },
            };
          }
          const { [threadKey]: _removed, ...rest } = state.itemsByThreadKey;
          return { itemsByThreadKey: rest };
        }),
    }),
    {
      name: CHECKLIST_STORAGE_KEY,
      storage: createJSONStorage(checklistStorage),
      partialize: (state) => ({ itemsByThreadKey: state.itemsByThreadKey }),
    },
  ),
);
