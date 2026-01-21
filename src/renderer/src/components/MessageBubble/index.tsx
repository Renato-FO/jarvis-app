import { Message } from '../../types/chat'
import { MarkdownRenderer } from '../MarkdownRenderer' // <--- Importe o componente

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const isJarvis = message.sender === 'jarvis'

  // Truque Visual: Se estiver fazendo streaming, adicionamos um cursor falso ao final do texto
  // Isso faz com que o cursor apareça "dentro" do Markdown (ex: dentro do bloco de código)
  const displayContent = message.isStreaming ? message.text + ' ▍' : message.text

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
        {/* Label do Remetente */}
        <span
          className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${isJarvis ? 'text-gray-500' : 'text-blue-200'}`}
        >
          {isJarvis ? 'J.A.R.V.I.S.' : 'COMMANDER'}
        </span>

        {/* Renderização Rica (Markdown + Cores) */}
        <div>
          <MarkdownRenderer content={displayContent} />
        </div>
      </div>
    </div>
  )
}
