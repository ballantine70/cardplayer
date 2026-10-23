import { create } from 'zustand';

export type Dialog =
  | { type: 'build'; itemIds: string[] }
  | { type: 'deal'; deckId: string }
  | { type: 'help' }
  | { type: 'online' }
  | { type: 'room-settings' }
  | { type: 'name' }
  | { type: 'library' }
  | { type: 'save-deck'; deckId: string };

interface Ui {
  dialog: Dialog | null;
  editingTextId: string | null;
  openDialog(d: Dialog | null): void;
  setEditingText(id: string | null): void;
}

export const useUi = create<Ui>()((set) => ({
  dialog: null,
  editingTextId: null,
  openDialog: (dialog) => set({ dialog }),
  setEditingText: (editingTextId) => set({ editingTextId }),
}));
