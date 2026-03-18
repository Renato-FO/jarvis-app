import { memo, useMemo, useState } from 'react'
import { Message } from '../../types/chat'
import { MarkdownRenderer } from '../MarkdownRenderer'

interface Props {
  message: Message
}

export const MessageBubble = memo(
  function MessageBubble({ message }: Props) {
    const isJarvis = message.sender === 'jarvis'
    const displayContent = message.isStreaming ? `${message.text} |` : message.text
    const shouldUseLightStreamingRender = isJarvis && Boolean(message.isStreaming)
    const [showContext, setShowContext] = useState(false)
    const hasSources =
      isJarvis && !message.isStreaming && Array.isArray(message.sources) && message.sources.length > 0
    const retrievalModeLabel =
      message.retrievalMode === 'fact'
        ? 'factual'
        : message.retrievalMode === 'exploratory'
          ? 'exploratorio'
          : 'indefinido'

    const sourceMetrics = useMemo(() => {
      if (!hasSources) return null
      const overlapTotal = message.sources?.reduce(
        (total, source) => total + (typeof source.overlap === 'number' ? source.overlap : 0),
        0
      )
      const avgScore = message.sources?.length
        ? message.sources.reduce(
            (total, source) => total + (typeof source.score === 'number' ? source.score : 0),
            0
          ) / message.sources.length
        : 0

      return {
        overlapTotal,
        avgScore: Number.isFinite(avgScore) ? avgScore : null
      }
    }, [hasSources, message.sources])

    const resolveSourceFileName = (filePath?: string) => {
      if (!filePath) return ''
      const parts = String(filePath).split(/[/\\]+/).filter(Boolean)
      return parts[parts.length - 1] ?? ''
    }

    return (
      <div className={`flex w-full ${isJarvis ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`max-w-[88%] rounded-[24px] border px-4 py-3 shadow-[0_18px_48px_rgba(2,6,23,0.28)] backdrop-blur-xl ${
            isJarvis
              ? 'border-cyan-300/14 bg-slate-950/55 text-slate-100'
              : 'border-cyan-300/28 bg-cyan-300/14 text-cyan-50'
          }`}
        >
          <span
            className={`mb-2 block text-[10px] font-semibold uppercase tracking-[0.34em] ${
              isJarvis ? 'text-cyan-200/70' : 'text-cyan-50/80'
            }`}
          >
            {isJarvis ? 'Core Response' : 'Commander'}
          </span>
          {shouldUseLightStreamingRender ? (
            <p className="whitespace-pre-wrap break-words text-sm text-slate-100">{displayContent}</p>
          ) : (
            <MarkdownRenderer content={displayContent} />
          )}
          {hasSources ? (
            <div className="mt-3 rounded-2xl border border-cyan-300/14 bg-slate-950/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.26em] text-cyan-200/70">
                    Fontes usadas
                  </span>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/70">
                    Modo {retrievalModeLabel}
                  </p>
                </div>
                <button
                  type="button"
                  className="action-button action-button--small cursor-pointer"
                  onClick={() => setShowContext((current) => !current)}
                >
                  {showContext ? 'Ocultar contexto' : 'Ver contexto'}
                </button>
              </div>

              {sourceMetrics ? (
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-100/60">
                  <span>{message.sources?.length ?? 0} fontes</span>
                  {typeof sourceMetrics.overlapTotal === 'number' ? (
                    <span>overlap {sourceMetrics.overlapTotal}</span>
                  ) : null}
                  {typeof sourceMetrics.avgScore === 'number' ? (
                    <span>score medio {sourceMetrics.avgScore.toFixed(1)}</span>
                  ) : null}
                </div>
              ) : null}

              {showContext ? (
                <div className="mt-3 flex flex-col gap-2">
                  {message.sources?.map((source) => {
                    const fileName = resolveSourceFileName(source.filePath)
                    return (
                      <div
                        key={`${message.id}-${source.id}-${source.source}`}
                        className="rounded-xl border border-cyan-300/14 bg-slate-900/50 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                            {source.id}
                          </p>
                          {source.type ? (
                            <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">
                              {source.type}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-slate-200">{source.source}</p>
                        {fileName ? (
                          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/60">
                            {fileName}
                          </p>
                        ) : null}
                        {source.excerpt ? (
                          <p className="mt-2 text-sm text-slate-300">{source.excerpt}</p>
                        ) : null}
                        {typeof source.similarity === 'number' ||
                        typeof source.lexical === 'number' ||
                        typeof source.overlap === 'number' ? (
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-100/60">
                            {typeof source.similarity === 'number' ? (
                              <span>sim {source.similarity.toFixed(3)}</span>
                            ) : null}
                            {typeof source.lexical === 'number' ? (
                              <span>lex {source.lexical.toFixed(1)}</span>
                            ) : null}
                            {typeof source.overlap === 'number' ? (
                              <span>overlap {source.overlap}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.text === next.message.text &&
    prev.message.isStreaming === next.message.isStreaming &&
    prev.message.sender === next.message.sender
)

MessageBubble.displayName = 'MessageBubble'
