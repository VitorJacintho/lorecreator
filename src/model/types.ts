/**
 * Modelo de dados de um projeto do LoreCreator (arquivo .lore = JSON).
 * Tudo que o usuário cria fica dentro de um único objeto Project.
 */

export type Id = string;

export const PROJECT_FORMAT = 'lorecreator-project';
export const PROJECT_VERSION = 2;

/* ---------------- codex (o mundo) ---------------- */

export type EntryKind = 'personagem' | 'local' | 'faccao' | 'item' | 'evento' | 'conceito';

export interface Field {
  key: string;
  value: string;
}

export interface Relation {
  id: Id;
  targetId: Id;
  /** ex.: "irmã de", "mora em", "líder de" */
  label: string;
}

export interface Entry {
  id: Id;
  kind: EntryKind;
  name: string;
  /** uma linha que resume a entrada */
  summary: string;
  /** texto livre; aceita [[Nome]] para ligar a outras entradas */
  body: string;
  tags: string[];
  fields: Field[];
  relations: Relation[];
  /** imagem reduzida, guardada como data URL dentro do projeto */
  image?: string;
  /** só para eventos: rótulo livre ("Ano 312 da Segunda Era") e posição na linha do tempo */
  when?: string;
  order?: number;
  /** posição no mapa de relações */
  mapPos?: { x: number; y: number };
  createdAt: number;
  updatedAt: number;
}

/* ---------------- variáveis (estado do jogo) ---------------- */

export type VarType = 'bool' | 'number' | 'text';
export type VarValue = boolean | number | string;

export interface Variable {
  id: Id;
  /** nome usado no texto como {nome} */
  name: string;
  type: VarType;
  initial: VarValue;
  description: string;
}

export type CompareOp = '==' | '!=' | '>' | '<' | '>=' | '<=';

export interface Condition {
  id: Id;
  varId: Id;
  op: CompareOp;
  value: VarValue;
}

export type EffectOp = 'set' | 'add' | 'sub' | 'toggle';

/** all = todas precisam valer (E); any = basta uma (OU) */
export type ConditionMode = 'all' | 'any';

export interface Effect {
  id: Id;
  varId: Id;
  op: EffectOp;
  value: VarValue;
}

/* ---------------- histórias ramificadas ---------------- */

/** cena = narração; fala = um personagem falando; final = um dos finais da história */
export type NodeType = 'cena' | 'fala' | 'final';

export interface Choice {
  id: Id;
  /** texto do botão; vazio = "Continuar" */
  text: string;
  targetId?: Id;
  /** vazio = sempre liberada */
  conditions: Condition[];
  conditionMode: ConditionMode;
  /** aplicados ao escolher, antes dos efeitos do nó de destino */
  effects: Effect[];
}

export interface StoryNode {
  id: Id;
  type: NodeType;
  title: string;
  /** personagem do codex que fala (para nós do tipo "fala") */
  speakerId?: Id;
  text: string;
  choices: Choice[];
  /** aplicados ao entrar no nó */
  effects: Effect[];
  position: { x: number; y: number };
}

export interface Story {
  id: Id;
  name: string;
  synopsis: string;
  startNodeId?: Id;
  nodes: StoryNode[];
  createdAt: number;
  updatedAt: number;
}

/* ---------------- projeto ---------------- */

export interface Project {
  format: typeof PROJECT_FORMAT;
  version: number;
  id: Id;
  name: string;
  genre: string;
  /** a premissa / pitch do jogo */
  premise: string;
  entries: Entry[];
  stories: Story[];
  variables: Variable[];
  createdAt: number;
  updatedAt: number;
}

export const KIND_INFO: Record<EntryKind, { label: string; plural: string; icon: string; color: string; fields: string[] }> = {
  personagem: {
    label: 'Personagem', plural: 'Personagens', icon: '👤', color: '#e0a458',
    fields: ['Idade', 'Espécie', 'Ocupação', 'Objetivo', 'Medo', 'Segredo'],
  },
  local: { label: 'Local', plural: 'Locais', icon: '🏰', color: '#5fb49c', fields: ['Região', 'Clima', 'População', 'Governante'] },
  faccao: { label: 'Facção', plural: 'Facções', icon: '⚑', color: '#c8553d', fields: ['Líder', 'Sede', 'Objetivo', 'Aliados', 'Inimigos'] },
  item: { label: 'Item', plural: 'Itens', icon: '🗝', color: '#9b7ede', fields: ['Raridade', 'Poder', 'Origem'] },
  evento: { label: 'Evento', plural: 'Eventos', icon: '⏳', color: '#4ea8de', fields: ['Envolvidos', 'Consequência'] },
  conceito: { label: 'Conceito', plural: 'Conceitos', icon: '✦', color: '#b5b5c8', fields: ['Regras', 'Limites'] },
};

export const ENTRY_KINDS = Object.keys(KIND_INFO) as EntryKind[];

export const NODE_TYPE_INFO: Record<NodeType, { label: string; color: string }> = {
  cena: { label: 'Cena', color: '#4ea8de' },
  fala: { label: 'Fala', color: '#e0a458' },
  final: { label: 'Final', color: '#c8553d' },
};
