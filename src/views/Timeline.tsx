/** Linha do tempo: entradas do tipo Evento, em ordem. */
import { RichText } from '../components/text';
import { newEntry } from '../model/factory';
import { KIND_INFO, type Entry } from '../model/types';
import { update, useProject } from '../store/store';
import { goEntry } from '../store/ui';

export function Timeline() {
  const project = useProject();
  const events = project.entries
    .filter((e) => e.kind === 'evento')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
  const byId = new Map(project.entries.map((e) => [e.id, e]));

  const add = (after?: Entry) => {
    const e = newEntry('evento');
    update((d) => {
      // abre espaço depois do evento escolhido (ou no fim)
      const base = after ? (after.order ?? 0) + 1 : Math.max(-1, ...events.map((x) => x.order ?? 0)) + 1;
      for (const x of d.entries) if (x.kind === 'evento' && (x.order ?? 0) >= base) x.order = (x.order ?? 0) + 1;
      e.order = base;
      d.entries.push(e);
    });
    goEntry(e.id);
  };

  /** troca a posição de dois eventos vizinhos e renumera tudo em sequência */
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= events.length) return;
    const ids = events.map((e) => e.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    update((d) => {
      ids.forEach((id, i) => {
        const x = d.entries.find((e) => e.id === id);
        if (x) x.order = i;
      });
    });
  };

  return (
    <div className="page timeline-page">
      <div className="section-head">
        <div>
          <h2>Linha do tempo</h2>
          <p className="muted">Os eventos do codex em ordem cronológica.</p>
        </div>
        <button className="btn primary" onClick={() => add()}>＋ Novo evento</button>
      </div>
      {events.length === 0 ? (
        <div className="empty">
          <p>Nenhum evento ainda.</p>
          <p className="muted">Guerras, fundações, catástrofes, nascimentos… tudo que aconteceu antes (ou durante) o jogo.</p>
        </div>
      ) : (
        <ol className="timeline">
          {events.map((e, i) => (
            <li key={e.id} className="tl-item">
              <div className="tl-when">{e.when || <span className="muted">sem data</span>}</div>
              <div className="tl-dot" />
              <div className="tl-card" onClick={() => goEntry(e.id)}>
                <div className="tl-top">
                  <h3>{e.name}</h3>
                  <div className="tl-actions" onClick={(ev) => ev.stopPropagation()}>
                    <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Mover para antes">↑</button>
                    <button className="icon-btn" disabled={i === events.length - 1} onClick={() => move(i, 1)} title="Mover para depois">↓</button>
                    <button className="icon-btn" onClick={() => add(e)} title="Inserir evento depois deste">＋</button>
                  </div>
                </div>
                {e.summary && <p>{e.summary}</p>}
                {e.body && (
                  <div className="tl-body" onClick={(ev) => ev.stopPropagation()}>
                    <RichText text={e.body.length > 280 ? `${e.body.slice(0, 280)}…` : e.body} />
                  </div>
                )}
                {e.relations.length > 0 && (
                  <div className="tl-rel" onClick={(ev) => ev.stopPropagation()}>
                    {e.relations.map((r) => {
                      const t = byId.get(r.targetId);
                      return t ? (
                        <button key={r.id} className="chip" onClick={() => goEntry(t.id)} style={{ color: KIND_INFO[t.kind].color }}>
                          {r.label && <span className="muted">{r.label} </span>}
                          {KIND_INFO[t.kind].icon} {t.name}
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
