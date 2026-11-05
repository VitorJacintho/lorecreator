/** Testes do motor das histórias (o mesmo código que vai no HTML jogável).   npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEffects, checkCondition, choicesFor, enterNode, initialVars, interpolate, renderText } from '../src/engine/runtime.js';

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

test('texto: variáveis e links', () => {
  const v = initialVars(variables);
  assert.equal(interpolate('Você tem {ouro} moedas e {OURO}. {desconhecida}', v, variables), 'Você tem 10 moedas e 10. {desconhecida}');
  assert.equal(renderText('Rumo a [[Velmora]] no [[Navio Aurora|navio]] ({confia})', v, variables), 'Rumo a Velmora no navio (não)');
});

test('escolhas liberadas e bloqueadas', () => {
  const node = {
    choices: [
      { id: '1', text: 'Pagar', targetId: 'n2', condition: { varId: 'a', op: '>=', value: 20 } },
      { id: '2', text: 'Ir', targetId: 'n3' },
      { id: '3', text: 'Sem destino' },
    ],
  };
  const r = choicesFor(node, initialVars(variables));
  assert.deepEqual(r.map((x) => [x.ok, x.locked]), [[false, true], [true, false], [false, false]]);
});

test('entrar em um nó aplica os efeitos', () => {
  const story = { nodes: [{ id: 'n1', effects: [{ varId: 'a', op: 'add', value: 5 }], choices: [] }] };
  const { node, vars } = enterNode(story, 'n1', initialVars(variables), variables);
  assert.equal(node.id, 'n1');
  assert.equal(vars.a, 15);
  assert.equal(enterNode(story, 'nada', vars, variables).node, null);
});
