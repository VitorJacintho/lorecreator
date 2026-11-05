/**
 * Interface do HTML jogável exportado. Roda no mesmo <script type="module"> que
 * src/engine/runtime.js (as funções enterNode, followChoice, choicesFor, renderText… vêm de lá).
 * Sem imports e sem innerHTML com texto do usuário: tudo via textContent.
 */
const DATA = JSON.parse(document.getElementById('lore-data').textContent);
const app = document.getElementById('app');

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'class') node.className = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

let state = null;
let keyHandler = null;

function onKeys(fn) {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = fn;
  if (fn) window.addEventListener('keydown', fn);
}

function showMenu() {
  onKeys((e) => {
    if (/^[1-9]$/.test(e.key) && DATA.stories[Number(e.key) - 1]) start(DATA.stories[Number(e.key) - 1]);
  });
  app.replaceChildren(
    el('header', { class: 'menu-head' }, el('h1', {}, DATA.title), DATA.genre ? el('p', { class: 'genre' }, DATA.genre) : null),
    DATA.premise ? el('p', { class: 'premise' }, DATA.premise) : null,
    el('ol', { class: 'menu' }, DATA.stories.map((s, i) =>
      el('li', {}, el('button', { onclick: () => start(s) },
        el('span', { class: 'key' }, i + 1),
        el('span', {}, el('strong', {}, s.name), s.synopsis ? el('small', {}, s.synopsis) : null))))),
  );
}

function start(story) {
  const { vars } = enterNode(story, story.startNodeId, initialVars(DATA.variables), DATA.variables);
  state = { story, steps: [{ nodeId: story.startNodeId, vars }] };
  render();
}

function choose(option) {
  if (!option.ok) return;
  const cur = state.steps[state.steps.length - 1];
  const { vars } = followChoice(state.story, option.choice, cur.vars, DATA.variables);
  state.steps.push({ nodeId: option.choice.targetId, vars });
  render();
}

function back() {
  if (state.steps.length > 1) {
    state.steps.pop();
    render();
  }
}

function render() {
  const cur = state.steps[state.steps.length - 1];
  const node = state.story.nodes.find((n) => n.id === cur.nodeId);
  if (!node) return showMenu();
  const options = node.type === 'final' ? [] : choicesFor(node, cur.vars).filter((o) => !o.locked && o.ok);
  const speaker = node.speakerId ? DATA.characters[node.speakerId] : null;
  const text = renderText(node.text, cur.vars, DATA.variables);

  onKeys((e) => {
    if (/^[1-9]$/.test(e.key) && options[Number(e.key) - 1]) choose(options[Number(e.key) - 1]);
    else if (e.key === 'Enter' && options.length === 1) choose(options[0]);
    else if (e.key === 'Backspace') back();
  });

  app.replaceChildren(
    el('nav', { class: 'bar' },
      el('button', { onclick: showMenu }, '☰ ', DATA.stories.length > 1 ? 'Histórias' : 'Início'),
      el('span', { class: 'title' }, state.story.name),
      el('button', { onclick: back, disabled: state.steps.length < 2 ? 'disabled' : null }, '↶ Voltar')),
    el('article', { class: `card ${node.type}` },
      node.type === 'fala'
        ? el('div', { class: 'speaker' },
          speaker && speaker.image ? el('img', { src: speaker.image, alt: '' }) : el('span', { class: 'avatar' }, (speaker ? speaker.name : '?').slice(0, 1)),
          el('strong', {}, speaker ? speaker.name : 'Alguém'))
        : null,
      el('div', { class: 'text' }, text.split(/\n+/).map((p) => el('p', {}, p))),
      node.type === 'final'
        ? el('div', { class: 'end' }, el('span', {}, `— FIM${node.title ? `: ${node.title}` : ''} —`),
          el('button', { class: 'primary', onclick: () => start(state.story) }, '⟲ Jogar de novo'))
        : el('ol', { class: 'choices' }, options.length
          ? options.map((o, i) => el('li', {}, el('button', { onclick: () => choose(o) },
            el('span', { class: 'key' }, i + 1), interpolate(o.choice.text.trim() || 'Continuar', cur.vars, DATA.variables))))
          : el('li', { class: 'muted' }, 'Não há escolhas disponíveis aqui.'))),
  );
  window.scrollTo({ top: 0 });
}

if (DATA.stories.length === 1) start(DATA.stories[0]);
else showMenu();
