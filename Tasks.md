# Tasks

## Objetivo desta consolidação

Este arquivo resume o que foi feito ao longo da conversa no `jarvis-app`, o estado atual do produto e os próximos passos mais importantes.

## O que foi implementado

### 1. Redesenho da experiência principal

- A home foi reposicionada para girar em torno do `Central Core`.
- `Memory Bay`, `Dialogue Layer` e `System Pulse` passaram a ser camadas sobrepostas.
- O chat deixou de ser um painel fixo e passou a abrir como drawer.
- O drawer do chat foi ajustado para ocupar metade da área útil em desktop.
- O chat passou a usar 100% da altura útil do painel.
- Foram removidos cards fixos sob o núcleo para deixar a home mais limpa.

### 2. Responsividade

- O layout foi ajustado para telas menores.
- O núcleo e os drawers passaram a responder melhor em larguras pequenas.
- O composer do chat foi ajustado para não quebrar em resoluções compactas.

### 3. Núcleo visual

- Foi criado um componente visual dedicado inspirado em `brain.html`.
- O cérebro holográfico passou a ter controle de velocidade conforme o estado:
  - idle
  - training
  - responding
- O visual foi isolado em componente próprio para facilitar evolução.

### 4. Ingestão de documentos dentro do app

- O app deixou de depender de carregamento automático de documentos no boot.
- A ingestão passou a acontecer pela interface.
- O pipeline passou a aceitar múltiplos formatos:
  - PDF
  - MD
  - TXT
  - JSON
  - CSV
  - JS/TS/JSX/TSX
  - HTML/CSS/XML/YAML

### 5. Preparação de arquivos para IA

- Foi criada uma etapa dedicada de preparação de documentos antes do RAG.
- O sistema agora:
  - extrai o conteúdo
  - limpa ruído
  - reorganiza o texto
  - gera versão preparada para IA
  - só depois faz chunking e embeddings
- A versão preparada é salva localmente em pasta dedicada.

### 6. Proteções para arquivos grandes

- O pipeline passou a quebrar chunks grandes de forma mais segura.
- O contexto enviado ao modelo passou a ter orçamento máximo.
- O histórico de conversa enviado ao modelo também passou a ser limitado.
- Foram adicionados fallbacks para evitar erros com conteúdo indefinido.

### 7. Ollama e runtime

- Foi implementada validação de runtime do Ollama.
- O app verifica:
  - se o servidor está acessível
  - se os modelos existem
  - se os modelos foram aquecidos
- Quando necessário, tenta iniciar `ollama serve`.
- O status do runtime foi exposto para a interface.

### 8. Instrumentação e debug

- Erros de ingestão passaram a mostrar:
  - etapa
  - arquivo
  - extensão
  - tamanho bruto
  - tamanho preparado
  - quantidade de chunks
  - stack
- Erros do fluxo de chat e embeddings também passaram a ser logados com mais contexto.
- Foi adicionado `console.log` do contexto recuperado para análise do RAG.

### 9. Persistência

- A persistência antiga em `dpack` apresentou falha.
- Foi implementado fallback seguro para JSON.
- Depois disso, a arquitetura evoluiu e a camada de memória foi refeita com LangChain.

### 10. Migração do RAG para LangChain

- A implementação antiga de retrieval foi substituída.
- O sistema agora usa:
  - `Document`
  - `MarkdownTextSplitter`
  - `RecursiveCharacterTextSplitter`
  - `OllamaEmbeddings`
  - `MemoryVectorStore`
- A persistência vetorial passou a usar JSON em arquivo próprio.
- Quando existe manifest antigo sem índice vetorial LangChain, os documentos são marcados como necessitando reindexação.

### 11. Grounding e fontes

- O prompt foi reforçado para:
  - usar o contexto recuperado como fonte principal
  - não generalizar quando houver resposta direta
  - preservar listas e contagens do documento
  - finalizar com `Fontes:`
- O contexto recuperado passou a carregar IDs `CTX-*`.
- Foi introduzido modo factual para perguntas objetivas.

## Problemas diagnosticados durante a conversa

### 1. Respostas erradas apesar de documento correto existir

Foi verificado que o problema principal não era o formato do arquivo nem ausência de ingestão, e sim a recuperação de contexto errada.

Exemplo observado:

- pergunta sobre `SuccessFactors metadata refresh`
- contexto recuperado trazia `SAPUI5.pdf` e `solman.pdf`
- o documento correto existia na base preparada

Conclusão:

- o gargalo estava na etapa de retrieval/ranking

### 2. Persistência antiga falhando

Foi identificado erro explícito na serialização com `dpack` durante `save`.

### 3. Vários pontos sensíveis a `undefined`

Foram feitas proteções em:

- ingestão
- retrieval
- histórico de chat
- renderer
- streaming

## Estado atual

Hoje o app já está nesta direção:

- home centrada no núcleo
- drawers laterais
- ingestão manual
- preparação de arquivos para IA
- runtime do Ollama validado
- RAG migrado para LangChain
- debug muito mais explícito

## Pendências e próximos passos

### Curto prazo

- reindexar os documentos já existentes na base após a migração para LangChain
- validar novamente a pergunta factual do SuccessFactors
- medir se o retrieval agora está puxando o documento correto

### Próximo passo técnico forte

- melhorar mais o ranking factual no LangChain
- considerar filtro por documento ou coleção
- exibir fontes usadas diretamente na UI

### Próximo passo de produto

- tornar o `Memory Bay` operacional de verdade:
  - remover documento
  - reprocessar documento
  - limpar memória
  - ver chunks e documento preparado

### Próximo passo visual

- lapidar ainda mais o cérebro holográfico
- integrar melhor status de memória e Ollama ao núcleo
- preparar terreno para voz

## Arquivos mais impactados

- `src/renderer/src/App.tsx`
- `src/renderer/src/assets/main.css`
- `src/renderer/src/components/HolographicBrain.tsx`
- `src/renderer/src/hooks/useJarvis.ts`
- `src/renderer/src/hooks/useKnowledgeBase.ts`
- `src/main/index.ts`
- `src/main/services/OllamaService.ts`
- `src/main/services/DocumentFormatter.ts`
- `src/main/services/KnowledgeBase.ts`
- `src/files/system_prompt.ts`

## Observação importante

Como o RAG foi migrado para LangChain, o estado antigo da memória não deve ser tratado como confiável sem reindexação. O fluxo correto agora é:

- reiniciar o app
- reimportar os documentos importantes
- validar o contexto recuperado
- só depois avaliar a qualidade final das respostas documentais
