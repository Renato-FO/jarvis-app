import { memo } from 'react'
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
          {isJarvis && !message.isStreaming && Array.isArray(message.sources) && message.sources.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-cyan-300/14 bg-slate-950/45 p-3">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.26em] text-cyan-200/70">
                Fontes usadas
              </span>
              <div className="flex flex-col gap-2">
                {message.sources.map((source) => (
                  <div
                    key={`${message.id}-${source.id}-${source.source}`}
                    className="rounded-xl border border-cyan-300/14 bg-slate-900/50 px-3 py-2"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                      {source.id}
                    </p>
                    <p className="text-sm text-slate-200">{source.source}</p>
                  </div>
                ))}
              </div>
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
