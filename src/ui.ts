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
  /** Whether the details panel is shown. */
  detailsOpen: boolean;
  /** A short status message, such as import progress or an error. */
  notice: { text: string; error?: boolean } | null;
  setNotice(notice: Ui['notice']): void;
  openDialog(d: Dialog | null): void;
  setEditingText(id: string | null): void;
  toggleDetails(open?: boolean): void;
}

const DETAILS_KEY = 'cardplayer.details';

function storedDetails(): boolean {
  try {
    return localStorage.getItem(DETAILS_KEY) === '1';
  } catch {
    return false;
  }
}

export const useUi = create<Ui>()((set, get) => ({
  dialog: null,
  editingTextId: null,
  detailsOpen: storedDetails(),
  notice: null,
  setNotice: (notice) => set({ notice }),
  openDialog: (dialog) => set({ dialog }),
  setEditingText: (editingTextId) => set({ editingTextId }),
  toggleDetails(open = !get().detailsOpen) {
    set({ detailsOpen: open });
    try {
      localStorage.setItem(DETAILS_KEY, open ? '1' : '0');
    } catch {
      // Not remembered; harmless.
    }
  },
}));
