/** Mapa de relações: as entradas do codex como um grafo arrastável. */
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useNodesInitialized,
  useReactFlow, type Edge, type Node, type NodeChange, type NodeProps,
} from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../model/factory';
import { ENTRY_KINDS, KIND_INFO, type Entry, type EntryKind } from '../model/types';
import { update, useProject } from '../store/store';
import { goEntry } from '../store/ui';

type MapNode = Node<{ entry: Entry }, 'entry'>;

function EntryNode({ data, selected }: NodeProps<MapNode>) {
  const e = data.entry;
  return (
    <div className={`map-node${selected ? ' selected' : ''}`} style={{ ['--kind' as string]: KIND_INFO[e.kind].color }}>
      <Handle type="target" position={Position.Top} className="map-handle" />
      {e.image ? <img src={e.image} alt="" /> : <span className="map-icon">{KIND_INFO[e.kind].icon}</span>}
      <div>
        <strong>{e.name}</strong>
        <span>{KIND_INFO[e.kind].label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="map-handle" />
    </div>
  );
}

const nodeTypes = { entry: EntryNode };

function defaultPos(i: number, n: number) {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  const r = 160 + n * 22;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r * 0.7) };
}

function MapInner() {
  const project = useProject();
  const [hidden, setHidden] = useState<Set<EntryKind>>(new Set());
  const [onlyLinked, setOnlyLinked] = useState(false);

  const linked = useMemo(() => {
    const s = new Set<string>();
    for (const e of project.entries) for (const r of e.relations) {
      s.add(e.id);
      s.add(r.targetId);
    }
    return s;
  }, [project.entries]);

  const visible = project.entries.filter((e) => !hidden.has(e.kind) && (!onlyLinked || linked.has(e.id)));
  const visibleIds = new Set(visible.map((e) => e.id));

  const [nodes, setNodes] = useState<MapNode[]>([]);
  const flow = useReactFlow<MapNode, Edge>();
  const nodesReady = useNodesInitialized();
  const fitted = useRef(false);
  useEffect(() => {
    if (!nodesReady || fitted.current) return;
    fitted.current = true;
    void flow.fitView({ padding: 0.15, maxZoom: 1.1 });
  }, [nodesReady, flow]);
  useEffect(() => {
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return visible.map((e, i) => ({
        ...old.get(e.id),
        id: e.id,
        type: 'entry' as const,
        position: e.mapPos ?? old.get(e.id)?.position ?? defaultPos(i, visible.length),
        data: { entry: e },
      }));
    });
  }, [project.entries, hidden, onlyLinked]);

  const edges: Edge[] = visible.flatMap((e) =>
    e.relations
      .filter((r) => visibleIds.has(r.targetId))
      .map((r) => ({
        id: r.id,
        source: e.id,
        target: r.targetId,
        label: r.label || undefined,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        type: 'straight',
        className: 'map-edge',
      })),
  );

  const onNodesChange = (changes: NodeChange<MapNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns));

  const savePositions = (moved: MapNode[]) =>
    update((d) => {
      for (const m of moved) {
        const e = d.entries.find((x) => x.id === m.id);
        if (e) e.mapPos = { x: Math.round(m.position.x), y: Math.round(m.position.y) };
      }
    });

  return (
    <div className="map-page">
      <div className="map-toolbar">
        {ENTRY_KINDS.map((k) => (
          <button key={k} className={`chip${hidden.has(k) ? '' : ' active'}`} style={{ ['--c' as string]: KIND_INFO[k].color }}
            onClick={() => setHidden((h) => {
              const n = new Set(h);
              if (n.has(k)) n.delete(k);
              else n.add(k);
              return n;
            })}>
            {KIND_INFO[k].icon} {KIND_INFO[k].plural}
          </button>
        ))}
        <label className="check">
          <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} /> Só com relações
        </label>
        <span className="muted small hint">Arraste de um ponto ao outro para criar uma relação · clique duas vezes para abrir</span>
      </div>
      <div className="map-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_e, _n, moved) => savePositions(moved)}
          onNodeDoubleClick={(_e, n) => goEntry(n.id)}
          onConnect={(c) => {
            if (!c.source || !c.target || c.source === c.target) return;
            update((d) => {
              const e = d.entries.find((x) => x.id === c.source);
              if (e && !e.relations.some((r) => r.targetId === c.target)) e.relations.push({ id: uid(), label: 'relacionado a', targetId: c.target });
            });
          }}
          onEdgesDelete={(del) =>
            update((d) => {
              const ids = new Set(del.map((x) => x.id));
              for (const e of d.entries) e.relations = e.relations.filter((r) => !ids.has(r.id));
            })}
          deleteKeyCode={['Delete']}
          minZoom={0.15}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(n) => KIND_INFO[(n as MapNode).data.entry.kind].color} />
        </ReactFlow>
        {visible.length === 0 && <div className="canvas-empty">Nada para mostrar. Crie entradas no codex.</div>}
      </div>
    </div>
  );
}

export function RelationMap() {
  return (
    <ReactFlowProvider>
      <MapInner />
    </ReactFlowProvider>
  );
}
