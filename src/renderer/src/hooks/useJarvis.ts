import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Message } from '../types/chat'

const STREAM_FLUSH_INTERVAL_MS = 40

export function useJarvis() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const messagesRef = useRef<Message[]>([])
  const pendingChunkRef = useRef('')
  const flushTimerRef = useRef<number | null>(null)

  const flushPendingChunk = useEffectEvent(() => {
    const chunk = pendingChunkRef.current
    if (!chunk) return

    pendingChunkRef.current = ''

    setMessages((prev) => {
      const safePrev = Array.isArray(prev) ? prev : []
      const lastMsg = safePrev[safePrev.length - 1]

      if (!lastMsg || lastMsg.sender !== 'jarvis') {
        const nextMessages = [
          ...safePrev,
          {
            id: `jarvis-${Date.now()}`,
            sender: 'jarvis' as const,
            text: chunk,
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
          text: `${String(lastMsg.text ?? '')}${chunk}`,
          isStreaming: true
        }
      ]

      messagesRef.current = nextMessages
      return nextMessages
    })
  })

  const scheduleChunkFlush = useEffectEvent(() => {
    if (flushTimerRef.current !== null) return

    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      flushPendingChunk()
    }, STREAM_FLUSH_INTERVAL_MS)
  })

  useEffect(() => {
    const unsubscribeChunk = window.jarvis.onResponse((chunk: string) => {
      pendingChunkRef.current += typeof chunk === 'string' ? chunk : String(chunk ?? '')
      scheduleChunkFlush()
    })

    const unsubscribeDone = window.jarvis.onDone(() => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }

      flushPendingChunk()

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
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }

      pendingChunkRef.current = ''
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
