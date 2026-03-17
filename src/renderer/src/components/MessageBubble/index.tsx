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
