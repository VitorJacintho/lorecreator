/**
 * Estado do projeto aberto, com desfazer/refazer e salvamento automático.
 *
 * Toda mudança passa por `update(recipe, key)`. Mudanças seguidas com a mesma
 * `key` (ex.: digitar no mesmo campo) viram um único passo de desfazer.
 */
import { produce, type Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import type { Project } from '../model/types';
import { platform } from '../platform';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;
const AUTOSAVE_MS = 700;

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export interface StoreState {
  project: Project | null;
  path: string | null;
  past: Project[];
  future: Project[];
  saveStatus: SaveStatus;
  savedAt: number | null;
  saveError: string | null;
}

let state: StoreState = {
  project: null,
  path: null,
  past: [],
  future: [],
  saveStatus: 'saved',
  savedAt: null,
  saveError: null,
};
let lastKey: string | null = null;
let lastTime = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savingNow: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getState() {
  return state;
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/** O projeto aberto (só use em telas que existem com um projeto aberto). */
export function useProject(): Project {
  const p = useStore((s) => s.project);
  if (!p) throw new Error('Nenhum projeto aberto.');
  return p;
}

/* ---------------- abrir / fechar ---------------- */

export function openProject(project: Project, path: string) {
  cancelSave();
  lastKey = null;
  set({ project, path, past: [], future: [], saveStatus: 'saved', savedAt: Date.now(), saveError: null });
}

export async function closeProject() {
  await flushSave();
  lastKey = null;
  set({ project: null, path: null, past: [], future: [], saveStatus: 'saved', savedAt: null, saveError: null });
}

/* ---------------- mudanças ---------------- */

export function update(recipe: (draft: Draft<Project>) => void, key?: string) {
  const current = state.project;
  if (!current) return;
  const next = produce(current, (d) => {
    recipe(d);
  });
  if (next === current) return;
  const stamped = produce(next, (d) => {
    d.updatedAt = Date.now();
  });
  const now = Date.now();
  const coalesce = !!key && key === lastKey && now - lastTime < COALESCE_MS && state.past.length > 0;
  const past = coalesce ? state.past : [...state.past, current].slice(-HISTORY_LIMIT);
  lastKey = key ?? null;
  lastTime = now;
  set({ project: stamped, past, future: [] });
  scheduleSave();
}

export function undo() {
  const { past, project, future } = state;
  if (!past.length || !project) return;
  lastKey = null;
  set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  scheduleSave();
}

export function redo() {
  const { past, project, future } = state;
  if (!future.length || !project) return;
  lastKey = null;
  set({ project: future[0], past: [...past, project], future: future.slice(1) });
  scheduleSave();
}

/* ---------------- salvamento ---------------- */

function cancelSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

function scheduleSave() {
  cancelSave();
  set({ saveStatus: 'pending' });
  saveTimer = setTimeout(() => void saveNow(), AUTOSAVE_MS);
}

export async function saveNow(): Promise<void> {
  cancelSave();
  if (savingNow) await savingNow;
  const { project, path } = state;
  if (!project || !path) return;
  set({ saveStatus: 'saving' });
  savingNow = platform
    .writeProject(path, JSON.stringify(project))
    .then(() => {
      // se o usuário mexeu enquanto salvava, o próximo salvamento já está agendado
      if (state.project === project) set({ saveStatus: 'saved', savedAt: Date.now(), saveError: null });
    })
    .catch((e: unknown) => {
      set({ saveStatus: 'error', saveError: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => {
      savingNow = null;
    });
  await savingNow;
}

/** Salva o que estiver pendente (ao fechar o projeto). */
export async function flushSave() {
  if (saveTimer || state.saveStatus === 'error') await saveNow();
  else if (savingNow) await savingNow;
}

/** Salvamento síncrono para quando a janela está fechando. */
export function flushSaveSync() {
  if (!saveTimer && state.saveStatus !== 'error') return;
  cancelSave();
  const { project, path } = state;
  if (project && path) platform.writeProjectSync(path, JSON.stringify(project));
}

export function setProjectPath(path: string) {
  set({ path });
}
