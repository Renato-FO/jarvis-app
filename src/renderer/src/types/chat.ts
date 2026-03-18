export type Sender = 'user' | 'jarvis' | 'system'

export interface MessageSource {
  id: string
  source: string
  excerpt?: string
  documentId?: string
  filePath?: string
  type?: string
  score?: number
  similarity?: number | null
  lexical?: number
  overlap?: number
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
  retrievalMode?: 'fact' | 'exploratory'
}
