/** Busca em todo o projeto (Ctrl+K): entradas, histórias, falas e variáveis. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { nodeLabel } from '../engine/analyze';
import { KIND_INFO, NODE_TYPE_INFO } from '../model/types';
import { useProject } from '../store/store';
import { goEntry, goStory, setUi, useUi } from '../store/ui';
import { fold } from '../util';

interface Result {
  key: string;
  icon: string;
  color?: string;
  title: string;
  detail: string;
  score: number;
  open: () => void;
}

function snippet(text: string, q: string) {
  const i = fold(text).indexOf(q);
  if (i < 0) return text.slice(0, 80);
  const start = Math.max(0, i - 30);
  return `${start > 0 ? '…' : ''}${text.slice(start, i + q.length + 50)}${i + q.length + 50 < text.length ? '…' : ''}`;
}

export function SearchPalette() {
  const open = useUi((s) => s.searchOpen);
  const project = useProject();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = fold(query.trim());
    if (!q) return [];
    const out: Result[] = [];
    for (const e of project.entries) {
      const name = fold(e.name);
      const rest = fold(`${e.summary} ${e.tags.join(' ')} ${e.fields.map((f) => f.value).join(' ')} ${e.body}`);
      if (!name.includes(q) && !rest.includes(q)) continue;
      out.push({
        key: e.id,
        icon: KIND_INFO[e.kind].icon,
        color: KIND_INFO[e.kind].color,
        title: e.name,
        detail: name.includes(q) ? e.summary || KIND_INFO[e.kind].label : snippet(`${e.summary} ${e.body}`, q),
        score: name.startsWith(q) ? 0 : name.includes(q) ? 1 : 3,
        open: () => goEntry(e.id),
      });
    }
    for (const s of project.stories) {
      if (fold(s.name).includes(q)) {
        out.push({ key: s.id, icon: '🎭', title: s.name, detail: s.synopsis || 'História', score: 1, open: () => goStory(s.id) });
      }
      for (const n of s.nodes) {
        if (!fold(`${n.title} ${n.text} ${n.choices.map((c) => c.text).join(' ')}`).includes(q)) continue;
        out.push({
          key: n.id,
          icon: '›',
          color: NODE_TYPE_INFO[n.type].color,
          title: `${s.name} › ${nodeLabel(n, 40)}`,
          detail: snippet(n.text, q),
          score: 4,
          open: () => goStory(s.id, n.id),
        });
      }
    }
    for (const v of project.variables) {
      if (fold(`${v.name} ${v.description}`).includes(q)) {
        out.push({ key: v.id, icon: '⚙', title: v.name, detail: v.description || 'Variável', score: 2, open: () => setUi({ view: 'variables' }) });
      }
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 40);
  }, [query, project]);

  if (!open) return null;
  const close = () => setUi({ searchOpen: false });
  const go = (r: Result | undefined) => {
    if (!r) return;
    close();
    r.open();
  };

  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Buscar">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Buscar personagens, locais, falas, variáveis…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') go(results[active]);
          }}
        />
        <ul className="palette-results">
          {results.map((r, i) => (
            <li key={r.key}>
              <button className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
                <span className="p-icon" style={{ color: r.color }}>{r.icon}</span>
                <span className="p-text">
                  <strong>{r.title}</strong>
                  <span className="muted small">{r.detail}</span>
                </span>
              </button>
            </li>
          ))}
          {query.trim() && results.length === 0 && <li className="muted p-empty">Nada encontrado para "{query}".</li>}
          {!query.trim() && <li className="muted p-empty">Digite para buscar em todo o projeto.</li>}
        </ul>
      </div>
    </div>
  );
}
