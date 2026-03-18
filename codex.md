# Codex Guidelines

## Objetivo

Este arquivo define como as tasks do projeto devem ser descritas, executadas e encerradas.

## Estrutura dos arquivos

- `codex.md`: guidelines do projeto e processo de execucao.
- `finished.md`: historico de tasks concluidas.
- `Tasks.md`: backlog atual, contendo apenas tasks ainda nao concluidas.

## Como trabalhar uma task

### 1. Ler o contexto

- Revisar `Tasks.md` para identificar prioridades ativas.
- Consultar `finished.md` para evitar retrabalho e entender decisoes anteriores.
- Preservar a direcao do produto: `Central Core` como elemento principal, memoria documental clara e boa relacao entre impacto visual e performance.

### 2. Executar

- Implementar a task completa sempre que possivel, sem parar apenas em analise.
- Preferir solucoes que mantenham a aplicacao rapida, estavel e auditavel.
- Em frentes de UI, preservar a leitura rapida do estado do sistema e evitar custo visual desnecessario.
- Em frentes de memoria e RAG, priorizar transparencia, governanca e rastreabilidade do contexto usado.

### 3. Validar

- Rodar validacoes relevantes apos alteracoes.
- Registrar no fechamento da task pelo menos:
- o que foi feito
- resultado obtido
- arquivos impactados
- validacao executada

### 4. Encerrar

- Remover a task concluida de `Tasks.md`.
- Adicionar a task concluida em `finished.md`.
- Manter `Tasks.md` contendo apenas pendencias reais.

## Guidelines de produto

- O `Central Core` deve continuar sendo o centro da experiencia.
- A interface deve permanecer limpa, legivel e orientada a acao.
- Melhorias visuais nao devem comprometer estabilidade ou performance.
- A memoria documental deve ser operavel, transparente e facil de auditar.
- Respostas com contexto documental devem deixar claro o que foi usado como fonte.

## Prioridades permanentes

- reduzir tempo de abertura
- melhorar estabilidade em uso prolongado
- amadurecer operacao de memoria em bases maiores
- preservar identidade visual sem reintroduzir custo excessivo
