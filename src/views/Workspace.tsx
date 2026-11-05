/** Área de trabalho de um projeto aberto: barra lateral, barra superior e a tela atual. */
import { ENTRY_KINDS, KIND_INFO } from '../model/types';
import { leaveProject, saveProjectAs } from '../projectActions';
import { redo, saveNow, undo, useProject, useStore } from '../store/store';
import { setUi, useUi, type View } from '../store/ui';
import { Codex } from './Codex';
import { ExportView } from './ExportView';
import { Overview } from './Overview';
import { RelationMap } from './RelationMap';
import { Stories } from './Stories';
import { Timeline } from './Timeline';
import { Variables } from './Variables';

export function Workspace() {
  const project = useProject();
  const view = useUi((s) => s.view);
  const kind = useUi((s) => s.kind);
  const storyId = useUi((s) => s.storyId);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  const counts = Object.fromEntries(ENTRY_KINDS.map((k) => [k, project.entries.filter((e) => e.kind === k).length]));
  const nav = (v: View, extra: Parameters<typeof setUi>[0] = {}) => setUi({ view: v, ...extra });

  return (
    <div className="workspace">
      <aside className="sidebar">
        <button className="sidebar-title" onClick={() => nav('overview')} title="Visão geral">
          <img src="./icon.png" alt="" width={28} height={28} />
          <span>{project.name}</span>
        </button>
        <nav>
          <NavItem active={view === 'overview'} onClick={() => nav('overview')} icon="◈" label="Visão geral" />
          <div className="nav-group">Mundo</div>
          <NavItem active={view === 'codex' && kind === 'all'} onClick={() => nav('codex', { kind: 'all' })} icon="📖" label="Codex" count={project.entries.length} />
          {ENTRY_KINDS.map((k) => (
            <NavItem key={k} sub active={view === 'codex' && kind === k} onClick={() => nav('codex', { kind: k })}
              icon={KIND_INFO[k].icon} label={KIND_INFO[k].plural} count={counts[k]} />
          ))}
          <NavItem active={view === 'timeline'} onClick={() => nav('timeline')} icon="⏳" label="Linha do tempo" />
          <NavItem active={view === 'map'} onClick={() => nav('map')} icon="🕸" label="Mapa de relações" />
          <div className="nav-group">Narrativa</div>
          <NavItem active={view === 'stories' && !storyId} onClick={() => nav('stories', { storyId: null })} icon="🎭" label="Histórias" count={project.stories.length} />
          {project.stories.map((s) => (
            <NavItem key={s.id} sub active={view === 'stories' && storyId === s.id} onClick={() => nav('stories', { storyId: s.id, focusNodeId: null })}
              icon="›" label={s.name} />
          ))}
          <NavItem active={view === 'variables'} onClick={() => nav('variables')} icon="⚙" label="Variáveis" count={project.variables.length} />
          <div className="nav-group">Compartilhar</div>
          <NavItem active={view === 'export'} onClick={() => nav('export')} icon="⇪" label="Exportar" />
        </nav>
        <div className="sidebar-foot">
          <button className="btn ghost small" onClick={() => void saveProjectAs()}>Salvar cópia…</button>
          <button className="btn ghost small" onClick={() => void leaveProject()}>Fechar projeto</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="search-trigger" onClick={() => setUi({ searchOpen: true })}>
            <span>🔍 Buscar no projeto…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-right">
            <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Desfazer (Ctrl+Z)">↶</button>
            <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Refazer (Ctrl+Y)">↷</button>
            <SaveIndicator />
          </div>
        </header>
        <div className="content">
          {view === 'overview' && <Overview />}
          {view === 'codex' && <Codex />}
          {view === 'timeline' && <Timeline />}
          {view === 'map' && <RelationMap />}
          {view === 'stories' && <Stories />}
          {view === 'variables' && <Variables />}
          {view === 'export' && <ExportView />}
        </div>
      </div>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, count, sub }: { active: boolean; onClick: () => void; icon: string; label: string; count?: number; sub?: boolean }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}${sub ? ' sub' : ''}`} onClick={onClick} title={label}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count !== undefined && count > 0 && <span className="nav-count">{count}</span>}
    </button>
  );
}

function SaveIndicator() {
  const status = useStore((s) => s.saveStatus);
  const error = useStore((s) => s.saveError);
  if (status === 'error') {
    return (
      <button className="save-status error" onClick={() => void saveNow()} title={error ?? ''}>
        ⚠ Erro ao salvar — tentar de novo
      </button>
    );
  }
  const label = status === 'saved' ? '✓ Salvo' : 'Salvando…';
  return <span className={`save-status ${status}`} title="O projeto é salvo automaticamente (Ctrl+S salva na hora)">{label}</span>;
}
