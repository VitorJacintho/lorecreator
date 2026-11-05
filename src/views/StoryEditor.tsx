/** Editor visual de uma história ramificada (quadro de nós + painel do nó selecionado). */
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useNodesInitialized,
  useReactFlow, useUpdateNodeInternals, type Connection, type Edge, type FinalConnectionState, type Node, type NodeChange, type NodeProps,
} from '@xyflow/react';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { analyzeStory, autoLayout, nodeLabel, type Issue } from '../engine/analyze';
import { newStoryNode, uid } from '../model/factory';
import { NODE_TYPE_INFO, type Entry, type Id, type NodeType, type Story, type StoryNode } from '../model/types';
import { update, useProject } from '../store/store';
import { getUi, setUi, useUi } from '../store/ui';
import { plural } from '../util';
import { NodeInspector, StoryInspector } from './NodeInspector';

type NodeData = { node: StoryNode; isStart: boolean; speaker: Entry | null; issues: Issue[] };
type SNode = Node<NodeData, 'story'>;

const stripLinks = (t: string) => t.replace(/\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g, (_a, n: string, alias?: string) => (alias ?? n).trim());

function StoryNodeView({ data, selected }: NodeProps<SNode>) {
  const { node, isStart, speaker, issues } = data;
  const info = NODE_TYPE_INFO[node.type];
  const updateInternals = useUpdateNodeInternals();
  const handleKey = node.type === 'final' ? 'final' : node.choices.map((c) => c.id).join('|');
  useEffect(() => updateInternals(node.id), [handleKey, node.id, updateInternals]);
  const errors = issues.filter((i) => i.level === 'erro').length;
  const text = stripLinks(node.text).trim();

  return (
    <div className={`snode type-${node.type}${selected ? ' selected' : ''}`} style={{ ['--type' as string]: info.color }}>
      <Handle type="target" position={Position.Left} className="snode-in" />
      <header>
        <span className="type-badge">{info.label}</span>
        {isStart && <span className="start-badge" title="Início da história">★ Início</span>}
        {issues.length > 0 && (
          <span className={`issue-badge${errors ? ' error' : ''}`} title={issues.map((i) => i.message).join('\n')}>⚠ {issues.length}</span>
        )}
      </header>
      {node.type === 'fala' && (
        <div className="speaker">
          {speaker?.image ? <img src={speaker.image} alt="" /> : <span className="speaker-dot">👤</span>}
          <span>{speaker?.name ?? 'Sem personagem'}</span>
        </div>
      )}
      {node.title && <strong className="snode-title">{node.title}</strong>}
      <p className={`excerpt${text ? '' : ' muted'}`}>{text ? (text.length > 150 ? `${text.slice(0, 149)}…` : text) : 'Sem texto'}</p>
      {node.effects.length > 0 && <div className="effects-badge">⚙ {plural(node.effects.length, 'efeito', 'efeitos')}</div>}
      {node.type !== 'final' && (
        <ul className="choices">
          {node.choices.map((c) => (
            <li key={c.id} className={c.targetId ? '' : 'dangling'}>
              {c.condition && <span title="Tem condição">🔒 </span>}
              {c.text.trim() || <em>Continuar</em>}
              <Handle type="source" position={Position.Right} id={c.id} className="snode-out" />
            </li>
          ))}
          <li className="add-choice" title="Arraste daqui para criar uma escolha">
            ＋ escolha
            <Handle type="source" position={Position.Right} id="new" className="snode-out new" />
          </li>
        </ul>
      )}
    </div>
  );
}

const nodeTypes = { story: StoryNodeView };

function Editor({ story }: { story: Story }) {
  const project = useProject();
  const flow = useReactFlow<SNode, Edge>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const focusNodeId = useUi((s) => s.focusNodeId);
  const [rfNodes, setRfNodes] = useState<SNode[]>(() => toRfNodes(story, [], new Map(project.entries.map((e) => [e.id, e])), new Map()));
  const nodesReady = useNodesInitialized();
  const fitted = useRef(false);
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
  const [showIssues, setShowIssues] = useState(false);

  const issues = useMemo(() => analyzeStory(story, project), [story, project]);
  const issuesByNode = useMemo(() => {
    const m = new Map<Id, Issue[]>();
    for (const i of issues) m.set(i.nodeId, [...(m.get(i.nodeId) ?? []), i]);
    return m;
  }, [issues]);
  const entries = useMemo(() => new Map(project.entries.map((e) => [e.id, e])), [project.entries]);

  // sincroniza o quadro com o projeto, preservando seleção e medidas dos nós
  useEffect(() => {
    setRfNodes((prev) => toRfNodes(story, prev, entries, issuesByNode));
  }, [story, entries, issuesByNode]);

  // enquadra a história quando os nós já foram medidos (o fitView inicial roda cedo demais)
  useEffect(() => {
    if (!nodesReady || fitted.current) return;
    fitted.current = true;
    if (!getUi().focusNodeId) void flow.fitView({ padding: 0.15, maxZoom: 1 });
  }, [nodesReady, flow]);

  const ids = useMemo(() => new Set(story.nodes.map((n) => n.id)), [story.nodes]);
  const edges: Edge[] = useMemo(
    () =>
      story.nodes.flatMap((n) =>
        n.type === 'final'
          ? []
          : n.choices
              .filter((c) => c.targetId && ids.has(c.targetId))
              .map((c) => ({
                id: c.id,
                source: n.id,
                sourceHandle: c.id,
                target: c.targetId!,
                selected: selectedEdges.has(c.id),
                className: c.condition ? 'edge-cond' : undefined,
                markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
              })),
      ),
    [story.nodes, ids, selectedEdges],
  );

  const selectedIds = rfNodes.filter((n) => n.selected).map((n) => n.id);
  const selectedNode = selectedIds.length === 1 ? story.nodes.find((n) => n.id === selectedIds[0]) ?? null : null;

  const editStory = (fn: (s: Story) => void, key?: string) =>
    update((d) => {
      const s = d.stories.find((x) => x.id === story.id);
      if (!s) return;
      fn(s as Story);
      s.updatedAt = Date.now();
    }, key && `story:${story.id}:${key}`);

  const select = (nodeId: Id | null) =>
    setRfNodes((ns) => ns.map((n) => (n.selected === (n.id === nodeId) ? n : { ...n, selected: n.id === nodeId })));

  /** foca um nó (vindo da busca, do "aparece em" ou da lista de problemas) */
  const focus = (nodeId: Id) => {
    const n = story.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    select(nodeId);
    void flow.setCenter(n.position.x + 130, n.position.y + 80, { zoom: Math.max(flow.getZoom(), 0.9), duration: 400 });
  };

  useEffect(() => {
    if (!focusNodeId) return;
    // espera o quadro montar os nós antes de centralizar
    const t = setTimeout(() => {
      focus(focusNodeId);
      setUi({ focusNodeId: null });
    }, 80);
    return () => clearTimeout(t);
  }, [focusNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNode = (type: NodeType, position?: { x: number; y: number }, from?: { nodeId: Id; handleId: string | null }) => {
    let pos = position;
    if (!pos) {
      const rect = wrapRef.current?.getBoundingClientRect();
      pos = rect ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
      pos = { x: pos.x - 130, y: pos.y - 60 };
    }
    const node = newStoryNode(type, { x: Math.round(pos.x), y: Math.round(pos.y) });
    editStory((s) => {
      s.nodes.push(node);
      if (!s.startNodeId) s.startNodeId = node.id;
      if (from) {
        const src = s.nodes.find((n) => n.id === from.nodeId);
        if (src) connectChoice(src, from.handleId, node.id);
      }
    });
    setTimeout(() => select(node.id), 0);
    return node.id;
  };

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    editStory((s) => {
      const src = s.nodes.find((n) => n.id === c.source);
      if (src) connectChoice(src, c.sourceHandle ?? null, c.target);
    });
  };

  const onConnectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || state.fromHandle?.type !== 'source') return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    const p = flow.screenToFlowPosition({ x: point.clientX, y: point.clientY });
    addNode('cena', { x: p.x, y: p.y - 40 }, { nodeId: state.fromNode.id, handleId: state.fromHandle.id ?? null });
  };

  const onNodesChange = (changes: NodeChange<SNode>[]) => {
    // remoção passa por onDelete (para virar um passo só de desfazer)
    setRfNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns));
  };

  const onDelete = ({ nodes, edges: delEdges }: { nodes: SNode[]; edges: Edge[] }) => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edgeIds = new Set(delEdges.map((e) => e.id));
    editStory((s) => {
      s.nodes = s.nodes.filter((n) => !nodeIds.has(n.id));
      for (const n of s.nodes) {
        for (const c of n.choices) if (edgeIds.has(c.id) || (c.targetId && nodeIds.has(c.targetId))) delete c.targetId;
      }
      if (s.startNodeId && nodeIds.has(s.startNodeId)) s.startNodeId = s.nodes[0]?.id;
    });
    setSelectedEdges(new Set());
  };

  const tidy = () => {
    const layout = autoLayout(story);
    editStory((s) => {
      for (const n of s.nodes) n.position = layout.get(n.id) ?? n.position;
    });
    setTimeout(() => void flow.fitView({ duration: 400, padding: 0.15 }), 50);
  };

  const onPaneDoubleClick = (e: ReactMouseEvent) => {
    if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode('cena', { x: p.x - 130, y: p.y - 40 });
  };

  const errors = issues.filter((i) => i.level === 'erro').length;

  return (
    <div className="story-editor">
      <div className="story-toolbar">
        <button className="icon-btn" title="Voltar para a lista" onClick={() => setUi({ storyId: null })}>←</button>
        <input className="story-name" value={story.name} aria-label="Nome da história"
          onChange={(e) => editStory((s) => { s.name = e.target.value; }, 'name')} />
        <div className="toolbar-group">
          <button className="btn small" onClick={() => addNode('cena')} title="Narração, descrição de cena">＋ Cena</button>
          <button className="btn small" onClick={() => addNode('fala')} title="Um personagem falando">＋ Fala</button>
          <button className="btn small" onClick={() => addNode('final')} title="Um final da história">＋ Final</button>
          <button className="btn small ghost" onClick={tidy} title="Organiza os nós em colunas a partir do início">⇶ Organizar</button>
        </div>
        <div className="toolbar-group right">
          <div className="issues-wrap">
            <button className={`btn small ${issues.length ? (errors ? 'danger-soft' : 'warn-soft') : 'ghost'}`} onClick={() => setShowIssues((v) => !v)}>
              {issues.length ? `⚠ ${plural(issues.length, 'aviso', 'avisos')}` : '✓ Sem problemas'}
            </button>
            {showIssues && issues.length > 0 && (
              <ul className="issues-pop" onMouseLeave={() => setShowIssues(false)}>
                {issues.map((i, k) => {
                  const n = story.nodes.find((x) => x.id === i.nodeId);
                  return (
                    <li key={k}>
                      <button onClick={() => {
                        if (n) focus(n.id);
                        setShowIssues(false);
                      }}>
                        <span className={i.level === 'erro' ? 'err' : 'warn'}>{i.level === 'erro' ? '●' : '○'}</span>
                        <span>
                          {n && <strong>{nodeLabel(n, 28)}: </strong>}
                          {i.message}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button className="btn small primary" disabled={!story.startNodeId} onClick={() => setUi({ playtest: { storyId: story.id } })}>▶ Testar</button>
        </div>
      </div>
      <div className="story-body">
        <div className="story-canvas" ref={wrapRef} onDoubleClick={onPaneDoubleClick}>
          <ReactFlow<SNode, Edge>
            nodes={rfNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={(changes) => {
              setSelectedEdges((sel) => {
                const next = new Set(sel);
                for (const c of changes) if (c.type === 'select') (c.selected ? next.add(c.id) : next.delete(c.id));
                return next;
              });
            }}
            onNodeDragStop={(_e, _n, moved) =>
              editStory((s) => {
                for (const m of moved) {
                  const n = s.nodes.find((x) => x.id === m.id);
                  if (n) n.position = { x: Math.round(m.position.x), y: Math.round(m.position.y) };
                }
              })}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onDelete={onDelete}
            deleteKeyCode={['Delete']}
            zoomOnDoubleClick={false}
            minZoom={0.1}
            maxZoom={2}
            snapToGrid
            snapGrid={[10, 10]}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => NODE_TYPE_INFO[(n as SNode).data.node.type].color} />
          </ReactFlow>
          {story.nodes.length === 0 && <div className="canvas-empty">Clique duas vezes no quadro para criar o primeiro nó.</div>}
          <div className="canvas-hint muted small">
            Clique duas vezes para criar um nó · arraste de uma escolha até um nó (ou até o vazio) para ligar · Delete apaga
          </div>
        </div>
        <aside className="inspector">
          {selectedNode ? (
            <NodeInspector
              key={selectedNode.id}
              story={story}
              node={selectedNode}
              issues={issuesByNode.get(selectedNode.id) ?? []}
              onFocus={focus}
              onAddNode={(type, from) => {
                const src = story.nodes.find((n) => n.id === from.nodeId);
                const offset = src ? src.choices.length * 60 : 0;
                return addNode(type, src ? { x: src.position.x + 340, y: src.position.y + offset - 60 } : undefined, from);
              }}
              onDeleted={() => select(null)}
            />
          ) : (
            <StoryInspector story={story} issues={issues} selectedCount={selectedIds.length} onFocus={focus} />
          )}
        </aside>
      </div>
    </div>
  );
}

function toRfNodes(story: Story, prev: SNode[], entries: Map<Id, Entry>, issuesByNode: Map<Id, Issue[]>): SNode[] {
  const old = new Map(prev.map((n) => [n.id, n]));
  return story.nodes.map((n) => ({
    ...old.get(n.id),
    id: n.id,
    type: 'story' as const,
    position: n.position,
    data: {
      node: n,
      isStart: story.startNodeId === n.id,
      speaker: n.speakerId ? entries.get(n.speakerId) ?? null : null,
      issues: issuesByNode.get(n.id) ?? [],
    },
  }));
}

/** Liga uma escolha (ou cria uma nova, se veio do "＋ escolha") ao nó de destino. */
function connectChoice(src: StoryNode, handleId: string | null, targetId: Id) {
  const existing = handleId && handleId !== 'new' ? src.choices.find((c) => c.id === handleId) : undefined;
  if (existing) existing.targetId = targetId;
  else src.choices.push({ id: uid(), text: '', targetId });
  if (src.type === 'final') src.type = 'cena';
}

export function StoryEditor({ story }: { story: Story }) {
  return (
    <ReactFlowProvider>
      <Editor story={story} />
    </ReactFlowProvider>
  );
}
