/** Modo "Testar": joga a história como o jogador veria, com as variáveis à mostra. */
import { useEffect, useMemo, useState } from 'react';
import { choicesFor, enterNode, formatValue, initialVars, interpolate, type Vars } from '../engine/runtime';
import { entryByName, segments } from '../model/links';
import { KIND_INFO, type Id, type VarValue } from '../model/types';
import { useProject } from '../store/store';
import { goStory, setUi, useUi } from '../store/ui';
import { ValueInput } from '../views/Variables';

interface Step {
  nodeId: Id;
  vars: Vars;
  /** texto da escolha que levou até aqui */
  via?: string;
}

export function Playtest() {
  const project = useProject();
  const pt = useUi((s) => s.playtest)!;
  const story = project.stories.find((s) => s.id === pt.storyId);
  const names = useMemo(() => entryByName(project), [project]);
  const [showLocked, setShowLocked] = useState(true);

  const begin = (): Step[] => {
    const first = pt.fromNodeId ?? story?.startNodeId;
    if (!story || !first) return [];
    const { vars } = enterNode(story, first, initialVars(project.variables), project.variables);
    return [{ nodeId: first, vars }];
  };
  const [steps, setSteps] = useState<Step[]>(begin);

  const current = steps[steps.length - 1];
  const node = story?.nodes.find((n) => n.id === current?.nodeId) ?? null;
  const speaker = node?.speakerId ? project.entries.find((e) => e.id === node.speakerId) : undefined;
  const options = node && node.type !== 'final' ? choicesFor(node, current.vars) : [];
  const visible = options.filter((o) => showLocked || !o.locked);

  const close = () => setUi({ playtest: null });
  const restart = () => setSteps(begin());
  const back = () => setSteps((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const choose = (i: number) => {
    const o = visible[i];
    if (!story || !o?.ok || !o.choice.targetId) return;
    const { vars } = enterNode(story, o.choice.targetId, current.vars, project.variables);
    setSteps((s) => [...s, { nodeId: o.choice.targetId!, vars, via: o.choice.text.trim() || 'Continuar' }]);
  };
  const setVar = (id: Id, value: VarValue) =>
    setSteps((s) => [...s.slice(0, -1), { ...s[s.length - 1], vars: { ...s[s.length - 1].vars, [id]: value } }]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') close();
      else if (e.key === 'Backspace') back();
      else if (/^[1-9]$/.test(e.key)) choose(Number(e.key) - 1);
      else if (e.key === 'Enter' && visible.length === 1) choose(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!story || !node) {
    return (
      <div className="playtest">
        <div className="pt-empty">
          <p>Esta história não tem um nó inicial.</p>
          <button className="btn" onClick={close}>Fechar</button>
        </div>
      </div>
    );
  }

  const text = interpolate(node.text, current.vars, project.variables);

  return (
    <div className="playtest" role="dialog" aria-label={`Testando ${story.name}`}>
      <header className="pt-bar">
        <strong>▶ {story.name}</strong>
        <span className="muted small">Testando{pt.fromNodeId ? ' a partir de um nó' : ''} · teclas 1–9 escolhem · Backspace volta · Esc fecha</span>
        <div className="row gap-s">
          <button className="btn small ghost" onClick={back} disabled={steps.length < 2}>↶ Voltar</button>
          <button className="btn small ghost" onClick={restart}>⟲ Recomeçar</button>
          <button className="btn small" onClick={() => {
            close();
            goStory(story.id, node.id);
          }}>✎ Editar este nó</button>
          <button className="icon-btn" onClick={close} aria-label="Fechar">✕</button>
        </div>
      </header>
      <div className="pt-body">
        <main className="pt-stage">
          <article className={`pt-card type-${node.type}`}>
            {node.type === 'fala' && (
              <div className="pt-speaker">
                {speaker?.image ? <img src={speaker.image} alt="" /> : <span className="pt-avatar">{speaker?.name.slice(0, 1) ?? '?'}</span>}
                <strong>{speaker?.name ?? 'Alguém'}</strong>
              </div>
            )}
            <div className="pt-text">
              {text.split(/\n+/).map((para, i) => (
                <p key={i}>
                  {segments(para, names).map((s, j) =>
                    'name' in s ? (
                      <span key={j} className="pt-link" style={s.entry ? { color: KIND_INFO[s.entry.kind].color } : undefined} title={s.entry?.summary}>
                        {s.text}
                      </span>
                    ) : (
                      <span key={j}>{s.text}</span>
                    ),
                  )}
                </p>
              ))}
            </div>
            {node.type === 'final' ? (
              <div className="pt-end">
                <span>— FIM{node.title ? `: ${node.title}` : ''} —</span>
                <button className="btn primary" onClick={restart}>⟲ Jogar de novo</button>
              </div>
            ) : (
              <ol className="pt-choices">
                {visible.map((o, i) => (
                  <li key={o.choice.id}>
                    <button disabled={!o.ok} onClick={() => choose(i)} className={o.locked ? 'locked' : ''}>
                      <span className="pt-key">{i + 1}</span>
                      <span>{interpolate(o.choice.text.trim() || 'Continuar', current.vars, project.variables)}</span>
                      {o.locked && <span className="pt-why">🔒 condição não cumprida</span>}
                      {!o.locked && !o.choice.targetId && <span className="pt-why">sem destino</span>}
                    </button>
                  </li>
                ))}
                {visible.length === 0 && <li className="muted">Beco sem saída: nenhuma escolha disponível aqui.</li>}
              </ol>
            )}
          </article>
        </main>
        <aside className="pt-side">
          <section>
            <h4>Variáveis</h4>
            {project.variables.length === 0 && <p className="muted small">Este projeto não tem variáveis.</p>}
            {project.variables.map((v) => {
              const prev = steps.length > 1 ? steps[steps.length - 2].vars[v.id] : undefined;
              const changed = steps.length > 1 && prev !== current.vars[v.id];
              return (
                <div key={v.id} className={`pt-var${changed ? ' changed' : ''}`} title={v.description}>
                  <span className="mono">{v.name}</span>
                  <ValueInput small type={v.type} value={current.vars[v.id] ?? v.initial} onChange={(val) => setVar(v.id, val)} />
                  {changed && <span className="muted small">antes: {formatValue(prev!)}</span>}
                </div>
              );
            })}
            <label className="check small">
              <input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} /> Mostrar escolhas bloqueadas
            </label>
          </section>
          <section>
            <h4>Caminho ({steps.length})</h4>
            <ol className="pt-path">
              {steps.map((s, i) => {
                const n = story.nodes.find((x) => x.id === s.nodeId);
                return (
                  <li key={i}>
                    {s.via && <span className="muted small">“{s.via}” → </span>}
                    <button className="link-btn" onClick={() => setSteps(steps.slice(0, i + 1))} title="Voltar até aqui">
                      {n ? n.title || n.text.slice(0, 32) || '(vazio)' : '(apagado)'}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
