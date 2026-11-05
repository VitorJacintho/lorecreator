/** Formatos de exportação: HTML jogável, JSON para engines e Markdown ("bíblia do mundo"). */
import runtimeSource from '../engine/runtime.js?raw';
import { reachable } from '../engine/analyze';
import { KIND_INFO, ENTRY_KINDS, NODE_TYPE_INFO, type Id, type Project, type Story, type StoryNode } from '../model/types';
import playerSource from './player.js?raw';

const stripLinks = (t: string) => t.replace(/\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g, (_a, n: string, alias?: string) => (alias ?? n).trim());

/* ---------------- JSON para engines ---------------- */

/**
 * Formato estável e simples de ler em qualquer engine:
 *  - nós indexados por id; cada escolha diz o destino (`next`) e a condição opcional;
 *  - `speaker` aponta para `characters`; textos mantêm {variavel} para interpolar no jogo;
 *  - [[links]] viram texto simples (o nome original fica em `mentions`).
 */
export function toEngineJson(project: Project): string {
  const varName = new Map(project.variables.map((v) => [v.id, v.name]));
  const mentions = (t: string) => [...t.matchAll(/\[\[([^[\]\n|]+)/g)].map((m) => m[1].trim());
  const out = {
    format: 'lorecreator-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: { name: project.name, genre: project.genre, premise: project.premise },
    variables: project.variables.map((v) => ({ name: v.name, type: v.type, initial: v.initial, description: v.description })),
    characters: Object.fromEntries(
      project.entries.filter((e) => e.kind === 'personagem').map((e) => [e.id, { name: e.name, summary: e.summary, tags: e.tags }]),
    ),
    stories: project.stories.map((s) => ({
      id: s.id,
      name: s.name,
      synopsis: s.synopsis,
      start: s.startNodeId ?? null,
      nodes: Object.fromEntries(
        s.nodes.map((n) => [
          n.id,
          {
            type: n.type,
            title: n.title,
            speaker: n.speakerId ?? null,
            text: stripLinks(n.text),
            mentions: mentions(n.text),
            effects: n.effects.filter((e) => varName.has(e.varId)).map((e) => ({ variable: varName.get(e.varId), op: e.op, value: e.value })),
            choices:
              n.type === 'final'
                ? []
                : n.choices.map((c) => ({
                    text: c.text,
                    next: c.targetId ?? null,
                    condition: c.condition && varName.has(c.condition.varId)
                      ? { variable: varName.get(c.condition.varId), op: c.condition.op, value: c.condition.value }
                      : null,
                  })),
          },
        ]),
      ),
    })),
    codex: project.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      summary: e.summary,
      description: stripLinks(e.body),
      tags: e.tags,
      fields: Object.fromEntries(e.fields.filter((f) => f.key.trim()).map((f) => [f.key, f.value])),
      relations: e.relations.map((r) => ({ label: r.label, target: r.targetId })),
      ...(e.kind === 'evento' ? { when: e.when ?? '', order: e.order ?? 0 } : {}),
    })),
  };
  return JSON.stringify(out, null, 2);
}

/* ---------------- Markdown ---------------- */

/** Ordem de leitura do roteiro: a partir do início, depois os nós soltos. */
function readingOrder(story: Story): StoryNode[] {
  const byId = new Map(story.nodes.map((n) => [n.id, n]));
  const seen = new Set<Id>();
  const order: StoryNode[] = [];
  const queue = story.startNodeId ? [story.startNodeId] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    const n = byId.get(id)!;
    order.push(n);
    for (const c of n.choices) if (c.targetId) queue.push(c.targetId);
  }
  for (const n of story.nodes) if (!seen.has(n.id)) order.push(n);
  return order;
}

export function toMarkdown(project: Project): string {
  const lines: string[] = [];
  const entries = new Map(project.entries.map((e) => [e.id, e]));
  const vars = new Map(project.variables.map((v) => [v.id, v]));
  const md = (t: string) => t.replace(/\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g, (_a, n: string, alias?: string) => `**${(alias ?? n).trim()}**`);
  const fmt = (v: unknown) => (v === true ? 'sim' : v === false ? 'não' : String(v));

  lines.push(`# ${project.name}`, '');
  if (project.genre) lines.push(`*${project.genre}*`, '');
  if (project.premise) lines.push(`> ${project.premise.replace(/\n/g, '\n> ')}`, '');

  for (const kind of ENTRY_KINDS) {
    const list = project.entries.filter((e) => e.kind === kind).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!list.length || kind === 'evento') continue;
    lines.push(`## ${KIND_INFO[kind].plural}`, '');
    for (const e of list) {
      lines.push(`### ${e.name}`, '');
      if (e.summary) lines.push(`*${md(e.summary)}*`, '');
      const fields = e.fields.filter((f) => f.value.trim());
      if (fields.length) {
        for (const f of fields) lines.push(`- **${f.key}:** ${f.value}`);
        lines.push('');
      }
      if (e.body.trim()) lines.push(md(e.body), '');
      if (e.relations.length) {
        lines.push(e.relations.map((r) => `${r.label || 'relacionado a'} ${entries.get(r.targetId)?.name ?? '?'}`).join(' · '), '');
      }
      if (e.tags.length) lines.push(e.tags.map((t) => `#${t}`).join(' '), '');
    }
  }

  const events = project.entries.filter((e) => e.kind === 'evento').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (events.length) {
    lines.push('## Linha do tempo', '');
    for (const e of events) {
      lines.push(`- **${e.when || 'Sem data'} — ${e.name}.** ${md(e.summary)}`);
      if (e.body.trim()) lines.push(`  ${md(e.body).replace(/\n/g, '\n  ')}`);
    }
    lines.push('');
  }

  if (project.variables.length) {
    lines.push('## Variáveis', '', '| Nome | Tipo | Inicial | Descrição |', '|---|---|---|---|');
    for (const v of project.variables) lines.push(`| \`${v.name}\` | ${v.type} | ${fmt(v.initial)} | ${v.description} |`);
    lines.push('');
  }

  for (const s of project.stories) {
    lines.push(`## Roteiro: ${s.name}`, '');
    if (s.synopsis) lines.push(`*${s.synopsis}*`, '');
    const order = readingOrder(s);
    const num = new Map(order.map((n, i) => [n.id, i + 1]));
    const reach = reachable(s);
    for (const n of order) {
      const head = `### ${num.get(n.id)}. ${n.title || NODE_TYPE_INFO[n.type].label}${n.id === s.startNodeId ? ' (início)' : ''}${n.type === 'final' ? ' — FINAL' : ''}`;
      lines.push(head, '');
      if (!reach.has(n.id)) lines.push('*(nenhum caminho leva até aqui)*', '');
      if (n.type === 'fala') lines.push(`**${entries.get(n.speakerId ?? '')?.name?.toUpperCase() ?? 'ALGUÉM'}:** ${md(n.text)}`, '');
      else if (n.text.trim()) lines.push(md(n.text), '');
      for (const e of n.effects) {
        const v = vars.get(e.varId);
        if (v) lines.push(`> ⚙ \`${v.name}\` ${e.op === 'set' ? '=' : e.op === 'add' ? '+=' : e.op === 'sub' ? '-=' : 'inverte'} ${e.op === 'toggle' ? '' : fmt(e.value)}`);
      }
      if (n.effects.length) lines.push('');
      if (n.type !== 'final') {
        for (const c of n.choices) {
          const cond = c.condition && vars.get(c.condition.varId)
            ? ` *(se \`${vars.get(c.condition.varId)!.name}\` ${c.condition.op} ${fmt(c.condition.value)})*`
            : '';
          lines.push(`- ${c.text.trim() || 'Continuar'} → ${c.targetId ? `§${num.get(c.targetId)}` : '(sem destino)'}${cond}`);
        }
        if (n.choices.length) lines.push('');
      }
    }
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/* ---------------- HTML jogável ---------------- */

const PLAYER_CSS = `
:root{color-scheme:dark;--bg:#14121c;--card:#1f1c2b;--line:#34304a;--text:#ece9f5;--muted:#9b97b0;--accent:#e0a458}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 50% -10%,#2a2340,var(--bg));color:var(--text);font:17px/1.65 Georgia,'Times New Roman',serif;min-height:100vh}
#app{max-width:760px;margin:0 auto;padding:32px 20px 80px}
button{font:inherit;color:inherit;cursor:pointer}
.menu-head h1{font-size:2.4rem;margin:.2em 0 0;letter-spacing:.02em}.genre{color:var(--accent);margin:.2em 0 1em;font-style:italic}
.premise{color:var(--muted);font-size:1.05rem;border-left:3px solid var(--accent);padding-left:14px}
.menu,.choices{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:10px}
.menu button,.choices button{width:100%;text-align:left;display:flex;gap:14px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;transition:.15s}
.menu button:hover,.choices button:hover{border-color:var(--accent);transform:translateX(3px)}
.menu small{display:block;color:var(--muted);font-size:.9rem;margin-top:2px}
.key{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#2c2840;color:var(--accent);font:600 13px system-ui,sans-serif;margin-top:1px}
.bar{display:flex;align-items:center;gap:12px;margin-bottom:22px;font-family:system-ui,sans-serif;font-size:14px}
.bar button{background:transparent;border:1px solid var(--line);border-radius:8px;padding:6px 12px;color:var(--muted)}
.bar button:disabled{opacity:.4;cursor:default}.bar .title{flex:1;text-align:center;color:var(--muted)}
.card{background:linear-gradient(180deg,#221e30,#1b1826);border:1px solid var(--line);border-radius:18px;padding:28px 30px;box-shadow:0 20px 60px #0006;animation:in .35s ease}
@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.speaker{display:flex;align-items:center;gap:12px;margin-bottom:12px}.speaker img,.avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--accent)}
.avatar{display:grid;place-items:center;background:#2c2840;color:var(--accent);font-weight:700}
.speaker strong{color:var(--accent);font-size:1.1rem;letter-spacing:.03em}
.text p{margin:0 0 .8em}.fala .text{font-style:italic}
.end{display:flex;flex-direction:column;align-items:center;gap:16px;margin-top:20px;color:var(--accent);letter-spacing:.1em}
.end button{background:var(--accent);color:#1a1424;border:0;border-radius:10px;padding:10px 20px;font-weight:700;letter-spacing:0}
.muted{color:var(--muted)}
footer{margin-top:40px;text-align:center;color:var(--muted);font:12px system-ui,sans-serif}
`;

export function toPlayableHtml(project: Project, storyIds: Id[]): string {
  const stories = project.stories.filter((s) => storyIds.includes(s.id) && s.startNodeId);
  const speakerIds = new Set(stories.flatMap((s) => s.nodes.map((n) => n.speakerId).filter((x): x is Id => !!x)));
  const characters = Object.fromEntries(
    project.entries.filter((e) => speakerIds.has(e.id)).map((e) => [e.id, { name: e.name, image: e.image ?? null }]),
  );
  const data = {
    title: project.name,
    genre: project.genre,
    premise: project.premise,
    variables: project.variables.map(({ id, name, type, initial }) => ({ id, name, type, initial })),
    characters,
    stories: stories.map((s) => ({ id: s.id, name: s.name, synopsis: s.synopsis, startNodeId: s.startNodeId, nodes: s.nodes })),
  };
  // impede que o texto do usuário feche a tag <script>
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const title = project.name.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${PLAYER_CSS}</style>
</head>
<body>
<div id="app"></div>
<footer>Feito com LoreCreator</footer>
<script type="application/json" id="lore-data">${json}</script>
<script type="module">
${runtimeSource}
${playerSource}
</script>
</body>
</html>
`;
}
