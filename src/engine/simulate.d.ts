import type { Id, Story, Variable } from '../model/types';
import type { Vars } from './runtime';

type VarDef = Pick<Variable, 'id' | 'name' | 'type' | 'initial'>;

/** Um passo de um caminho: o nó, as variáveis depois de entrar nele e a escolha que levou até ali. */
export interface RouteStep {
  nodeId: Id;
  vars: Vars;
  via?: string;
}

export interface SimEnding {
  nodeId: Id;
  /** existe alguma sequência de escolhas ligando o início a este final (sem olhar condições) */
  linked: boolean;
  /** caminho mais curto; null = nenhum caminho chegou aqui */
  route: RouteStep[] | null;
}

export type StuckReason = 'sem-escolhas' | 'bloqueadas' | 'sem-destino';

export interface SimResult {
  /** false = a história tem combinações demais e o limite foi atingido antes de testar todas */
  complete: boolean;
  /** quantas combinações de nó + variáveis foram testadas */
  states: number;
  endings: SimEnding[];
  /** nós onde o jogador pode ficar sem nenhuma escolha disponível */
  stuck: { nodeId: Id; reason: StuckReason; route: RouteStep[] }[];
  /** nós em laços sem saída: o jogador só anda em círculos e nunca termina (só preenchido se complete) */
  loops: { nodeId: Id; route: RouteStep[] }[];
  /** escolhas em nós visitados cujas condições nunca ficaram verdadeiras */
  lockedChoices: { nodeId: Id; choiceId: Id }[];
  /** nós (não finais) ligados ao início, mas que nenhum caminho alcançou */
  blockedNodes: Id[];
  /** menor e maior valor de cada variável numérica considerada */
  ranges: { varId: Id; min: number; max: number }[];
  /** variáveis que ficaram fora da conta porque nenhuma condição as lê */
  skippedVars: Id[];
}

export const MAX_STATES: number;
export function reachable(story: Pick<Story, 'nodes' | 'startNodeId'>): Set<Id>;
export function simulateStory(story: Pick<Story, 'nodes' | 'startNodeId'>, variables: VarDef[], maxStates?: number): SimResult;
