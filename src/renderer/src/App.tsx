import { useEffect, useRef } from 'react'
import { useJarvis } from './hooks/useJarvis'
import { MessageBubble } from './components/MessageBubble'
import { ChatInput } from './components/ChatInput'

function App() {
  const { messages, sendMessage, isProcessing } = useJarvis()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-screen font-sans selection:bg-jarvis-accent selection:text-white">
      {/* STATUS BAR (Drag Region) */}
      <header className="flex justify-between items-center px-4 py-2 bg-jarvis-panel border-b border-jarvis-border text-xs text-jarvis-dim font-mono uppercase tracking-widest select-none app-drag-region">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          System Online
        </span>
        <span>J.A.R.V.I.S. v1.0</span>
        <span>QWEN-30B</span>
      </header>

      {/* CHAT AREA */}
      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={endRef} />
      </main>

      {/* FOOTER */}
      <footer className="p-4 bg-jarvis-panel border-t border-jarvis-border">
        <ChatInput onSend={sendMessage} disabled={isProcessing} />
      </footer>
    </div>
  )
}

export default App
