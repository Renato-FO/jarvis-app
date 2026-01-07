import { useState, useEffect, useRef } from 'react'
import { Message } from '../types/chat'

export function useJarvis() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Ref para controlar o buffer de stream sem causar re-renders desnecessários
  const streamBuffer = useRef('')

  useEffect(() => {
    // Escuta a resposta do Backend (Main Process)
    window.jarvis.onResponse((chunk: string) => {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1]

        // Se a última msg não for do Jarvis, cria uma nova
        if (!lastMsg || lastMsg.sender !== 'jarvis') {
          return [
            ...prev,
            {
              id: Date.now().toString(),
              sender: 'jarvis',
              text: chunk,
              timestamp: new Date(),
              isStreaming: true
            }
          ]
        }

        // Se já existe, atualiza o texto (Imutabilidade do React)
        const updatedLastMsg = { ...lastMsg, text: lastMsg.text + chunk }
        return [...prev.slice(0, -1), updatedLastMsg]
      })

      setIsProcessing(false) // Começou a receber, não está mais "esperando"
    })
  }, [])

  const sendMessage = (text: string) => {
    if (!text.trim()) return

    // 1. Adiciona mensagem do usuário na UI
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: text,
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMsg])
    setIsProcessing(true)

    // 2. Dispara para o Backend
    window.jarvis.sendMessage(text)
  }

  return { messages, sendMessage, isProcessing }
}
