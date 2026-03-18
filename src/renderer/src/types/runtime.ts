export type OllamaPhase =
  | 'idle'
  | 'validating'
  | 'starting-server'
  | 'warming-chat'
  | 'warming-embedding'
  | 'ready'
  | 'error'

export interface OllamaRuntimeStatus {
  host: string
  phase: OllamaPhase
  message: string
  serverReachable: boolean
  chatModel: string
  embeddingModel: string
  chatModelInstalled: boolean
  embeddingModelInstalled: boolean
  chatModelLoaded: boolean
  embeddingModelLoaded: boolean
  lastError: string | null
}

export interface RuntimePerformanceSnapshot {
  timestampMs: number
  cpuUserMicros: number
  cpuSystemMicros: number
  cpuCount: number
  rssBytes: number
  heapUsedBytes: number
  heapTotalBytes: number
  externalBytes: number
}
