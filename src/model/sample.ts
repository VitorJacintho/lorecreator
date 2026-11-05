/** Projeto de exemplo: mostra codex, linha do tempo, relações, variáveis e uma história com três finais. */
import { autoLayout } from '../engine/analyze';
import { newChoice, newEntry, newProject, newStory, newStoryNode, newVariable, uid } from './factory';
import type { CompareOp, Condition, Effect, Entry, EntryKind, NodeType, Project, StoryNode, VarValue } from './types';

export function sampleProject(): Project {
  const p = newProject(
    'As Cinzas de Velmora',
    'Fantasia sombria · RPG narrativo',
    'Depois que o farol de Velmora se apagou, a bruma engoliu o litoral e apagou a memória de quem respira nela. Uma cartógrafa sem passado precisa reacender a chama antes que a Maré Cinzenta alcance a capital.',
  );

  const entry = (kind: EntryKind, name: string, summary: string, body: string, fields: Record<string, string> = {}, tags: string[] = []) => {
    const e = newEntry(kind, name);
    e.summary = summary;
    e.body = body;
    e.tags = tags;
    e.fields = e.fields.map((f) => ({ ...f, value: fields[f.key] ?? '' }));
    p.entries.push(e);
    return e;
  };
  const relate = (from: Entry, label: string, to: Entry) => from.relations.push({ id: uid(), label, targetId: to.id });

  const iara = entry('personagem', 'Iara Venn', 'Cartógrafa que acordou na praia sem nenhuma lembrança.',
    'Protagonista. Carrega um mapa queimado que aponta para o [[O Farol de Cinzas]]. Fragmentos de memória voltam quando ela desenha.',
    { Idade: '27', Espécie: 'Humana', Ocupação: 'Cartógrafa da Guilda', Objetivo: 'Lembrar quem é e reacender o farol', Medo: 'Descobrir que causou o naufrágio' },
    ['protagonista']);
  const odrin = entry('personagem', 'Mestre Odrin', 'Velho guardião do farol, o último que ainda lembra da chama.',
    'Foi mentor de Iara na [[Guilda dos Cartógrafos]] antes de se exilar no farol. Guarda a [[A Lente Ardente]].',
    { Idade: '71', Espécie: 'Humano', Ocupação: 'Guardião do farol', Segredo: 'Foi ele quem apagou o farol' },
    ['mentor']);
  const kael = entry('personagem', 'Kael Morrow', 'Contrabandista charmoso que conhece todas as trilhas do pântano.',
    'Trabalha para a [[Ordem da Maré Cinzenta]], mas quer sair. Pode virar aliado — se Iara confiar nele.',
    { Idade: '31', Ocupação: 'Contrabandista', Objetivo: 'Comprar a própria liberdade', Medo: 'A Viúva de Sal' },
    ['aliado?']);
  const viuva = entry('personagem', 'A Viúva de Sal', 'Líder da Ordem; acredita que esquecer é uma bênção.',
    'Perdeu a família no mar e encontrou paz na bruma. Quer que a [[A Bruma]] cubra todo o reino.',
    { Ocupação: 'Grã-mestra da Ordem', Objetivo: 'Espalhar a bruma pelo reino', Segredo: 'Ainda guarda o nome do filho' },
    ['antagonista']);

  const velmora = entry('local', 'Velmora', 'Cidade portuária construída em terraços sobre o mar.',
    'Antiga capital da cartografia. Desde que o farol se apagou, metade da cidade vive dentro da bruma.',
    { Região: 'Costa de Ferro', Clima: 'Frio e úmido', População: '12 mil (antes da bruma)' });
  const farol = entry('local', 'O Farol de Cinzas', 'Farol cuja chama mantinha a bruma longe da costa.',
    'Seus 400 degraus são cobertos de mapas antigos. A chama só acende com a [[A Lente Ardente]].',
    { Região: 'Ponta de Velmora' });
  const pantano = entry('local', 'Pântano dos Sussurros', 'Atalho perigoso entre o porto e o farol.',
    'Quem entra sem guia ouve vozes com o próprio nome — e esquece o caminho de volta.',
    { Clima: 'Bruma permanente' });

  const ordem = entry('faccao', 'Ordem da Maré Cinzenta', 'Culto que venera a bruma como misericórdia.',
    'Liderada por [[A Viúva de Sal]]. Recruta pessoas que querem esquecer o próprio passado.',
    { Líder: 'A Viúva de Sal', Sede: 'Ruínas submersas', Objetivo: 'Cobrir o reino com a bruma', Inimigos: 'Guilda dos Cartógrafos' });
  const guilda = entry('faccao', 'Guilda dos Cartógrafos', 'Os que mapeiam o mundo — e, com isso, o fazem lembrar.',
    'Os mapas da Guilda são encantados: um lugar desenhado não pode ser apagado pela bruma.',
    { Sede: 'Velmora', Inimigos: 'Ordem da Maré Cinzenta' });

  const lente = entry('item', 'A Lente Ardente', 'Cristal que concentra a luz do farol.',
    'Só funciona nas mãos de quem lembra o próprio nome.', { Raridade: 'Única', Poder: 'Dissipa a bruma', Origem: 'Forjada na fundação de Velmora' });

  const bruma = entry('conceito', 'A Bruma', 'Névoa que apaga memórias de quem a respira.',
    'Lugares mapeados resistem a ela. Pessoas com vínculos fortes demoram mais a esquecer.',
    { Regras: 'Apaga primeiro os nomes, depois os rostos', Limites: 'Não atravessa a luz do farol' });

  const ev = (name: string, when: string, order: number, summary: string) => {
    const e = entry('evento', name, summary, '');
    e.when = when;
    e.order = order;
    return e;
  };
  const fundacao = ev('A Fundação de Velmora', 'Ano 0', 0, 'Os primeiros cartógrafos forjam a Lente e acendem o farol.');
  const apagar = ev('O Apagar do Farol', 'Ano 312', 1, 'Numa noite sem lua, a chama se apaga e a bruma avança.');
  const naufragio = ev('O Naufrágio de Iara', 'Ano 312, inverno', 2, 'O navio da Guilda afunda; Iara é a única sobrevivente.');

  relate(iara, 'discípula de', odrin);
  relate(iara, 'membro de', guilda);
  relate(odrin, 'guardião de', farol);
  relate(kael, 'trabalha para', ordem);
  relate(viuva, 'líder de', ordem);
  relate(farol, 'fica em', velmora);
  relate(pantano, 'liga o porto de', velmora);
  relate(bruma, 'contida por', farol);
  relate(lente, 'guardada em', farol);
  relate(ordem, 'inimiga de', guilda);
  relate(fundacao, 'origem de', lente);
  relate(apagar, 'causado por', odrin);
  relate(naufragio, 'envolve', iara);

  const confia = newVariable('confia_kael', 'bool');
  confia.description = 'Iara aceitou a ajuda de Kael no porto.';
  const ouro = newVariable('ouro', 'number');
  ouro.initial = 10;
  ouro.description = 'Moedas que Iara carrega.';
  const temLente = newVariable('tem_lente', 'bool');
  temLente.description = 'Iara está com a Lente Ardente.';
  p.variables.push(confia, ouro, temLente);

  const story = newStory('Capítulo 1 — O Farol Apagado');
  story.synopsis = 'Iara acorda em Velmora e precisa chegar ao farol. A forma como ela trata Kael decide o final.';
  const node = (type: NodeType, title: string, text: string, speaker?: Entry): StoryNode => {
    const n = newStoryNode(type, { x: 0, y: 0 }, text);
    n.title = title;
    if (speaker) n.speakerId = speaker.id;
    story.nodes.push(n);
    return n;
  };
  const link = (from: StoryNode, text: string, to: StoryNode, conditions: Condition[] = [], effects: Effect[] = []) =>
    from.choices.push({ ...newChoice(to.id, text), conditions, effects });
  const se = (varId: string, op: CompareOp, value: VarValue): Condition => ({ id: uid(), varId, op, value });

  const n1 = story.nodes[0];
  n1.title = 'Despertar';
  n1.text = 'Você acorda na praia de [[Velmora]], encharcada e sem memórias. Na sua mão, um mapa queimado aponta para o [[O Farol de Cinzas|farol]]. No bolso, {ouro} moedas.';
  const n2 = node('fala', 'O guardião',
    'Então a maré te devolveu, menina. Faz anos que ninguém sobe estes degraus. A [[A Lente Ardente|Lente]] ainda está aqui — mas a chama precisa de alguém que lembre o próprio nome.', odrin);
  n2.effects.push({ id: uid(), varId: temLente.id, op: 'set', value: true });
  const n3 = node('fala', 'O contrabandista',
    'Uma cartógrafa da Guilda, aqui? Posso te levar ao farol pelo [[Pântano dos Sussurros|pântano]]... por 8 moedas.', kael);
  const n4 = node('cena', 'Pelo pântano',
    'Kael guia você pela bruma. No caminho, confessa que trabalha para a [[Ordem da Maré Cinzenta]] — mas jura que quer sair.');
  const n5 = node('fala', 'O topo do farol',
    'Devolva a Lente, cartógrafa. A bruma é misericórdia. Esquecer dói menos do que lembrar.', viuva);
  const n6 = node('final', 'Chama solitária', 'A chama volta a arder e a Viúva desaparece na bruma. Velmora está salva — por enquanto.');
  const n7 = node('final', 'Juntos', 'Kael surge na escada e derruba a Viúva. Juntos, vocês reacendem o farol. Pela primeira vez, você lembra o seu nome.');
  const n8 = node('final', 'A bruma vence', 'Você entrega a Lente. A bruma engole o farol — e o seu nome se perde para sempre.');

  link(n1, 'Seguir direto para o farol', n2);
  link(n1, 'Procurar ajuda no porto', n3);
  link(n3, 'Pagar Kael (8 moedas)', n4, [se(ouro.id, '>=', 8)], [
    { id: uid(), varId: ouro.id, op: 'sub', value: 8 },
    { id: uid(), varId: confia.id, op: 'set', value: true },
  ]);
  link(n3, 'Recusar e ir sozinha', n2);
  link(n4, '', n2);
  link(n2, 'Pegar a Lente e subir', n5);
  link(n5, 'Acender o farol', n6);
  link(n5, 'Chamar Kael', n7, [se(confia.id, '==', true), se(temLente.id, '==', true)]);
  link(n5, 'Entregar a Lente', n8);

  const layout = autoLayout(story);
  for (const n of story.nodes) n.position = layout.get(n.id) ?? n.position;
  p.stories.push(story);

  // posições do mapa de relações em círculo
  p.entries.forEach((e, i) => {
    const a = (i / p.entries.length) * Math.PI * 2;
    e.mapPos = { x: Math.round(Math.cos(a) * 420), y: Math.round(Math.sin(a) * 300) };
  });
  return p;
}
