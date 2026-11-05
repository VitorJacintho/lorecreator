/**
 * Testes do formato do projeto e dos exportadores.   npm test
 * Esses módulos são TypeScript e usam ?raw, então são carregados pelo Vite.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let load;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  load = (path) => server.ssrLoadModule(path);
});

after(async () => {
  await server.close();
});

/** Como um projeto ficava salvo no LoreCreator 0.1.0 (formato versão 1). */
const v1Project = () => ({
  format: 'lorecreator-project',
  version: 1,
  id: 'p1',
  name: 'Antigo',
  genre: '',
  premise: '',
  entries: [],
  variables: [
    { id: 'ouro', name: 'ouro', type: 'number', initial: 10, description: '' },
    { id: 'ok', name: 'ok', type: 'bool', initial: false, description: '' },
  ],
  stories: [{
    id: 's1',
    name: 'H',
    synopsis: '',
    startNodeId: 'a',
    nodes: [
      {
        id: 'a', type: 'cena', title: '', text: 'x', position: { x: 0, y: 0 }, effects: [{ id: 'e1', varId: 'ouro', op: 'add', value: 1 }],
        choices: [
          { id: 'c1', text: 'Pagar', targetId: 'b', condition: { varId: 'ouro', op: '>=', value: '8' } },
          { id: 'c2', text: 'Sair', targetId: 'b' },
        ],
      },
      { id: 'b', type: 'final', title: '', text: 'y', position: { x: 0, y: 0 }, effects: [], choices: [] },
    ],
    createdAt: 1,
    updatedAt: 1,
  }],
  createdAt: 1,
  updatedAt: 1,
});

test('projeto da versão 1 abre com a condição migrada', async () => {
  const { normalizeProject } = await load('/src/model/normalize.ts');
  const p = normalizeProject(v1Project());
  assert.equal(p.version, 2);
  const [c1, c2] = p.stories[0].nodes[0].choices;
  assert.equal(c1.conditions.length, 1);
  assert.equal(c1.conditions[0].varId, 'ouro');
  assert.equal(c1.conditions[0].op, '>=');
  assert.equal(c1.conditions[0].value, 8);
  assert.ok(c1.conditions[0].id);
  assert.equal(c1.conditionMode, 'all');
  assert.deepEqual(c1.effects, []);
  assert.equal('condition' in c1, false);
  assert.deepEqual(c2.conditions, []);
  assert.equal(p.stories[0].nodes[0].effects.length, 1);
});

test('projeto da versão 2 mantém condições, modo e efeitos ao salvar e abrir', async () => {
  const { normalizeProject, parseProject } = await load('/src/model/normalize.ts');
  const raw = v1Project();
  raw.version = 2;
  raw.stories[0].nodes[0].choices[0] = {
    id: 'c1',
    text: 'Pagar',
    targetId: 'b',
    conditions: [{ id: 'k1', varId: 'ouro', op: '>=', value: 8 }, { id: 'k2', varId: 'ok', op: '==', value: true }],
    conditionMode: 'any',
    effects: [{ id: 'f1', varId: 'ouro', op: 'sub', value: 8 }],
  };
  const once = normalizeProject(raw);
  const twice = parseProject(JSON.stringify(once));
  assert.deepEqual(twice.stories[0].nodes[0].choices[0], raw.stories[0].nodes[0].choices[0]);
});

test('arquivo de uma versão mais nova é recusado em vez de perder dados', async () => {
  const { normalizeProject, ProjectFormatError } = await load('/src/model/normalize.ts');
  const raw = v1Project();
  raw.version = 3;
  assert.throws(() => normalizeProject(raw), ProjectFormatError);
});

test('copiar uma escolha gera ids novos sem mexer na original', async () => {
  const { cloneChoice, newChoice } = await load('/src/model/factory.ts');
  const c = newChoice('b', 'Ir');
  c.conditions.push({ id: 'k', varId: 'v', op: '==', value: true });
  c.effects.push({ id: 'f', varId: 'v', op: 'toggle', value: true });
  const copy = cloneChoice(c);
  assert.notEqual(copy.id, c.id);
  assert.notEqual(copy.conditions[0].id, 'k');
  assert.notEqual(copy.effects[0].id, 'f');
  assert.equal(copy.targetId, 'b');
  assert.equal(c.conditions[0].id, 'k');
});

test('projeto de exemplo: sem erros e com os três finais alcançáveis', async () => {
  const { sampleProject } = await load('/src/model/sample.ts');
  const { analyzeStory } = await load('/src/engine/analyze.ts');
  const { simulateStory } = await load('/src/engine/simulate.js');
  const p = sampleProject();
  const story = p.stories[0];
  assert.deepEqual(analyzeStory(story, p), []);
  const r = simulateStory(story, p.variables);
  assert.equal(r.complete, true);
  assert.equal(r.endings.length, 3);
  assert.ok(r.endings.every((e) => e.route), 'todos os finais têm caminho');
  assert.deepEqual(r.stuck, []);
  assert.deepEqual(r.loops, []);
  assert.deepEqual(r.lockedChoices, []);
  const ouro = p.variables.find((v) => v.name === 'ouro');
  assert.deepEqual(r.ranges, [{ varId: ouro.id, min: 2, max: 10 }]);
});

test('análise aponta variável apagada em condição e em efeito de escolha', async () => {
  const { normalizeProject } = await load('/src/model/normalize.ts');
  const { analyzeStory } = await load('/src/engine/analyze.ts');
  const raw = v1Project();
  raw.version = 2;
  raw.stories[0].nodes[0].choices[0] = {
    id: 'c1',
    text: 'Pagar',
    targetId: 'b',
    conditions: [{ id: 'k1', varId: 'sumiu', op: '==', value: true }],
    conditionMode: 'all',
    effects: [{ id: 'f1', varId: 'sumiu', op: 'set', value: true }],
  };
  const p = normalizeProject(raw);
  const errors = analyzeStory(p.stories[0], p).filter((i) => i.level === 'erro').map((i) => i.message);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /condição/);
  assert.match(errors[1], /efeito/);
});

test('JSON para engines traz condições, modo e efeitos da escolha', async () => {
  const { sampleProject } = await load('/src/model/sample.ts');
  const { toEngineJson } = await load('/src/export/exporters.ts');
  const out = JSON.parse(toEngineJson(sampleProject()));
  assert.equal(out.version, 2);
  const choices = Object.values(out.stories[0].nodes).flatMap((n) => n.choices);
  const pagar = choices.find((c) => c.text.startsWith('Pagar'));
  assert.deepEqual(pagar.conditions, [{ variable: 'ouro', op: '>=', value: 8 }]);
  assert.equal(pagar.conditionMode, 'all');
  assert.deepEqual(pagar.effects, [{ variable: 'ouro', op: 'sub', value: 8 }, { variable: 'confia_kael', op: 'set', value: true }]);
  const chamar = choices.find((c) => c.text === 'Chamar Kael');
  assert.equal(chamar.conditions.length, 2);
  assert.equal('condition' in chamar, false);
});

test('Markdown mostra condições e efeitos da escolha', async () => {
  const { sampleProject } = await load('/src/model/sample.ts');
  const { toMarkdown } = await load('/src/export/exporters.ts');
  const md = toMarkdown(sampleProject());
  assert.match(md, /- Pagar Kael \(8 moedas\) → §\d+ \*\(se `ouro` >= 8\)\* ⚙ `ouro` -= 8, `confia_kael` = sim/);
  assert.match(md, /- Chamar Kael → §\d+ \*\(se `confia_kael` == sim e `tem_lente` == sim\)\*/);
});

test('HTML jogável embute o motor novo', async () => {
  const { sampleProject } = await load('/src/model/sample.ts');
  const { toPlayableHtml } = await load('/src/export/exporters.ts');
  const p = sampleProject();
  const html = toPlayableHtml(p, [p.stories[0].id]);
  assert.match(html, /function followChoice/);
  assert.match(html, /function checkConditions/);
  assert.match(html, /followChoice\(state\.story/);
  assert.match(html, /"conditionMode":"all"/);
});
