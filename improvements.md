# Improvements for jarvis-app

## Visão atual

O Jarvis está evoluindo de um chat local para um cérebro documental com memória treinável, ingestão manual de arquivos, RAG local e interface centrada em um núcleo visual. A prioridade deixou de ser apenas "conversar" e passou a ser:

- abrir rápido
- treinar documentos dentro do app
- recuperar contexto confiável
- responder com base nas fontes
- ter presença visual forte e responsiva

## Direção de produto

### Home

- A tela inicial deve ser dominada pelo `Central Core`.
- `Memory Bay`, `Dialogue Layer` e `System Pulse` devem abrir como camadas sobre o palco principal.
- A home deve ficar limpa, sem cards fixos desnecessários abaixo do núcleo.

### Memória

- O usuário envia documentos pela interface.
- O app prepara o arquivo para IA antes do chunking e embeddings.
- O estado da memória precisa ser visível: pronto, processando, erro, reindexação necessária.
- O sistema deve deixar claro quais documentos estão realmente indexados no RAG atual.

### Conversa

- O chat abre como drawer lateral.
- Em desktop, ocupa metade da área útil.
- Em telas pequenas, deve ocupar a largura disponível sem quebrar.
- O histórico e o contexto enviados ao modelo precisam ter orçamento controlado.

### Visual

- O centro da experiência é um cérebro holográfico animado.
- A interface deve parecer um organismo computacional, não um dashboard genérico.
- O visual precisa reagir a estados como idle, treinamento, resposta e erro.

## Melhorias já implementadas

### UI e experiência

- Home reorganizada com foco no `Central Core`.
- `Memory Bay` e `Dialogue Layer` movidos para camadas sobrepostas.
- Chat com meia largura em desktop e altura útil total.
- Responsividade revisada para telas menores.
- Núcleo visual separado em componente dedicado inspirado em `brain.html`.
- Velocidade do cérebro ajustada conforme estado de resposta ou treinamento.

### Pipeline de documentos

- Ingestão manual dentro do app.
- Suporte a múltiplos formatos, incluindo `.pdf`, `.md`, `.txt`, `.json`, `.csv` e código.
- Etapa de preparação do documento para IA antes do RAG.
- Geração de versão tratada em `AppData/Roaming/jarvis-app/knowledge/prepared`.
- Chunking mais seguro para arquivos grandes.
- Controle de orçamento para embeddings e para o contexto enviado ao chat.

### Runtime e estabilidade

- Validação do Ollama no boot.
- Tentativa de subir `ollama serve` automaticamente quando necessário.
- Validação de modelos de chat e embeddings.
- Status de runtime exposto para a UI.
- Instrumentação de erro mais explícita no fluxo de ingestão, retrieval e chat.
- Fallback de persistência para JSON quando o formato antigo falhava.

### RAG

- Prompt reforçado para respostas mais fiéis ao contexto.
- Respostas documentais orientadas por fontes.
- Logging do contexto recuperado enviado ao modelo.
- Heurísticas para perguntas factuais e listadas.
- Migração da camada de RAG para LangChain.

## Arquitetura atual do RAG

O RAG passou a usar LangChain localmente:

- `Document` do LangChain
- `MarkdownTextSplitter` e `RecursiveCharacterTextSplitter`
- `OllamaEmbeddings`
- `MemoryVectorStore`
- persistência vetorial em JSON

Isso substitui a lógica antiga baseada em Orama para ingestão e retrieval.

## Problemas ainda abertos

### 1. Qualidade do retrieval factual

Mesmo com melhorias, o retrieval ainda precisa ficar mais preciso para perguntas documentais objetivas, especialmente quando existem PDFs grandes e muitos materiais genéricos na base.

Melhorias desejadas:

- filtro mais forte por documento e domínio
- busca híbrida melhor
- reranking semântico mais confiável
- possibilidade de filtrar por coleção ou documento

### 2. Grounding da resposta

O modelo ainda pode responder de forma genérica quando o contexto recuperado não é o ideal.

Melhorias desejadas:

- modo "strict factual"
- resposta por extração/paráfrase fiel para listas e contagens
- recusa explícita quando não houver resposta direta no contexto

### 3. Transparência da memória

Hoje a memória existe, mas o usuário ainda não vê tudo o que o sistema está usando.

Melhorias desejadas:

- preview do documento preparado
- preview dos chunks
- exibição das fontes usadas na resposta diretamente na UI
- informação clara de reindexação necessária após migração de engine

## Próximas melhorias prioritárias

### Prioridade 1: fechar bem o novo RAG em LangChain

- validar reindexação completa da base
- melhorar retrieval factual
- mostrar melhor as fontes na interface
- impedir respostas inventadas quando o contexto for fraco

### Prioridade 2: tornar o Memory Bay mais operacional

- remover documento
- reprocessar documento
- limpar base
- mostrar status real de indexação por documento
- destacar arquivos preparados e chunks

### Prioridade 3: consolidar a camada visual

- lapidar mais o cérebro holográfico
- melhorar abertura dos drawers
- integrar melhor `System Pulse`, status do Ollama e status da memória

### Prioridade 4: preparar crescimento do produto

- coleções
- tags
- filtros por documento
- comparação entre fontes
- voz

## Roadmap sugerido

### Fase 1

- consolidar home com `Central Core`
- consolidar ingestão manual
- estabilizar runtime do Ollama
- estabilizar RAG em LangChain

### Fase 2

- melhorar retrieval factual e grounding
- mostrar fontes e contexto na UI
- dar controle real da memória ao usuário

### Fase 3

- coleções, filtros e análise documental
- voz
- explicabilidade mais forte do cérebro

## Resultado esperado

Se essa direção for seguida, o Jarvis deixa de ser só um chat bonito com documentos anexados e passa a ser um cérebro documental local, treinável, explicável e visualmente coerente com a proposta do produto.
