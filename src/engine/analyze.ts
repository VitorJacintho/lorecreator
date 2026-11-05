import type { Id, Project, Story, StoryNode } from '../model/types';

export interface Issue {
  nodeId: Id;
  level: 'erro' | 'aviso';
  message: string;
}

/** Nós alcançáveis a partir do início (seguindo todas as escolhas, sem olhar condições). */
export function reachable(story: Story): Set<Id> {
  const seen = new Set<Id>();
  const byId = new Map(story.nodes.map((n) => [n.id, n]));
  const queue = story.startNodeId ? [story.startNodeId] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    for (const c of byId.get(id)!.choices) if (c.targetId) queue.push(c.targetId);
  }
  return seen;
}

export function analyzeStory(story: Story, project: Project): Issue[] {
  const issues: Issue[] = [];
  const reach = reachable(story);
  const varIds = new Set(project.variables.map((v) => v.id));
  const entryIds = new Set(project.entries.map((e) => e.id));
  if (!story.startNodeId) issues.push({ nodeId: '', level: 'erro', message: 'A história não tem nó inicial.' });
  for (const n of story.nodes) {
    const add = (level: Issue['level'], message: string) => issues.push({ nodeId: n.id, level, message });
    if (!reach.has(n.id)) add('aviso', 'Nenhum caminho leva até este nó.');
    if (n.type !== 'final' && n.choices.length === 0) add('aviso', 'Beco sem saída: sem escolhas e não é um final.');
    if (n.type === 'final' && n.choices.length > 0) add('aviso', 'Finais encerram a história: as escolhas deste nó são ignoradas.');
    if (n.type === 'fala' && (!n.speakerId || !entryIds.has(n.speakerId))) add('aviso', 'Fala sem personagem definido.');
    if (!n.text.trim()) add('aviso', 'Nó sem texto.');
    n.choices.forEach((c, i) => {
      const label = c.text.trim() ? `"${c.text.trim().slice(0, 30)}"` : `${i + 1}`;
      if (n.type !== 'final' && !c.targetId) add('erro', `A escolha ${label} não leva a lugar nenhum.`);
      if (c.condition && !varIds.has(c.condition.varId)) add('erro', `A escolha ${label} usa uma variável que foi apagada.`);
    });
    if (n.effects.some((e) => !varIds.has(e.varId))) add('erro', 'Um efeito usa uma variável que foi apagada.');
  }
  return issues;
}

/** Organiza os nós em colunas pela distância até o início. */
export function autoLayout(story: Story): Map<Id, { x: number; y: number }> {
  const byId = new Map(story.nodes.map((n) => [n.id, n]));
  const depth = new Map<Id, number>();
  const order: Id[] = [];
  const queue: Id[] = story.startNodeId ? [story.startNodeId] : [];
  if (story.startNodeId) depth.set(story.startNodeId, 0);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const c of byId.get(id)?.choices ?? []) {
      if (c.targetId && byId.has(c.targetId) && !depth.has(c.targetId)) {
        depth.set(c.targetId, depth.get(id)! + 1);
        queue.push(c.targetId);
      }
    }
  }
  // nós soltos ficam em uma coluna extra no fim
  const maxDepth = Math.max(0, ...depth.values());
  for (const n of story.nodes) {
    if (!depth.has(n.id)) {
      depth.set(n.id, maxDepth + 1);
      order.push(n.id);
    }
  }
  const columns = new Map<number, Id[]>();
  for (const id of order) {
    const d = depth.get(id)!;
    columns.set(d, [...(columns.get(d) ?? []), id]);
  }
  // empilha cada coluna pela altura estimada dos nós, centralizada no zero
  const GAP = 36;
  const out = new Map<Id, { x: number; y: number }>();
  for (const [d, ids] of columns) {
    const heights = ids.map((id) => estimateHeight(byId.get(id)!));
    const total = heights.reduce((a, b) => a + b, 0) + GAP * (ids.length - 1);
    let y = -total / 2;
    ids.forEach((id, i) => {
      out.set(id, { x: d * 340, y: Math.round(y / 10) * 10 });
      y += heights[i] + GAP;
    });
  }
  return out;
}

/** Altura aproximada do cartão do nó no quadro (para o "Organizar" não sobrepor nós). */
export function estimateHeight(n: StoryNode): number {
  const text = Math.min(150, n.text.trim().length);
  let h = 30 + Math.max(1, Math.ceil(text / 36)) * 18 + 10;
  if (n.type === 'fala') h += 28;
  if (n.title.trim()) h += 22;
  if (n.effects.length) h += 18;
  if (n.type !== 'final') h += (n.choices.length + 1) * 32;
  return h;
}

export function nodeLabel(n: StoryNode, max = 40): string {
  const raw = n.title.trim() || n.text.trim().replace(/\s+/g, ' ') || '(vazio)';
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}
