/**
 * Lê um projeto vindo do disco e garante que todos os campos existem e têm o tipo certo.
 * Assim arquivos antigos, editados à mão ou parcialmente corrompidos ainda abrem.
 */
import { coerce, newProject, uid } from './factory';
import {
  ENTRY_KINDS, PROJECT_FORMAT, PROJECT_VERSION,
  type Choice, type CompareOp, type Condition, type Effect, type EffectOp, type Entry, type NodeType, type Project, type Story,
  type StoryNode, type VarType, type Variable,
} from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const id = (v: unknown) => (typeof v === 'string' && v ? v : uid());
const pos = (v: unknown) => (isObj(v) ? { x: num(v.x), y: num(v.y) } : { x: 0, y: 0 });

const OPS: CompareOp[] = ['==', '!=', '>', '<', '>=', '<='];
const EFFECT_OPS: EffectOp[] = ['set', 'add', 'sub', 'toggle'];
const VAR_TYPES: VarType[] = ['bool', 'number', 'text'];
const NODE_TYPES: NodeType[] = ['cena', 'fala', 'final'];

export class ProjectFormatError extends Error {}

function variable(v: Obj): Variable {
  const type = VAR_TYPES.includes(v.type as VarType) ? (v.type as VarType) : 'bool';
  return { id: id(v.id), name: str(v.name, 'variavel'), type, initial: coerce(type, v.initial), description: str(v.description) };
}

function condition(v: unknown, vars: Map<string, Variable>): Condition | undefined {
  if (!isObj(v) || typeof v.varId !== 'string') return undefined;
  const variable = vars.get(v.varId);
  return {
    id: id(v.id),
    varId: v.varId,
    op: OPS.includes(v.op as CompareOp) ? (v.op as CompareOp) : '==',
    value: variable ? coerce(variable.type, v.value) : (v.value as Condition['value']) ?? '',
  };
}

function effect(v: Obj, vars: Map<string, Variable>): Effect {
  const variable = typeof v.varId === 'string' ? vars.get(v.varId) : undefined;
  return {
    id: id(v.id),
    varId: str(v.varId),
    op: EFFECT_OPS.includes(v.op as EffectOp) ? (v.op as EffectOp) : 'set',
    value: variable ? coerce(variable.type, v.value) : (v.value as Effect['value']) ?? '',
  };
}

function choice(v: Obj, vars: Map<string, Variable>): Choice {
  // a versão 1 do formato guardava uma condição só, no campo "condition"
  const rawConditions = Array.isArray(v.conditions) ? v.conditions : [v.condition];
  const c: Choice = {
    id: id(v.id),
    text: str(v.text),
    conditions: rawConditions.map((x) => condition(x, vars)).filter((x): x is Condition => !!x),
    conditionMode: v.conditionMode === 'any' ? 'any' : 'all',
    effects: arr(v.effects).filter(isObj).map((e) => effect(e, vars)),
  };
  if (typeof v.targetId === 'string' && v.targetId) c.targetId = v.targetId;
  return c;
}

function storyNode(v: Obj, vars: Map<string, Variable>): StoryNode {
  const n: StoryNode = {
    id: id(v.id),
    type: NODE_TYPES.includes(v.type as NodeType) ? (v.type as NodeType) : 'cena',
    title: str(v.title),
    text: str(v.text),
    choices: arr(v.choices).filter(isObj).map((c) => choice(c, vars)),
    effects: arr(v.effects).filter(isObj).map((e) => effect(e, vars)),
    position: pos(v.position),
  };
  if (typeof v.speakerId === 'string' && v.speakerId) n.speakerId = v.speakerId;
  return n;
}

function story(v: Obj, vars: Map<string, Variable>): Story {
  const nodes = arr(v.nodes).filter(isObj).map((n) => storyNode(n, vars));
  const ids = new Set(nodes.map((n) => n.id));
  // escolhas que apontam para nós que não existem mais perdem o destino
  for (const n of nodes) for (const c of n.choices) if (c.targetId && !ids.has(c.targetId)) delete c.targetId;
  const start = typeof v.startNodeId === 'string' && ids.has(v.startNodeId) ? v.startNodeId : nodes[0]?.id;
  return {
    id: id(v.id),
    name: str(v.name, 'História'),
    synopsis: str(v.synopsis),
    startNodeId: start,
    nodes,
    createdAt: num(v.createdAt, Date.now()),
    updatedAt: num(v.updatedAt, Date.now()),
  };
}

function entry(v: Obj): Entry {
  const kind = ENTRY_KINDS.includes(v.kind as Entry['kind']) ? (v.kind as Entry['kind']) : 'conceito';
  const e: Entry = {
    id: id(v.id),
    kind,
    name: str(v.name, 'Sem nome'),
    summary: str(v.summary),
    body: str(v.body),
    tags: arr(v.tags).filter((t): t is string => typeof t === 'string'),
    fields: arr(v.fields).filter(isObj).map((f) => ({ key: str(f.key), value: str(f.value) })),
    relations: arr(v.relations)
      .filter(isObj)
      .filter((r) => typeof r.targetId === 'string')
      .map((r) => ({ id: id(r.id), targetId: r.targetId as string, label: str(r.label) })),
    createdAt: num(v.createdAt, Date.now()),
    updatedAt: num(v.updatedAt, Date.now()),
  };
  if (typeof v.image === 'string' && v.image.startsWith('data:image/')) e.image = v.image;
  if (kind === 'evento') {
    e.when = str(v.when);
    e.order = num(v.order);
  }
  if (isObj(v.mapPos)) e.mapPos = pos(v.mapPos);
  return e;
}

export function normalizeProject(raw: unknown): Project {
  if (!isObj(raw)) throw new ProjectFormatError('O arquivo não contém um projeto válido.');
  if (raw.format !== PROJECT_FORMAT) throw new ProjectFormatError('Este arquivo não é um projeto do LoreCreator.');
  if (num(raw.version, 1) > PROJECT_VERSION) {
    throw new ProjectFormatError('Este projeto foi salvo por uma versão mais nova do LoreCreator. Atualize o app para abri-lo.');
  }
  const base = newProject(str(raw.name, 'Projeto sem nome'));
  const variables = arr(raw.variables).filter(isObj).map(variable);
  const vars = new Map(variables.map((v) => [v.id, v]));
  const entries = arr(raw.entries).filter(isObj).map(entry);
  const entryIds = new Set(entries.map((e) => e.id));
  for (const e of entries) e.relations = e.relations.filter((r) => entryIds.has(r.targetId));
  return {
    ...base,
    id: id(raw.id),
    genre: str(raw.genre),
    premise: str(raw.premise),
    entries,
    stories: arr(raw.stories).filter(isObj).map((s) => story(s, vars)),
    variables,
    createdAt: num(raw.createdAt, base.createdAt),
    updatedAt: num(raw.updatedAt, base.updatedAt),
  };
}

export function parseProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectFormatError('O arquivo está corrompido (JSON inválido).');
  }
  return normalizeProject(raw);
}
