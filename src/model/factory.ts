import {
  KIND_INFO, PROJECT_FORMAT, PROJECT_VERSION,
  type Entry, type EntryKind, type Id, type NodeType, type Project, type Story, type StoryNode, type VarType, type VarValue, type Variable,
} from './types';

export function uid(): Id {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function newProject(name: string, genre = '', premise = ''): Project {
  const now = Date.now();
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: uid(),
    name: name.trim() || 'Projeto sem nome',
    genre,
    premise,
    entries: [],
    stories: [],
    variables: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function newEntry(kind: EntryKind, name = ''): Entry {
  const now = Date.now();
  return {
    id: uid(),
    kind,
    name: name || `Novo ${KIND_INFO[kind].label.toLowerCase()}`,
    summary: '',
    body: '',
    tags: [],
    fields: KIND_INFO[kind].fields.map((key) => ({ key, value: '' })),
    relations: [],
    ...(kind === 'evento' ? { when: '', order: 0 } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function newStoryNode(type: NodeType, position: { x: number; y: number }, text = ''): StoryNode {
  return { id: uid(), type, title: '', text, choices: [], effects: [], position };
}

export function newStory(name: string): Story {
  const now = Date.now();
  const start = newStoryNode('cena', { x: 0, y: 0 }, 'A história começa aqui…');
  start.title = 'Início';
  return { id: uid(), name: name || 'Nova história', synopsis: '', startNodeId: start.id, nodes: [start], createdAt: now, updatedAt: now };
}

export function defaultValue(type: VarType): VarValue {
  return type === 'bool' ? false : type === 'number' ? 0 : '';
}

export function newVariable(name: string, type: VarType = 'bool'): Variable {
  return { id: uid(), name, type, initial: defaultValue(type), description: '' };
}

/** Converte um valor digitado para o tipo da variável. */
export function coerce(type: VarType, raw: unknown): VarValue {
  if (type === 'bool') return raw === true || raw === 'true' || raw === 'sim' || raw === 1;
  if (type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return String(raw ?? '');
}
