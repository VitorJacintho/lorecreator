/** Variáveis do jogo: guardam escolhas e recursos (confiança, ouro, itens…) usados nas condições das histórias. */
import { confirmDialog } from '../components/dialogs';
import { NumInput } from '../components/text';
import { coerce, defaultValue, newVariable } from '../model/factory';
import type { VarType, Variable } from '../model/types';
import { update, useProject } from '../store/store';

const TYPE_LABEL: Record<VarType, string> = { bool: 'Sim/Não', number: 'Número', text: 'Texto' };

export function Variables() {
  const project = useProject();

  const usage = (v: Variable) => {
    let n = 0;
    for (const s of project.stories) for (const node of s.nodes) {
      n += node.effects.filter((e) => e.varId === v.id).length;
      n += node.choices.filter((c) => c.condition?.varId === v.id).length;
      if (node.text.toLowerCase().includes(`{${v.name.toLowerCase()}}`)) n++;
    }
    return n;
  };

  const edit = (id: string, fn: (v: Variable) => void, key?: string) =>
    update((d) => {
      const v = d.variables.find((x) => x.id === id);
      if (v) fn(v as Variable);
    }, key && `var:${id}:${key}`);

  const add = () => {
    let i = project.variables.length + 1;
    while (project.variables.some((v) => v.name === `variavel_${i}`)) i++;
    update((d) => {
      d.variables.push(newVariable(`variavel_${i}`));
    });
  };

  const changeType = (v: Variable, type: VarType) =>
    update((d) => {
      const x = d.variables.find((y) => y.id === v.id);
      if (!x) return;
      x.type = type;
      x.initial = defaultValue(type);
      // ajusta condições e efeitos para o novo tipo
      for (const s of d.stories) for (const n of s.nodes) {
        for (const e of n.effects) if (e.varId === v.id) {
          e.value = coerce(type, e.value);
          if ((e.op === 'add' || e.op === 'sub') && type !== 'number') e.op = 'set';
          if (e.op === 'toggle' && type !== 'bool') e.op = 'set';
        }
        for (const c of n.choices) if (c.condition?.varId === v.id) c.condition.value = coerce(type, c.condition.value);
      }
    });

  const remove = async (v: Variable) => {
    const used = usage(v);
    if (used > 0) {
      const ok = await confirmDialog({
        title: `Apagar "${v.name}"?`,
        message: `Ela é usada ${used} ${used === 1 ? 'vez' : 'vezes'} nas histórias. Condições e efeitos com ela vão aparecer como erro até você corrigir. Dá para desfazer com Ctrl+Z.`,
        confirmLabel: 'Apagar',
        danger: true,
      });
      if (!ok) return;
    }
    update((d) => {
      d.variables = d.variables.filter((x) => x.id !== v.id);
    });
  };

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <h2>Variáveis</h2>
          <p className="muted">
            Guardam o que o jogador fez. Use nas histórias como <strong>efeitos</strong> (mudar o valor ao entrar em um nó),{' '}
            <strong>condições</strong> (liberar uma escolha) e no texto como <code>{'{nome}'}</code>.
          </p>
        </div>
        <button className="btn primary" onClick={add}>＋ Nova variável</button>
      </div>
      {project.variables.length === 0 ? (
        <div className="empty">
          <p>Nenhuma variável ainda.</p>
          <p className="muted">Exemplos: <code>confia_no_rei</code> (Sim/Não), <code>ouro</code> (Número), <code>nome_do_navio</code> (Texto).</p>
        </div>
      ) : (
        <table className="var-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Valor inicial</th>
              <th>Descrição</th>
              <th>Usos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.variables.map((v) => {
              const dup = project.variables.some((o) => o.id !== v.id && o.name.toLowerCase() === v.name.toLowerCase());
              return (
                <tr key={v.id}>
                  <td>
                    <input className={`input mono${dup ? ' invalid' : ''}`} value={v.name} title={dup ? 'Já existe outra variável com este nome' : ''}
                      onChange={(e) => edit(v.id, (x) => { x.name = e.target.value.replace(/[{}\s]/g, '_'); }, 'name')} />
                  </td>
                  <td>
                    <select className="input" value={v.type} onChange={(e) => changeType(v, e.target.value as VarType)}>
                      {(Object.keys(TYPE_LABEL) as VarType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                  </td>
                  <td>
                    <ValueInput type={v.type} value={v.initial} onChange={(val) => edit(v.id, (x) => { x.initial = val; }, 'initial')} />
                  </td>
                  <td>
                    <input className="input" value={v.description} placeholder="Para que serve?"
                      onChange={(e) => edit(v.id, (x) => { x.description = e.target.value; }, 'desc')} />
                  </td>
                  <td className="muted center">{usage(v)}</td>
                  <td>
                    <button className="icon-btn" title="Apagar" onClick={() => void remove(v)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ValueInput({ type, value, onChange, small }: { type: VarType; value: Variable['initial']; onChange: (v: Variable['initial']) => void; small?: boolean }) {
  const cls = `input${small ? ' small' : ''}`;
  if (type === 'bool') {
    return (
      <select className={cls} value={value ? 'true' : 'false'} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="true">sim</option>
        <option value="false">não</option>
      </select>
    );
  }
  if (type === 'number') {
    return <NumInput className={cls} value={Number(value)} onChange={onChange} />;
  }
  return <input className={cls} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
}
