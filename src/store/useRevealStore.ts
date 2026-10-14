import { create } from "zustand";

/**
 * Which record's reveal is playing, if any.
 *
 * The reveal lives at the root, above the navigation stack, rather than inside
 * the record screen. Saving closes the form's modal and opens the record in the
 * same moment, and iOS will not present a second modal while the first is
 * still leaving: the reveal as a Modal inside the record silently never showed.
 * An overlay at the root needs no presentation, so it is simply there when the
 * form slides away.
 */
interface RevealState {
  id: string | null;
  show: (id: string) => void;
  hide: () => void;
}

export const useRevealStore = create<RevealState>()((set) => ({
  id: null,
  show: (id) => set({ id }),
  hide: () => set({ id: null }),
}));
