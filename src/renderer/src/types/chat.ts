export type Sender = 'user' | 'jarvis' | 'system'

export interface MessageSource {
  id: string
  source: string
  excerpt?: string
}

export interface JarvisResponseContext {
  sources: MessageSource[]
  retrievalMode: 'fact' | 'exploratory'
}

export interface Message {
  id: string
  text: string
  sender: Sender
  timestamp: Date
  isStreaming?: boolean // Para mostrar cursor piscando
  sources?: MessageSource[]
}

export interface ChatState {
  messages: Message[]
  isLoading: boolean
}
