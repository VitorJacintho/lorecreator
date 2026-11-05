/** Tela de exportação. */
import { useState } from 'react';
import { alertDialog } from '../components/dialogs';
import { toEngineJson, toMarkdown, toPlayableHtml } from '../export/exporters';
import { platform, type FileFilter } from '../platform';
import { saveProjectAs } from '../projectActions';
import { useProject } from '../store/store';
import { toast } from '../store/ui';

export function ExportView() {
  const project = useProject();
  const playable = project.stories.filter((s) => s.startNodeId);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(playable.map((s) => s.id)));
  const [last, setLast] = useState<string | null>(null);

  const save = async (name: string, content: string, filters: FileFilter[]) => {
    try {
      const path = await platform.exportFile(name, content, filters);
      if (path) {
        setLast(platform.isDesktop ? path : null);
        toast(platform.isDesktop ? `Exportado: ${path}` : 'Arquivo baixado.');
      }
    } catch (e) {
      await alertDialog('Não foi possível exportar', e instanceof Error ? e.message : String(e));
    }
  };

  const base = project.name.trim() || 'projeto';

  return (
    <div className="page export-page">
      <div className="section-head">
        <div>
          <h2>Exportar</h2>
          <p className="muted">Leve o seu mundo e as suas histórias para fora do LoreCreator.</p>
        </div>
      </div>

      <div className="export-grid">
        <section className="card export-card">
          <div className="export-icon">▶</div>
          <h3>História jogável (HTML)</h3>
          <p className="muted">Um único arquivo .html que abre em qualquer navegador. Ótimo para mandar para alguém testar a narrativa.</p>
          {playable.length === 0 ? (
            <p className="warn-line small">Nenhuma história com nó inicial ainda.</p>
          ) : (
            <div className="pick-list">
              {playable.map((s) => (
                <label key={s.id} className="check">
                  <input type="checkbox" checked={picked.has(s.id)} onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(s.id);
                    else n.delete(s.id);
                    setPicked(n);
                  }} />
                  {s.name}
                </label>
              ))}
            </div>
          )}
          <button className="btn primary" disabled={picked.size === 0}
            onClick={() => void save(`${base} - jogavel.html`, toPlayableHtml(project, [...picked]), [{ name: 'Página HTML', extensions: ['html'] }])}>
            Exportar HTML
          </button>
        </section>

        <section className="card export-card">
          <div className="export-icon">{'{ }'}</div>
          <h3>Dados para engines (JSON)</h3>
          <p className="muted">
            Histórias, variáveis, personagens e codex num JSON simples para carregar no Unity, Godot, Unreal, GameMaker, Ren'Py…
            Cada nó tem texto, quem fala, efeitos e escolhas com destino, condições e efeitos.
          </p>
          <button className="btn primary" onClick={() => void save(`${base}.json`, toEngineJson(project), [{ name: 'JSON', extensions: ['json'] }])}>
            Exportar JSON
          </button>
        </section>

        <section className="card export-card">
          <div className="export-icon">¶</div>
          <h3>Bíblia do mundo (Markdown)</h3>
          <p className="muted">
            Documento legível com o codex, a linha do tempo, as variáveis e os roteiros numerados. Abre no Notion, Obsidian, GitHub, Word (colando)…
          </p>
          <button className="btn primary" onClick={() => void save(`${base}.md`, toMarkdown(project), [{ name: 'Markdown', extensions: ['md'] }])}>
            Exportar Markdown
          </button>
        </section>

        <section className="card export-card">
          <div className="export-icon">⧉</div>
          <h3>Cópia do projeto (.lore)</h3>
          <p className="muted">Uma cópia completa para backup ou para mandar para outra pessoa abrir no LoreCreator.</p>
          <button className="btn" onClick={() => void saveProjectAs()}>Salvar cópia…</button>
        </section>
      </div>

      {last && platform.revealExport && (
        <p className="small">
          Último arquivo: <code>{last}</code>{' '}
          <button className="link-btn" onClick={() => void platform.revealExport!(last)}>Mostrar na pasta</button>
        </p>
      )}
    </div>
  );
}
