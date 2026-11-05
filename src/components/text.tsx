/** Campos de texto com [[links]]: autocompletar ao digitar e visualização com links clicáveis. */
import { useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { entryByName, segments } from '../model/links';
import { KIND_INFO, type Entry } from '../model/types';
import { useProject } from '../store/store';
import { goEntry } from '../store/ui';
import { fold } from '../util';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
};

/** Textarea que sugere entradas do codex depois de digitar "[[". */
export function LoreTextarea({ value, onChange, onKeyDown, className, ...rest }: Props) {
  const project = useProject();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = fold(query);
    return project.entries.filter((e) => fold(e.name).includes(q)).slice(0, 8);
  }, [query, project.entries]);

  const detect = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const m = /\[\[([^[\]\n|]*)$/.exec(before);
    setQuery(m ? m[1] : null);
    setActive(0);
  };

  const insert = (entry: Entry) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/\[\[([^[\]\n|]*)$/, '');
    let after = value.slice(caret);
    if (after.startsWith(']]')) after = after.slice(2);
    const link = `[[${entry.name}]]`;
    onChange(before + link + after);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + link.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query !== null && matches.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insert(matches[active]);
        return;
      }
    }
    if (e.key === 'Escape' && query !== null) {
      e.stopPropagation();
      setQuery(null);
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="lore-textarea">
      <textarea
        {...rest}
        ref={ref}
        className={className ?? 'input'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target);
        }}
        onKeyDown={keyDown}
        onClick={(e) => detect(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {query !== null && matches.length > 0 && (
        <ul className="suggest" role="listbox">
          {matches.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(m);
              }}>
              <span style={{ color: KIND_INFO[m.kind].color }}>{KIND_INFO[m.kind].icon}</span> {m.name}
              <span className="muted small"> · {KIND_INFO[m.kind].label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mostra um texto com os [[links]] clicáveis (links quebrados aparecem em vermelho). */
export function RichText({ text, onMissing }: { text: string; onMissing?: (name: string) => void }) {
  const project = useProject();
  const names = useMemo(() => entryByName(project), [project]);
  if (!text.trim()) return <p className="muted">Nada escrito ainda.</p>;
  return (
    <div className="rich-text">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {segments(para, names).map((s, j) =>
            'name' in s ? (
              s.entry ? (
                <button key={j} className="lore-link" style={{ color: KIND_INFO[s.entry.kind].color }} onClick={() => goEntry(s.entry!.id)}
                  title={s.entry.summary || s.entry.name}>
                  {s.text}
                </button>
              ) : (
                <button key={j} className="lore-link missing" onClick={() => onMissing?.(s.name)}
                  title={onMissing ? `"${s.name}" ainda não existe no codex — clique para criar` : `"${s.name}" não existe no codex`}>
                  {s.text}
                </button>
              )
            ) : (
              <span key={j}>{s.text}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = (raw: string) => {
    const next = [...tags];
    for (const t of raw.split(',').map((s) => s.trim()).filter(Boolean)) if (!next.includes(t)) next.push(t);
    if (next.length !== tags.length) onChange(next);
    setDraft('');
  };
  const add = () => commit(draft);
  return (
    <div className="tag-input">
      {tags.map((t) => (
        <span key={t} className="tag">
          {t}
          <button aria-label={`Remover ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>✕</button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={tags.length ? '' : 'Adicionar tag…'}
        onChange={(e) => (e.target.value.includes(',') ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

/** Campo numérico que deixa digitar "-" e "1." sem apagar o que foi digitado. */
export function NumInput({ value, onChange, className = 'input', ...rest }: { value: number; onChange: (n: number) => void; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      className={className}
      inputMode="decimal"
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.');
        setDraft(raw);
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
