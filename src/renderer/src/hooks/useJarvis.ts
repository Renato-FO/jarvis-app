import { useEffect, useRef, useState } from 'react'
import { Message } from '../types/chat'

export function useJarvis() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const messagesRef = useRef<Message[]>([])

  useEffect(() => {
    const unsubscribeChunk = window.jarvis.onResponse((chunk: string) => {
      setMessages((prev) => {
        const safePrev = Array.isArray(prev) ? prev : []
        const safeChunk = typeof chunk === 'string' ? chunk : String(chunk ?? '')
        const lastMsg = safePrev[safePrev.length - 1]

        if (!lastMsg || lastMsg.sender !== 'jarvis') {
          const nextMessages = [
            ...safePrev,
            {
              id: `jarvis-${Date.now()}`,
              sender: 'jarvis' as const,
              text: safeChunk,
              timestamp: new Date(),
              isStreaming: true
            }
          ]

          messagesRef.current = nextMessages
          return nextMessages
        }

        const nextMessages = [
          ...safePrev.slice(0, -1),
          {
            ...lastMsg,
            text: `${String(lastMsg.text ?? '')}${safeChunk}`,
            isStreaming: true
          }
        ]

        messagesRef.current = nextMessages
        return nextMessages
      })
    })

    const unsubscribeDone = window.jarvis.onDone(() => {
      setMessages((prev) => {
        const safePrev = Array.isArray(prev) ? prev : []
        const lastMsg = safePrev[safePrev.length - 1]
        if (!lastMsg || lastMsg.sender !== 'jarvis') return safePrev

        const nextMessages = [
          ...safePrev.slice(0, -1),
          {
            ...lastMsg,
            isStreaming: false
          }
        ]

        messagesRef.current = nextMessages
        return nextMessages
      })
      setIsProcessing(false)
    })

    return () => {
      unsubscribeChunk()
      unsubscribeDone()
    }
  }, [])

  const sendMessage = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isProcessing) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date()
    }

    const history = messagesRef.current

    setMessages((prev) => {
      const safePrev = Array.isArray(prev) ? prev : []
      const nextMessages = [...safePrev, userMsg]
      messagesRef.current = nextMessages
      return nextMessages
    })

    setIsProcessing(true)
    window.jarvis.sendMessage(trimmed, history)
  }

  return { messages, sendMessage, isProcessing }
}
