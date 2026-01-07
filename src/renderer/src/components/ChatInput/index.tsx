import { useState, KeyboardEvent } from 'react'
import { MicIcon } from '../Icons'

interface Props {
  onSend: (text: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: Props) {
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input)
      setInput('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex gap-3 items-end relative">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        className={`
          flex-1 bg-black/30 border text-gray-200
          rounded p-3 font-mono text-sm outline-none resize-none
          transition-all duration-300
          min-h-11 max-h-32
        `}
      />

      {/* Botão de Microfone */}
      <button
        className={`
          h-11 w-11 flex items-center justify-center rounded transition-all
        `}
        title="Ativar Voz"
      >
        <MicIcon />
      </button>

      {/* Botão de Enviar */}
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="
          h-11 px-6 bg-jarvis-accent text-white font-bold text-xs tracking-wider rounded
          hover:bg-blue-600 transition-colors uppercase
          disabled:bg-jarvis-border disabled:text-gray-500 disabled:cursor-not-allowed
        "
      >
        Execute
      </button>
    </div>
  )
}
