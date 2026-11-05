/**
 * Processo principal do LoreCreator (Electron).
 *
 *  - Projetos são arquivos .lore (JSON) — por padrão em Documentos\LoreCreator Projetos.
 *  - O app guarda só a lista de projetos recentes (userData/settings.json).
 *  - Salvamento atômico (arquivo temporário + rename) e um .bak da versão que
 *    existia quando o projeto foi aberto pela primeira vez na sessão.
 *  - Abrir um .lore pelo Explorer (associação de arquivo) abre o projeto no app.
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');
const PRELOAD = join(HERE, 'preload.cjs');
const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;
const HOST = 'lorecreator';
const MAX_RECENT = 20;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// testes automatizados: tudo (configurações e projetos) fica numa pasta separada
const TEST_DIR = process.env.LORECREATOR_TEST_DIR || null;
if (TEST_DIR) {
  app.setPath('userData', join(TEST_DIR, 'userData'));
  // nos testes a janela pode ficar atrás de outras: continua desenhando mesmo assim
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

/** @type {BrowserWindow | null} */ let mainWin = null;
/** arquivo .lore recebido antes da janela estar pronta */
let pendingFile = findLoreArg(process.argv);
/** caminhos cujo .bak já foi feito nesta sessão */
const backedUp = new Set();

/* ---------------- configurações ---------------- */

let settings = { recent: [] };
const settingsFile = () => join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    const saved = JSON.parse(readFileSync(settingsFile(), 'utf8'));
    settings.recent = Array.isArray(saved.recent) ? saved.recent.filter((p) => typeof p === 'string') : [];
  } catch {
    // primeira execução: usa os padrões
  }
}

function saveSettings() {
  try {
    mkdirSync(dirname(settingsFile()), { recursive: true });
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Falha ao salvar configurações:', e);
  }
}

function addRecent(path) {
  settings.recent = [path, ...settings.recent.filter((p) => p.toLowerCase() !== path.toLowerCase())].slice(0, MAX_RECENT);
  saveSettings();
}

function forgetRecent(path) {
  settings.recent = settings.recent.filter((p) => p.toLowerCase() !== String(path).toLowerCase());
  saveSettings();
}

/* ---------------- arquivos de projeto ---------------- */

const projectsDir = () => (TEST_DIR ? join(TEST_DIR, 'Projetos') : join(app.getPath('documents'), 'LoreCreator Projetos'));

function findLoreArg(argv) {
  return argv.slice(1).find((a) => typeof a === 'string' && a.toLowerCase().endsWith('.lore') && existsSync(a)) ?? null;
}

/** Só aceita caminhos absolutos para arquivos .lore. */
function lorePath(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || extname(path).toLowerCase() !== '.lore') {
    throw new Error('Caminho de projeto inválido.');
  }
  return normalize(path);
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function writeProject(path, json) {
  const file = lorePath(path);
  if (typeof json !== 'string') throw new Error('Conteúdo inválido.');
  // guarda a versão anterior uma vez por sessão, para dar para voltar atrás
  if (!backedUp.has(file) && existsSync(file)) {
    try {
      copyFileSync(file, `${file}.bak`);
    } catch (e) {
      console.error('Falha ao criar backup:', e);
    }
    backedUp.add(file);
  }
  writeAtomic(file, json);
}

function summarize(path) {
  try {
    const st = statSync(path);
    const p = JSON.parse(readFileSync(path, 'utf8'));
    if (p?.format !== 'lorecreator-project') return null;
    return {
      path,
      name: typeof p.name === 'string' ? p.name : basename(path, '.lore'),
      genre: typeof p.genre === 'string' ? p.genre : '',
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : st.mtimeMs,
      entries: Array.isArray(p.entries) ? p.entries.length : 0,
      stories: Array.isArray(p.stories) ? p.stories.length : 0,
    };
  } catch {
    return null;
  }
}

function listProjects() {
  const seen = new Set();
  const out = [];
  const add = (path) => {
    const key = path.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const s = summarize(path);
    if (s) out.push(s);
  };
  const dir = projectsDir();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) if (f.toLowerCase().endsWith('.lore')) add(join(dir, f));
  }
  for (const p of settings.recent) if (existsSync(p)) add(p);
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

function safeFileName(name) {
  const clean = String(name || 'Projeto').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean.replace(/[. ]+$/, '') || 'Projeto';
}

function createProject(name, json) {
  const dir = projectsDir();
  mkdirSync(dir, { recursive: true });
  const base = safeFileName(name);
  let file = join(dir, `${base}.lore`);
  for (let i = 2; existsSync(file); i++) file = join(dir, `${base} (${i}).lore`);
  writeAtomic(file, json);
  addRecent(file);
  return file;
}

/* ---------------- protocolo app:// ---------------- */

function pageUrl() {
  return DEV_URL ?? `app://${HOST}/index.html`;
}

const isAppUrl = (url) => url.startsWith(`app://${HOST}/`) || (!!DEV_URL && url.startsWith(DEV_URL));

function registerAppProtocol() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = normalize(join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST + sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
}

function iconPath() {
  const built = join(DIST, 'icon.png');
  return existsSync(built) ? built : join(HERE, '..', 'public', 'icon.png');
}

/* ---------------- janela ---------------- */

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'LoreCreator',
    icon: iconPath(),
    backgroundColor: '#14121c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWin.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  mainWin.once('ready-to-show', () => {
    mainWin.maximize();
    mainWin.show();
  });
  mainWin.on('closed', () => {
    mainWin = null;
  });
  mainWin.loadURL(pageUrl());
}

function buildMenu() {
  // sem Desfazer/Refazer aqui: o app cuida do Ctrl+Z para desfazer mudanças no projeto
  const template = [
    {
      label: 'Editar',
      submenu: [{ role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }],
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { role: 'resetZoom', label: 'Zoom padrão' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- IPC ---------------- */

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

function registerIpc() {
  handle('app:info', () => ({ version: app.getVersion(), projectsDir: projectsDir() }));
  handle('app:take-pending-file', () => {
    const f = pendingFile;
    pendingFile = null;
    if (f) addRecent(f);
    return f;
  });

  handle('projects:list', () => listProjects());
  handle('projects:create', (name, json) => createProject(name, json));
  handle('projects:read', (path) => {
    const file = lorePath(path);
    const text = readFileSync(file, 'utf8');
    addRecent(file);
    return text;
  });
  handle('projects:write', (path, json) => writeProject(path, json));
  ipcMain.on('projects:write-sync', (e, path, json) => {
    try {
      writeProject(path, json);
      e.returnValue = true;
    } catch (err) {
      console.error('Falha ao salvar ao fechar:', err);
      e.returnValue = false;
    }
  });
  handle('projects:open-dialog', async () => {
    const r = await dialog.showOpenDialog(mainWin, {
      title: 'Abrir projeto',
      defaultPath: projectsDir(),
      filters: [{ name: 'Projeto LoreCreator', extensions: ['lore'] }],
      properties: ['openFile'],
    });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });
  handle('projects:save-as', async (name, json) => {
    const r = await dialog.showSaveDialog(mainWin, {
      title: 'Salvar uma cópia do projeto',
      defaultPath: join(projectsDir(), `${safeFileName(name)}.lore`),
      filters: [{ name: 'Projeto LoreCreator', extensions: ['lore'] }],
    });
    if (r.canceled || !r.filePath) return null;
    const file = lorePath(r.filePath);
    writeAtomic(file, json);
    addRecent(file);
    return file;
  });
  handle('projects:trash', async (path) => {
    const file = lorePath(path);
    if (existsSync(file)) await shell.trashItem(file);
    forgetRecent(file);
  });
  handle('projects:reveal', (path) => shell.showItemInFolder(lorePath(path)));
  handle('projects:open-folder', () => {
    mkdirSync(projectsDir(), { recursive: true });
    return shell.openPath(projectsDir());
  });

  handle('export:save', async (defaultName, content, filters) => {
    const r = await dialog.showSaveDialog(mainWin, {
      title: 'Exportar',
      defaultPath: join(app.getPath('documents'), safeFileName(defaultName)),
      filters: Array.isArray(filters) ? filters : [],
    });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, String(content));
    return r.filePath;
  });
  handle('export:reveal', (path) => {
    if (typeof path === 'string' && isAbsolute(path) && existsSync(path)) shell.showItemInFolder(path);
  });
}

/* ---------------- ciclo de vida ---------------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const file = findLoreArg(argv);
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
      if (file) {
        addRecent(file);
        mainWin.webContents.send('app:open-file', file);
      }
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => {
    loadSettings();
    registerAppProtocol();
    registerIpc();
    buildMenu();
    createMainWindow();
  });
}
