import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatInput } from './components/ChatInput'
import { HolographicBrain, HolographicBrainPerformanceSample } from './components/HolographicBrain'
import { MessageBubble } from './components/MessageBubble'
import { useJarvis } from './hooks/useJarvis'
import { useKnowledgeBase } from './hooks/useKnowledgeBase'
import { useRuntimeStatus } from './hooks/useRuntimeStatus'
import { KnowledgeDocument, KnowledgeDocumentStatus } from './types/knowledge'
import { RuntimePerformanceSnapshot } from './types/runtime'

type OverlayPanel = 'memory' | 'dialogue' | 'status' | null

interface SessionStats {
  responseCount: number
  avgLatencyMs: number | null
  avgDurationMs: number | null
  p95LatencyMs: number | null
  p95DurationMs: number | null
  lastResponseAt: number | null
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDeltaBytes(delta: number | null) {
  if (delta === null || Number.isNaN(delta)) return 'n/d'
  const sign = delta >= 0 ? '+' : '-'
  return `${sign}${formatBytes(Math.abs(delta))}`
}

function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return 'n/d'
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  const seconds = ms / 1000
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`
}

function average(values: number[]) {
  if (values.length === 0) return null
  const sum = values.reduce((total, value) => total + value, 0)
  return Math.round(sum / values.length)
}

function percentile(values: number[], target: number) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((target / 100) * sorted.length) - 1))
  return Math.round(sorted[index])
}

function formatIndexedAt(value: string | null) {
  if (!value) return 'Sem data'

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getDocumentStatusLabel(status: KnowledgeDocumentStatus) {
  if (status === 'ready') return 'pronto'
  if (status === 'processing') return 'processando'
  if (status === 'reindex-required') return 'reindexar'
  return 'erro'
}

function normalizeFilterValue(value: string) {
  return String(value ?? '').trim().toLowerCase()
}

function resolveCollectionInfo(filePath: string) {
  const parts = String(filePath ?? '').split(/[/\\]+/).filter(Boolean)
  const parentSegments = parts.slice(0, -1)
  const labels = parentSegments.slice(-2)
  const keys = labels.map((segment) => normalizeFilterValue(segment)).filter(Boolean)

  return {
    labels: labels.filter((segment) => segment.trim().length > 0),
    keys
  }
}

function formatCollectionLabel(value: string) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= 3) return trimmed.toUpperCase()
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
}

type DocumentWithCollections = KnowledgeDocument & {
  collectionLabels: string[]
  collectionKeys: string[]
}

function App() {
  const { messages, sendMessage, isProcessing, streamDiagnostics } = useJarvis()
  const {
    state,
    activity,
    isImporting,
    importDocuments,
    removeDocument,
    reprocessDocument,
    clearDocuments,
    loadDocumentInsights,
    insightsByDocument,
    insightLoadingByDocument
  } = useKnowledgeBase()
  const runtimeStatus = useRuntimeStatus()
  const [activePanel, setActivePanel] = useState<OverlayPanel>(null)
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null)
  const [corePerformance, setCorePerformance] = useState<HolographicBrainPerformanceSample | null>(null)
  const [isBooting, setIsBooting] = useState(true)
  const [memorySearch, setMemorySearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<KnowledgeDocumentStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [collectionFilter, setCollectionFilter] = useState('all')
  const [sortMode, setSortMode] = useState<'recent' | 'name' | 'size' | 'chunks'>('recent')
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    responseCount: 0,
    avgLatencyMs: null,
    avgDurationMs: null,
    p95LatencyMs: null,
    p95DurationMs: null,
    lastResponseAt: null
  })
  const [perfSamples, setPerfSamples] = useState<RuntimePerformanceSnapshot[]>([])
  const responseSamplesRef = useRef<
    Array<{
      latencyMs: number | null
      durationMs: number | null
      timestamp: number
    }>
  >([])
  const wasProcessingRef = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const safeMessages = Array.isArray(messages) ? messages : []
  const safeDocuments = Array.isArray(state.documents) ? state.documents : []
  const enrichedDocuments = useMemo<DocumentWithCollections[]>(
    () =>
      safeDocuments.map((document) => {
        const { labels, keys } = resolveCollectionInfo(document.path)

        return {
          ...document,
          collectionLabels: labels,
          collectionKeys: keys
        }
      }),
    [safeDocuments]
  )
  const collectionOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const document of enrichedDocuments) {
      for (const [index, key] of document.collectionKeys.entries()) {
        if (!key || map.has(key)) continue
        map.set(key, document.collectionLabels[index] ?? key)
      }
    }

    return Array.from(map.entries())
      .map(([key, label]) => ({
        key,
        label: formatCollectionLabel(label)
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [enrichedDocuments])
  const typeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const document of enrichedDocuments) {
      if (document.type) {
        set.add(document.type)
      }
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right))
  }, [enrichedDocuments])
  const normalizedSearch = normalizeFilterValue(memorySearch)
  const filteredDocuments = useMemo(() => {
    return enrichedDocuments.filter((document) => {
      if (statusFilter !== 'all' && document.status !== statusFilter) {
        return false
      }

      if (typeFilter !== 'all' && document.type !== typeFilter) {
        return false
      }

      if (
        collectionFilter !== 'all' &&
        !document.collectionKeys.includes(normalizeFilterValue(collectionFilter))
      ) {
        return false
      }

      if (normalizedSearch) {
        const searchTarget = [
          document.name,
          document.path,
          document.type,
          document.collectionLabels.join(' ')
        ]
          .join(' ')
          .toLowerCase()

        if (!searchTarget.includes(normalizedSearch)) {
          return false
        }
      }

      return true
    })
  }, [collectionFilter, enrichedDocuments, normalizedSearch, statusFilter, typeFilter])
  const sortedDocuments = useMemo(() => {
    const list = [...filteredDocuments]

    list.sort((left, right) => {
      if (sortMode === 'name') {
        return left.name.localeCompare(right.name)
      }

      if (sortMode === 'size') {
        return right.size - left.size
      }

      if (sortMode === 'chunks') {
        return right.chunks - left.chunks
      }

      const leftDate = left.indexedAt ? new Date(left.indexedAt).getTime() : 0
      const rightDate = right.indexedAt ? new Date(right.indexedAt).getTime() : 0
      if (rightDate !== leftDate) {
        return rightDate - leftDate
      }

      return left.name.localeCompare(right.name)
    })

    return list
  }, [filteredDocuments, sortMode])
  const interactionCount = safeMessages.reduce(
    (count, message) => (message.sender === 'user' ? count + 1 : count),
    0
  )
  const isKnowledgeBusy = isImporting || state.stats.processingDocuments > 0
  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    collectionFilter !== 'all'

  useEffect(() => {
    window.jarvis.notifyRendererReady(Date.now())
  }, [])

  useEffect(() => {
    let cancelled = false
    const resolveBoot = () => {
      if (!cancelled) {
        setIsBooting(false)
      }
    }
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(resolveBoot, { timeout: 1200 })
      return () => {
        cancelled = true
        idleWindow.cancelIdleCallback?.(idleId)
      }
    }

    const timeoutId = window.setTimeout(resolveBoot, 450)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (isProcessing) {
      wasProcessingRef.current = true
      return
    }

    if (!wasProcessingRef.current) return
    wasProcessingRef.current = false

    const durationMs = streamDiagnostics.responseDurationMs
    if (durationMs === null) return

    const sample = {
      latencyMs: streamDiagnostics.responseLatencyMs ?? null,
      durationMs,
      timestamp: Date.now()
    }
    const nextSamples = [...responseSamplesRef.current, sample].slice(-20)
    responseSamplesRef.current = nextSamples

    const latencies = nextSamples
      .map((item) => item.latencyMs)
      .filter((value): value is number => typeof value === 'number')
    const durations = nextSamples
      .map((item) => item.durationMs)
      .filter((value): value is number => typeof value === 'number')

    setSessionStats({
      responseCount: nextSamples.length,
      avgLatencyMs: average(latencies),
      avgDurationMs: average(durations),
      p95LatencyMs: percentile(latencies, 95),
      p95DurationMs: percentile(durations, 95),
      lastResponseAt: sample.timestamp
    })
  }, [isProcessing, streamDiagnostics.responseDurationMs, streamDiagnostics.responseLatencyMs])

  useEffect(() => {
    let cancelled = false

    const poll = () => {
      void window.jarvis
        .getPerformanceSnapshot()
        .then((snapshot) => {
          if (cancelled) return
          setPerfSamples((prev) => [...prev, snapshot].slice(-20))
        })
        .catch(() => {})
    }

    poll()
    const interval = window.setInterval(poll, 30000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (activePanel !== 'dialogue') return
    endRef.current?.scrollIntoView({ behavior: isProcessing ? 'auto' : 'smooth' })
  }, [safeMessages, activePanel, isProcessing])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePanel(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!expandedDocumentId) return

    const stillExists = safeDocuments.some((document) => document.id === expandedDocumentId)
    if (!stillExists) {
      setExpandedDocumentId(null)
    }
  }, [expandedDocumentId, safeDocuments])

  const togglePanel = (panel: Exclude<OverlayPanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel))
  }

  const highlightedDocument = safeDocuments[0]
  const startupMetrics = runtimeStatus.startup
  const startupHighlightMs =
    startupMetrics?.rendererReadyMs ?? startupMetrics?.windowReadyMs ?? null
  const perfWindowStart = perfSamples[0]
  const perfWindowEnd = perfSamples[perfSamples.length - 1]
  const perfWindowMinutes =
    perfWindowStart && perfWindowEnd
      ? Math.max(1, Math.round((perfWindowEnd.timestampMs - perfWindowStart.timestampMs) / 60000))
      : null
  const rssDelta =
    perfWindowStart && perfWindowEnd ? perfWindowEnd.rssBytes - perfWindowStart.rssBytes : null
  const heapDelta =
    perfWindowStart && perfWindowEnd
      ? perfWindowEnd.heapUsedBytes - perfWindowStart.heapUsedBytes
      : null

  const activityLabel =
    activity?.type === 'chunk-progress'
      ? `${activity.current ?? 0}/${activity.total ?? 0} fragmentos analisados`
      : activity?.type === 'document-reprocess-started'
        ? activity.message || 'Reprocessando documento'
        : activity?.type === 'document-removed'
          ? activity.message || 'Documento removido'
          : activity?.type === 'memory-cleared'
            ? activity.message || 'Memoria limpa'
            : activity?.message || activity?.error || 'Importe documentos para ativar a memoria.'

  const runtimeLabel =
    runtimeStatus.phase === 'ready'
      ? 'Ollama online'
      : runtimeStatus.phase === 'error'
        ? 'Ollama com falha'
        : runtimeStatus.phase === 'warming-chat' || runtimeStatus.phase === 'warming-embedding'
          ? 'Carregando modelo'
          : runtimeStatus.phase === 'starting-server'
            ? 'Iniciando Ollama'
            : 'Validando Ollama'

  const neuralStatus = isImporting
    ? activity?.record?.name
      ? `Treinando ${activity.record.name}`
      : 'Treinando memoria'
    : isProcessing
      ? 'Processando consulta'
      : isBooting
        ? 'Inicializando interface'
        : runtimeStatus.phase === 'error'
          ? runtimeLabel
          : state.stats.indexedDocuments > 0
            ? 'Memoria operacional'
            : 'Aguardando documentos'

  const isOverlayOpen = activePanel !== null

  const overlayTitle =
    activePanel === 'memory'
      ? 'Memory Bay'
      : activePanel === 'dialogue'
        ? 'Dialogue Layer'
        : 'System Pulse'

  const overlaySubtitle =
    activePanel === 'memory'
      ? 'Gerencie documentos, reindexacao e atividade recente.'
      : activePanel === 'dialogue'
        ? 'Conversa direta com o nucleo.'
        : 'Veja o estado atual do Ollama, dos modelos e da memoria.'

  const shortcuts = [
    {
      id: 'memory' as const,
      title: 'Memory Bay',
      value: isImporting ? 'Treinando base' : `${state.stats.indexedDocuments} docs`,
      meta:
        highlightedDocument?.name ||
        (state.stats.indexedDocuments > 0 ? 'Memoria pronta' : 'Nenhum documento treinado'),
      tone: isImporting ? 'is-busy' : state.stats.indexedDocuments > 0 ? 'is-ready' : ''
    },
    {
      id: 'dialogue' as const,
      title: 'Dialogue Layer',
      value: isProcessing ? 'Em resposta' : 'Pronto',
      meta: `${messages.length} mensagens em sessao`,
      tone: isProcessing ? 'is-busy' : ''
    },
    {
      id: 'status' as const,
      title: 'System Pulse',
      value: runtimeLabel,
      meta: runtimeStatus.message,
      tone:
        runtimeStatus.phase === 'error'
          ? 'is-error'
          : runtimeStatus.phase === 'ready'
            ? 'is-ready'
            : 'is-busy'
    }
  ]

  const handleToggleDocumentDetails = (documentId: string) => {
    setExpandedDocumentId((current) => {
      if (current === documentId) {
        return null
      }

      void loadDocumentInsights(documentId)
      return documentId
    })
  }

  const handleRemoveDocument = async (documentId: string, documentName: string) => {
    const shouldRemove = window.confirm(
      `Remover "${documentName}" da memoria?\n\nIsso apaga os chunks indexados deste documento.`
    )
    if (!shouldRemove) return
    await removeDocument(documentId)
  }

  const handleReprocessDocument = async (documentId: string) => {
    await reprocessDocument(documentId)
    await loadDocumentInsights(documentId, true)
  }

  const handleClearDocuments = async () => {
    const shouldClear = window.confirm(
      'Limpar toda a memoria?\n\nIsso remove todos os documentos e vetores da base local.'
    )
    if (!shouldClear) return
    await clearDocuments()
    setExpandedDocumentId(null)
  }

  const handleResetFilters = () => {
    setMemorySearch('')
    setStatusFilter('all')
    setTypeFilter('all')
    setCollectionFilter('all')
    setSortMode('recent')
  }

  return (
    <div className="jarvis-shell">
      <div className="jarvis-shell__backdrop" />
      <div className="jarvis-shell__grid" />

      <header className="jarvis-topbar app-drag-region">
        <div className="jarvis-topbar__brand">
          <span className="jarvis-topbar__dot" />
          <div>
            <div className="jarvis-topbar__title">J.A.R.V.I.S.</div>
            <div className="jarvis-topbar__subtitle">Neural Memory Workspace</div>
          </div>
        </div>

        <div className="jarvis-topbar__metrics">
          <span>{state.stats.indexedDocuments} docs online</span>
          <span>{state.stats.totalChunks} chunks</span>
          <span>{runtimeLabel}</span>
        </div>
      </header>

      <main className="jarvis-layout jarvis-layout--single">
        <section className="glass-panel glass-panel--core glass-panel--hero">
          <div className="core-header">
            <div>
              <p className="panel-heading__eyebrow">Central Core</p>
              <h1 className="core-header__title">Cerebro operacional do Jarvis</h1>
            </div>
            <div className="core-header__actions">
              <div className="core-header__badge">{runtimeStatus.message || neuralStatus}</div>
            </div>
          </div>

          <div className="core-stage core-stage--hero">
            <div className="core-shortcuts">
              {shortcuts.map((shortcut) => (
                <button
                  key={shortcut.id}
                  type="button"
                  className={`core-shortcuts__button cursor-pointer core-shortcuts__button--${shortcut.id} ${
                    activePanel === shortcut.id ? 'is-active' : ''
                  } ${shortcut.tone}`}
                  onClick={() => togglePanel(shortcut.id)}
                >
                  <span>{shortcut.title}</span>
                  <strong>{shortcut.value}</strong>
                  <small>{shortcut.meta}</small>
                </button>
              ))}
            </div>

            <HolographicBrain
              isThinking={isProcessing}
              isTraining={isImporting}
              isEconomicMode={isProcessing || isBooting}
              indexedDocuments={state.stats.indexedDocuments}
              totalChunks={state.stats.totalChunks}
              statusLabel={neuralStatus}
              interactionCount={interactionCount}
              onPerformanceSample={setCorePerformance}
            />
          </div>

          <div className={`overlay-drawer ${isOverlayOpen ? 'is-open' : ''}`}>
            <div className="overlay-drawer__backdrop" onClick={() => setActivePanel(null)} />
            <aside
              className={`overlay-drawer__panel ${
                activePanel === 'dialogue' ? 'overlay-drawer__panel--dialogue' : ''
              }`}
            >
              <div className="overlay-drawer__header">
                <div>
                  <p className="panel-heading__eyebrow">{overlayTitle}</p>
                  <h2 className="panel-heading__title">{overlaySubtitle}</h2>
                </div>
                <button
                  type="button"
                  className="action-button action-button--small cursor-pointer"
                  onClick={() => setActivePanel(null)}
                >
                  Fechar
                </button>
              </div>

              {activePanel === 'memory' ? (
                <div className="overlay-drawer__content">
                  <div className="panel-heading panel-heading--memory-tools">
                    <div className="memory-inline-stats">
                      <span className="memory-inline-stats__pill">
                        <strong>{state.stats.isReady ? 'online' : 'boot'}</strong>
                        <small>status</small>
                      </span>
                      <span className="memory-inline-stats__pill">
                        <strong>{state.stats.processingDocuments}</strong>
                        <small>em fila</small>
                      </span>
                      <span className="memory-inline-stats__pill">
                        <strong>{state.stats.reindexDocuments}</strong>
                        <small>reindex</small>
                      </span>
                      <span className="memory-inline-stats__pill">
                        <strong>{state.stats.erroredDocuments}</strong>
                        <small>falhas</small>
                      </span>
                    </div>

                    <div className="memory-toolbar-actions">
                      <button
                        type="button"
                        onClick={() => void importDocuments()}
                        className="action-button cursor-pointer"
                        disabled={isImporting}
                      >
                        {isImporting ? 'Treinando...' : 'Adicionar arquivos'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClearDocuments()}
                        className="action-button action-button--ghost cursor-pointer"
                        disabled={isKnowledgeBusy || state.documents.length === 0}
                      >
                        Limpar base
                      </button>
                    </div>
                  </div>

                  <div className="memory-filters">
                    <div className="memory-filters__row">
                      <label className="memory-filter memory-filter--search">
                        <span>Buscar</span>
                        <input
                          value={memorySearch}
                          onChange={(event) => setMemorySearch(event.target.value)}
                          placeholder="Nome, caminho, tag"
                        />
                      </label>
                      <label className="memory-filter">
                        <span>Status</span>
                        <select
                          value={statusFilter}
                          onChange={(event) =>
                            setStatusFilter(
                              (event.target.value || 'all') as KnowledgeDocumentStatus | 'all'
                            )
                          }
                        >
                          <option value="all">Todos</option>
                          <option value="ready">Prontos</option>
                          <option value="processing">Processando</option>
                          <option value="reindex-required">Reindexar</option>
                          <option value="error">Falhas</option>
                        </select>
                      </label>
                      <label className="memory-filter">
                        <span>Tipo</span>
                        <select
                          value={typeFilter}
                          onChange={(event) => setTypeFilter(event.target.value || 'all')}
                        >
                          <option value="all">Todos</option>
                          {typeOptions.map((type) => (
                            <option key={type} value={type}>
                              {type.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="memory-filter">
                        <span>Colecao</span>
                        <select
                          value={collectionFilter}
                          onChange={(event) => setCollectionFilter(event.target.value || 'all')}
                        >
                          <option value="all">Todas</option>
                          {collectionOptions.map((collection) => (
                            <option key={collection.key} value={collection.key}>
                              {collection.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="memory-filter">
                        <span>Ordenar</span>
                        <select
                          value={sortMode}
                          onChange={(event) =>
                            setSortMode(
                              (event.target.value as 'recent' | 'name' | 'size' | 'chunks') ||
                                'recent'
                            )
                          }
                        >
                          <option value="recent">Recentes</option>
                          <option value="name">Nome</option>
                          <option value="size">Tamanho</option>
                          <option value="chunks">Chunks</option>
                        </select>
                      </label>
                    </div>
                    <div className="memory-filters__row memory-filters__row--meta">
                      <span>
                        Exibindo {sortedDocuments.length} de {safeDocuments.length} documentos
                      </span>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          className="action-button action-button--small action-button--ghost cursor-pointer"
                          onClick={handleResetFilters}
                        >
                          Limpar filtros
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="memory-activity">
                    <span className="memory-activity__label">Atividade recente</span>
                    <p>{activityLabel}</p>
                  </div>

                  <div className="document-list">
                    {sortedDocuments.length === 0 ? (
                      <div className="empty-card">
                        <p className="empty-card__title">
                          {safeDocuments.length === 0
                            ? 'Nenhum documento treinado'
                            : 'Nenhum documento encontrado'}
                        </p>
                        <p className="empty-card__text">
                          {safeDocuments.length === 0
                            ? 'Traga PDFs, Markdown, TXT, JSON ou codigo para comecar a montar a memoria do Jarvis.'
                            : 'Ajuste filtros ou remova restricoes para visualizar mais documentos.'}
                        </p>
                      </div>
                    ) : (
                      sortedDocuments.map((document) => {
                        const isExpanded = expandedDocumentId === document.id
                        const insights = insightsByDocument[document.id]
                        const isLoadingInsights = Boolean(insightLoadingByDocument[document.id])
                        const displayTags = [
                          document.type.toUpperCase(),
                          ...document.collectionLabels.map((label) => formatCollectionLabel(label))
                        ].filter((tag, index, tags) => tag && tags.indexOf(tag) === index)

                        return (
                          <article
                            key={document.id}
                            className={`document-card status-${document.status}`}
                          >
                            <div className="document-card__header">
                              <div>
                                <h3>{document.name}</h3>
                                <p>{document.type.toUpperCase()}</p>
                              </div>
                              <span className="document-card__status">
                                {getDocumentStatusLabel(document.status)}
                              </span>
                            </div>
                            {displayTags.length > 0 ? (
                              <div className="document-card__tags">
                                {displayTags.slice(0, 3).map((tag) => (
                                  <span key={`${document.id}-${tag}`} className="document-tag">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="document-card__meta">
                              <span>{formatBytes(document.size)}</span>
                              <span>{document.chunks} chunks</span>
                            </div>
                            <div className="document-card__footer">
                              <span>{formatIndexedAt(document.indexedAt)}</span>
                              {document.lastError ? <span>{document.lastError}</span> : null}
                            </div>

                            <div className="document-card__actions">
                              <button
                                type="button"
                                className="action-button action-button--small cursor-pointer"
                                onClick={() => handleToggleDocumentDetails(document.id)}
                              >
                                {isExpanded ? 'Ocultar preview' : 'Ver preview'}
                              </button>
                              <button
                                type="button"
                                className="action-button action-button--small cursor-pointer"
                                onClick={() => void handleReprocessDocument(document.id)}
                                disabled={document.status === 'processing'}
                              >
                                Reprocessar
                              </button>
                              <button
                                type="button"
                                className="action-button action-button--small action-button--ghost cursor-pointer"
                                onClick={() => void handleRemoveDocument(document.id, document.name)}
                                disabled={document.status === 'processing'}
                              >
                                Remover
                              </button>
                            </div>

                            {isExpanded ? (
                              <div className="document-card__details">
                                <section className="document-preview">
                                  <div className="document-preview__heading">
                                    <span>Documento preparado</span>
                                    <small>
                                      {insights?.preparedLength
                                        ? `${insights.preparedLength} chars`
                                        : 'Sem arquivo preparado'}
                                    </small>
                                  </div>
                                  {isLoadingInsights ? (
                                    <p className="document-preview__empty">Carregando preview...</p>
                                  ) : insights?.preparedPreview ? (
                                    <pre className="document-preview__content">
                                      {insights.preparedPreview}
                                    </pre>
                                  ) : (
                                    <p className="document-preview__empty">
                                      Nenhum preview preparado disponivel.
                                    </p>
                                  )}
                                </section>

                                <section className="document-preview">
                                  <div className="document-preview__heading">
                                    <span>Chunks indexados</span>
                                    <small>{insights?.totalChunks ?? 0} no total</small>
                                  </div>
                                  {isLoadingInsights ? (
                                    <p className="document-preview__empty">Carregando chunks...</p>
                                  ) : insights?.chunkPreviews?.length ? (
                                    <div className="chunk-preview-list">
                                      {insights.chunkPreviews.map((chunk) => (
                                        <article key={chunk.id} className="chunk-preview-item">
                                          <header>
                                            <strong>
                                              Chunk {chunk.chunkIndex + 1}.{chunk.childChunkIndex + 1}
                                            </strong>
                                            <small>{chunk.length} chars</small>
                                          </header>
                                          <p>{chunk.preview}</p>
                                        </article>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="document-preview__empty">
                                      Nenhum chunk indexado para este documento.
                                    </p>
                                  )}
                                </section>
                              </div>
                            ) : null}
                          </article>
                        )
                      })
                    )}
                  </div>
                </div>
              ) : null}

              {activePanel === 'dialogue' ? (
                <div className="overlay-drawer__content overlay-drawer__content--chat">
                  <div className="chat-toolbar">
                    <div className="chat-toolbar__meta">
                      <span>{isProcessing ? 'Respondendo...' : 'Pronto para conversar'}</span>
                      <span>{state.stats.indexedDocuments} docs ativos</span>
                      <span>{runtimeLabel}</span>
                    </div>
                  </div>
                  <div className="chat-stream">
                    {messages.length === 0 ? (
                      <div className="empty-card empty-card--chat">
                        <p className="empty-card__title">Pronto para conversar</p>
                        <p className="empty-card__text">
                          Pergunte algo sobre seus documentos ou use este espaco para testar o
                          nucleo mesmo antes de treinar a memoria.
                        </p>
                      </div>
                    ) : (
                      messages.map((message) => <MessageBubble key={message.id} message={message} />)
                    )}
                    <div ref={endRef} />
                  </div>

                  <footer className="chat-composer">
                    <ChatInput onSend={sendMessage} disabled={isProcessing} />
                  </footer>
                </div>
              ) : null}

              {activePanel === 'status' ? (
                <div className="overlay-drawer__content">
                  <div className="overlay-drawer__stats">
                    <article className="insight-card">
                      <span className="insight-card__label">Startup</span>
                      <strong>
                        {startupHighlightMs !== null
                          ? `UI pronta em ${formatDuration(startupHighlightMs)}`
                          : 'Inicializando UI'}
                      </strong>
                      <div className="insight-card__rows">
                        <div className="insight-card__row">
                          <span>App pronto</span>
                          <span>{formatDuration(startupMetrics?.appReadyMs ?? null)}</span>
                        </div>
                        <div className="insight-card__row">
                          <span>Janela pronta</span>
                          <span>{formatDuration(startupMetrics?.windowReadyMs ?? null)}</span>
                        </div>
                        <div className="insight-card__row">
                          <span>Renderer pronto</span>
                          <span>{formatDuration(startupMetrics?.rendererReadyMs ?? null)}</span>
                        </div>
                        <div className="insight-card__row">
                          <span>Memoria pronta</span>
                          <span>{formatDuration(startupMetrics?.knowledgeReadyMs ?? null)}</span>
                        </div>
                        <div className="insight-card__row">
                          <span>Ollama pronto</span>
                          <span>{formatDuration(startupMetrics?.ollamaValidatedMs ?? null)}</span>
                        </div>
                      </div>
                    </article>

                    <article className="insight-card">
                      <span className="insight-card__label">Estabilidade de resposta</span>
                      <strong>{sessionStats.responseCount} respostas na sessao</strong>
                      <p>
                        Lat media {formatDuration(sessionStats.avgLatencyMs)} (P95{' '}
                        {formatDuration(sessionStats.p95LatencyMs)}) | Dur media{' '}
                        {formatDuration(sessionStats.avgDurationMs)}
                      </p>
                      <div className="insight-card__rows">
                        <div className="insight-card__row">
                          <span>RSS Delta {perfWindowMinutes ? `${perfWindowMinutes}m` : ''}</span>
                          <span>{formatDeltaBytes(rssDelta)}</span>
                        </div>
                        <div className="insight-card__row">
                          <span>Heap Delta {perfWindowMinutes ? `${perfWindowMinutes}m` : ''}</span>
                          <span>{formatDeltaBytes(heapDelta)}</span>
                        </div>
                      </div>
                    </article>

                    <article className="insight-card">
                      <span className="insight-card__label">Central Core</span>
                      <strong>
                        {corePerformance ? `${Math.round(corePerformance.fps)} fps` : 'Coletando fps'}
                      </strong>
                      <p>
                        Frame{' '}
                        {corePerformance ? `${corePerformance.frameTimeMs.toFixed(1)} ms` : 'n/d'} |
                        Densidade {corePerformance ? corePerformance.densityScale.toFixed(2) : 'n/d'}
                      </p>
                    </article>

                    <article className="insight-card">
                      <span className="insight-card__label">Ollama Runtime</span>
                      <strong>{runtimeLabel}</strong>
                      <p>{runtimeStatus.message}</p>
                    </article>

                    <article className="insight-card">
                      <span className="insight-card__label">Modelos</span>
                      <strong>
                        Chat {runtimeStatus.chatModelLoaded ? 'carregado' : 'em espera'} / Embed{' '}
                        {runtimeStatus.embeddingModelLoaded ? 'carregado' : 'em espera'}
                      </strong>
                      <p>
                        Instalacao: chat {runtimeStatus.chatModelInstalled ? 'ok' : 'pendente'} e
                        embeddings {runtimeStatus.embeddingModelInstalled ? 'ok' : 'pendente'}.
                      </p>
                    </article>

                    <article className="insight-card">
                      <span className="insight-card__label">Documento em foco</span>
                      <strong>{highlightedDocument?.name || 'Nenhum documento destacado'}</strong>
                      <p>
                        {highlightedDocument
                          ? `${highlightedDocument.chunks} chunks prontos. Ultima indexacao em ${formatIndexedAt(
                              highlightedDocument.indexedAt
                            )}.`
                          : 'Adicione arquivos para que o nucleo comece a estruturar conhecimento.'}
                      </p>
                    </article>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
