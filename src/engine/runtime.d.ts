import type { Choice, CompareOp, Condition, Effect, Id, Story, StoryNode, VarValue, Variable } from '../model/types';

export type Vars = Record<Id, VarValue>;
type VarDef = Pick<Variable, 'id' | 'name' | 'type' | 'initial'>;

export function compareValues(a: VarValue, op: CompareOp, b: VarValue): boolean;
export function checkCondition(cond: Condition | undefined, vars: Vars): boolean;
export function initialVars(variables: VarDef[]): Vars;
export function applyEffects(effects: Effect[], vars: Vars, variables: VarDef[]): Vars;
export function formatValue(value: VarValue): string;
export function interpolate(text: string, vars: Vars, variables: VarDef[]): string;
export function renderText(text: string, vars: Vars, variables: VarDef[]): string;
export function choicesFor(node: StoryNode, vars: Vars): { choice: Choice; ok: boolean; locked: boolean }[];
export function enterNode(
  story: Pick<Story, 'nodes'>,
  nodeId: Id,
  vars: Vars,
  variables: VarDef[],
): { node: StoryNode | null; vars: Vars };
