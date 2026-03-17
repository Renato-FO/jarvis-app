import { useState, KeyboardEvent, useRef } from 'react'
import { MicIcon } from '../Icons'

interface Props {
  onSend: (text: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: Props) {
  const [input, setInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input)
      setInput('')
    }
  }

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    chunksRef.current = []

    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm'
    })

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const buffer = await blob.arrayBuffer()
      const text = await window.jarvis.transcribe(buffer)
      onSend(text)
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    setIsRecording(true)
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-input-shell flex items-end gap-3">
      <div className="chat-input-shell__field relative flex-1">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Pergunte algo ou peça ao Jarvis para cruzar conhecimentos..."
          className="min-h-14 max-h-36 w-full resize-none rounded-2xl border border-white/10 bg-white/6 px-4 py-4 pr-14 text-sm text-slate-100 outline-none transition-all duration-300 placeholder:text-slate-500 focus:border-cyan-300/50 focus:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          type="button"
          className={`absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
            isRecording
              ? 'border-rose-400/70 bg-rose-500/20 text-rose-100'
              : 'border-cyan-300/30 bg-cyan-300/8 text-cyan-100'
          }`}
          title={isRecording ? 'Parar gravação' : 'Ativar voz'}
        >
          <MicIcon className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        type="button"
        className="chat-input-shell__send h-14 rounded-2xl border border-cyan-300/40 bg-cyan-300/14 px-5 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100 transition-all hover:border-cyan-200/60 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
      >
        Enviar
      </button>
    </div>
  )
}
