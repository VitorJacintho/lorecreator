/** Navegação e janelas abertas (não é salvo no projeto). */
import { useSyncExternalStore } from 'react';
import type { RouteStep } from '../engine/simulate';
import type { EntryKind, Id } from '../model/types';

export type View = 'overview' | 'codex' | 'timeline' | 'map' | 'stories' | 'variables' | 'export';

export interface UiState {
  view: View;
  /** filtro do codex ('all' = tudo) */
  kind: EntryKind | 'all';
  entryId: Id | null;
  storyId: Id | null;
  /** nó para focar ao abrir uma história */
  focusNodeId: Id | null;
  /** route = abre o teste já no fim de um caminho (vindo do simulador) */
  playtest: { storyId: Id; fromNodeId?: Id; route?: RouteStep[] } | null;
  searchOpen: boolean;
  toast: { text: string; id: number } | null;
}

let state: UiState = {
  view: 'overview',
  kind: 'all',
  entryId: null,
  storyId: null,
  focusNodeId: null,
  playtest: null,
  searchOpen: false,
  toast: null,
};
const listeners = new Set<() => void>();

export function setUi(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getUi() {
  return state;
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
  );
}

export function resetUi() {
  setUi({ view: 'overview', kind: 'all', entryId: null, storyId: null, focusNodeId: null, playtest: null, searchOpen: false });
}

export const goEntry = (entryId: Id) => setUi({ view: 'codex', entryId, kind: 'all' });
export const goStory = (storyId: Id, focusNodeId: Id | null = null) => setUi({ view: 'stories', storyId, focusNodeId });

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(text: string) {
  if (toastTimer) clearTimeout(toastTimer);
  const id = Date.now();
  setUi({ toast: { text, id } });
  toastTimer = setTimeout(() => {
    if (state.toast?.id === id) setUi({ toast: null });
  }, 3500);
}
