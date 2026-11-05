/** Lista de histórias do projeto (ou o editor da história escolhida). */
import { confirmDialog, promptDialog } from '../components/dialogs';
import { analyzeStory } from '../engine/analyze';
import { cloneChoice, newStory, uid } from '../model/factory';
import type { Story } from '../model/types';
import { update, useProject } from '../store/store';
import { goStory, setUi, useUi } from '../store/ui';
import { formatDate, plural } from '../util';
import { StoryEditor } from './StoryEditor';

export function Stories() {
  const project = useProject();
  const storyId = useUi((s) => s.storyId);
  const story = project.stories.find((s) => s.id === storyId);
  if (story) return <StoryEditor key={story.id} story={story} />;
  return <StoryList />;
}

/** Cópia com ids novos (escolhas continuam apontando para os nós copiados). */
function cloneStory(s: Story): Story {
  const ids = new Map(s.nodes.map((n) => [n.id, uid()]));
  return {
    ...structuredClone(s),
    id: uid(),
    name: `${s.name} (cópia)`,
    startNodeId: s.startNodeId ? ids.get(s.startNodeId) : undefined,
    nodes: s.nodes.map((n) => ({
      ...structuredClone(n),
      id: ids.get(n.id)!,
      choices: n.choices.map((c) => ({ ...cloneChoice(c), targetId: c.targetId ? ids.get(c.targetId) : undefined })),
      effects: n.effects.map((e) => ({ ...e, id: uid() })),
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function StoryList() {
  const project = useProject();

  const create = async () => {
    const name = await promptDialog({ title: 'Nova história', message: 'Pode ser um capítulo, uma missão, um diálogo…', placeholder: 'Ex.: Capítulo 2 — A Travessia', confirmLabel: 'Criar' });
    if (name === null) return;
    const s = newStory(name.trim() || `História ${project.stories.length + 1}`);
    update((d) => {
      d.stories.push(s);
    });
    goStory(s.id);
  };

  const remove = async (s: Story) => {
    const ok = await confirmDialog({ title: `Excluir "${s.name}"?`, message: `${plural(s.nodes.length, 'nó', 'nós')} serão apagados. Dá para desfazer com Ctrl+Z.`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    update((d) => {
      d.stories = d.stories.filter((x) => x.id !== s.id);
    });
  };

  const duplicate = (s: Story) => {
    const copy = cloneStory(s);
    update((d) => {
      d.stories.push(copy);
    });
  };

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <h2>Histórias</h2>
          <p className="muted">Roteiros ramificados: cenas, falas, escolhas do jogador e finais.</p>
        </div>
        <button className="btn primary" onClick={() => void create()}>＋ Nova história</button>
      </div>
      {project.stories.length === 0 ? (
        <div className="empty">
          <p>Nenhuma história ainda.</p>
          <p className="muted">Crie a primeira e monte o fluxo arrastando nós e ligando escolhas.</p>
        </div>
      ) : (
        <div className="story-grid">
          {project.stories.map((s) => {
            const issues = analyzeStory(s, project);
            const errors = issues.filter((i) => i.level === 'erro').length;
            const endings = s.nodes.filter((n) => n.type === 'final').length;
            const choices = s.nodes.reduce((n, x) => n + x.choices.filter((c) => c.text.trim()).length, 0);
            return (
              <article key={s.id} className="story-card" onClick={() => goStory(s.id)}>
                <h3>{s.name}</h3>
                {s.synopsis && <p className="synopsis">{s.synopsis}</p>}
                <p className="muted small">
                  {plural(s.nodes.length, 'nó', 'nós')} · {plural(choices, 'escolha', 'escolhas')} · {plural(endings, 'final', 'finais')}
                </p>
                <p className="muted small">Editada {formatDate(s.updatedAt)}</p>
                {errors > 0 && <p className="warn-line small">⚠ {plural(errors, 'problema', 'problemas')}</p>}
                <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn small primary" onClick={() => setUi({ playtest: { storyId: s.id } })} disabled={!s.startNodeId}>▶ Testar</button>
                  <button className="btn ghost small" onClick={() => duplicate(s)}>Duplicar</button>
                  <button className="btn ghost small danger-text" onClick={() => void remove(s)}>Excluir</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
