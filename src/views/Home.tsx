/** Tela inicial: projetos existentes e criação de um novo. */
import { useEffect, useState } from 'react';
import { confirmDialog, Modal } from '../components/dialogs';
import { createProject, openProjectFromPath, pickAndOpenProject } from '../projectActions';
import { platform, type ProjectSummary } from '../platform';
import { formatDate } from '../util';

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [dir, setDir] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    platform.listProjects().then(setProjects, () => setProjects([]));
  };
  useEffect(() => {
    refresh();
    void platform.projectsDir().then(setDir);
  }, []);

  const remove = async (p: ProjectSummary) => {
    const ok = await confirmDialog({
      title: `Excluir "${p.name}"?`,
      message: platform.isDesktop ? 'O arquivo vai para a Lixeira do Windows. Dá para recuperar de lá.' : 'O projeto será apagado do navegador.',
      confirmLabel: 'Mover para a Lixeira',
      danger: true,
    });
    if (!ok) return;
    await platform.trashProject(p.path);
    refresh();
  };

  return (
    <div className="home">
      <header className="home-hero">
        <div className="brand">
          <img src="./icon.png" alt="" width={56} height={56} />
          <div>
            <h1>LoreCreator</h1>
            <p>Construa mundos, personagens e histórias ramificadas para os seus jogos.</p>
          </div>
        </div>
        <div className="home-actions">
          <button className="btn primary big" onClick={() => setCreating(true)}>＋ Novo projeto</button>
          <button className="btn big" onClick={() => void pickAndOpenProject().then(refresh)}>Abrir arquivo…</button>
        </div>
      </header>

      <section className="home-list">
        <div className="section-head">
          <h2>Seus projetos</h2>
          {platform.openProjectsFolder && (
            <button className="btn ghost small" onClick={() => void platform.openProjectsFolder!()} title={dir}>
              Abrir pasta dos projetos
            </button>
          )}
        </div>
        {projects === null ? (
          <p className="muted">Carregando…</p>
        ) : projects.length === 0 ? (
          <div className="empty">
            <p>Nenhum projeto ainda.</p>
            <p className="muted">Comece pelo projeto de exemplo para ver como tudo funciona, ou crie um mundo do zero.</p>
            <div className="row gap">
              <button className="btn primary" onClick={() => void createProject({ name: '', genre: '', premise: '', template: 'sample' })}>
                Abrir o exemplo "As Cinzas de Velmora"
              </button>
              <button className="btn" onClick={() => setCreating(true)}>Criar em branco</button>
            </div>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <article key={p.path} className="project-card" onClick={() => void openProjectFromPath(p.path)}>
                <h3>{p.name}</h3>
                {p.genre && <p className="genre">{p.genre}</p>}
                <p className="muted small">
                  {p.entries} {p.entries === 1 ? 'entrada' : 'entradas'} · {p.stories} {p.stories === 1 ? 'história' : 'histórias'}
                </p>
                <p className="muted small">Editado {formatDate(p.updatedAt)}</p>
                <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                  {platform.revealProject && (
                    <button className="btn ghost small" onClick={() => void platform.revealProject!(p.path)}>Mostrar arquivo</button>
                  )}
                  <button className="btn ghost small danger-text" onClick={() => void remove(p)}>Excluir</button>
                </div>
              </article>
            ))}
          </div>
        )}
        {dir && <p className="muted small footnote">Projetos novos são salvos em: {dir}</p>}
      </section>

      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('');
  const [premise, setPremise] = useState('');
  const [template, setTemplate] = useState<'blank' | 'sample'>('blank');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    await createProject({ name, genre, premise, template });
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title="Novo projeto"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy || (template === 'blank' && !name.trim())} onClick={() => void submit()}>
            Criar projeto
          </button>
        </>
      }
    >
      <div className="template-pick">
        <button className={`template${template === 'blank' ? ' active' : ''}`} onClick={() => setTemplate('blank')}>
          <strong>Em branco</strong>
          <span>Um mundo vazio, pronto para começar.</span>
        </button>
        <button className={`template${template === 'sample' ? ' active' : ''}`} onClick={() => setTemplate('sample')}>
          <strong>Exemplo: As Cinzas de Velmora</strong>
          <span>Fantasia sombria com personagens, linha do tempo e uma história com 3 finais.</span>
        </button>
      </div>
      <label className="field">
        <span>Nome do projeto {template === 'sample' && <em className="muted">(opcional)</em>}</span>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Crônicas de Aurora"
          onKeyDown={(e) => e.key === 'Enter' && (template === 'sample' || name.trim()) && void submit()} />
      </label>
      {template === 'blank' && (
        <>
          <label className="field">
            <span>Gênero</span>
            <input className="input" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Ex.: Ficção científica · Aventura" />
          </label>
          <label className="field">
            <span>Premissa</span>
            <textarea className="input" rows={3} value={premise} onChange={(e) => setPremise(e.target.value)}
              placeholder="Em uma ou duas frases: sobre o que é o seu jogo?" />
          </label>
        </>
      )}
    </Modal>
  );
}
