import { useEffect } from 'react';
import { DialogHost } from './components/dialogs';
import { Playtest } from './components/Playtest';
import { SearchPalette } from './components/SearchPalette';
import { openProjectFromPath } from './projectActions';
import { platform } from './platform';
import { flushSaveSync, redo, saveNow, undo, useStore } from './store/store';
import { getUi, setUi, useUi } from './store/ui';
import { Home } from './views/Home';
import { Workspace } from './views/Workspace';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export function App() {
  const hasProject = useStore((s) => !!s.project);
  const toast = useUi((s) => s.toast);
  const playtest = useUi((s) => s.playtest);

  useEffect(() => {
    // arquivo .lore aberto pelo Explorer (ao iniciar ou com o app já aberto)
    void platform.takePendingFile().then((f) => {
      if (f) void openProjectFromPath(f);
    });
    const off = platform.onOpenFile((f) => void openProjectFromPath(f));
    const onUnload = () => flushSaveSync();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      off();
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && key === 's') {
        e.preventDefault();
        void saveNow();
        return;
      }
      if (!hasProject) return;
      if (ctrl && key === 'k') {
        e.preventDefault();
        setUi({ searchOpen: !getUi().searchOpen });
        return;
      }
      // nos campos de texto o Ctrl+Z nativo desfaz a digitação
      if (isTyping(e.target) || getUi().playtest) return;
      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasProject]);

  return (
    <>
      {hasProject ? <Workspace /> : <Home />}
      {hasProject && <SearchPalette />}
      {hasProject && playtest && <Playtest key={`${playtest.storyId}:${playtest.fromNodeId ?? ''}`} />}
      <DialogHost />
      {toast && (
        <div className="toast" key={toast.id} role="status">
          {toast.text}
        </div>
      )}
    </>
  );
}
