/** Diálogos simples (alerta, confirmação, pergunta) usados como promessas. */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

interface DialogReq {
  id: number;
  title: string;
  message?: string;
  kind: 'alert' | 'confirm' | 'prompt';
  confirmLabel?: string;
  danger?: boolean;
  initial?: string;
  placeholder?: string;
  resolve: (v: unknown) => void;
}

let queue: DialogReq[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function push(req: Omit<DialogReq, 'id' | 'resolve'>) {
  return new Promise<unknown>((resolve) => {
    queue = [...queue, { ...req, id: nextId++, resolve }];
    for (const l of listeners) l();
  });
}

function pop(value: unknown) {
  const [first, ...rest] = queue;
  queue = rest;
  first?.resolve(value);
  for (const l of listeners) l();
}

export const alertDialog = (title: string, message?: string) => push({ kind: 'alert', title, message }).then(() => undefined);

export const confirmDialog = (opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) =>
  push({ kind: 'confirm', ...opts }) as Promise<boolean>;

export const promptDialog = (opts: { title: string; message?: string; initial?: string; placeholder?: string; confirmLabel?: string }) =>
  push({ kind: 'prompt', ...opts }) as Promise<string | null>;

export function Modal({ title, onClose, children, wide, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function DialogHost() {
  const req = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => queue[0] ?? null,
  );
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!req) return;
    setText(req.initial ?? '');
    setTimeout(() => (req.kind === 'prompt' ? inputRef.current?.select() : okRef.current?.focus()), 0);
  }, [req]);

  if (!req) return null;
  const cancel = () => pop(req.kind === 'confirm' ? false : req.kind === 'prompt' ? null : undefined);
  const ok = () => pop(req.kind === 'confirm' ? true : req.kind === 'prompt' ? text : undefined);

  return (
    <Modal
      title={req.title}
      onClose={cancel}
      footer={
        <>
          {req.kind !== 'alert' && <button className="btn ghost" onClick={cancel}>Cancelar</button>}
          <button ref={okRef} className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={ok}>
            {req.confirmLabel ?? 'OK'}
          </button>
        </>
      }
    >
      {req.message && <p className="dialog-message">{req.message}</p>}
      {req.kind === 'prompt' && (
        <input
          ref={inputRef}
          className="input"
          value={text}
          placeholder={req.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok()}
        />
      )}
    </Modal>
  );
}
