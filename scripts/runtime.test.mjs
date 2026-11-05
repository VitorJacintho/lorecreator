/** Testes do motor das histórias (o mesmo código que vai no HTML jogável).   npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEffects, checkCondition, checkConditions, choicesFor, enterNode, followChoice, initialVars, interpolate, renderText } from '../src/engine/runtime.js';

const variables = [
  { id: 'a', name: 'ouro', type: 'number', initial: 10 },
  { id: 'b', name: 'confia', type: 'bool', initial: false },
  { id: 'c', name: 'navio', type: 'text', initial: 'Aurora' },
];

test('valores iniciais', () => {
  assert.deepEqual(initialVars(variables), { a: 10, b: false, c: 'Aurora' });
});

test('efeitos: soma, subtrai, inverte e define', () => {
  const v = applyEffects(
    [
      { varId: 'a', op: 'sub', value: 8 },
      { varId: 'b', op: 'toggle' },
      { varId: 'c', op: 'set', value: 'Maré' },
      { varId: 'apagada', op: 'set', value: 1 },
    ],
    initialVars(variables),
    variables,
  );
  assert.deepEqual(v, { a: 2, b: true, c: 'Maré' });
});

test('condições', () => {
  const v = { a: 8, b: true };
  assert.equal(checkCondition({ varId: 'a', op: '>=', value: 8 }, v), true);
  assert.equal(checkCondition({ varId: 'a', op: '>', value: 8 }, v), false);
  assert.equal(checkCondition({ varId: 'b', op: '==', value: true }, v), true);
  // variável apagada não trava a escolha
  assert.equal(checkCondition({ varId: 'x', op: '==', value: true }, v), true);
  assert.equal(checkCondition(undefined, v), true);
});

test('várias condições: todas (E) e qualquer uma (OU)', () => {
  const v = { a: 8, b: false };
  const certa = { varId: 'a', op: '>=', value: 8 };
  const errada = { varId: 'b', op: '==', value: true };
  const apagada = { varId: 'x', op: '==', value: true };
  assert.equal(checkConditions([certa, errada], 'all', v), false);
  assert.equal(checkConditions([certa, errada], 'any', v), true);
  assert.equal(checkConditions([errada], 'any', v), false);
  assert.equal(checkConditions([], 'all', v), true);
  assert.equal(checkConditions(undefined, 'any', v), true);
  // condição com variável apagada é ignorada: não libera um OU nem trava um E
  assert.equal(checkConditions([errada, apagada], 'any', v), false);
  assert.equal(checkConditions([certa, apagada], 'all', v), true);
  assert.equal(checkConditions([apagada], 'any', v), true);
});

test('texto: variáveis e links', () => {
  const v = initialVars(variables);
  assert.equal(interpolate('Você tem {ouro} moedas e {OURO}. {desconhecida}', v, variables), 'Você tem 10 moedas e 10. {desconhecida}');
  assert.equal(renderText('Rumo a [[Velmora]] no [[Navio Aurora|navio]] ({confia})', v, variables), 'Rumo a Velmora no navio (não)');
});

test('escolhas liberadas e bloqueadas', () => {
  const node = {
    choices: [
      { id: '1', text: 'Pagar', targetId: 'n2', conditions: [{ varId: 'a', op: '>=', value: 20 }], conditionMode: 'all' },
      { id: '2', text: 'Ir', targetId: 'n3', conditions: [], conditionMode: 'all' },
      { id: '3', text: 'Sem destino', conditions: [], conditionMode: 'all' },
      { id: '4', text: 'Ou', targetId: 'n4', conditions: [{ varId: 'a', op: '>=', value: 20 }, { varId: 'b', op: '==', value: false }], conditionMode: 'any' },
    ],
  };
  const r = choicesFor(node, initialVars(variables));
  assert.deepEqual(r.map((x) => [x.ok, x.locked]), [[false, true], [true, false], [false, false], [true, false]]);
});

test('seguir uma escolha aplica os efeitos dela e depois os do destino', () => {
  const story = { nodes: [{ id: 'n1', effects: [{ varId: 'a', op: 'add', value: 5 }], choices: [] }] };
  const choice = { targetId: 'n1', effects: [{ varId: 'a', op: 'sub', value: 8 }, { varId: 'b', op: 'toggle' }] };
  const start = initialVars(variables);
  const { node, vars } = followChoice(story, choice, start, variables);
  assert.equal(node.id, 'n1');
  assert.equal(vars.a, 7);
  assert.equal(vars.b, true);
  assert.equal(start.a, 10, 'não altera o estado anterior');
  // escolha gravada sem efeitos
  assert.equal(followChoice(story, { targetId: 'n1' }, start, variables).vars.a, 15);
});

test('entrar em um nó aplica os efeitos', () => {
  const story = { nodes: [{ id: 'n1', effects: [{ varId: 'a', op: 'add', value: 5 }], choices: [] }] };
  const { node, vars } = enterNode(story, 'n1', initialVars(variables), variables);
  assert.equal(node.id, 'n1');
  assert.equal(vars.a, 15);
  assert.equal(enterNode(story, 'nada', vars, variables).node, null);
});
