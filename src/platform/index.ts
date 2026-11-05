/**
 * Onde os projetos ficam guardados.
 *  - No app desktop: arquivos .lore no disco, via `window.lore` (electron/preload.cjs).
 *  - No navegador (desenvolvimento com `npm run dev`): localStorage e downloads.
 */

export interface ProjectSummary {
  path: string;
  name: string;
  genre: string;
  updatedAt: number;
  entries: number;
  stories: number;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

interface DesktopApi {
  isDesktop: true;
  info(): Promise<{ version: string; projectsDir: string }>;
  takePendingFile(): Promise<string | null>;
  onOpenFile(cb: (path: string) => void): () => void;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string, json: string): Promise<string>;
  readProject(path: string): Promise<string>;
  writeProject(path: string, json: string): Promise<void>;
  writeProjectSync(path: string, json: string): boolean;
  openProjectDialog(): Promise<string | null>;
  saveProjectAs(name: string, json: string): Promise<string | null>;
  trashProject(path: string): Promise<void>;
  revealProject(path: string): Promise<void>;
  openProjectsFolder(): Promise<void>;
  exportFile(defaultName: string, content: string, filters: FileFilter[]): Promise<string | null>;
  revealExport(path: string): Promise<void>;
}

declare global {
  interface Window {
    lore?: DesktopApi;
  }
}

export interface Platform {
  isDesktop: boolean;
  /** onde os projetos novos são criados (para mostrar ao usuário) */
  projectsDir(): Promise<string>;
  takePendingFile(): Promise<string | null>;
  onOpenFile(cb: (path: string) => void): () => void;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string, json: string): Promise<string>;
  readProject(path: string): Promise<string>;
  writeProject(path: string, json: string): Promise<void>;
  writeProjectSync(path: string, json: string): boolean;
  /** escolhe um arquivo .lore; devolve o caminho já pronto para readProject */
  openProjectDialog(): Promise<string | null>;
  saveProjectAs(name: string, json: string): Promise<string | null>;
  trashProject(path: string): Promise<void>;
  revealProject?(path: string): Promise<void>;
  openProjectsFolder?(): Promise<void>;
  /** devolve onde salvou (ou null se cancelado) */
  exportFile(defaultName: string, content: string, filters: FileFilter[]): Promise<string | null>;
  revealExport?(path: string): Promise<void>;
}

/* ---------------- desktop ---------------- */

function desktop(api: DesktopApi): Platform {
  return {
    isDesktop: true,
    projectsDir: async () => (await api.info()).projectsDir,
    takePendingFile: api.takePendingFile,
    onOpenFile: api.onOpenFile,
    listProjects: api.listProjects,
    createProject: api.createProject,
    readProject: api.readProject,
    writeProject: api.writeProject,
    writeProjectSync: api.writeProjectSync,
    openProjectDialog: api.openProjectDialog,
    saveProjectAs: api.saveProjectAs,
    trashProject: api.trashProject,
    revealProject: api.revealProject,
    openProjectsFolder: api.openProjectsFolder,
    exportFile: api.exportFile,
    revealExport: api.revealExport,
  };
}

/* ---------------- navegador ---------------- */

const KEY = 'lorecreator:project:';

function webSummary(path: string): ProjectSummary | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY + path.slice(4)) ?? 'null');
    if (!p) return null;
    return {
      path,
      name: p.name ?? 'Projeto',
      genre: p.genre ?? '',
      updatedAt: p.updatedAt ?? 0,
      entries: p.entries?.length ?? 0,
      stories: p.stories?.length ?? 0,
    };
  } catch {
    return null;
  }
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.click();
  });
}

function web(): Platform {
  const write = (path: string, json: string) => localStorage.setItem(KEY + path.slice(4), json);
  const create = (json: string) => {
    const path = `web:${crypto.randomUUID()}`;
    write(path, json);
    return path;
  };
  return {
    isDesktop: false,
    projectsDir: async () => 'armazenamento do navegador',
    takePendingFile: async () => null,
    onOpenFile: () => () => {},
    listProjects: async () =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith(KEY))
        .map((k) => webSummary(`web:${k.slice(KEY.length)}`))
        .filter((s): s is ProjectSummary => !!s)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    createProject: async (_name, json) => create(json),
    readProject: async (path) => {
      const text = localStorage.getItem(KEY + path.slice(4));
      if (text === null) throw new Error('Projeto não encontrado.');
      return text;
    },
    writeProject: async (path, json) => write(path, json),
    writeProjectSync: (path, json) => {
      write(path, json);
      return true;
    },
    openProjectDialog: async () => {
      const text = await pickFile('.lore,application/json');
      return text === null ? null : create(text);
    },
    saveProjectAs: async (name, json) => {
      download(`${name}.lore`, json);
      return null;
    },
    trashProject: async (path) => localStorage.removeItem(KEY + path.slice(4)),
    exportFile: async (name, content) => {
      download(name, content);
      return name;
    },
  };
}

export const platform: Platform = window.lore?.isDesktop ? desktop(window.lore) : web();
