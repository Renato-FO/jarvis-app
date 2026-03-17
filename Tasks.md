# Tasks

## Objetivo desta consolidacao

Este arquivo resume o que foi implementado no `jarvis-app`, o estado atual e os proximos passos mais importantes.

## O que foi implementado

### 1. Experiencia principal da home

- Home centrada no `Central Core`.
- `Memory Bay`, `Dialogue Layer` e `System Pulse` como camadas sobrepostas.
- Chat em drawer lateral (metade da area util em desktop).
- Limpeza visual da home com remocao de cards fixos abaixo do nucleo.

### 2. Responsividade

- Ajustes para desktop, tablet e mobile.
- Melhor comportamento de drawers e composer em larguras pequenas.

### 3. Nucleo visual holografico

- Componente visual dedicado em `HolographicBrain.tsx`.
- Nucleo ampliado para maior presenca no palco.
- Mais aneis/camadas, conexoes e particulas.
- Troca de cor por interacao do usuario (pergunta/envio).
- Cor temporaria durante processamento/treino e retorno ao tom base ao finalizar.
- Pulsacao removida por solicitacao.

### 4. Ingestao de documentos no app

- Ingestao manual pela interface.
- Suporte a multiplos formatos: PDF, MD, TXT, JSON, CSV, JS/TS/JSX/TSX, HTML/CSS/XML/YAML.
- Pipeline de preparo para IA antes de chunking/embeddings.

### 5. RAG e retrieval (LangChain)

- Migracao da camada de retrieval para LangChain (`Document`, splitters, embeddings e `MemoryVectorStore`).
- Persistencia vetorial em JSON.
- Modo factual com heuristicas de ranking.
- IDs de contexto `CTX-*` para rastreabilidade.

### 6. Grounding e resposta

- Prompt reforcado para usar contexto recuperado quando houver resposta direta.
- Ajuste para evitar resposta vazia no formato:
  - `Nenhum contexto adicional encontrado.`
  - `Fontes:`
- Quando nao houver contexto confiavel, resposta com conhecimento geral util.
- `Fontes:` apenas quando houver uso real de contexto recuperado.
- Fallback progressivo no retrieval factual:
  - filtro estrito
  - ampliacao de criterio
  - melhores hits disponiveis

### 7. Runtime e estabilidade

- Validacao do Ollama no boot (servidor, modelos e aquecimento).
- Tentativa de iniciar `ollama serve` quando necessario.
- Status de runtime exposto para a UI.
- Instrumentacao de erro com contexto mais detalhado.

### 8. Performance (rodada atual)

- Streaming do chat em lotes curtos para reduzir rerender por chunk.
- `HolographicBrain` otimizado com:
  - `memo`
  - limite de DPR
  - densidade adaptativa de elementos
  - throttle de frame (~45 FPS)
  - pausa quando a aba nao esta visivel
- Autoscroll otimizado:
  - `auto` durante streaming
  - `smooth` fora de streaming
- Render de streaming do Jarvis mais leve:
  - texto simples durante transmissao
  - markdown completo ao finalizar
- `MessageBubble` e `MarkdownRenderer` memoizados.

## Problemas diagnosticados e status

### 1. Resposta documental incorreta por retrieval

- Status: parcialmente mitigado.
- Melhorias aplicadas em ranking e fallback, mas ainda requer calibracao fina em bases grandes.

### 2. Resposta vazia sem contexto util

- Status: corrigido no fluxo principal.
- O modelo nao deve mais responder com placeholder vazio de contexto/fontes.

### 3. Travamento durante resposta em streaming

- Status: melhorado.
- Houve reducao de custo em render e canvas; ainda pode haver carga dependendo do hardware/base.

## Estado atual

- Home centrada no nucleo e camadas operacionais.
- Ingestao manual e preparo de documentos para IA.
- RAG em LangChain com persistencia JSON.
- Runtime do Ollama validado e monitorado.
- Nucleo visual mais forte e mais reativo.
- Streaming mais estavel em performance.

## Proximos passos prioritarios

### Curto prazo

- Medir latencia/CPU com perfilador durante respostas longas.
- Ajustar `STREAM_FLUSH_INTERVAL_MS` por hardware (ex: 40 -> 60/80ms quando necessario).
- Aplicar "modo economico" do nucleo durante `isProcessing` para maquinas mais fracas.

### Produto e memoria

- Tornar `Memory Bay` operacional (remover, reprocessar, limpar, visualizar chunks/prepared).
- Exibir fontes usadas diretamente na UI de resposta.

### Qualidade de retrieval

- Melhorar ranking factual com filtros por documento/colecao.
- Evoluir para estrategia hibrida (keyword + semantica + reranking).

## Arquivos mais impactados

- `src/renderer/src/App.tsx`
- `src/renderer/src/assets/main.css`
- `src/renderer/src/components/HolographicBrain.tsx`
- `src/renderer/src/components/MessageBubble/index.tsx`
- `src/renderer/src/components/MarkdownRenderer.tsx`
- `src/renderer/src/hooks/useJarvis.ts`
- `src/main/index.ts`
- `src/main/services/KnowledgeBase.ts`
- `src/files/system_prompt.ts`

## Validacao tecnica desta rodada

- `npm.cmd run typecheck` executado com sucesso apos as alteracoes.
