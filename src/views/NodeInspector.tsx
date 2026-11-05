/** Painel lateral do editor de histórias: edita o nó selecionado (ou mostra o resumo da história). */
import { confirmDialog, promptDialog } from '../components/dialogs';
import { LoreTextarea } from '../components/text';
import { OP_LABEL, nodeLabel, type Issue } from '../engine/analyze';
import { cloneChoice, defaultValue, newChoice, newEntry, newVariable, uid } from '../model/factory';
import {
  NODE_TYPE_INFO, type Choice, type CompareOp, type Condition, type Effect, type EffectOp, type Id, type NodeType, type Story,
  type StoryNode, type VarType, type Variable,
} from '../model/types';
import { update, useProject } from '../store/store';
import { goEntry, setUi } from '../store/ui';
import { plural } from '../util';
import { ValueInput } from './Variables';

const OPS_FOR: Record<VarType, CompareOp[]> = { bool: ['==', '!='], number: ['==', '!=', '>', '<', '>=', '<='], text: ['==', '!='] };
const EFFECT_OPS_FOR: Record<VarType, EffectOp[]> = { bool: ['set', 'toggle'], number: ['set', 'add', 'sub'], text: ['set'] };
const EFFECT_LABEL: Record<EffectOp, string> = { set: 'vira', add: 'soma', sub: 'subtrai', toggle: 'inverte' };

const startValue = (v: Variable) => (v.type === 'bool' ? true : defaultValue(v.type));
const blankEffect = (v: Variable): Effect => ({ id: uid(), varId: v.id, op: 'set', value: startValue(v) });

interface Props {
  story: Story;
  node: StoryNode;
  issues: Issue[];
  onFocus: (id: Id) => void;
  onAddNode: (type: NodeType, from: { nodeId: Id; handleId: string | null }) => Id;
  onDeleted: () => void;
}

export function NodeInspector({ story, node, issues, onFocus, onAddNode, onDeleted }: Props) {
  const project = useProject();
  const characters = project.entries.filter((e) => e.kind === 'personagem').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const others = story.nodes.filter((n) => n.id !== node.id);

  const edit = (fn: (n: StoryNode, s: Story) => void, key?: string) =>
    update((d) => {
      const s = d.stories.find((x) => x.id === story.id);
      const n = s?.nodes.find((x) => x.id === node.id);
      if (!s || !n) return;
      fn(n as StoryNode, s as Story);
      s.updatedAt = Date.now();
    }, key && `node:${node.id}:${key}`);

  const editChoice = (choiceId: Id, fn: (c: Choice) => void, key?: string) =>
    edit((n) => {
      const c = n.choices.find((x) => x.id === choiceId);
      if (c) fn(c);
    }, key && `${choiceId}:${key}`);

  const editEffect = (effectId: Id, fn: (e: Effect) => void, key?: string) =>
    edit((n) => {
      const e = n.effects.find((x) => x.id === effectId);
      if (e) fn(e);
    }, key && `${effectId}:${key}`);

  /** cria uma variável rapidamente (quando ainda não há nenhuma) */
  const quickVariable = async (): Promise<Variable | null> => {
    const name = await promptDialog({ title: 'Nova variável', message: 'Ela começa como Sim/Não (falso). Ajuste o tipo na tela Variáveis.', placeholder: 'ex.: salvou_o_ferreiro', confirmLabel: 'Criar' });
    if (!name?.trim()) return null;
    const v = newVariable(name.trim().replace(/[{}\s]/g, '_'));
    update((d) => {
      d.variables.push(v);
    });
    return v;
  };

  const addEffect = async () => {
    const v = project.variables[0] ?? (await quickVariable());
    if (!v) return;
    edit((n) => {
      n.effects.push(blankEffect(v));
    });
  };

  const addChoiceEffect = async (choiceId: Id) => {
    const v = project.variables[0] ?? (await quickVariable());
    if (!v) return;
    editChoice(choiceId, (c) => {
      c.effects.push(blankEffect(v));
    });
  };

  const addCondition = async (choice: Choice) => {
    // prefere uma variável que esta escolha ainda não testa
    const v = project.variables.find((x) => !choice.conditions.some((c) => c.varId === x.id)) ?? project.variables[0] ?? (await quickVariable());
    if (!v) return;
    editChoice(choice.id, (c) => {
      c.conditions.push({ id: uid(), varId: v.id, op: v.type === 'number' ? '>=' : '==', value: startValue(v) });
    });
  };

  const newSpeaker = async () => {
    const name = await promptDialog({ title: 'Novo personagem', placeholder: 'Nome do personagem', confirmLabel: 'Criar' });
    if (!name?.trim()) return;
    const e = newEntry('personagem', name.trim());
    update((d) => {
      d.entries.push(e);
      const n = d.stories.find((s) => s.id === story.id)?.nodes.find((x) => x.id === node.id);
      if (n) n.speakerId = e.id;
    });
  };

  const duplicate = () => {
    const copy: StoryNode = {
      ...structuredClone(node),
      id: uid(),
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      choices: node.choices.map(cloneChoice),
      effects: node.effects.map((e) => ({ ...e, id: uid() })),
    };
    update((d) => {
      d.stories.find((s) => s.id === story.id)?.nodes.push(copy);
    });
  };

  const remove = async () => {
    const incoming = story.nodes.reduce((n, x) => n + x.choices.filter((c) => c.targetId === node.id).length, 0);
    if (incoming > 0 || node.text.trim()) {
      const ok = await confirmDialog({
        title: 'Excluir este nó?',
        message: incoming ? `${plural(incoming, 'escolha leva', 'escolhas levam')} até ele e vão ficar sem destino. Dá para desfazer com Ctrl+Z.` : 'Dá para desfazer com Ctrl+Z.',
        confirmLabel: 'Excluir',
        danger: true,
      });
      if (!ok) return;
    }
    update((d) => {
      const s = d.stories.find((x) => x.id === story.id);
      if (!s) return;
      s.nodes = s.nodes.filter((n) => n.id !== node.id);
      for (const n of s.nodes) for (const c of n.choices) if (c.targetId === node.id) delete c.targetId;
      if (s.startNodeId === node.id) s.startNodeId = s.nodes[0]?.id;
    });
    onDeleted();
  };

  const moveChoice = (i: number, dir: -1 | 1) =>
    edit((n) => {
      const j = i + dir;
      if (j < 0 || j >= n.choices.length) return;
      [n.choices[i], n.choices[j]] = [n.choices[j], n.choices[i]];
    });

  return (
    <div className="inspector-inner" style={{ ['--type' as string]: NODE_TYPE_INFO[node.type].color }}>
      <div className="segmented full">
        {(Object.keys(NODE_TYPE_INFO) as NodeType[]).map((t) => (
          <button key={t} className={node.type === t ? 'active' : ''} onClick={() => edit((n) => { n.type = t; })}>
            {NODE_TYPE_INFO[t].label}
          </button>
        ))}
      </div>

      {node.type === 'fala' && (
        <label className="field">
          <span>Quem fala</span>
          <div className="row gap-s">
            <select className="input grow" value={node.speakerId ?? ''} onChange={(e) => edit((n) => {
              if (e.target.value) n.speakerId = e.target.value;
              else delete n.speakerId;
            })}>
              <option value="">— escolha um personagem —</option>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="icon-btn" title="Criar personagem" onClick={() => void newSpeaker()}>＋</button>
            {node.speakerId && <button className="icon-btn" title="Abrir no codex" onClick={() => goEntry(node.speakerId!)}>→</button>}
          </div>
        </label>
      )}

      <label className="field">
        <span>Título <em className="muted">(só para você se orientar)</em></span>
        <input className="input" value={node.title} placeholder={nodeLabel({ ...node, title: '' }, 30)}
          onChange={(e) => edit((n) => { n.title = e.target.value; }, 'title')} />
      </label>

      <label className="field">
        <span>{node.type === 'fala' ? 'Fala' : node.type === 'final' ? 'Texto do final' : 'Narração'}</span>
        <LoreTextarea rows={7} value={node.text}
          placeholder={node.type === 'fala' ? 'O que o personagem diz…' : 'O que acontece nesta cena…'}
          onChange={(v) => edit((n) => { n.text = v; }, 'text')} />
        <small className="muted">[[Nome]] liga ao codex · {'{variavel}'} mostra um valor</small>
      </label>

      <section className="insp-section">
        <div className="section-head">
          <h4>Efeitos ao entrar</h4>
          <button className="btn ghost small" onClick={() => void addEffect()}>＋ Efeito</button>
        </div>
        {node.effects.length === 0 && <p className="muted small">Mude variáveis quando o jogador chegar aqui (ganhar ouro, ganhar a confiança de alguém…).</p>}
        {node.effects.map((ef) => (
          <EffectRow key={ef.id} effect={ef} variables={project.variables}
            onChange={(fn, key) => editEffect(ef.id, fn, key)}
            onRemove={() => edit((n) => { n.effects = n.effects.filter((x) => x.id !== ef.id); })} />
        ))}
      </section>

      {node.type !== 'final' ? (
        <section className="insp-section">
          <div className="section-head">
            <h4>Escolhas</h4>
            <button className="btn ghost small" onClick={() => edit((n) => { n.choices.push(newChoice()); })}>＋ Escolha</button>
          </div>
          {node.choices.length === 0 && <p className="muted small">Sem escolhas, a história trava aqui. Adicione uma (texto vazio = "Continuar").</p>}
          {node.choices.map((c, i) => (
            <div key={c.id} className="choice-card">
              <div className="row gap-s">
                <span className="choice-num">{i + 1}</span>
                <input className="input grow" value={c.text} placeholder="Continuar"
                  onChange={(e) => editChoice(c.id, (x) => { x.text = e.target.value; }, 'text')} />
                <button className="icon-btn" disabled={i === 0} onClick={() => moveChoice(i, -1)} title="Subir">↑</button>
                <button className="icon-btn" disabled={i === node.choices.length - 1} onClick={() => moveChoice(i, 1)} title="Descer">↓</button>
                <button className="icon-btn" title="Remover escolha" onClick={() => edit((n) => { n.choices = n.choices.filter((x) => x.id !== c.id); })}>✕</button>
              </div>
              <div className="row gap-s">
                <span className="muted small">vai para</span>
                <select className={`input small grow${c.targetId ? '' : ' invalid'}`} value={c.targetId ?? ''}
                  onChange={(e) => {
                    if (e.target.value === '__new') onAddNode('cena', { nodeId: node.id, handleId: c.id });
                    else editChoice(c.id, (x) => {
                      if (e.target.value) x.targetId = e.target.value;
                      else delete x.targetId;
                    });
                  }}>
                  <option value="">— sem destino —</option>
                  <option value="__new">＋ Novo nó</option>
                  {node.id && <option value={node.id}>↺ este mesmo nó</option>}
                  {others.map((o) => <option key={o.id} value={o.id}>{NODE_TYPE_INFO[o.type].label}: {nodeLabel(o, 34)}</option>)}
                </select>
                {c.targetId && <button className="icon-btn" title="Ir até o destino" onClick={() => onFocus(c.targetId!)}>→</button>}
              </div>
              {c.conditions.length > 1 && (
                <div className="segmented full cond-mode" role="group" aria-label="Como combinar as condições">
                  <button className={c.conditionMode === 'all' ? 'active' : ''} onClick={() => editChoice(c.id, (x) => { x.conditionMode = 'all'; })}>Todas (E)</button>
                  <button className={c.conditionMode === 'any' ? 'active' : ''} onClick={() => editChoice(c.id, (x) => { x.conditionMode = 'any'; })}>Qualquer uma (OU)</button>
                </div>
              )}
              {c.conditions.map((cond, j) => (
                <ConditionRow key={cond.id} condition={cond} variables={project.variables}
                  lead={j === 0 ? '🔒 se' : c.conditionMode === 'any' ? 'ou' : 'e'}
                  onChange={(next) => editChoice(c.id, (x) => {
                    const k = x.conditions.findIndex((y) => y.id === cond.id);
                    if (k >= 0) x.conditions[k] = next;
                  }, `cond:${cond.id}`)}
                  onRemove={() => editChoice(c.id, (x) => { x.conditions = x.conditions.filter((y) => y.id !== cond.id); })} />
              ))}
              {c.effects.map((ef) => (
                <EffectRow key={ef.id} lead="⚙" effect={ef} variables={project.variables}
                  onChange={(fn, key) => editChoice(c.id, (x) => {
                    const e = x.effects.find((y) => y.id === ef.id);
                    if (e) fn(e);
                  }, key && `${ef.id}:${key}`)}
                  onRemove={() => editChoice(c.id, (x) => { x.effects = x.effects.filter((y) => y.id !== ef.id); })} />
              ))}
              <div className="choice-add">
                <button className="link-btn small" onClick={() => void addCondition(c)}>🔒 {c.conditions.length ? 'Outra condição' : 'Exigir uma condição'}</button>
                <button className="link-btn small" onClick={() => void addChoiceEffect(c.id)} title="Aplicado quando o jogador faz esta escolha, antes dos efeitos do nó de destino">⚙ Efeito ao escolher</button>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="muted small final-note">Finais encerram a história. No modo Testar, o jogador vê este texto e o botão para recomeçar.</p>
      )}

      {issues.length > 0 && (
        <section className="insp-section issues">
          <h4>Problemas</h4>
          <ul>
            {issues.map((i, k) => <li key={k} className={i.level === 'erro' ? 'err' : 'warn'}>{i.message}</li>)}
          </ul>
        </section>
      )}

      <div className="insp-actions">
        <button className="btn small" disabled={story.startNodeId === node.id} onClick={() => edit((_n, s) => { s.startNodeId = node.id; })}>
          ★ {story.startNodeId === node.id ? 'É o início' : 'Definir como início'}
        </button>
        <button className="btn small" onClick={() => setUi({ playtest: { storyId: story.id, fromNodeId: node.id } })}>▶ Testar daqui</button>
        <button className="btn small ghost" onClick={duplicate}>Duplicar</button>
        <button className="btn small ghost danger-text" onClick={() => void remove()}>Excluir</button>
      </div>
    </div>
  );
}

function VarSelect({ value, variables, onChange }: { value: Id; variables: Variable[]; onChange: (id: Id) => void }) {
  const missing = !variables.some((v) => v.id === value);
  return (
    <select className={`input small${missing ? ' invalid' : ''}`} value={missing ? '' : value} onChange={(e) => e.target.value && onChange(e.target.value)}>
      {missing && <option value="">(variável apagada)</option>}
      {variables.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );
}

function EffectRow({ effect, variables, lead, onChange, onRemove }: { effect: Effect; variables: Variable[]; lead?: string; onChange: (fn: (e: Effect) => void, key?: string) => void; onRemove: () => void }) {
  const v = variables.find((x) => x.id === effect.varId);
  return (
    <div className="rule-row">
      {lead && <span className="muted small">{lead}</span>}
      <VarSelect value={effect.varId} variables={variables} onChange={(varId) => onChange((x) => {
        const nv = variables.find((y) => y.id === varId)!;
        x.varId = varId;
        if (!EFFECT_OPS_FOR[nv.type].includes(x.op)) x.op = 'set';
        x.value = startValue(nv);
      })} />
      {v && (
        <>
          <select className="input small" value={effect.op} onChange={(e) => onChange((x) => { x.op = e.target.value as EffectOp; })}>
            {EFFECT_OPS_FOR[v.type].map((o) => <option key={o} value={o}>{EFFECT_LABEL[o]}</option>)}
          </select>
          {effect.op !== 'toggle' && <ValueInput small type={v.type} value={effect.value} onChange={(val) => onChange((x) => { x.value = val; }, 'value')} />}
        </>
      )}
      <button className="icon-btn" title="Remover efeito" onClick={onRemove}>✕</button>
    </div>
  );
}

function ConditionRow({ condition, variables, lead, onChange, onRemove }: { condition: Condition; variables: Variable[]; lead: string; onChange: (c: Condition) => void; onRemove: () => void }) {
  const v = variables.find((x) => x.id === condition.varId);
  return (
    <div className="rule-row cond">
      <span className="muted small">{lead}</span>
      <VarSelect value={condition.varId} variables={variables} onChange={(varId) => {
        const nv = variables.find((x) => x.id === varId)!;
        onChange({ ...condition, varId, op: OPS_FOR[nv.type].includes(condition.op) ? condition.op : '==', value: startValue(nv) });
      }} />
      {v && (
        <>
          <select className="input small" value={condition.op} onChange={(e) => onChange({ ...condition, op: e.target.value as CompareOp })}>
            {OPS_FOR[v.type].map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
          </select>
          <ValueInput small type={v.type} value={condition.value} onChange={(value) => onChange({ ...condition, value })} />
        </>
      )}
      <button className="icon-btn" title="Remover condição" onClick={onRemove}>✕</button>
    </div>
  );
}

export function StoryInspector({ story, issues, selectedCount, onFocus }: { story: Story; issues: Issue[]; selectedCount: number; onFocus: (id: Id) => void }) {
  const endings = story.nodes.filter((n) => n.type === 'final');
  const speakers = new Set(story.nodes.map((n) => n.speakerId).filter(Boolean)).size;
  const start = story.nodes.find((n) => n.id === story.startNodeId);
  return (
    <div className="inspector-inner">
      <h3>Sobre a história</h3>
      {selectedCount > 1 && <p className="muted small">{selectedCount} nós selecionados. Arraste para mover juntos ou aperte Delete para apagar.</p>}
      <label className="field">
        <span>Sinopse</span>
        <textarea className="input" rows={4} value={story.synopsis} placeholder="Do que trata esta história?"
          onChange={(e) => update((d) => {
            const s = d.stories.find((x) => x.id === story.id);
            if (s) s.synopsis = e.target.value;
          }, `story:${story.id}:synopsis`)} />
      </label>
      <ul className="facts">
        <li><strong>{story.nodes.length}</strong> nós</li>
        <li><strong>{endings.length}</strong> {endings.length === 1 ? 'final' : 'finais'}</li>
        <li><strong>{speakers}</strong> {speakers === 1 ? 'personagem fala' : 'personagens falam'}</li>
      </ul>
      {start && (
        <p className="small">
          Começa em <button className="link-btn" onClick={() => onFocus(start.id)}>{nodeLabel(start, 30)}</button>
        </p>
      )}
      {endings.length > 0 && (
        <section className="insp-section">
          <h4>Finais</h4>
          <ul className="plain">
            {endings.map((e) => <li key={e.id}><button className="link-btn" onClick={() => onFocus(e.id)}>{nodeLabel(e, 36)}</button></li>)}
          </ul>
        </section>
      )}
      {issues.length > 0 && (
        <section className="insp-section issues">
          <h4>Problemas</h4>
          <ul>
            {issues.slice(0, 12).map((i, k) => (
              <li key={k} className={i.level === 'erro' ? 'err' : 'warn'}>
                {i.nodeId ? <button className="link-btn" onClick={() => onFocus(i.nodeId)}>{i.message}</button> : i.message}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small">Selecione um nó no quadro para editar o texto, as escolhas e os efeitos.</p>
    </div>
  );
}
