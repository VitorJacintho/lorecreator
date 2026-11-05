/**
 * Ponte segura entre a interface e o processo principal (contextIsolation + sandbox).
 * Expõe só o necessário em `window.lore`. Tipos em src/platform/desktop.ts.
 */
const { contextBridge, ipcRenderer } = require('electron');

/** Desembrulha { ok, value | error } vindo do processo principal. */
async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r || !r.ok) throw new Error(r?.error || 'Falha desconhecida.');
  return r.value;
}

contextBridge.exposeInMainWorld('lore', {
  isDesktop: true,
  info: () => call('app:info'),
  takePendingFile: () => call('app:take-pending-file'),
  onOpenFile: (cb) => {
    const handler = (_e, path) => cb(path);
    ipcRenderer.on('app:open-file', handler);
    return () => ipcRenderer.removeListener('app:open-file', handler);
  },

  listProjects: () => call('projects:list'),
  createProject: (name, json) => call('projects:create', name, json),
  readProject: (path) => call('projects:read', path),
  writeProject: (path, json) => call('projects:write', path, json),
  writeProjectSync: (path, json) => ipcRenderer.sendSync('projects:write-sync', path, json),
  openProjectDialog: () => call('projects:open-dialog'),
  saveProjectAs: (name, json) => call('projects:save-as', name, json),
  trashProject: (path) => call('projects:trash', path),
  revealProject: (path) => call('projects:reveal', path),
  openProjectsFolder: () => call('projects:open-folder'),

  exportFile: (defaultName, content, filters) => call('export:save', defaultName, content, filters),
  revealExport: (path) => call('export:reveal', path),
});
