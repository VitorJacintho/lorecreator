/** Testes do simulador de caminhos.   npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateStory } from '../src/engine/simulate.js';

const num = (id, initial) => ({ id, name: id, type: 'number', initial });
const se = (varId, op, value) => ({ id: `${varId}${op}${value}`, varId, op, value });
const fx = (varId, op, value) => ({ id: `${varId}${op}${value}`, varId, op, value });
const go = (targetId, text = '', extra = {}) => ({ id: `${text}>${targetId}`, text, targetId, conditions: [], conditionMode: 'all', effects: [], ...extra });
const cena = (id, choices = [], effects = []) => ({ id, type: 'cena', title: id, text: id, choices, effects });
const fim = (id) => ({ id, type: 'final', title: id, text: id, choices: [], effects: [] });
const story = (...nodes) => ({ startNodeId: nodes[0].id, nodes });
const ending = (r, id) => r.endings.find((e) => e.nodeId === id);

test('final que exige mais ouro do que dá para juntar é apontado', () => {
  const r = simulateStory(
    story(
      cena('a', [go('rico', 'Comprar', { conditions: [se('ouro', '>=', 50)] }), go('pobre', 'Sair')]),
      fim('rico'),
      fim('pobre'),
    ),
    [num('ouro', 20)],
  );
  assert.equal(r.complete, true);
  assert.equal(ending(r, 'rico').route, null);
  assert.equal(ending(r, 'rico').linked, true);
  assert.deepEqual(ending(r, 'pobre').route.map((s) => s.nodeId), ['a', 'pobre']);
  assert.deepEqual(r.lockedChoices, [{ nodeId: 'a', choiceId: 'Comprar>rico' }]);
});

test('final só alcançável repetindo um laço que dá ouro', () => {
  const r = simulateStory(
    story(
      cena('a', [
        go('a', 'Trabalhar', { effects: [fx('ouro', 'add', 10)] }),
        go('rico', 'Comprar', { conditions: [se('ouro', '>=', 50)] }),
      ]),
      fim('rico'),
    ),
    [num('ouro', 0)],
  );
  const route = ending(r, 'rico').route;
  assert.equal(route.length, 7);
  assert.equal(route[route.length - 2].vars.ouro, 50);
  assert.equal(route[route.length - 1].via, 'Comprar');
});

test('efeito da escolha vale antes de entrar no destino', () => {
  const r = simulateStory(
    story(
      cena('a', [go('b', 'Pagar', { effects: [fx('ouro', 'sub', 8)] })]),
      cena('b', [go('fim', '', { conditions: [se('ouro', '==', 4)] })], [fx('ouro', 'add', 2)]),
      fim('fim'),
    ),
    [num('ouro', 10)],
  );
  assert.deepEqual(ending(r, 'fim').route.map((s) => s.vars.ouro), [10, 4, 4]);
});

test('jogador que gasta tudo e fica sem escolhas liberadas', () => {
  const r = simulateStory(
    story(
      cena('a', [go('loja', 'Gastar', { effects: [fx('ouro', 'sub', 10)] }), go('porta', 'Guardar')]),
      cena('loja', [go('porta')]),
      cena('porta', [go('fim', 'Abrir', { conditions: [se('ouro', '>=', 5)] })]),
      fim('fim'),
    ),
    [num('ouro', 10)],
  );
  assert.ok(ending(r, 'fim').route, 'o final ainda é alcançável guardando o ouro');
  assert.equal(r.stuck.length, 1);
  assert.equal(r.stuck[0].nodeId, 'porta');
  assert.equal(r.stuck[0].reason, 'bloqueadas');
  assert.equal(r.stuck[0].route.at(-1).vars.ouro, 0);
  assert.deepEqual(r.lockedChoices, [], 'a escolha abre em algum caminho');
  assert.deepEqual(r.ranges, [{ varId: 'ouro', min: 0, max: 10 }]);
});

test('motivos de travamento: sem escolhas e sem destino', () => {
  const r = simulateStory(
    story(cena('a', [go('b', 'b'), go('c', 'c')]), cena('b'), cena('c', [{ ...go('x'), targetId: undefined }])),
    [],
  );
  assert.deepEqual(
    r.stuck.map((s) => [s.nodeId, s.reason]),
    [['b', 'sem-escolhas'], ['c', 'sem-destino']],
  );
});

test('laço sem saída é apontado uma vez, no ponto de entrada', () => {
  const r = simulateStory(
    story(cena('a', [go('b', 'Entrar'), go('fim', 'Sair')]), cena('b', [go('c')]), cena('c', [go('b')]), fim('fim')),
    [],
  );
  assert.deepEqual(r.loops.map((l) => l.nodeId), ['b']);
  assert.deepEqual(r.stuck, []);
  assert.ok(ending(r, 'fim').route);
});

test('quando todos os caminhos caem no laço, aponta o laço e não o início', () => {
  const r = simulateStory(
    story(cena('a', [go('b')]), cena('b', [go('c')]), cena('c', [go('d')]), cena('d', [go('c')]), fim('fim')),
    [],
  );
  assert.deepEqual(r.loops.map((l) => l.nodeId), ['c']);
  assert.deepEqual(r.loops[0].route.map((s) => s.nodeId), ['a', 'b', 'c']);
  assert.equal(ending(r, 'fim').linked, false);
});

test('laço com saída não é problema, e travamento à frente não conta como laço', () => {
  const r = simulateStory(
    story(cena('a', [go('a', 'Esperar'), go('b', 'Seguir')]), cena('b')),
    [],
  );
  assert.deepEqual(r.loops, []);
  assert.deepEqual(r.stuck.map((s) => s.nodeId), ['b']);
});

test('nó ligado mas bloqueado pelas condições', () => {
  const r = simulateStory(
    story(cena('a', [go('b', 'x', { conditions: [se('c', '==', true)] }), go('fim', 'y')]), cena('b', [go('fim')]), cena('solto'), fim('fim')),
    [{ id: 'c', name: 'c', type: 'bool', initial: false }],
  );
  assert.deepEqual(r.blockedNodes, ['b'], 'nó sem nenhuma ligação fica de fora (a análise comum já avisa)');
});

test('condições E e OU', () => {
  const vars = [num('a', 1), num('b', 2)];
  const conds = [se('a', '==', 1), se('b', '==', 99)];
  const build = (mode) => story(cena('s', [go('e', 'x', { conditions: conds, conditionMode: mode }), go('o', 'y')]), fim('e'), fim('o'));
  assert.equal(ending(simulateStory(build('all'), vars), 'e').route, null);
  assert.ok(ending(simulateStory(build('any'), vars), 'e').route);
});

test('contador que nenhuma condição lê não impede a conclusão', () => {
  const r = simulateStory(
    story(cena('a', [go('a', 'De novo', { effects: [fx('visitas', 'add', 1)] }), go('fim', 'Sair')]), fim('fim')),
    [num('visitas', 0)],
    500,
  );
  assert.equal(r.complete, true);
  assert.ok(ending(r, 'fim').route);
  assert.deepEqual(r.skippedVars, ['visitas']);
  assert.deepEqual(r.ranges, []);
});

test('sem limite natural: para no máximo e diz que não terminou', () => {
  const r = simulateStory(
    story(
      cena('a', [
        go('a', 'Mais', { effects: [fx('x', 'add', 1)] }),
        go('perto', 'Perto', { conditions: [se('x', '>=', 3)] }),
        go('longe', 'Longe', { conditions: [se('x', '>=', 100000)] }),
      ]),
      fim('perto'),
      fim('longe'),
    ),
    [num('x', 0)],
    200,
  );
  assert.equal(r.complete, false);
  assert.equal(r.states, 200);
  assert.ok(ending(r, 'perto').route, 'o que foi alcançado continua valendo');
  assert.equal(ending(r, 'longe').route, null);
  assert.deepEqual(r.loops, [], 'sem testar tudo, não afirma que há laço sem saída');
});

test('história vazia ou sem início não quebra', () => {
  const r = simulateStory({ nodes: [] }, []);
  assert.equal(r.states, 0);
  assert.deepEqual(r.endings, []);
  assert.deepEqual(r.ranges, []);
});

test('história grande termina rápido', () => {
  // 12 variáveis Sim/Não ligadas em sequência: 4096 combinações
  const nodes = [];
  const vars = [];
  for (let i = 0; i < 12; i++) {
    vars.push({ id: `v${i}`, name: `v${i}`, type: 'bool', initial: false });
    nodes.push(cena(`n${i}`, [
      go(`n${i + 1}`, 'sim', { effects: [fx(`v${i}`, 'set', true)] }),
      go(`n${i + 1}`, 'não'),
    ]));
  }
  nodes.push(fim('n12'));
  const t = performance.now();
  const r = simulateStory(story(...nodes), vars);
  const ms = performance.now() - t;
  assert.equal(r.complete, true);
  assert.ok(ending(r, 'n12').route);
  assert.ok(ms < 2000, `demorou ${ms} ms`);
});
