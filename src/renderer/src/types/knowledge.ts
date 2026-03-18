export type KnowledgeDocumentStatus = 'ready' | 'processing' | 'error' | 'reindex-required'

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
    reindexDocuments: number
    totalChunks: number
    isReady: boolean
  }
}

export interface KnowledgeChunkPreview {
  id: string
  chunkIndex: number
  childChunkIndex: number
  length: number
  preview: string
}

export interface KnowledgeDocumentInsights {
  documentId: string
  preparedPath: string | null
  preparedPreview: string
  preparedLength: number
  totalChunks: number
  chunkPreviews: KnowledgeChunkPreview[]
  preparedMissing: boolean
}

export interface KnowledgeProgressEvent {
  type:
    | 'document-started'
    | 'document-reprocess-started'
    | 'document-formatting'
    | 'chunk-progress'
    | 'document-complete'
    | 'document-error'
    | 'document-skipped'
    | 'document-removed'
    | 'memory-cleared'
  record?: KnowledgeDocument
  current?: number
  total?: number
  message?: string
  error?: string
}
