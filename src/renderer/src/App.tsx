import { useEffect, useRef, useState } from 'react'
import { ChatInput } from './components/ChatInput'
import { HolographicBrain } from './components/HolographicBrain'
import { MessageBubble } from './components/MessageBubble'
import { useJarvis } from './hooks/useJarvis'
import { useKnowledgeBase } from './hooks/useKnowledgeBase'
import { useRuntimeStatus } from './hooks/useRuntimeStatus'

type OverlayPanel = 'memory' | 'dialogue' | 'status' | null

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

function App() {
  const { messages, sendMessage, isProcessing } = useJarvis()
  const { state, activity, isImporting, importDocuments } = useKnowledgeBase()
  const runtimeStatus = useRuntimeStatus()
  const [activePanel, setActivePanel] = useState<OverlayPanel>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const safeMessages = Array.isArray(messages) ? messages : []
  const safeDocuments = Array.isArray(state.documents) ? state.documents : []

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [safeMessages, activePanel])

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

  const togglePanel = (panel: Exclude<OverlayPanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel))
  }

  const highlightedDocument = safeDocuments[0]

  const activityLabel =
    activity?.type === 'chunk-progress'
      ? `${activity.current ?? 0}/${activity.total ?? 0} fragmentos analisados`
      : activity?.message || activity?.error || 'Importe documentos para ativar a memória.'

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
      : 'Treinando memória'
    : isProcessing
      ? 'Processando consulta'
      : runtimeStatus.phase === 'error'
        ? runtimeLabel
        : state.stats.indexedDocuments > 0
          ? 'Memória operacional'
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
      ? 'Gerencie documentos, treinamento e atividade recente.'
      : activePanel === 'dialogue'
        ? 'Abra o canal de conversa e fale com o núcleo.'
        : 'Veja o estado atual do Ollama, dos modelos e da memória.'

  const quickPrompts = [
    'Resuma o que já existe na memória.',
    'Quais fontes estão disponíveis agora?',
    'Como você usaria os documentos para responder melhor?'
  ]

  const shortcuts = [
    {
      id: 'memory' as const,
      title: 'Memory Bay',
      value: isImporting ? 'Treinando base' : `${state.stats.indexedDocuments} docs`,
      meta:
        highlightedDocument?.name ||
        (state.stats.indexedDocuments > 0 ? 'Memória pronta' : 'Nenhum documento treinado'),
      tone: isImporting ? 'is-busy' : state.stats.indexedDocuments > 0 ? 'is-ready' : ''
    },
    {
      id: 'dialogue' as const,
      title: 'Dialogue Layer',
      value: isProcessing ? 'Em resposta' : 'Abrir canal',
      meta: `${messages.length} mensagens em sessão`,
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
              <h1 className="core-header__title">Cérebro operacional do Jarvis</h1>
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
                  className={`core-shortcuts__button core-shortcuts__button--${shortcut.id} ${
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
              indexedDocuments={state.stats.indexedDocuments}
              totalChunks={state.stats.totalChunks}
              statusLabel={neuralStatus}
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
                  className="action-button action-button--small"
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
                        <strong>{state.stats.erroredDocuments}</strong>
                        <small>falhas</small>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void importDocuments()}
                      className="action-button"
                      disabled={isImporting}
                    >
                      {isImporting ? 'Treinando...' : 'Adicionar arquivos'}
                    </button>
                  </div>

                  <div className="memory-activity">
                    <span className="memory-activity__label">Atividade recente</span>
                    <p>{activityLabel}</p>
                  </div>

                  <div className="document-list">
                    {state.documents.length === 0 ? (
                      <div className="empty-card">
                        <p className="empty-card__title">Nenhum documento treinado</p>
                        <p className="empty-card__text">
                          Traga PDFs, Markdown, TXT, JSON ou código para começar a montar a memória
                          do Jarvis.
                        </p>
                      </div>
                    ) : (
                      state.documents.map((document) => (
                        <article
                          key={document.id}
                          className={`document-card status-${document.status}`}
                        >
                          <div className="document-card__header">
                            <div>
                              <h3>{document.name}</h3>
                              <p>{document.type.toUpperCase()}</p>
                            </div>
                            <span className="document-card__status">{document.status}</span>
                          </div>
                          <div className="document-card__meta">
                            <span>{formatBytes(document.size)}</span>
                            <span>{document.chunks} chunks</span>
                          </div>
                          <div className="document-card__footer">
                            <span>{formatIndexedAt(document.indexedAt)}</span>
                            {document.lastError ? <span>{document.lastError}</span> : null}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {activePanel === 'dialogue' ? (
                <div className="overlay-drawer__content overlay-drawer__content--chat">
                  <div className="panel-heading panel-heading--chat">
                    <div>
                      <p className="panel-heading__eyebrow">Canal de conversa</p>
                      <h2 className="panel-heading__title">Converse com o núcleo</h2>
                    </div>
                    <div className="chat-status">
                      {isProcessing ? 'Respondendo...' : 'Aguardando comando'}
                    </div>
                  </div>

                  <div className="chat-toolbar">
                    <div className="chat-toolbar__meta">
                      <span>{state.stats.indexedDocuments} docs ativos</span>
                      <span>{messages.length} mensagens</span>
                      <span>{state.stats.totalChunks} chunks</span>
                      <span>{runtimeLabel}</span>
                    </div>
                    <div className="chat-toolbar__actions">
                      {quickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="chat-toolbar__prompt"
                          onClick={() => sendMessage(prompt)}
                          disabled={isProcessing}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="chat-stream">
                    {messages.length === 0 ? (
                      <div className="empty-card empty-card--chat">
                        <p className="empty-card__title">Pronto para conversar</p>
                        <p className="empty-card__text">
                          Pergunte algo sobre seus documentos ou use este espaço para testar o
                          núcleo mesmo antes de treinar a memória.
                        </p>
                      </div>
                    ) : (
                      messages.map((message) => (
                        <MessageBubble key={message.id} message={message} />
                      ))
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
                        Instalação: chat {runtimeStatus.chatModelInstalled ? 'ok' : 'pendente'} e
                        embeddings {runtimeStatus.embeddingModelInstalled ? 'ok' : 'pendente'}.
                      </p>
                    </article>

                    <article className="insight-card">
                      <span className="insight-card__label">Documento em foco</span>
                      <strong>{highlightedDocument?.name || 'Nenhum documento destacado'}</strong>
                      <p>
                        {highlightedDocument
                          ? `${highlightedDocument.chunks} chunks prontos. Última indexação em ${formatIndexedAt(
                              highlightedDocument.indexedAt
                            )}.`
                          : 'Adicione arquivos para que o núcleo comece a estruturar conhecimento.'}
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
