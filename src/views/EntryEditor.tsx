/** Editor de uma entrada do codex (personagem, local, facção…). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { alertDialog, confirmDialog } from '../components/dialogs';
import { LoreTextarea, NumInput, RichText, TagInput } from '../components/text';
import { newEntry, uid } from '../model/factory';
import { backlinks, renameLinks } from '../model/links';
import { ENTRY_KINDS, KIND_INFO, type Entry, type EntryKind } from '../model/types';
import { update, useProject } from '../store/store';
import { goEntry, goStory, setUi } from '../store/ui';
import { imageFileToDataUrl } from '../util';

export function EntryEditor({ entry }: { entry: Entry }) {
  const project = useProject();
  const [name, setName] = useState(entry.name);
  const [preview, setPreview] = useState(entry.body.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  // desfazer/refazer pode trocar o nome por fora
  useEffect(() => setName(entry.name), [entry.name]);
  const info = KIND_INFO[entry.kind];
  const links = useMemo(() => backlinks(project, entry), [project, entry]);
  const others = useMemo(
    () => project.entries.filter((e) => e.id !== entry.id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [project.entries, entry.id],
  );

  /** muda a entrada; `key` agrupa a digitação em um só passo de desfazer */
  const edit = (fn: (e: Entry) => void, key?: string) =>
    update((d) => {
      const e = d.entries.find((x) => x.id === entry.id);
      if (!e) return;
      fn(e as Entry);
      e.updatedAt = Date.now();
    }, key && `${entry.id}:${key}`);

  const commitName = () => {
    const next = name.trim();
    if (!next) {
      setName(entry.name);
      return;
    }
    if (next === entry.name) return;
    const old = entry.name;
    update((d) => {
      const e = d.entries.find((x) => x.id === entry.id);
      if (e) e.name = next;
      // mantém os [[links]] apontando para a entrada renomeada
      for (const x of d.entries) {
        x.body = renameLinks(x.body, old, next);
        x.summary = renameLinks(x.summary, old, next);
      }
      for (const s of d.stories) for (const n of s.nodes) n.text = renameLinks(n.text, old, next);
    });
  };

  const changeKind = (kind: EntryKind) =>
    edit((e) => {
      e.kind = kind;
      // acrescenta os campos sugeridos do novo tipo sem perder os que já existem
      for (const key of KIND_INFO[kind].fields) if (!e.fields.some((f) => f.key === key)) e.fields.push({ key, value: '' });
      if (kind === 'evento') {
        e.when ??= '';
        e.order ??= Math.max(0, ...project.entries.filter((x) => x.kind === 'evento').map((x) => (x.order ?? 0) + 1));
      }
    });

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await imageFileToDataUrl(file);
      edit((e) => {
        e.image = url;
      });
    } catch (err) {
      await alertDialog('Imagem inválida', err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Excluir "${entry.name}"?`,
      message: 'As relações com esta entrada serão removidas e as falas deste personagem ficarão sem personagem. Dá para desfazer com Ctrl+Z.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    update((d) => {
      d.entries = d.entries.filter((e) => e.id !== entry.id);
      for (const e of d.entries) e.relations = e.relations.filter((r) => r.targetId !== entry.id);
      for (const s of d.stories) for (const n of s.nodes) if (n.speakerId === entry.id) delete n.speakerId;
    });
    setUi({ entryId: null });
  };

  const duplicate = () => {
    const copy: Entry = { ...structuredClone(entry), id: uid(), name: `${entry.name} (cópia)`, createdAt: Date.now(), updatedAt: Date.now() };
    copy.relations = copy.relations.map((r) => ({ ...r, id: uid() }));
    delete copy.mapPos;
    update((d) => {
      d.entries.push(copy);
    });
    goEntry(copy.id);
  };

  const createMissing = async (missing: string) => {
    const ok = await confirmDialog({ title: `Criar "${missing}" no codex?`, message: 'A entrada nasce como Conceito; troque o tipo depois se quiser.', confirmLabel: 'Criar' });
    if (!ok) return;
    const e = newEntry('conceito', missing);
    update((d) => {
      d.entries.push(e);
    });
    goEntry(e.id);
  };

  return (
    <div className="entry-editor" style={{ ['--kind' as string]: info.color }}>
      <header className="entry-head">
        <button className="portrait" onClick={() => fileRef.current?.click()} title="Escolher imagem">
          {entry.image ? <img src={entry.image} alt="" /> : <span>{info.icon}<small>Imagem</small></span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
          void pickImage(e.target.files?.[0]);
          e.target.value = '';
        }} />
        <div className="entry-head-main">
          <div className="row gap">
            <select className="kind-select" value={entry.kind} onChange={(e) => changeKind(e.target.value as EntryKind)} aria-label="Tipo">
              {ENTRY_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_INFO[k].icon} {KIND_INFO[k].label}</option>
              ))}
            </select>
            {entry.image && (
              <button className="btn ghost small" onClick={() => edit((e) => { delete e.image; })}>Remover imagem</button>
            )}
          </div>
          <input className="title-input" value={name} aria-label="Nome" onChange={(e) => setName(e.target.value)} onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          <input className="input summary" value={entry.summary} placeholder="Resumo em uma linha" aria-label="Resumo"
            onChange={(e) => edit((x) => { x.summary = e.target.value; }, 'summary')} />
          <TagInput tags={entry.tags} onChange={(tags) => edit((x) => { x.tags = tags; })} />
        </div>
      </header>

      {entry.kind === 'evento' && (
        <section className="card">
          <h3>Na linha do tempo</h3>
          <div className="row gap">
            <label className="field grow">
              <span>Quando</span>
              <input className="input" value={entry.when ?? ''} placeholder="Ex.: Ano 312 da Segunda Era"
                onChange={(e) => edit((x) => { x.when = e.target.value; }, 'when')} />
            </label>
            <label className="field narrow">
              <span>Ordem</span>
              <NumInput value={entry.order ?? 0} onChange={(n) => edit((x) => { x.order = n; }, 'order')} />
            </label>
          </div>
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h3>Ficha</h3>
          <button className="btn ghost small" onClick={() => edit((x) => { x.fields.push({ key: 'Novo campo', value: '' }); })}>＋ Campo</button>
        </div>
        {entry.fields.length === 0 && <p className="muted small">Sem campos. Adicione atributos como idade, região, poder…</p>}
        <div className="fields">
          {entry.fields.map((f, i) => (
            <div key={i} className="field-row">
              <input className="input key" value={f.key} aria-label="Nome do campo"
                onChange={(e) => edit((x) => { x.fields[i].key = e.target.value; }, `fk${i}`)} />
              <input className="input" value={f.value} placeholder="—" aria-label={f.key}
                onChange={(e) => edit((x) => { x.fields[i].value = e.target.value; }, `fv${i}`)} />
              <button className="icon-btn" title="Remover campo" onClick={() => edit((x) => { x.fields.splice(i, 1); })}>✕</button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h3>Descrição</h3>
          <div className="segmented">
            <button className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>Editar</button>
            <button className={preview ? 'active' : ''} onClick={() => setPreview(true)}>Visualizar</button>
          </div>
        </div>
        {preview ? (
          <div className="preview-box" onDoubleClick={() => setPreview(false)} title="Clique duas vezes para editar">
            <RichText text={entry.body} onMissing={(n) => void createMissing(n)} />
          </div>
        ) : (
          <LoreTextarea rows={10} value={entry.body}
            placeholder="História, aparência, personalidade… Use [[Nome]] para ligar a outras entradas."
            onChange={(v) => edit((x) => { x.body = v; }, 'body')} />
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h3>Relações</h3>
          <button className="btn ghost small" disabled={others.length === 0}
            onClick={() => edit((x) => { x.relations.push({ id: uid(), label: '', targetId: others[0].id }); })}>
            ＋ Relação
          </button>
        </div>
        {entry.relations.length === 0 && <p className="muted small">Ligue esta entrada a outras: "irmã de", "mora em", "líder de"…</p>}
        {entry.relations.map((r, i) => (
          <div key={r.id} className="relation-row">
            <span className="muted">{entry.name}</span>
            <input className="input" value={r.label} placeholder="relação (ex.: aliado de)" aria-label="Relação"
              onChange={(e) => edit((x) => { x.relations[i].label = e.target.value; }, `rl${r.id}`)} />
            <select className="input" value={r.targetId} aria-label="Com quem"
              onChange={(e) => edit((x) => { x.relations[i].targetId = e.target.value; })}>
              {others.map((o) => (
                <option key={o.id} value={o.id}>{KIND_INFO[o.kind].icon} {o.name}</option>
              ))}
            </select>
            <button className="icon-btn" title="Abrir" onClick={() => goEntry(r.targetId)}>→</button>
            <button className="icon-btn" title="Remover relação" onClick={() => edit((x) => { x.relations.splice(i, 1); })}>✕</button>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Aparece em</h3>
        {links.length === 0 ? (
          <p className="muted small">Nenhuma outra entrada ou história menciona "{entry.name}" ainda.</p>
        ) : (
          <ul className="backlinks">
            {links.map((l, i) => (
              <li key={i}>
                <button onClick={() => (l.storyId ? goStory(l.storyId, l.nodeId ?? null) : l.entryId && goEntry(l.entryId))}>
                  <span className="muted small">{l.kind === 'historia' ? '🎭' : l.kind === 'relacao' ? '🔗' : '📖'}</span> {l.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="entry-foot">
        <button className="btn ghost" onClick={duplicate}>Duplicar</button>
        <button className="btn ghost danger-text" onClick={() => void remove()}>Excluir entrada</button>
      </footer>
    </div>
  );
}
