# Improvements for jarvis-app

## Visao atual (2026-03-18)

O Jarvis ja concluiu as frentes de performance em streaming, qualidade de retrieval factual e transparencia operacional da memoria descritas em `Tasks.md`.

Este documento passa a listar apenas o que ainda falta evoluir.

## Pendencias ativas

### Abertura e estabilidade

- reduzir tempo de abertura da aplicacao
- melhorar prontidao inicial da UI em maquinas mais lentas
- validar estabilidade de resposta em sessoes longas
- usar as metricas ja instrumentadas para calibrar gargalos reais

### Produto e memoria

- evoluir governanca da memoria para bases maiores
- adicionar colecoes e filtros operacionais
- ampliar auditoria de contexto usado nas respostas
- refinar UX de operacao para uso intensivo da base documental

### Direcao de experiencia

- manter o `Central Core` como elemento principal da experiencia
- preservar forca visual sem reintroduzir custo excessivo de renderizacao
- manter leitura rapida do estado do sistema e operacao simples

## Resultado esperado

Com essa trilha, o Jarvis fica mais rapido para iniciar, mais estavel em uso continuo e mais maduro para operar bases documentais maiores com clareza e controle.
