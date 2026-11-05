# LoreCreator

Aplicativo para Windows para criar histórias de jogos: o **mundo** (personagens, locais, facções, itens, eventos, conceitos), a **linha do tempo** e **roteiros ramificados** com escolhas, condições, variáveis e vários finais.

## O que dá para fazer

- **Codex do mundo**: fichas com campos sugeridos por tipo (idade, região, líder…), tags, imagem, descrição e relações ("irmã de", "mora em"…).
  Escreva `[[Nome]]` (ou `[[Nome|texto]]`) em qualquer texto para ligar a outra entrada. Ao digitar `[[`, o app sugere nomes. Renomear uma entrada atualiza os links.
  Cada ficha mostra onde ela **aparece**: outras entradas, relações e falas nas histórias.
- **Linha do tempo**: os eventos do codex em ordem, com setas para reordenar.
- **Mapa de relações**: as entradas em um grafo. Arrastar entre dois cartões cria uma relação.
- **Histórias ramificadas**: quadro de nós (Cena, Fala, Final). Arraste de uma escolha até outro nó para ligar, ou até o vazio para criar o próximo nó já ligado.
  Cada nó tem efeitos em variáveis, e as escolhas podem exigir condições ("ouro ≥ 8"). O app avisa sobre escolhas sem destino, becos sem saída e nós inalcançáveis.
- **Testar**: jogue a história dentro do app, veja e altere as variáveis, volte passos e pule para editar o nó atual.
- **Exportar**:
  - **HTML jogável**: um arquivo único que abre em qualquer navegador.
  - **JSON para engines** (Unity, Godot, Unreal, Ren'Py…): nós, escolhas, condições, efeitos, personagens e codex.
  - **Markdown**: "bíblia do mundo" com codex, linha do tempo, variáveis e roteiros numerados.
- Salvamento automático, **Ctrl+Z / Ctrl+Y**, busca global com **Ctrl+K**.

## Onde ficam os projetos

Cada projeto é um arquivo `.lore` (JSON) em `Documentos\LoreCreator Projetos`. Também é possível abrir e salvar cópias em qualquer pasta.
Na primeira gravação de cada sessão, o app guarda a versão anterior em `arquivo.lore.bak`. Com o app instalado, dar dois cliques num `.lore` abre o projeto.

## Desenvolvimento

```bash
npm install
npm run app:dev     # Vite + Electron com recarga automática
npm run dev         # só a interface no navegador (projetos ficam no localStorage)
npm test            # testes do motor das histórias
npm run typecheck
npm run dist:win    # gera o instalador e a versão portátil em release/
```

Estrutura:

| Pasta | Conteúdo |
|---|---|
| `electron/` | processo principal (arquivos, diálogos, associação `.lore`) e preload |
| `src/model/` | tipos, criação, validação/migração de projetos, links `[[...]]`, projeto de exemplo |
| `src/engine/` | `runtime.js` (condições, efeitos, texto; também vai embutido no HTML exportado) e análise/organização das histórias |
| `src/store/` | estado do projeto com desfazer/refazer e salvamento automático; navegação |
| `src/views/`, `src/components/` | telas e componentes |
| `src/export/` | exportadores e o player do HTML jogável |

O ícone é gerado por `npm run icon` (`scripts/make-icon.mjs`).
