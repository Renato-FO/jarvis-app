export type KnowledgeDocumentStatus = 'ready' | 'processing' | 'error'

export interface KnowledgeDocument {
  id: string
  name: string
  path: string
  type: string
  status: KnowledgeDocumentStatus
  indexedAt: string | null
  size: number
  chunks: number
  lastError?: string
}

export interface KnowledgeState {
  documents: KnowledgeDocument[]
  stats: {
    indexedDocuments: number
    processingDocuments: number
    erroredDocuments: number
    totalChunks: number
    isReady: boolean
  }
}

export interface KnowledgeProgressEvent {
  type:
    | 'document-started'
    | 'document-formatting'
    | 'chunk-progress'
    | 'document-complete'
    | 'document-error'
    | 'document-skipped'
  record?: KnowledgeDocument
  current?: number
  total?: number
  message?: string
  error?: string
}
