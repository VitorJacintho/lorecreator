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
  return (node.choices || []).map((choice) => ({
    choice,
    ok: checkCondition(choice.condition, vars) && !!choice.targetId,
    locked: !checkCondition(choice.condition, vars),
  }));
}

/** Entra em um nó: aplica os efeitos e devolve o novo estado. */
export function enterNode(story, nodeId, vars, variables) {
  const node = story.nodes.find((n) => n.id === nodeId);
  if (!node) return { node: null, vars };
  return { node, vars: applyEffects(node.effects, vars, variables) };
}
