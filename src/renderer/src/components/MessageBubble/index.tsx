import { Message } from '../../types/chat'

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const isJarvis = message.sender === 'jarvis'

  return (
    <div className={`flex w-full ${isJarvis ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`
          max-w-[85%] rounded-lg p-4 font-mono text-sm leading-relaxed shadow-lg relative
          ${
            isJarvis
              ? 'bg-jarvis-panel border border-jarvis-border text-gray-200 rounded-bl-none'
              : 'bg-jarvis-accent text-white rounded-br-none'
          }
        `}
      >
        <span
          className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isJarvis ? 'text-gray-500' : 'text-blue-200'}`}
        >
          {isJarvis ? 'J.A.R.V.I.S.' : 'COMMANDER'}
        </span>

        <div className="whitespace-pre-wrap">
          {message.text}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 align-middle bg-green-400 animate-blink" />
          )}
        </div>
      </div>
    </div>
  )
}
