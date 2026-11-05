/** Resultado do simulador de caminhos: o que o jogador consegue (ou não) alcançar em uma história. */
import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from '../components/dialogs';
import { describeConditions, nodeLabel } from '../engine/analyze';
import { formatValue } from '../engine/runtime';
import { MAX_STATES, simulateStory, type RouteStep, type SimResult, type StuckReason } from '../engine/simulate';
import type { Id, Story } from '../model/types';
import { useProject } from '../store/store';
import { setUi } from '../store/ui';
import { plural } from '../util';

const STUCK_TEXT: Record<StuckReason, string> = {
  'sem-escolhas': 'Este nó não tem escolhas e não é um final.',
  bloqueadas: 'O jogador pode chegar aqui sem cumprir nenhuma das condições.',
  'sem-destino': 'As escolhas liberadas aqui não levam a lugar nenhum.',
};

interface Props {
  story: Story;
  onClose: () => void;
  onFocus: (id: Id) => void;
}

export function SimulationReport({ story, onClose, onFocus }: Props) {
  const project = useProject();
  const variables = project.variables;
  const [result, setResult] = useState<SimResult | null>(null);

  useEffect(() => {
    setResult(null);
    // deixa o "Simulando…" aparecer antes da conta, que roda de uma vez
    const t = setTimeout(() => setResult(simulateStory(story, variables)), 30);
    return () => clearTimeout(t);
  }, [story, variables]);

  const nodeById = new Map(story.nodes.map((n) => [n.id, n]));
  const name = (id: Id) => {
    const n = nodeById.get(id);
    return n ? nodeLabel(n, 44) : '(apagado)';
  };
  const see = (id: Id) => {
    onClose();
    onFocus(id);
  };
  const play = (route: RouteStep[]) => {
    onClose();
    setUi({ playtest: { storyId: story.id, route } });
  };

  const seeButton = (id: Id) => <button className="btn small ghost" onClick={() => see(id)}>Ver no quadro</button>;
  const playButton = (route: RouteStep[], label: string) => <button className="btn small" onClick={() => play(route)}>▶ {label}</button>;

  const body = () => {
    if (!result) return <p className="muted">Simulando…</p>;
    const reached = result.endings.filter((e) => e.route).length;
    const problems = result.stuck.length + result.loops.length + result.lockedChoices.length + result.blockedNodes.length + (result.endings.length - reached);
    const verified = result.complete && problems === 0 && result.endings.length > 0;
    const numberVars = result.ranges.map((r) => ({ ...r, variable: variables.find((v) => v.id === r.varId) }));

    return (
      <>
        <p className="sim-summary">
          <strong>{reached} de {plural(result.endings.length, 'final', 'finais')}</strong> {reached === 1 ? 'alcançável' : 'alcançáveis'} ·{' '}
          <span title="Cada situação é um nó com uma combinação de valores das variáveis">{plural(result.states, 'situação testada', 'situações testadas')}</span>
        </p>

        {verified && <div className="sim-banner good">✓ Todos os finais podem ser alcançados e o jogador nunca fica preso.</div>}
        {!result.complete && (
          <div className="sim-banner warn">
            Esta história tem combinações demais para testar todas (o limite é {MAX_STATES.toLocaleString('pt-BR')} situações). O que aparece como alcançável está
            confirmado, mas o que não apareceu pode existir em caminhos mais longos.
          </div>
        )}

        <Section title="Finais" hint={result.endings.length === 0 ? 'Esta história ainda não tem nós do tipo Final.' : undefined}>
          {result.endings.map((e) => (
            <Row key={e.nodeId} mark={e.route ? '✓' : '✕'} tone={e.route ? 'ok' : 'bad'}
              title={name(e.nodeId)}
              detail={e.route
                ? `Caminho mais curto: ${plural(e.route.length - 1, 'escolha', 'escolhas')}`
                : !e.linked
                  ? 'Nenhuma escolha leva até este final.'
                  : result.complete ? 'As condições nunca deixam o jogador chegar aqui.' : 'Não foi alcançado nas situações testadas.'}
              actions={e.route ? playButton(e.route, 'Jogar este caminho') : seeButton(e.nodeId)}
              route={e.route}
              name={name} />
          ))}
        </Section>

        <Section title="Onde o jogador fica preso">
          {result.stuck.map((s) => {
            const node = nodeById.get(s.nodeId);
            const last = s.route[s.route.length - 1].vars;
            const read = new Set(node?.choices.flatMap((c) => c.conditions.map((x) => x.varId)));
            const values = variables.filter((v) => read.has(v.id)).map((v) => `${v.name} = ${formatValue(last[v.id])}`);
            return (
              <Row key={s.nodeId} mark="⛔" tone="bad" title={name(s.nodeId)}
                detail={`${STUCK_TEXT[s.reason]}${s.reason === 'bloqueadas' && values.length ? ` Exemplo: ${values.join(', ')}.` : ''}`}
                actions={<>{playButton(s.route, 'Jogar até aqui')}{seeButton(s.nodeId)}</>}
                route={s.route}
                name={name} />
            );
          })}
          {result.loops.map((l) => (
            <Row key={l.nodeId} mark="🔁" tone="bad" title={name(l.nodeId)}
              detail="Este nó faz parte de um laço sem saída: as escolhas só andam em círculos e nenhum final é alcançado."
              actions={<>{playButton(l.route, 'Jogar até aqui')}{seeButton(l.nodeId)}</>}
              route={l.route}
              name={name} />
          ))}
        </Section>

        <Section title="Escolhas que nunca liberam">
          {result.lockedChoices.map(({ nodeId, choiceId }) => {
            const choice = nodeById.get(nodeId)?.choices.find((c) => c.id === choiceId);
            if (!choice) return null;
            return (
              <Row key={choiceId} mark="🔒" tone="warn" title={`${name(nodeId)}: “${choice.text.trim() || 'Continuar'}”`}
                detail={`Exige ${describeConditions(choice, variables)}, o que nunca acontece.`}
                actions={seeButton(nodeId)} name={name} />
            );
          })}
        </Section>

        <Section title="Nós que o jogador nunca vê" hint={result.blockedNodes.length ? 'Existe ligação até eles, mas as condições nunca deixam passar.' : undefined}>
          {result.blockedNodes.map((id) => (
            <Row key={id} mark="○" tone="warn" title={name(id)} actions={seeButton(id)} name={name} />
          ))}
        </Section>

        {(numberVars.length > 0 || result.skippedVars.length > 0) && (
          <section className="sim-section">
            <h3>Valores das variáveis numéricas</h3>
            {!result.complete && <p className="muted">Só até onde deu para testar.</p>}
            {result.skippedVars.length > 0 && (
              <p className="muted">Variáveis que nenhuma condição usa ficaram fora da conta: {result.skippedVars.map((id) => variables.find((v) => v.id === id)?.name).join(', ')}.</p>
            )}
            {numberVars.length > 0 && (
              <table className="sim-ranges">
                <tbody>
                  {numberVars.map((r) => (
                    <tr key={r.varId}>
                      <td className="mono">{r.variable?.name}</td>
                      <td>{r.min === r.max ? `sempre ${r.min}` : `de ${r.min} a ${r.max}`}</td>
                      <td className="warn-line">{r.min < 0 ? '⚠ pode ficar negativa' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </>
    );
  };

  return <Modal wide title={`🧭 Simulação: ${story.name}`} onClose={onClose}>{body()}</Modal>;
}

/** Seção com título; some quando não há nada para mostrar. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  if (items.length === 0 && !hint) return null;
  return (
    <section className="sim-section">
      <h3>{title}</h3>
      {hint && <p className="muted">{hint}</p>}
      {items.length > 0 && <ul className="sim-list">{items}</ul>}
    </section>
  );
}

function Row({ mark, tone, title, detail, actions, route, name }: {
  mark: string;
  tone: 'ok' | 'bad' | 'warn';
  title: string;
  detail?: string;
  actions: ReactNode;
  route?: RouteStep[] | null;
  name: (id: Id) => string;
}) {
  return (
    <li className="sim-row">
      <span className={`sim-mark ${tone}`} aria-hidden="true">{mark}</span>
      <div>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <div className="sim-actions">{actions}</div>
      {route && route.length > 1 && (
        <details className="sim-route">
          <summary>Ver o caminho</summary>
          <ol>
            {route.map((step, i) => (
              <li key={i}>
                {step.via && <span>“{step.via}” → </span>}
                {name(step.nodeId)}
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}
