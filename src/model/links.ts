/**
 * Ligações entre textos: [[Nome]] ou [[Nome|texto exibido]] aponta para uma entrada do codex.
 */
import type { Entry, Id, Project } from './types';

const LINK_RE = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;

export function mentionedNames(text: string): string[] {
  return [...text.matchAll(LINK_RE)].map((m) => m[1].trim());
}

export function entryByName(project: Project): Map<string, Entry> {
  const map = new Map<string, Entry>();
  for (const e of project.entries) map.set(e.name.trim().toLowerCase(), e);
  return map;
}

export type Segment = { text: string } | { text: string; entry: Entry | null; name: string };

/** Quebra um texto em pedaços simples e links (resolvidos ou não). */
export function segments(text: string, names: Map<string, Entry>): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const name = m[1].trim();
    out.push({ text: (m[2] ?? m[1]).trim(), name, entry: names.get(name.toLowerCase()) ?? null });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export interface Backlink {
  kind: 'entrada' | 'relacao' | 'historia';
  label: string;
  entryId?: Id;
  storyId?: Id;
  nodeId?: Id;
}

/** Onde uma entrada aparece: outras entradas, relações e falas/menções nas histórias. */
export function backlinks(project: Project, target: Entry): Backlink[] {
  const name = target.name.trim().toLowerCase();
  const mentions = (text: string) => mentionedNames(text).some((n) => n.toLowerCase() === name);
  const out: Backlink[] = [];
  for (const e of project.entries) {
    if (e.id === target.id) continue;
    const rel = e.relations.find((r) => r.targetId === target.id);
    if (rel) out.push({ kind: 'relacao', label: `${e.name} — ${rel.label || 'relacionado'}`, entryId: e.id });
    else if (mentions(e.body) || mentions(e.summary)) out.push({ kind: 'entrada', label: e.name, entryId: e.id });
  }
  for (const s of project.stories) {
    const nodes = s.nodes.filter((n) => n.speakerId === target.id || mentions(n.text));
    if (nodes.length) {
      out.push({
        kind: 'historia',
        label: `${s.name} (${nodes.length} ${nodes.length === 1 ? 'nó' : 'nós'})`,
        storyId: s.id,
        nodeId: nodes[0].id,
      });
    }
  }
  return out;
}

/** Ao renomear uma entrada, atualiza os [[links]] que usavam o nome antigo. */
export function renameLinks(text: string, oldName: string, newName: string): string {
  const old = oldName.trim().toLowerCase();
  if (!old || !newName.trim()) return text;
  return text.replace(LINK_RE, (all, name: string, alias?: string) =>
    name.trim().toLowerCase() === old ? `[[${newName.trim()}${alias ? `|${alias}` : ''}]]` : all);
}
