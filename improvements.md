# Improvements for jarvis-app

## Visao atual (2026-03-18)

O Jarvis evoluiu de um chat local para um nucleo documental com memoria treinavel, runtime local de IA e interface centrada no `Central Core`.

Prioridades ativas:

- abrir rapido
- responder com mais estabilidade
- reduzir custo de processamento durante streaming
- recuperar contexto util com mais confianca
- manter uma experiencia visual forte sem comprometer performance

## Direcao de produto

### Home e experiencia

- O palco principal deve continuar dominado pelo `Central Core`.
- `Memory Bay`, `Dialogue Layer` e `System Pulse` seguem como camadas da mesma experiencia.
- A interface deve continuar limpa, com foco em acao e leitura rapida do estado do sistema.

### Memoria e RAG

- Ingestao manual continua sendo o fluxo principal.
- Pipeline de preparo para IA antes de chunking/embeddings.
- Transparencia do estado por documento (pronto, processando, erro, reindex necessario).
- Recuperacao contextual com fallback robusto, evitando respostas vazias.

### Conversa

- Chat em drawer lateral responsivo.
- Fluxo de streaming otimizado para reduzir travamento.
- Respostas devem alternar entre:
  - documental com `Fontes:` quando houver contexto
  - conhecimento geral util quando nao houver contexto confiavel

### Visual

- Nucleo holografico maior e com mais profundidade.
- Reatividade visual por interacao do usuario.
- Cor temporaria durante atividade e retorno ao estado base ao concluir.
- Sem pulsacao forcada, preservando legibilidade e custo controlado.

## Melhorias implementadas (consolidado)

### UX/UI

- Home reorganizada e drawers estabilizados.
- Responsividade refinada em diferentes breakpoints.
- Nucleo visual separado em componente dedicado para evolucao continua.

### Nucleo holografico

- Escala visual ampliada no palco.
- Mais aneis, conexoes e particulas.
- Troca de paleta por interacao.
- Remocao da pulsacao.
- Retorno automatico para cor base ao finalizar resposta/treino.

### RAG, grounding e fallback

- Prompt atualizado para evitar placeholder vazio.
- `Fontes:` somente quando contexto recuperado foi realmente usado.
- Retrieval factual com fallback progressivo para reduzir casos sem contexto util.

### Produto e transparencia da memoria

- `Memory Bay` operacional para remover documentos.
- `Memory Bay` operacional para reprocessar documentos.
- `Memory Bay` operacional para limpar toda a base.
- Preview de documento preparado disponivel por documento.
- Preview de chunks indexados disponivel por documento.
- Status de reindexacao mais explicito no fluxo.
- Fontes usadas exibidas diretamente na UI de resposta.

### Runtime e estabilidade

- Validacao de ambiente Ollama no boot.
- Tentativa automatica de subida do servico quando necessario.
- Logs e diagnostico com mais contexto.

### Performance

- Streaming com flush em lote no renderer.
- Autoscroll otimizado para nao animar em loop durante streaming.
- Render de streaming com texto simples e markdown completo ao final.
- Memoizacao de `HolographicBrain`, `MessageBubble` e `MarkdownRenderer`.
- Canvas otimizado com:
  - limite de DPR
  - densidade adaptativa
  - throttle de frame (~45 FPS)
  - skip de trabalho com aba oculta

## Problemas ainda abertos

### 1. Carga em hardware mais fraco durante respostas longas

Mesmo com melhorias, ainda pode haver picos em maquinas com GPU/CPU limitadas.

Melhorias desejadas:

- modo economico automatico durante `isProcessing`
- reducao adicional de densidade visual enquanto stream estiver ativo
- ajuste dinamico de flush interval no chat

### 2. Qualidade de retrieval factual em bases heterogeneas

Ainda ha espaco para melhorar precision quando a base contem materiais grandes e genericos.

Melhorias desejadas:

- filtros por documento/colecao
- estrategia hibrida (keyword + semantica)
- reranking mais forte

### 3. Transparencia da memoria para o usuario

Status: resolvido na rodada atual.

## Prioridades recomendadas (proxima fase)

### Prioridade 1: qualidade de resposta documental

- melhorar ranking factual com filtros por documento/colecao
- evoluir para estrategia hibrida (`keyword` + semantica)
- adicionar reranking mais forte
- reduzir chance de respostas genericas quando houver contexto util

### Prioridade 2: estabilizacao adicional de performance

- continuar calibracao para hardware mais fraco em respostas longas
- ajustar dinamicamente flush interval por carga real
- validar latencia/FPS em cenarios extensos de uso

### Prioridade 3: refinamento de produto

- evoluir governanca da memoria (colecoes, filtros e auditoria de contexto)
- melhorar UX de operacao em bases grandes

## Resultado esperado

Com essa trilha, o Jarvis fica mais fluido durante resposta, mais confiavel em grounding documental e mais consistente como "cerebro documental local" para uso diario.
