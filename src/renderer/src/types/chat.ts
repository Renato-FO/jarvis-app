export type Sender = 'user' | 'jarvis' | 'system'

export interface Message {
  id: string
  text: string
  sender: Sender
  timestamp: Date
  isStreaming?: boolean // Para mostrar cursor piscando
}

export interface ChatState {
  messages: Message[]
  isLoading: boolean
}
