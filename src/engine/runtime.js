/**
 * Motor das histórias ramificadas: condições, efeitos e interpolação de variáveis.
 *
 * Fica em JavaScript puro e sem imports de propósito: o mesmo arquivo é usado
 * pelo modo "Testar" do app e é embutido no HTML jogável exportado.
 * Tipos em runtime.d.ts.
 */

export function compareValues(a, op, b) {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>': return Number(a) > Number(b);
    case '<': return Number(a) < Number(b);
    case '>=': return Number(a) >= Number(b);
    case '<=': return Number(a) <= Number(b);
    default: return false;
  }
}

/** Condição sem variável (ex.: a variável foi apagada) não bloqueia a escolha. */
export function checkCondition(cond, vars) {
  if (!cond || !cond.varId || !(cond.varId in vars)) return true;
  return compareValues(vars[cond.varId], cond.op, cond.value);
}

/** Confere as condições de uma escolha: todas ('all') ou pelo menos uma ('any'). Condições com variável apagada são ignoradas. */
export function checkConditions(conditions, mode, vars) {
  const live = (conditions || []).filter((c) => c && c.varId && c.varId in vars);
  if (live.length === 0) return true;
  return mode === 'any' ? live.some((c) => checkCondition(c, vars)) : live.every((c) => checkCondition(c, vars));
}

export function initialVars(variables) {
  const vars = {};
  for (const v of variables) vars[v.id] = v.initial;
  return vars;
}

export function applyEffects(effects, vars, variables) {
  const next = { ...vars };
  const types = {};
  for (const v of variables) types[v.id] = v.type;
  for (const e of effects || []) {
    if (!e.varId || !(e.varId in types)) continue;
    const type = types[e.varId];
    const cur = next[e.varId];
    if (e.op === 'toggle') next[e.varId] = type === 'bool' ? !cur : cur;
    else if (e.op === 'add' && type === 'number') next[e.varId] = Number(cur) + Number(e.value);
    else if (e.op === 'sub' && type === 'number') next[e.varId] = Number(cur) - Number(e.value);
    else if (e.op === 'set') next[e.varId] = e.value;
  }
  return next;
}

export function formatValue(value) {
  if (value === true) return 'sim';
  if (value === false) return 'não';
  return String(value);
}

/** Troca {nome} pelo valor da variável (nomes desconhecidos ficam como estão). */
export function interpolate(text, vars, variables) {
  const byName = {};
  for (const v of variables) byName[v.name.toLowerCase()] = v.id;
  return String(text || '').replace(/\{([^{}\n]+)\}/g, (all, name) => {
    const varId = byName[name.trim().toLowerCase()];
    return varId && varId in vars ? formatValue(vars[varId]) : all;
  });
}

/** Texto final para o jogador: variáveis preenchidas e [[Entrada|apelido]] virando só o nome. */
export function renderText(text, vars, variables) {
  return interpolate(text, vars, variables)
    .replace(/\[\[([^\[\]\n|]+)(?:\|([^\[\]\n]+))?\]\]/g, (_all, name, alias) => (alias || name).trim());
}

/** Escolhas de um nó com a informação de quais estão liberadas agora. */
export function choicesFor(node, vars) {
  return (node.choices || []).map((choice) => {
    const open = checkConditions(choice.conditions, choice.conditionMode, vars);
    return { choice, ok: open && !!choice.targetId, locked: !open };
  });
}

/** Entra em um nó: aplica os efeitos e devolve o novo estado. */
export function enterNode(story, nodeId, vars, variables) {
  const node = story.nodes.find((n) => n.id === nodeId);
  if (!node) return { node: null, vars };
  return { node, vars: applyEffects(node.effects, vars, variables) };
}

/** Segue uma escolha: aplica os efeitos dela e depois entra no nó de destino. */
export function followChoice(story, choice, vars, variables) {
  return enterNode(story, choice.targetId, applyEffects(choice.effects, vars, variables), variables);
}
