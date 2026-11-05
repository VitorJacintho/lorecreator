/** Ações de projeto usadas por várias telas (abrir, criar, fechar, salvar cópia). */
import { newProject } from './model/factory';
import { parseProject } from './model/normalize';
import { sampleProject } from './model/sample';
import type { Project } from './model/types';
import { platform } from './platform';
import { alertDialog } from './components/dialogs';
import { closeProject, getState, openProject, setProjectPath } from './store/store';
import { resetUi, toast } from './store/ui';

export async function openProjectFromPath(path: string) {
  try {
    const project = parseProject(await platform.readProject(path));
    await closeProject();
    resetUi();
    openProject(project, path);
  } catch (e) {
    await alertDialog('Não foi possível abrir o projeto', e instanceof Error ? e.message : String(e));
  }
}

export async function createProject(opts: { name: string; genre: string; premise: string; template: 'blank' | 'sample' }) {
  const project: Project = opts.template === 'sample' ? sampleProject() : newProject(opts.name, opts.genre, opts.premise);
  if (opts.template === 'sample' && opts.name.trim()) project.name = opts.name.trim();
  try {
    const path = await platform.createProject(project.name, JSON.stringify(project));
    await closeProject();
    resetUi();
    openProject(project, path);
  } catch (e) {
    await alertDialog('Não foi possível criar o projeto', e instanceof Error ? e.message : String(e));
  }
}

export async function pickAndOpenProject() {
  try {
    const path = await platform.openProjectDialog();
    if (path) await openProjectFromPath(path);
  } catch (e) {
    await alertDialog('Não foi possível abrir o projeto', e instanceof Error ? e.message : String(e));
  }
}

/** Salva uma cópia em outro lugar e passa a editar a cópia. */
export async function saveProjectAs() {
  const { project } = getState();
  if (!project) return;
  try {
    const path = await platform.saveProjectAs(project.name, JSON.stringify(project));
    if (path) {
      setProjectPath(path);
      toast('Cópia salva. Agora você está editando a cópia.');
    } else if (!platform.isDesktop) {
      toast('Arquivo .lore baixado.');
    }
  } catch (e) {
    await alertDialog('Não foi possível salvar a cópia', e instanceof Error ? e.message : String(e));
  }
}

export async function leaveProject() {
  await closeProject();
  resetUi();
}
