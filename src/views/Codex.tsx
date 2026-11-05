/** Codex: lista de entradas do mundo + editor da entrada selecionada. */
import { useMemo, useState } from 'react';
import { newEntry } from '../model/factory';
import { ENTRY_KINDS, KIND_INFO, type EntryKind } from '../model/types';
import { update, useProject } from '../store/store';
import { setUi, useUi } from '../store/ui';
import { fold } from '../util';
import { EntryEditor } from './EntryEditor';

export function Codex() {
  const project = useProject();
  const kind = useUi((s) => s.kind);
  const entryId = useUi((s) => s.entryId);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const allTags = useMemo(() => [...new Set(project.entries.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [project.entries]);
  const list = useMemo(() => {
    const q = fold(query.trim());
    return project.entries
      .filter((e) => kind === 'all' || e.kind === kind)
      .filter((e) => !tag || e.tags.includes(tag))
      .filter((e) => !q || fold(`${e.name} ${e.summary} ${e.tags.join(' ')}`).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [project.entries, kind, query, tag]);

  const selected = project.entries.find((e) => e.id === entryId) ?? null;

  const create = (k: EntryKind) => {
    const e = newEntry(k);
    update((d) => {
      d.entries.push(e);
    });
    setUi({ entryId: e.id, kind: kind === 'all' ? 'all' : k });
  };

  return (
    <div className="codex">
      <div className="list-panel">
        <div className="list-head">
          <h2>{kind === 'all' ? 'Codex' : KIND_INFO[kind].plural}</h2>
          {kind === 'all' ? (
            <select className="btn primary small" value="" aria-label="Nova entrada" onChange={(e) => e.target.value && create(e.target.value as EntryKind)}>
              <option value="">＋ Nova…</option>
              {ENTRY_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_INFO[k].icon} {KIND_INFO[k].label}</option>
              ))}
            </select>
          ) : (
            <button className="btn primary small" onClick={() => create(kind)}>＋ Novo</button>
          )}
        </div>
        <input className="input search" placeholder="Filtrar…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips">
          <button className={`chip${kind === 'all' ? ' active' : ''}`} onClick={() => setUi({ kind: 'all' })}>Tudo</button>
          {ENTRY_KINDS.map((k) => (
            <button key={k} className={`chip${kind === k ? ' active' : ''}`} onClick={() => setUi({ kind: k })} title={KIND_INFO[k].plural}>
              {KIND_INFO[k].icon}
            </button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="chips tags">
            {allTags.map((t) => (
              <button key={t} className={`chip tag-chip${tag === t ? ' active' : ''}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>
            ))}
          </div>
        )}
        <ul className="entry-list">
          {list.map((e) => (
            <li key={e.id}>
              <button className={`entry-item${e.id === entryId ? ' active' : ''}`} onClick={() => setUi({ entryId: e.id })}>
                {e.image ? (
                  <img src={e.image} alt="" className="thumb" />
                ) : (
                  <span className="thumb icon" style={{ color: KIND_INFO[e.kind].color }}>{KIND_INFO[e.kind].icon}</span>
                )}
                <span className="entry-text">
                  <strong>{e.name || 'Sem nome'}</strong>
                  <span className="muted small">{e.summary || KIND_INFO[e.kind].label}</span>
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted empty-list">Nenhuma entrada {query || tag ? 'encontrada' : 'ainda'}.</li>}
        </ul>
      </div>
      <div className="editor-panel">
        {selected ? (
          <EntryEditor key={selected.id} entry={selected} />
        ) : (
          <div className="placeholder">
            <p>Selecione uma entrada na lista ou crie uma nova.</p>
            <div className="quick-add">
              {ENTRY_KINDS.map((k) => (
                <button key={k} className="btn" onClick={() => create(k)}>{KIND_INFO[k].icon} {KIND_INFO[k].label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
