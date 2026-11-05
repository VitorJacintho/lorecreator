/**
 * Simulador de caminhos: percorre a história como um jogador faria, testando cada
 * combinação de nó + valores das variáveis, e descobre o que dá para alcançar de verdade.
 *
 * A busca é em largura, então o primeiro caminho achado até um nó é o mais curto.
 * JavaScript puro como o runtime.js (roda nos testes sem compilar). Tipos em simulate.d.ts.
 */
import { choicesFor, enterNode, followChoice, initialVars } from './runtime.js';

export const MAX_STATES = 30000;

/** Nós ligados ao início (seguindo todas as escolhas, sem olhar condições). */
export function reachable(story) {
  const seen = new Set();
  const byId = new Map(story.nodes.map((n) => [n.id, n]));
  const queue = story.startNodeId ? [story.startNodeId] : [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    for (const c of byId.get(id).choices) if (c.targetId) queue.push(c.targetId);
  }
  return seen;
}

/** Monta o grafo de estados. Dois estados são iguais se têm o mesmo nó e os mesmos valores nas variáveis de keyVarIds. */
function explore(story, variables, keyVarIds, maxStates) {
  const byId = new Map(story.nodes.map((n) => [n.id, n]));
  const states = [];
  const preds = [];
  const index = new Map();
  const finals = [];
  const stuck = [];
  const opened = new Set();
  let truncated = false;

  const add = (nodeId, vars, prev, via) => {
    const key = `${nodeId}|${JSON.stringify(keyVarIds.map((id) => vars[id]))}`;
    const known = index.get(key);
    if (known !== undefined) {
      preds[known].push(prev);
      return;
    }
    if (states.length >= maxStates) {
      truncated = true;
      return;
    }
    index.set(key, states.length);
    states.push({ nodeId, vars, prev, via });
    preds.push(prev >= 0 ? [prev] : []);
  };

  if (byId.has(story.startNodeId)) {
    add(story.startNodeId, enterNode(story, story.startNodeId, initialVars(variables), variables).vars, -1);
  }
  for (let i = 0; i < states.length; i++) {
    const { nodeId, vars } = states[i];
    const node = byId.get(nodeId);
    if (node.type === 'final') {
      finals.push(i);
      continue;
    }
    let exits = 0;
    for (const { choice, ok, locked } of choicesFor(node, vars)) {
      if (!locked) opened.add(choice.id);
      if (!ok || !byId.has(choice.targetId)) continue;
      exits++;
      add(choice.targetId, followChoice(story, choice, vars, variables).vars, i, choice.text.trim() || 'Continuar');
    }
    if (exits === 0) stuck.push(i);
  }
  return { states, preds, finals, stuck, opened, truncated };
}

/**
 * Laços sem saída: estados de onde não se chega nem a um final nem a um travamento.
 * Para cada ponto onde o jogador entra nessa região, anda em frente até repetir um
 * estado e devolve esse estado, que com certeza faz parte de um laço.
 */
function findLoops({ states, preds, finals, stuck }) {
  const canEnd = new Array(states.length).fill(false);
  const queue = [...finals, ...stuck];
  for (const i of queue) canEnd[i] = true;
  while (queue.length) {
    for (const p of preds[queue.pop()]) {
      if (!canEnd[p]) {
        canEnd[p] = true;
        queue.push(p);
      }
    }
  }
  const next = states.map(() => []);
  preds.forEach((list, i) => {
    for (const p of list) next[p].push(i);
  });
  return states.flatMap((s, i) => {
    if (canEnd[i] || (s.prev >= 0 && !canEnd[s.prev])) return [];
    // quem não chega ao fim sempre tem uma saída, e todas as saídas também não chegam
    const seen = new Set();
    let k = i;
    while (!seen.has(k)) {
      seen.add(k);
      k = next[k][0];
    }
    return [k];
  });
}

function report(story, variables, run, keyVarIds) {
  const { states, stuck, opened, truncated } = run;
  const byId = new Map(story.nodes.map((n) => [n.id, n]));
  const routeTo = (i) => {
    const route = [];
    for (let k = i; k >= 0; k = states[k].prev) {
      const { nodeId, vars, via } = states[k];
      route.unshift(via ? { nodeId, vars, via } : { nodeId, vars });
    }
    return route;
  };
  const firstAt = new Map();
  states.forEach((s, i) => {
    if (!firstAt.has(s.nodeId)) firstAt.set(s.nodeId, i);
  });
  const firstPerNode = (list) => {
    const seen = new Set();
    return list.filter((i) => !seen.has(states[i].nodeId) && seen.add(states[i].nodeId));
  };
  const linked = reachable(story);

  const endings = story.nodes.filter((n) => n.type === 'final').map((n) => ({
    nodeId: n.id,
    linked: linked.has(n.id),
    route: firstAt.has(n.id) ? routeTo(firstAt.get(n.id)) : null,
  }));

  const stuckOut = firstPerNode(stuck).map((i) => {
    const { nodeId, vars } = states[i];
    const node = byId.get(nodeId);
    const reason = node.choices.length === 0 ? 'sem-escolhas' : choicesFor(node, vars).some((o) => o.locked) ? 'bloqueadas' : 'sem-destino';
    return { nodeId, reason, route: routeTo(i) };
  });

  // só dá para afirmar que não há saída se todos os estados foram explorados
  const loops = truncated ? [] : firstPerNode(findLoops(run)).map((i) => ({ nodeId: states[i].nodeId, route: routeTo(i) }));

  const lockedChoices = story.nodes.flatMap((n) =>
    n.type === 'final' || !firstAt.has(n.id)
      ? []
      : n.choices.filter((c) => (c.conditions || []).length > 0 && !opened.has(c.id)).map((c) => ({ nodeId: n.id, choiceId: c.id })),
  );

  const blockedNodes = story.nodes.filter((n) => n.type !== 'final' && linked.has(n.id) && !firstAt.has(n.id)).map((n) => n.id);

  const ranges = states.length === 0 ? [] : variables
    .filter((v) => v.type === 'number' && keyVarIds.includes(v.id))
    .map((v) => {
      const values = states.map((s) => Number(s.vars[v.id]));
      return { varId: v.id, min: values.reduce((a, b) => Math.min(a, b)), max: values.reduce((a, b) => Math.max(a, b)) };
    });

  return {
    complete: !truncated,
    states: states.length,
    endings,
    stuck: stuckOut,
    loops,
    lockedChoices,
    blockedNodes,
    ranges,
    skippedVars: variables.filter((v) => !keyVarIds.includes(v.id)).map((v) => v.id),
  };
}

export function simulateStory(story, variables, maxStates = MAX_STATES) {
  const all = variables.map((v) => v.id);
  const full = explore(story, variables, all, maxStates);
  if (!full.truncated) return report(story, variables, full, all);

  // Variáveis que nenhuma condição lê (um contador de visitas, por exemplo) não mudam o que o
  // jogador pode fazer, mas multiplicam as combinações. Tenta de novo sem contar com elas.
  const read = new Set(story.nodes.flatMap((n) => n.choices.flatMap((c) => (c.conditions || []).map((x) => x.varId))));
  const used = all.filter((id) => read.has(id));
  if (used.length === all.length) return report(story, variables, full, all);
  return report(story, variables, explore(story, variables, used, maxStates), used);
}
