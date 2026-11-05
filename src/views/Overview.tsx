import { analyzeStory } from '../engine/analyze';
import { newEntry, newStory } from '../model/factory';
import { ENTRY_KINDS, KIND_INFO } from '../model/types';
import { update, useProject } from '../store/store';
import { goEntry, goStory, setUi } from '../store/ui';
import { formatDate, plural } from '../util';

export function Overview() {
  const project = useProject();
  const recent = [...project.entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const issues = project.stories.reduce((n, s) => n + analyzeStory(s, project).filter((i) => i.level === 'erro').length, 0);
  const endings = project.stories.reduce((n, s) => n + s.nodes.filter((x) => x.type === 'final').length, 0);

  const addEntry = (kind: (typeof ENTRY_KINDS)[number]) => {
    const e = newEntry(kind);
    update((d) => {
      d.entries.push(e);
    });
    goEntry(e.id);
  };
  const addStory = () => {
    const s = newStory(`História ${project.stories.length + 1}`);
    update((d) => {
      d.stories.push(s);
    });
    goStory(s.id);
  };

  return (
    <div className="page overview">
      <section className="hero-card">
        <input className="title-input" value={project.name} aria-label="Nome do projeto"
          onChange={(e) => update((d) => { d.name = e.target.value; }, 'project-name')} />
        <input className="genre-input" value={project.genre} placeholder="Gênero (ex.: Fantasia sombria · RPG)" aria-label="Gênero"
          onChange={(e) => update((d) => { d.genre = e.target.value; }, 'project-genre')} />
        <label className="field">
          <span>Premissa</span>
          <textarea className="input premise" rows={3} value={project.premise}
            placeholder="Sobre o que é o seu jogo? Quem é o protagonista, o que ele quer e o que está em jogo?"
            onChange={(e) => update((d) => { d.premise = e.target.value; }, 'project-premise')} />
        </label>
      </section>

      <section className="stats">
        {ENTRY_KINDS.map((k) => (
          <button key={k} className="stat" style={{ ['--c' as string]: KIND_INFO[k].color }} onClick={() => setUi({ view: 'codex', kind: k, entryId: null })}>
            <span className="stat-icon">{KIND_INFO[k].icon}</span>
            <strong>{project.entries.filter((e) => e.kind === k).length}</strong>
            <span>{KIND_INFO[k].plural}</span>
          </button>
        ))}
        <button className="stat" style={{ ['--c' as string]: '#e8e6f0' }} onClick={() => setUi({ view: 'stories', storyId: null })}>
          <span className="stat-icon">🎭</span>
          <strong>{project.stories.length}</strong>
          <span>{plural(endings, 'final', 'finais')}</span>
        </button>
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Criar</h3>
          <div className="quick-add">
            {ENTRY_KINDS.map((k) => (
              <button key={k} className="btn" onClick={() => addEntry(k)}>
                {KIND_INFO[k].icon} {KIND_INFO[k].label}
              </button>
            ))}
            <button className="btn primary" onClick={addStory}>🎭 Nova história</button>
          </div>
          {issues > 0 && (
            <p className="warn-line">
              ⚠ {plural(issues, 'problema', 'problemas')} nas histórias (escolhas sem destino, variáveis apagadas…). Abra a história para ver.
            </p>
          )}
        </section>
        <section className="card">
          <h3>Editados recentemente</h3>
          {recent.length === 0 ? (
            <p className="muted">Nada por aqui ainda. Comece criando um personagem ou um local.</p>
          ) : (
            <ul className="recent-list">
              {recent.map((e) => (
                <li key={e.id}>
                  <button onClick={() => goEntry(e.id)}>
                    <span style={{ color: KIND_INFO[e.kind].color }}>{KIND_INFO[e.kind].icon}</span> {e.name}
                    <span className="muted small"> · {formatDate(e.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card tips">
        <h3>Dicas</h3>
        <ul>
          <li>Escreva <code>[[Nome]]</code> em qualquer texto para ligar a uma entrada do codex. Ex.: <code>[[Velmora]]</code> ou <code>[[Velmora|a cidade]]</code>.</li>
          <li>Nas histórias, <code>{'{nome_da_variavel}'}</code> mostra o valor da variável durante o jogo.</li>
          <li>Arraste de uma escolha para um espaço vazio do quadro para criar o próximo nó já ligado.</li>
          <li>Tudo é salvo sozinho. <kbd>Ctrl Z</kbd> desfaz, <kbd>Ctrl K</kbd> busca em todo o projeto.</li>
        </ul>
      </section>
    </div>
  );
}
