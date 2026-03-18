import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import Database from 'better-sqlite3'
import { Document } from '@langchain/core/documents'
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory'
import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { OllamaEmbeddings } from '@langchain/ollama'
import { DocumentFormatter } from './DocumentFormatter'
import { ollamaService } from './OllamaService'

const require = createRequire(import.meta.url)
const pdf = require('pdf-parse-new')

const EMBEDDING_CHUNK_SIZE = 1100
const EMBEDDING_CHUNK_OVERLAP = 140
const EMBEDDING_MAX_CHARS = 1400
const EMBEDDING_MIN_CHARS = 120
const SEARCH_RESULT_LIMIT = 6
const FACT_SEARCH_RESULT_LIMIT = 4
const HYBRID_SEMANTIC_LIMIT = 16
const HYBRID_SEMANTIC_LIMIT_FACT = 28
const HYBRID_KEYWORD_LIMIT = 22
const HYBRID_KEYWORD_LIMIT_FACT = 36
const MIN_CONTENT_LENGTH_FOR_RETRIEVAL = 50
const MAX_CONTEXT_CHARS = 5200
const MAX_CONTEXT_HIT_CHARS = 1200
const PREPARED_PREVIEW_MAX_CHARS = 2600
const DEFAULT_CHUNK_PREVIEW_LIMIT = 8
const CHUNK_PREVIEW_MAX_CHARS = 320
const KNOWLEDGE_DB_FILENAME = 'knowledge.db'
const LEGACY_VECTOR_STORE_FILENAME = 'jarvis-memory-langchain.json'
const LEGACY_MANIFEST_FILENAME = 'docs.json'

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || error.message
    }
  }

  return {
    message: String(error),
    stack: String(error)
  }
}

function buildDiagnosticError(scope: string, context: Record<string, unknown>, error: unknown) {
  const details = getErrorDetails(error)
  const debugContext = Object.entries(context)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' | ')

  return new Error(
    `[${scope}] ${details.message}\nContext: ${debugContext || 'n/a'}\nStack:\n${details.stack}`
  )
}

export type KnowledgeDocumentStatus = 'ready' | 'processing' | 'error' | 'reindex-required'

export interface KnowledgeDocumentRecord {
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

export interface KnowledgeSnapshot {
  documents: KnowledgeDocumentRecord[]
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

export interface RetrievedContextSource {
  id: string
  source: string
  excerpt: string
}

export interface RetrievedContext {
  contextText: string
  sources: RetrievedContextSource[]
  retrievalMode: 'fact' | 'exploratory'
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
  record?: KnowledgeDocumentRecord
  current?: number
  total?: number
  message?: string
  error?: string
}

interface PersistedVectorRecord {
  pageContent: string
  metadata: Record<string, unknown>
  embedding: number[]
  id?: string
}

interface QueryKeywordScore {
  overlapCount: number
  score: number
  matchedKeywords: string[]
}

interface RetrievalFilters {
  documentIds: Set<string>
  collectionDocumentIds: Set<string>
  hasDocumentConstraint: boolean
  hasCollectionConstraint: boolean
}

interface RetrievalCandidate {
  key: string
  documentId: string
  source: string
  content: string
  metadata: Record<string, unknown>
  similarity: number | null
  semanticRank: number | null
  keywordRank: number | null
  keywordScore: QueryKeywordScore
  lexicalScore: number
  matchedKeywords: string[]
  filterBoost: number
  chunkBoost: number
  baseScore: number
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.md',
  '.txt',
  '.json',
  '.csv',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.html',
  '.css',
  '.xml',
  '.yml',
  '.yaml'
])

export class KnowledgeBase {
  private vectorStore: MemoryVectorStore | null = null
  private embeddings: OllamaEmbeddings | null = null
  private database: Database.Database | null = null
  private databasePath = ''
  private legacyMemoryPath = ''
  private legacyManifestPath = ''
  private preparedDocumentsDir = ''
  private processedFiles: KnowledgeDocumentRecord[] = []
  private activeDocuments = new Set<string>()
  private formatter: DocumentFormatter | null = null

  async initialize() {
    const rootDir = path.join(app.getPath('userData'), 'knowledge')
    fs.mkdirSync(rootDir, { recursive: true })

    this.databasePath = path.join(rootDir, KNOWLEDGE_DB_FILENAME)
    this.legacyMemoryPath = path.join(rootDir, LEGACY_VECTOR_STORE_FILENAME)
    this.legacyManifestPath = path.join(rootDir, LEGACY_MANIFEST_FILENAME)
    this.preparedDocumentsDir = path.join(rootDir, 'prepared')
    this.formatter = new DocumentFormatter(this.preparedDocumentsDir)
    this.embeddings = this.createEmbeddings()
    this.vectorStore = await MemoryVectorStore.fromExistingIndex(this.embeddings)
    this.openDatabase()

    console.log(`[KnowledgeBase][SQLite] Database: ${this.databasePath}`)
    console.log(`[KnowledgeBase][SQLite] Legacy vectors: ${this.legacyMemoryPath}`)
    console.log(`[KnowledgeBase][SQLite] Legacy manifest: ${this.legacyManifestPath}`)

    this.loadManifest()
    await this.restoreVectorStore()
    await this.migrateLegacyStorageIfNeeded()

    if (
      this.getPersistedVectorCount() === 0 &&
      this.processedFiles.some((record) => record.status === 'ready')
    ) {
      this.processedFiles = this.processedFiles.map((record) => ({
        ...record,
        status: 'reindex-required',
        lastError: 'Reindexacao necessaria para reconstruir vetores no banco local.'
      }))
      this.saveManifest()
      console.warn(
        '[KnowledgeBase][SQLite] Documentos detectados sem vetores persistidos. Reindexacao necessaria.'
      )
    }
  }

  getSupportedExtensions(): string[] {
    return Array.from(SUPPORTED_EXTENSIONS)
  }

  getSnapshot(): KnowledgeSnapshot {
    const documents = [...this.processedFiles].sort((a, b) => {
      const aDate = a.indexedAt ? new Date(a.indexedAt).getTime() : 0
      const bDate = b.indexedAt ? new Date(b.indexedAt).getTime() : 0
      return bDate - aDate || a.name.localeCompare(b.name)
    })

    return {
      documents,
      stats: {
        indexedDocuments: documents.filter((doc) => doc.status === 'ready').length,
        processingDocuments: documents.filter((doc) => doc.status === 'processing').length,
        erroredDocuments: documents.filter((doc) => doc.status === 'error').length,
        reindexDocuments: documents.filter((doc) => doc.status === 'reindex-required').length,
        totalChunks: documents.reduce((sum, doc) => sum + doc.chunks, 0),
        isReady: this.vectorStore !== null
      }
    }
  }

  async ingestDocuments(
    filePaths: string[],
    onProgress?: (event: KnowledgeProgressEvent) => void
  ): Promise<void> {
    for (const filePath of filePaths) {
      await this.ingestDocument(filePath, onProgress)
    }
  }

  async removeDocumentById(documentId: string): Promise<KnowledgeDocumentRecord | null> {
    const record = this.findRecordById(documentId)
    if (!record) {
      return null
    }

    if (this.activeDocuments.has(path.resolve(record.path))) {
      throw new Error(`Nao e possivel remover ${record.name} enquanto ele esta em processamento.`)
    }

    this.removeVectorsForDocument(documentId)
    this.processedFiles = this.processedFiles.filter((item) => item.id !== documentId)
    this.deletePreparedArtifact(record.path)
    await this.saveToDisk()
    this.saveManifest()

    return record
  }

  async reprocessDocumentById(
    documentId: string,
    onProgress?: (event: KnowledgeProgressEvent) => void
  ): Promise<KnowledgeDocumentRecord | null> {
    const record = this.findRecordById(documentId)
    if (!record) {
      return null
    }

    onProgress?.({
      type: 'document-reprocess-started',
      record,
      message: `Reprocessando ${record.name} para atualizar a indexacao.`
    })

    return this.ingestDocument(record.path, onProgress, { force: true })
  }

  async clearAllDocuments(): Promise<void> {
    if (this.activeDocuments.size > 0) {
      throw new Error('Nao e possivel limpar a memoria enquanto ha documentos em processamento.')
    }

    this.processedFiles = []
    if (this.vectorStore) {
      this.vectorStore.memoryVectors.splice(0, this.vectorStore.memoryVectors.length)
    }
    this.clearPreparedArtifacts()
    await this.saveToDisk()
    this.saveManifest()
  }

  getDocumentInsights(documentId: string, chunkLimit = DEFAULT_CHUNK_PREVIEW_LIMIT) {
    const record = this.findRecordById(documentId)
    if (!record) {
      return null
    }

    const safeChunkLimit = Math.max(1, Math.min(24, Number(chunkLimit) || DEFAULT_CHUNK_PREVIEW_LIMIT))
    const preparedPath = this.resolvePreparedPath(record.path)
    const preparedContent =
      preparedPath && fs.existsSync(preparedPath) ? fs.readFileSync(preparedPath, 'utf-8') : ''

    const vectors = this.vectorStore?.memoryVectors ?? []
    const relatedVectors = vectors
      .filter((vector) => String((vector.metadata as Record<string, unknown>)?.documentId ?? '') === record.id)
      .sort((left, right) => {
        const leftChunkIndex = Number((left.metadata as Record<string, unknown>)?.chunkIndex ?? 0)
        const rightChunkIndex = Number((right.metadata as Record<string, unknown>)?.chunkIndex ?? 0)
        if (leftChunkIndex !== rightChunkIndex) {
          return leftChunkIndex - rightChunkIndex
        }

        const leftChildIndex = Number((left.metadata as Record<string, unknown>)?.childChunkIndex ?? 0)
        const rightChildIndex = Number((right.metadata as Record<string, unknown>)?.childChunkIndex ?? 0)
        return leftChildIndex - rightChildIndex
      })

    const chunkPreviews: KnowledgeChunkPreview[] = relatedVectors
      .slice(0, safeChunkLimit)
      .map((vector, index) => {
        const metadata = (vector.metadata ?? {}) as Record<string, unknown>
        const rawContent = String(vector.content ?? '')

        return {
          id: String(vector.id ?? `${record.id}-chunk-${index}`),
          chunkIndex: Number(metadata.chunkIndex ?? index),
          childChunkIndex: Number(metadata.childChunkIndex ?? 0),
          length: rawContent.length,
          preview: this.trimToBudget(rawContent, CHUNK_PREVIEW_MAX_CHARS)
        }
      })

    const preparedPreview = this.trimToBudget(preparedContent, PREPARED_PREVIEW_MAX_CHARS)

    return {
      documentId: record.id,
      preparedPath,
      preparedPreview,
      preparedLength: preparedContent.length,
      totalChunks: relatedVectors.length,
      chunkPreviews,
      preparedMissing: !preparedPath || !fs.existsSync(preparedPath)
    } satisfies KnowledgeDocumentInsights
  }

  async ingestDocument(
    filePath: string,
    onProgress?: (event: KnowledgeProgressEvent) => void,
    options?: { force?: boolean }
  ): Promise<KnowledgeDocumentRecord | null> {
    if (!this.vectorStore) {
      throw new Error('Base de conhecimento LangChain ainda não inicializada.')
    }

    const resolvedPath = path.resolve(filePath)
    const extension = path.extname(resolvedPath).toLowerCase()

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new Error(`Formato não suportado: ${extension || 'desconhecido'}`)
    }

    if (this.activeDocuments.has(resolvedPath)) {
      const existing = this.findRecord(resolvedPath)
      onProgress?.({
        type: 'document-skipped',
        record: existing ?? undefined,
        message: `${path.basename(resolvedPath)} já está em processamento.`
      })
      return existing ?? null
    }

    const existingRecord = this.findRecord(resolvedPath)
    const shouldForceReindex = Boolean(options?.force)
    if (existingRecord?.status === 'ready' && !shouldForceReindex) {
      onProgress?.({
        type: 'document-skipped',
        record: existingRecord,
        message: `${existingRecord.name} já está disponível na memória.`
      })
      return existingRecord
    }

    const stats = fs.statSync(resolvedPath)
    const baseRecord: KnowledgeDocumentRecord = {
      id: existingRecord?.id ?? resolvedPath,
      name: path.basename(resolvedPath),
      path: resolvedPath,
      type: extension.replace('.', '') || 'file',
      status: 'processing',
      indexedAt: existingRecord?.indexedAt ?? null,
      size: stats.size,
      chunks: existingRecord?.chunks ?? 0,
      lastError: ''
    }

    this.activeDocuments.add(resolvedPath)
    if (shouldForceReindex && existingRecord) {
      this.removeVectorsForDocument(existingRecord.id)
    }
    this.upsertRecord(baseRecord)
    this.saveManifest()
    onProgress?.({ type: 'document-started', record: baseRecord })

    let stage = 'extract'
    let rawContentLength = 0
    let preparedContentLength = 0
    let chunkCount = 0

    try {
      const rawContent = await this.extractContent(resolvedPath, extension)
      rawContentLength = rawContent.length

      onProgress?.({
        type: 'document-formatting',
        record: baseRecord,
        message: `Formatando ${baseRecord.name} para leitura semântica...`
      })

      stage = 'format'
      const preparedDocument = this.getFormatter().prepareForAI({
        filePath: resolvedPath,
        extension,
        rawContent
      })
      preparedContentLength = preparedDocument.content.length

      stage = 'split'
      const chunkDocuments = await this.createChunkDocuments(
        preparedDocument.content,
        baseRecord,
        preparedDocument.outputPath
      )
      chunkCount = chunkDocuments.length

      if (chunkDocuments.length === 0) {
        throw new Error('Nenhum conteúdo textual útil foi extraído do arquivo.')
      }

      console.log(
        `[KnowledgeBase][LangChain] Prepared ${baseRecord.name} at ${preparedDocument.outputPath}.`
      )
      console.log(
        `[KnowledgeBase][LangChain] Indexing ${chunkDocuments.length} chunks from ${baseRecord.name}...`
      )

      stage = 'embed'
      await ollamaService.ensureEmbeddingReady()
      const vectors = await this.getEmbeddings().embedDocuments(
        chunkDocuments.map((document) => document.pageContent)
      )

      stage = 'store'
      await this.vectorStore.addVectors(vectors, chunkDocuments)

      for (let index = 0; index < chunkDocuments.length; index += 1) {
        onProgress?.({
          type: 'chunk-progress',
          record: { ...baseRecord, chunks: chunkDocuments.length },
          current: index + 1,
          total: chunkDocuments.length
        })
      }

      stage = 'save'
      await this.saveToDisk()

      const completedRecord: KnowledgeDocumentRecord = {
        ...baseRecord,
        status: 'ready',
        indexedAt: new Date().toISOString(),
        chunks: chunkDocuments.length,
        lastError: ''
      }

      this.upsertRecord(completedRecord)
      this.saveManifest()
      onProgress?.({
        type: 'document-complete',
        record: completedRecord,
        message: `${completedRecord.name} foi incorporado à memória.`
      })

      return completedRecord
    } catch (error) {
      const diagnosticError = buildDiagnosticError(
        'KnowledgeBase.ingestDocument',
        {
          stage,
          filePath: resolvedPath,
          extension,
          documentName: baseRecord.name,
          rawContentLength,
          preparedContentLength,
          chunkCount
        },
        error
      )

      const erroredRecord: KnowledgeDocumentRecord = {
        ...baseRecord,
        status: 'error',
        lastError: diagnosticError.message
      }

      this.upsertRecord(erroredRecord)
      this.saveManifest()
      onProgress?.({
        type: 'document-error',
        record: erroredRecord,
        error: erroredRecord.lastError
      })

      console.error(diagnosticError)
      throw diagnosticError
    } finally {
      this.activeDocuments.delete(resolvedPath)
    }
  }

  async searchRelevantContext(query: string): Promise<RetrievedContext> {
    if (!this.vectorStore) {
      return {
        contextText: '',
        sources: [],
        retrievalMode: this.isFactSeekingQuery(query) ? 'fact' : 'exploratory'
      }
    }

    const readyDocuments = this.processedFiles.filter((doc) => doc.status === 'ready').length
    const retrievalMode = this.isFactSeekingQuery(query) ? 'fact' : 'exploratory'

    if (readyDocuments === 0) {
      return {
        contextText: '',
        sources: [],
        retrievalMode
      }
    }

    let stage = 'embed-query'
    let queryLength = 0
    let hitCount = 0

    try {
      queryLength = String(query ?? '').length
      const maxContextChars = retrievalMode === 'fact' ? 2600 : MAX_CONTEXT_CHARS
      const maxContextHitChars = retrievalMode === 'fact' ? 820 : MAX_CONTEXT_HIT_CHARS
      const queryKeywords = this.extractQueryKeywords(query)
      const retrievalFilters = this.resolveRetrievalFilters(query, queryKeywords)
      const semanticLimit =
        retrievalMode === 'fact' ? HYBRID_SEMANTIC_LIMIT_FACT : HYBRID_SEMANTIC_LIMIT
      const keywordLimit = retrievalMode === 'fact' ? HYBRID_KEYWORD_LIMIT_FACT : HYBRID_KEYWORD_LIMIT

      stage = 'embed-query'
      await ollamaService.ensureEmbeddingReady()
      const queryEmbedding = await this.getEmbeddings().embedQuery(String(query ?? ''))

      stage = 'semantic-search'
      const semanticResult = await this.vectorStore.similaritySearchVectorWithScore(
        queryEmbedding,
        semanticLimit
      )

      stage = 'keyword-search'
      const keywordResult = this.keywordSearchCandidates(queryKeywords, retrievalFilters, keywordLimit)
      stage = 'hybrid-merge'
      const mergedCandidates = this.mergeHybridCandidates(
        semanticResult,
        keywordResult,
        queryKeywords,
        retrievalFilters
      )
      const filterAwareCandidates = this.applyRetrievalFilters(mergedCandidates, retrievalFilters)
      const candidatesToRank =
        filterAwareCandidates.length > 0 ? filterAwareCandidates : mergedCandidates

      if (candidatesToRank.length === 0) {
        return {
          contextText: '',
          sources: [],
          retrievalMode
        }
      }

      hitCount = candidatesToRank.length
      stage = 'rerank'
      const rerankedHits = this.rerankCandidates(
        candidatesToRank,
        queryKeywords,
        retrievalMode,
        retrievalFilters
      )

      const selectedHits =
        retrievalMode === 'fact'
          ? this.selectFactCandidates(rerankedHits)
          : rerankedHits.slice(0, SEARCH_RESULT_LIMIT)

      if (selectedHits.length === 0) {
        return {
          contextText: '',
          sources: [],
          retrievalMode
        }
      }

      stage = 'build-context'

      const contextBlocks: string[] = []
      const sources: RetrievedContextSource[] = []
      let usedChars = 0

      for (const [index, entry] of selectedHits.entries()) {
        const trimmedContent = this.trimToBudget(entry.content, maxContextHitChars)
        const contextId = `CTX-${index + 1}`
        const similarityLabel =
          entry.similarity === null ? 'n/a' : Number(entry.similarity).toFixed(4)
        const block = [
          `[${contextId} | Fonte: ${entry.source} | hybridScore=${entry.baseScore.toFixed(2)} | similarity=${similarityLabel} | lexical=${entry.lexicalScore.toFixed(1)} | overlap=${entry.keywordScore.overlapCount}]`,
          trimmedContent
        ].join('\n')

        if (usedChars + block.length > maxContextChars) {
          const remainingBudget = maxContextChars - usedChars
          if (remainingBudget < 220) {
            break
          }

          const truncated = this.trimToBudget(block, remainingBudget)
          if (truncated) {
            contextBlocks.push(truncated)
          }
          break
        }

        contextBlocks.push(block)
        sources.push({
          id: contextId,
          source: entry.source,
          excerpt: trimmedContent
        })
        usedChars += block.length + 2
      }

      return {
        contextText: contextBlocks.join('\n\n'),
        sources,
        retrievalMode
      }
    } catch (error) {
      throw buildDiagnosticError(
        'KnowledgeBase.searchRelevantContext',
        {
          stage,
          queryLength,
          readyDocuments,
          hitCount
        },
        error
      )
    }
  }

  private openDatabase() {
    try {
      this.database = new Database(this.databasePath)
      this.database.pragma('journal_mode = WAL')
      this.database.pragma('synchronous = NORMAL')
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          indexed_at TEXT,
          size INTEGER NOT NULL DEFAULT 0,
          chunks INTEGER NOT NULL DEFAULT 0,
          last_error TEXT NOT NULL DEFAULT ''
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
        CREATE TABLE IF NOT EXISTS vectors (
          id TEXT PRIMARY KEY,
          page_content TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          embedding_json TEXT NOT NULL
        );
      `)
    } catch (error) {
      throw buildDiagnosticError(
        'KnowledgeBase.openDatabase',
        { databasePath: this.databasePath },
        error
      )
    }
  }

  private getDatabase(): Database.Database {
    if (!this.database) {
      throw new Error('Banco local da KnowledgeBase ainda não inicializado.')
    }

    return this.database
  }

  private getPersistedVectorCount() {
    const row = this.getDatabase().prepare('SELECT COUNT(*) AS total FROM vectors').get() as
      | { total?: number }
      | undefined

    return Number(row?.total ?? 0)
  }

  private async migrateLegacyStorageIfNeeded() {
    if (this.processedFiles.length === 0 && fs.existsSync(this.legacyManifestPath)) {
      try {
        const legacyManifestRaw = fs.readFileSync(this.legacyManifestPath, 'utf-8')
        const legacyManifestParsed = JSON.parse(legacyManifestRaw)
        const legacyManifest = Array.isArray(legacyManifestParsed) ? legacyManifestParsed : []

        if (legacyManifest.length > 0) {
          this.processedFiles = legacyManifest.map((item) => this.normalizeRecord(item))
          this.saveManifest()
          console.log(
            `[KnowledgeBase][SQLite] Migrated ${this.processedFiles.length} document records from legacy docs.json.`
          )
        }
      } catch (error) {
        console.error(
          buildDiagnosticError(
            'KnowledgeBase.migrateLegacyStorageIfNeeded',
            { legacyManifestPath: this.legacyManifestPath },
            error
          )
        )
      }
    }

    if (this.getPersistedVectorCount() > 0 || !this.vectorStore || !fs.existsSync(this.legacyMemoryPath)) {
      return
    }

    try {
      const raw = fs.readFileSync(this.legacyMemoryPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const records = Array.isArray(parsed) ? parsed : []

      if (records.length === 0) {
        return
      }

      const documents = records.map((record) => {
        const metadata =
          record?.metadata && typeof record.metadata === 'object' ? record.metadata : {}

        return new Document({
          pageContent: String(record?.pageContent ?? ''),
          metadata,
          id: record?.id ? String(record.id) : undefined
        })
      })
      const vectors = records.map((record) =>
        Array.isArray(record?.embedding) ? record.embedding.map((value) => Number(value)) : []
      )

      await this.vectorStore.addVectors(vectors, documents)
      await this.saveToDisk()
      console.log(`[KnowledgeBase][SQLite] Migrated ${records.length} vectors from legacy JSON.`)
    } catch (error) {
      console.error(
        buildDiagnosticError(
          'KnowledgeBase.migrateLegacyStorageIfNeeded',
          { legacyMemoryPath: this.legacyMemoryPath },
          error
        )
      )
    }
  }

  private async restoreVectorStore() {
    if (!this.vectorStore) {
      return
    }

    try {
      const rows = this.getDatabase()
        .prepare(
          `SELECT id, page_content AS pageContent, metadata_json AS metadataJson, embedding_json AS embeddingJson FROM vectors`
        )
        .all() as Array<{
        id: string
        pageContent: string
        metadataJson: string
        embeddingJson: string
      }>

      if (rows.length === 0) {
        return
      }

      const records: PersistedVectorRecord[] = rows.map((row) => {
        let metadata: Record<string, unknown> = {}
        let embedding: number[] = []

        try {
          const parsedMetadata = JSON.parse(String(row.metadataJson ?? '{}'))
          metadata =
            parsedMetadata && typeof parsedMetadata === 'object'
              ? (parsedMetadata as Record<string, unknown>)
              : {}
        } catch {
          metadata = {}
        }

        try {
          const parsedEmbedding = JSON.parse(String(row.embeddingJson ?? '[]'))
          embedding = Array.isArray(parsedEmbedding)
            ? parsedEmbedding.map((value) => Number(value))
            : []
        } catch {
          embedding = []
        }

        return {
          id: String(row.id),
          pageContent: String(row.pageContent ?? ''),
          metadata,
          embedding
        }
      })

      if (records.length === 0) {
        return
      }

      const documents = records.map(
        (record) =>
          new Document({
            pageContent: String(record.pageContent ?? ''),
            metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
            id: record.id ? String(record.id) : undefined
          })
      )
      const vectors = records.map((record) =>
        Array.isArray(record.embedding) ? record.embedding.map((value) => Number(value)) : []
      )

      await this.vectorStore.addVectors(vectors, documents)
      console.log(`[KnowledgeBase][SQLite] Restored ${records.length} vectors from local database.`)
    } catch (error) {
      console.error(
        buildDiagnosticError(
          'KnowledgeBase.restoreVectorStore',
          { databasePath: this.databasePath },
          error
        )
      )
    }
  }

  private loadManifest() {
    try {
      const rows = this.getDatabase()
        .prepare(
          `SELECT id, name, path, type, status, indexed_at AS indexedAt, size, chunks, last_error AS lastError FROM documents`
        )
        .all() as Array<Record<string, unknown>>

      this.processedFiles = rows.map((item) => this.normalizeRecord(item))
    } catch (error) {
      console.error('[Manifest] Failed to read documents from SQLite', error)
      this.processedFiles = []
    }
  }

  private saveManifest() {
    try {
      const db = this.getDatabase()
      const insert = db.prepare(
        `INSERT INTO documents (id, name, path, type, status, indexed_at, size, chunks, last_error)
         VALUES (@id, @name, @path, @type, @status, @indexedAt, @size, @chunks, @lastError)`
      )

      const persist = db.transaction((records: KnowledgeDocumentRecord[]) => {
        db.prepare('DELETE FROM documents').run()

        for (const record of records) {
          insert.run({
            id: record.id,
            name: record.name,
            path: record.path,
            type: record.type,
            status: record.status,
            indexedAt: record.indexedAt,
            size: record.size,
            chunks: record.chunks,
            lastError: record.lastError ?? ''
          })
        }
      })

      persist(this.processedFiles)
    } catch (error) {
      console.error('[Manifest] Failed to save documents to SQLite', error)
    }
  }

  private normalizeRecord(item: Record<string, unknown>): KnowledgeDocumentRecord {
    return {
      id: String(item.id ?? item.path ?? item.name),
      name: String(item.name ?? 'Documento'),
      path: String(item.path ?? ''),
      type: String(item.type ?? 'file'),
      status: this.normalizeStatus(item.status),
      indexedAt: item.indexedAt ? String(item.indexedAt) : null,
      size: Number(item.size ?? 0),
      chunks: Number(item.chunks ?? 0),
      lastError: item.lastError ? String(item.lastError) : ''
    }
  }

  private normalizeStatus(value: unknown): KnowledgeDocumentStatus {
    if (
      value === 'processing' ||
      value === 'error' ||
      value === 'ready' ||
      value === 'reindex-required' ||
      value === 'reindex_required'
    ) {
      return value === 'reindex_required' ? 'reindex-required' : value
    }

    if (typeof value === 'string' && value.toLowerCase() === 'reindex-required') {
      return 'reindex-required'
    }

    return 'ready'
  }

  private findRecord(filePath: string): KnowledgeDocumentRecord | undefined {
    const resolvedPath = path.resolve(filePath)

    return this.processedFiles.find(
      (record) => record.path && path.resolve(record.path) === resolvedPath
    )
  }

  private findRecordById(documentId: string): KnowledgeDocumentRecord | undefined {
    return this.processedFiles.find((record) => record.id === String(documentId))
  }

  private upsertRecord(record: KnowledgeDocumentRecord) {
    const index = this.processedFiles.findIndex((item) => item.id === record.id)

    if (index >= 0) {
      this.processedFiles[index] = record
      return
    }

    this.processedFiles.push(record)
  }

  private removeVectorsForDocument(documentId: string) {
    if (!this.vectorStore) return

    const currentVectors = this.vectorStore.memoryVectors
    if (!Array.isArray(currentVectors) || currentVectors.length === 0) {
      return
    }

    const keptVectors = currentVectors.filter((vector) => {
      const metadata = (vector.metadata ?? {}) as Record<string, unknown>
      return String(metadata.documentId ?? '') !== String(documentId)
    })

    currentVectors.splice(0, currentVectors.length, ...keptVectors)
  }

  private resolvePreparedPath(filePath: string): string {
    return this.getFormatter().buildPreparedOutputPath(filePath)
  }

  private deletePreparedArtifact(filePath: string) {
    const preparedPath = this.resolvePreparedPath(filePath)
    if (!preparedPath || !fs.existsSync(preparedPath)) {
      return
    }

    try {
      fs.unlinkSync(preparedPath)
    } catch (error) {
      console.warn(
        buildDiagnosticError(
          'KnowledgeBase.deletePreparedArtifact',
          { preparedPath, filePath },
          error
        )
      )
    }
  }

  private clearPreparedArtifacts() {
    if (!this.preparedDocumentsDir || !fs.existsSync(this.preparedDocumentsDir)) {
      return
    }

    try {
      for (const entry of fs.readdirSync(this.preparedDocumentsDir)) {
        const absolutePath = path.join(this.preparedDocumentsDir, entry)
        const stat = fs.statSync(absolutePath)

        if (stat.isFile()) {
          fs.unlinkSync(absolutePath)
        }
      }
    } catch (error) {
      console.warn(
        buildDiagnosticError(
          'KnowledgeBase.clearPreparedArtifacts',
          { preparedDocumentsDir: this.preparedDocumentsDir },
          error
        )
      )
    }
  }

  private async extractContent(filePath: string, extension: string): Promise<string> {
    if (extension === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath)
      const data = await pdf(dataBuffer)
      return typeof data?.text === 'string' ? data.text : ''
    }

    return String(fs.readFileSync(filePath, 'utf-8') ?? '')
  }

  private async createChunkDocuments(
    preparedContent: string,
    record: KnowledgeDocumentRecord,
    preparedPath: string
  ): Promise<Document[]> {
    const sourceDocument = new Document({
      pageContent: String(preparedContent ?? ''),
      metadata: {
        source: record.name,
        documentId: record.id,
        filePath: record.path,
        preparedPath,
        type: record.type
      }
    })

    const splitter =
      record.type === 'md'
        ? new MarkdownTextSplitter({
            chunkSize: EMBEDDING_CHUNK_SIZE,
            chunkOverlap: EMBEDDING_CHUNK_OVERLAP
          })
        : new RecursiveCharacterTextSplitter({
            chunkSize: EMBEDDING_CHUNK_SIZE,
            chunkOverlap: EMBEDDING_CHUNK_OVERLAP,
            separators: ['\n## ', '\n### ', '\n\n', '\n', '. ', ' ', '']
          })

    const splitDocuments = await splitter.splitDocuments([sourceDocument])

    return splitDocuments
      .flatMap((document, index) =>
        this.ensureChunkBudget(document.pageContent).map(
          (pageContent, childIndex) =>
            new Document({
              pageContent,
              metadata: {
                ...document.metadata,
                chunkIndex: index,
                childChunkIndex: childIndex
              }
            })
        )
      )
      .filter((document) => document.pageContent.length >= EMBEDDING_MIN_CHARS)
  }

  private async saveToDisk() {
    if (!this.vectorStore) return

    try {
      const records: PersistedVectorRecord[] = this.vectorStore.memoryVectors.map((vector, index) => ({
        id: vector.id ? String(vector.id) : `vec-${index}`,
        pageContent: String(vector.content ?? ''),
        metadata: vector.metadata ?? {},
        embedding: Array.isArray(vector.embedding) ? vector.embedding : []
      }))

      const db = this.getDatabase()
      const insert = db.prepare(
        `INSERT INTO vectors (id, page_content, metadata_json, embedding_json)
         VALUES (@id, @pageContent, @metadataJson, @embeddingJson)`
      )
      const persist = db.transaction((items: PersistedVectorRecord[]) => {
        db.prepare('DELETE FROM vectors').run()

        for (const item of items) {
          insert.run({
            id: item.id,
            pageContent: item.pageContent,
            metadataJson: JSON.stringify(item.metadata ?? {}),
            embeddingJson: JSON.stringify(item.embedding ?? [])
          })
        }
      })

      persist(records)
      console.log(
        `[KnowledgeBase][SQLite] Saved ${records.length} vectors to local database.`
      )
    } catch (error) {
      throw buildDiagnosticError(
        'KnowledgeBase.saveToDisk',
        { databasePath: this.databasePath },
        error
      )
    }
  }

  private ensureChunkBudget(chunk: string): string[] {
    if (chunk.length <= EMBEDDING_MAX_CHARS) {
      return [chunk]
    }

    const segments = chunk
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)

    if (segments.length <= 1) {
      return this.splitChunkByLength(chunk, EMBEDDING_MAX_CHARS - 160)
    }

    const result: string[] = []
    let current = ''

    for (const segment of segments) {
      const candidate = current ? `${current}\n\n${segment}` : segment

      if (candidate.length > EMBEDDING_MAX_CHARS) {
        if (current) {
          result.push(current)
          current = ''
        }

        if (segment.length > EMBEDDING_MAX_CHARS) {
          result.push(...this.splitChunkByLength(segment, EMBEDDING_MAX_CHARS - 160))
          continue
        }
      }

      current = current ? `${current}\n\n${segment}` : segment
    }

    if (current) {
      result.push(current)
    }

    return result
  }

  private splitChunkByLength(text: string, maxLength: number): string[] {
    const safeMax = Math.max(320, maxLength)
    const parts: string[] = []
    let cursor = 0

    while (cursor < text.length) {
      let end = Math.min(text.length, cursor + safeMax)
      if (end < text.length) {
        const lastBoundary = text.lastIndexOf('\n', end)
        if (lastBoundary > cursor + 180) {
          end = lastBoundary
        }
      }

      const slice = text.slice(cursor, end).trim()
      if (slice) {
        parts.push(slice)
      }
      cursor = end
    }

    return parts
  }

  private trimToBudget(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text
    }

    const cutoff = text.lastIndexOf('\n', maxChars)
    const safeSlice =
      cutoff >= Math.floor(maxChars * 0.6) ? text.slice(0, cutoff) : text.slice(0, maxChars)

    return `${safeSlice.trim()}\n[...]`
  }

  private normalizeSearchText(text: string): string {
    return String(text ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  }

  private tokenizeSearchText(text: string): string[] {
    return this.normalizeSearchText(text)
      .match(/[a-z0-9]+/g)
      ?.filter(Boolean) ?? []
  }

  private escapeRegExp(value: string): string {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private textContainsTerm(normalizedHaystack: string, normalizedNeedle: string): boolean {
    const haystack = String(normalizedHaystack ?? '')
    const needle = String(normalizedNeedle ?? '').trim()
    if (!haystack || !needle) {
      return false
    }

    if (needle.includes(' ')) {
      return haystack.includes(needle)
    }

    return new RegExp(`\\b${this.escapeRegExp(needle)}\\b`, 'i').test(haystack)
  }

  private extractQueryKeywords(query: string): string[] {
    const stopwords = new Set([
      'a',
      'as',
      'ao',
      'aos',
      'com',
      'como',
      'da',
      'das',
      'de',
      'do',
      'dos',
      'e',
      'em',
      'eu',
      'me',
      'na',
      'nas',
      'no',
      'nos',
      'o',
      'os',
      'ou',
      'para',
      'por',
      'qual',
      'quais',
      'que',
      'sao',
      'ser',
      'tem',
      'the',
      'to',
      'um',
      'uma'
    ])

    const tokens = this.tokenizeSearchText(query)
    const baseKeywords = tokens.filter(
      (token) => (token.length >= 3 || /^\d+$/.test(token)) && !stopwords.has(token)
    )

    return Array.from(new Set([...baseKeywords, ...this.expandDomainKeywords(baseKeywords)]))
  }

  private expandDomainKeywords(keywords: string[]): string[] {
    const expanded = new Set<string>()
    const has = (value: string) => keywords.includes(value)

    if (has('success') || has('factors') || has('successfactors')) {
      expanded.add('successfactors')
      expanded.add('success')
      expanded.add('factors')
      expanded.add('sf')
      expanded.add('odata')
      expanded.add('metadata')
      expanded.add('admin')
      expanded.add('center')
      expanded.add('provisioning')
      expanded.add('mdf')
    }

    if (has('metadata') || has('refresh') || has('cenarios')) {
      expanded.add('refresh')
      expanded.add('refreshing')
      expanded.add('metadata')
      expanded.add('odata')
      expanded.add('mdf')
      expanded.add('admin')
      expanded.add('center')
      expanded.add('provisioning')
    }

    return Array.from(expanded)
  }

  private getDocumentAliases(record: KnowledgeDocumentRecord): string[] {
    const aliases = new Set<string>()
    const normalizedName = this.normalizeSearchText(String(record.name ?? '').trim())
    const normalizedBaseName = this.normalizeSearchText(
      path.basename(String(record.name ?? ''), path.extname(String(record.name ?? '')))
    )

    if (normalizedName.length >= 4) {
      aliases.add(normalizedName)
    }

    if (normalizedBaseName.length >= 4) {
      aliases.add(normalizedBaseName)
    }

    for (const token of this.tokenizeSearchText(normalizedBaseName)) {
      if (token.length >= 5) {
        aliases.add(token)
      }
    }

    return Array.from(aliases)
  }

  private getDocumentCollectionTags(record: KnowledgeDocumentRecord): string[] {
    const tags = new Set<string>()
    const normalizedType = this.normalizeSearchText(String(record.type ?? ''))
    const safePath = String(record.path ?? '')
    const parentPath = safePath ? path.dirname(safePath) : ''
    const parentSegments = parentPath
      .split(/[\\/]/)
      .map((segment) => this.normalizeSearchText(segment))
      .filter((segment) => segment.length >= 3)
      .slice(-2)

    if (normalizedType) {
      tags.add(normalizedType)
    }

    for (const segment of parentSegments) {
      tags.add(segment)
    }

    const typeAliases: Record<string, string[]> = {
      md: ['markdown', 'documentacao', 'texto'],
      pdf: ['pdf', 'documentacao', 'texto'],
      txt: ['txt', 'texto', 'documentacao'],
      csv: ['csv', 'dados'],
      json: ['json', 'dados'],
      xml: ['xml', 'dados'],
      js: ['codigo', 'javascript'],
      ts: ['codigo', 'typescript'],
      jsx: ['codigo', 'javascript'],
      tsx: ['codigo', 'typescript'],
      html: ['codigo', 'frontend'],
      css: ['codigo', 'frontend'],
      yml: ['dados', 'configuracao'],
      yaml: ['dados', 'configuracao']
    }

    for (const alias of typeAliases[normalizedType] ?? []) {
      tags.add(alias)
    }

    return Array.from(tags)
  }

  private matchesDocumentTypeInQuery(
    documentType: string,
    normalizedQuery: string,
    queryKeywordSet: Set<string>
  ): boolean {
    const type = this.normalizeSearchText(documentType)
    if (!type) {
      return false
    }

    const aliasesByType: Record<string, string[]> = {
      md: ['md', 'markdown'],
      pdf: ['pdf'],
      txt: ['txt', 'texto'],
      csv: ['csv'],
      json: ['json'],
      xml: ['xml'],
      js: ['js', 'javascript', 'codigo'],
      ts: ['ts', 'typescript', 'codigo'],
      jsx: ['jsx', 'javascript', 'codigo'],
      tsx: ['tsx', 'typescript', 'codigo'],
      html: ['html', 'frontend'],
      css: ['css', 'frontend'],
      yml: ['yml', 'yaml'],
      yaml: ['yaml', 'yml']
    }

    return (aliasesByType[type] ?? [type]).some(
      (alias) => queryKeywordSet.has(alias) || this.textContainsTerm(normalizedQuery, alias)
    )
  }

  private resolveRetrievalFilters(query: string, queryKeywords: string[]): RetrievalFilters {
    const normalizedQuery = this.normalizeSearchText(query)
    const queryTokens = new Set(this.tokenizeSearchText(query))
    const queryKeywordSet = new Set(queryKeywords)
    const readyDocuments = this.processedFiles.filter((record) => record.status === 'ready')
    const documentIds = new Set<string>()
    const collectionDocumentIds = new Set<string>()
    const hasDocumentCue = /\b(documento|arquivo|doc|manual|fonte)\b/i.test(normalizedQuery)
    const hasCollectionCue = /\b(colecao|categoria|pasta|diretorio|tipo)\b/i.test(normalizedQuery)

    for (const record of readyDocuments) {
      const aliases = this.getDocumentAliases(record)
      const aliasTokens = Array.from(
        new Set(
          aliases.flatMap((alias) => this.tokenizeSearchText(alias)).filter((token) => token.length >= 3)
        )
      )
      const exactAliasMatch = aliases.some((alias) => this.textContainsTerm(normalizedQuery, alias))
      const tokenOverlap = aliasTokens.filter((token) => queryTokens.has(token)).length
      const tokenThreshold = Math.min(2, Math.max(1, Math.ceil(aliasTokens.length * 0.5)))
      const tokenMatch = tokenOverlap > 0 && tokenOverlap >= tokenThreshold

      if (exactAliasMatch || (hasDocumentCue && tokenMatch)) {
        documentIds.add(record.id)
      }

      const collectionTags = this.getDocumentCollectionTags(record)
      const collectionHit = collectionTags.some(
        (tag) => queryKeywordSet.has(tag) || this.textContainsTerm(normalizedQuery, tag)
      )
      if (
        (hasCollectionCue && collectionHit) ||
        this.matchesDocumentTypeInQuery(record.type, normalizedQuery, queryKeywordSet)
      ) {
        collectionDocumentIds.add(record.id)
      }
    }

    return {
      documentIds,
      collectionDocumentIds,
      hasDocumentConstraint: hasDocumentCue || documentIds.size > 0,
      hasCollectionConstraint: hasCollectionCue || collectionDocumentIds.size > 0
    }
  }

  private buildCandidateKey(
    documentId: string,
    metadata: Record<string, unknown>,
    source: string,
    content: string
  ): string {
    const chunkIndex = Number(metadata.chunkIndex ?? -1)
    const childChunkIndex = Number(metadata.childChunkIndex ?? -1)

    if (documentId && chunkIndex >= 0) {
      return `${documentId}::${chunkIndex}::${Math.max(0, childChunkIndex)}`
    }

    const normalizedSource = this.normalizeSearchText(source)
    const normalizedSnippet = this.normalizeSearchText(content.slice(0, 96))
    return `${documentId || normalizedSource}::${normalizedSnippet}`
  }

  private computeFilterBoost(documentId: string, filters: RetrievalFilters): number {
    let boost = 0
    if (filters.documentIds.size > 0 && filters.documentIds.has(documentId)) {
      boost += 28
    }
    if (filters.collectionDocumentIds.size > 0 && filters.collectionDocumentIds.has(documentId)) {
      boost += 16
    }
    return boost
  }

  private computeChunkBoost(metadata: Record<string, unknown>): number {
    const chunkIndex = Number(metadata.chunkIndex ?? 0)
    const childChunkIndex = Number(metadata.childChunkIndex ?? 0)
    const chunkBoost = Number.isFinite(chunkIndex) ? Math.max(0, 5 - Math.min(5, chunkIndex)) : 0
    const childBoost = Number.isFinite(childChunkIndex)
      ? Math.max(0, 2 - Math.min(2, childChunkIndex))
      : 0

    return chunkBoost + childBoost
  }

  private reciprocalRankFusion(semanticRank: number | null, keywordRank: number | null): number {
    const k = 10
    let score = 0

    if (semanticRank && semanticRank > 0) {
      score += 1 / (k + semanticRank)
    }

    if (keywordRank && keywordRank > 0) {
      score += 1 / (k + keywordRank)
    }

    return score * 140
  }

  private keywordSearchCandidates(
    queryKeywords: string[],
    retrievalFilters: RetrievalFilters,
    limit: number
  ): RetrievalCandidate[] {
    if (!this.vectorStore || queryKeywords.length === 0) {
      return []
    }

    const vectors = this.vectorStore.memoryVectors ?? []
    const candidates: RetrievalCandidate[] = []

    for (const vector of vectors) {
      const metadata =
        vector?.metadata && typeof vector.metadata === 'object'
          ? (vector.metadata as Record<string, unknown>)
          : {}
      const source = typeof metadata.source === 'string' ? metadata.source : 'Fonte desconhecida'
      const content = typeof vector?.content === 'string' ? vector.content : ''

      if (content.length < MIN_CONTENT_LENGTH_FOR_RETRIEVAL) {
        continue
      }

      const documentId = String(metadata.documentId ?? '')
      const keywordScore = this.scoreHitAgainstQuery(queryKeywords, source, content)
      if (keywordScore.overlapCount === 0 && keywordScore.score < 8) {
        continue
      }

      const lexicalScore = keywordScore.score + keywordScore.overlapCount * 4
      const filterBoost = this.computeFilterBoost(documentId, retrievalFilters)
      const chunkBoost = this.computeChunkBoost(metadata)

      candidates.push({
        key: this.buildCandidateKey(documentId, metadata, source, content),
        documentId,
        source,
        content,
        metadata,
        similarity: null,
        semanticRank: null,
        keywordRank: null,
        keywordScore,
        lexicalScore,
        matchedKeywords: keywordScore.matchedKeywords,
        filterBoost,
        chunkBoost,
        baseScore: lexicalScore + filterBoost + chunkBoost
      })
    }

    return candidates
      .sort((left, right) => {
        if (right.baseScore !== left.baseScore) {
          return right.baseScore - left.baseScore
        }

        if (right.keywordScore.overlapCount !== left.keywordScore.overlapCount) {
          return right.keywordScore.overlapCount - left.keywordScore.overlapCount
        }

        return right.content.length - left.content.length
      })
      .slice(0, Math.max(1, limit))
      .map((candidate, index) => ({
        ...candidate,
        keywordRank: index + 1
      }))
  }

  private mergeHybridCandidates(
    semanticResult: Array<[Document, number]>,
    keywordCandidates: RetrievalCandidate[],
    queryKeywords: string[],
    retrievalFilters: RetrievalFilters
  ): RetrievalCandidate[] {
    const byKey = new Map<string, RetrievalCandidate>()

    for (const [index, [document, similarityRaw]] of semanticResult.entries()) {
      const metadata =
        document?.metadata && typeof document.metadata === 'object'
          ? (document.metadata as Record<string, unknown>)
          : {}
      const source = typeof metadata.source === 'string' ? metadata.source : 'Fonte desconhecida'
      const content = typeof document.pageContent === 'string' ? document.pageContent : ''

      if (content.length < MIN_CONTENT_LENGTH_FOR_RETRIEVAL) {
        continue
      }

      const documentId = String(metadata.documentId ?? '')
      const keywordScore = this.scoreHitAgainstQuery(queryKeywords, source, content)
      const lexicalScore = keywordScore.score + keywordScore.overlapCount * 3
      const similarity = Math.max(0, Number(similarityRaw ?? 0))
      const filterBoost = this.computeFilterBoost(documentId, retrievalFilters)
      const chunkBoost = this.computeChunkBoost(metadata)
      const key = this.buildCandidateKey(documentId, metadata, source, content)

      byKey.set(key, {
        key,
        documentId,
        source,
        content,
        metadata,
        similarity,
        semanticRank: index + 1,
        keywordRank: null,
        keywordScore,
        lexicalScore,
        matchedKeywords: keywordScore.matchedKeywords,
        filterBoost,
        chunkBoost,
        baseScore: similarity * 18 + lexicalScore + filterBoost + chunkBoost
      })
    }

    for (const [index, candidate] of keywordCandidates.entries()) {
      const keywordRank = index + 1
      const existing = byKey.get(candidate.key)

      if (!existing) {
        byKey.set(candidate.key, {
          ...candidate,
          keywordRank
        })
        continue
      }

      const mergedKeywords = Array.from(
        new Set([...existing.matchedKeywords, ...candidate.matchedKeywords])
      )
      existing.keywordRank = keywordRank
      existing.lexicalScore = Math.max(existing.lexicalScore, candidate.lexicalScore)
      existing.keywordScore = {
        overlapCount: Math.max(existing.keywordScore.overlapCount, candidate.keywordScore.overlapCount),
        score: Math.max(existing.keywordScore.score, candidate.keywordScore.score),
        matchedKeywords: mergedKeywords
      }
      existing.matchedKeywords = mergedKeywords
      existing.filterBoost = Math.max(existing.filterBoost, candidate.filterBoost)
      existing.chunkBoost = Math.max(existing.chunkBoost, candidate.chunkBoost)
    }

    return Array.from(byKey.values())
      .map((candidate) => {
        const semanticScore = (candidate.similarity ?? 0) * 18
        const rrfScore = this.reciprocalRankFusion(candidate.semanticRank, candidate.keywordRank)

        return {
          ...candidate,
          baseScore:
            semanticScore +
            candidate.lexicalScore +
            candidate.filterBoost +
            candidate.chunkBoost +
            rrfScore
        }
      })
      .sort((left, right) => {
        if (right.baseScore !== left.baseScore) {
          return right.baseScore - left.baseScore
        }

        return right.keywordScore.overlapCount - left.keywordScore.overlapCount
      })
  }

  private applyRetrievalFilters(
    candidates: RetrievalCandidate[],
    retrievalFilters: RetrievalFilters
  ): RetrievalCandidate[] {
    if (candidates.length === 0) {
      return []
    }

    const hasDocumentFilters =
      retrievalFilters.hasDocumentConstraint && retrievalFilters.documentIds.size > 0
    const hasCollectionFilters =
      retrievalFilters.hasCollectionConstraint && retrievalFilters.collectionDocumentIds.size > 0

    if (!hasDocumentFilters && !hasCollectionFilters) {
      return candidates
    }

    if (hasDocumentFilters && hasCollectionFilters) {
      const intersection = candidates.filter(
        (candidate) =>
          retrievalFilters.documentIds.has(candidate.documentId) &&
          retrievalFilters.collectionDocumentIds.has(candidate.documentId)
      )
      if (intersection.length > 0) {
        return intersection
      }

      const union = candidates.filter(
        (candidate) =>
          retrievalFilters.documentIds.has(candidate.documentId) ||
          retrievalFilters.collectionDocumentIds.has(candidate.documentId)
      )
      return union.length > 0 ? union : candidates
    }

    if (hasDocumentFilters) {
      const documentMatches = candidates.filter((candidate) =>
        retrievalFilters.documentIds.has(candidate.documentId)
      )
      return documentMatches.length > 0 ? documentMatches : candidates
    }

    const collectionMatches = candidates.filter((candidate) =>
      retrievalFilters.collectionDocumentIds.has(candidate.documentId)
    )
    return collectionMatches.length > 0 ? collectionMatches : candidates
  }

  private rerankCandidates(
    candidates: RetrievalCandidate[],
    queryKeywords: string[],
    retrievalMode: 'fact' | 'exploratory',
    retrievalFilters: RetrievalFilters
  ): RetrievalCandidate[] {
    const selectionLimit =
      retrievalMode === 'fact' ? FACT_SEARCH_RESULT_LIMIT + 4 : SEARCH_RESULT_LIMIT + 6
    const remaining = [...candidates].sort((left, right) => right.baseScore - left.baseScore)
    const selected: RetrievalCandidate[] = []
    const coveredKeywords = new Set<string>()
    const selectedByDocument = new Map<string, number>()

    while (selected.length < selectionLimit && remaining.length > 0) {
      let bestIndex = 0
      let bestScore = Number.NEGATIVE_INFINITY

      for (const [index, candidate] of remaining.entries()) {
        const newCoverage = candidate.matchedKeywords.filter((kw) => !coveredKeywords.has(kw)).length
        const coverageBoost = newCoverage * (retrievalMode === 'fact' ? 4.8 : 3.1)
        const documentCount = candidate.documentId
          ? Number(selectedByDocument.get(candidate.documentId) ?? 0)
          : 0
        const diversityPenalty =
          documentCount > 0 ? documentCount * (retrievalMode === 'fact' ? 7 : 11) : 0
        const weakSignalPenalty =
          retrievalMode === 'fact' &&
          candidate.keywordScore.overlapCount === 0 &&
          (candidate.similarity ?? 0) < 0.16
            ? 10
            : 0
        const documentFilterBoost =
          retrievalFilters.documentIds.size > 0 &&
          retrievalFilters.documentIds.has(candidate.documentId)
            ? 8
            : 0
        const score =
          candidate.baseScore +
          coverageBoost +
          documentFilterBoost -
          diversityPenalty -
          weakSignalPenalty

        if (score > bestScore) {
          bestScore = score
          bestIndex = index
        }
      }

      const [chosen] = remaining.splice(bestIndex, 1)
      if (!chosen) {
        break
      }

      selected.push({
        ...chosen,
        baseScore: bestScore
      })

      for (const keyword of chosen.matchedKeywords) {
        coveredKeywords.add(keyword)
      }

      if (chosen.documentId) {
        selectedByDocument.set(
          chosen.documentId,
          Number(selectedByDocument.get(chosen.documentId) ?? 0) + 1
        )
      }

      if (
        retrievalMode === 'fact' &&
        coveredKeywords.size >= queryKeywords.length &&
        selected.length >= FACT_SEARCH_RESULT_LIMIT
      ) {
        break
      }
    }

    return selected
  }

  private selectFactCandidates(candidates: RetrievalCandidate[]): RetrievalCandidate[] {
    if (candidates.length === 0) {
      return []
    }

    const strict = candidates
      .filter(
        (candidate) =>
          candidate.keywordScore.overlapCount >= 2 ||
          candidate.lexicalScore >= 20 ||
          (candidate.similarity ?? 0) >= 0.2
      )
      .slice(0, FACT_SEARCH_RESULT_LIMIT)
    if (strict.length > 0) {
      return strict
    }

    const broader = candidates
      .filter(
        (candidate) =>
          candidate.keywordScore.overlapCount >= 1 ||
          candidate.lexicalScore >= 10 ||
          (candidate.similarity ?? 0) >= 0.13
      )
      .slice(0, FACT_SEARCH_RESULT_LIMIT)

    return broader.length > 0 ? broader : candidates.slice(0, FACT_SEARCH_RESULT_LIMIT)
  }

  private scoreHitAgainstQuery(queryKeywords: string[], source: string, content: string): QueryKeywordScore {
    const normalizedSource = this.normalizeSearchText(source)
    const normalizedContent = this.normalizeSearchText(content.slice(0, 1600))
    let overlapCount = 0
    let score = 0
    const matchedKeywords: string[] = []

    for (const keyword of queryKeywords) {
      const inSource = normalizedSource.includes(keyword)
      const inContent = normalizedContent.includes(keyword)

      if (inSource || inContent) {
        overlapCount += 1
        score += inSource ? 12 : 0
        score += inContent ? 5 : 0
        matchedKeywords.push(keyword)
      }
    }

    return {
      overlapCount,
      score,
      matchedKeywords: Array.from(new Set(matchedKeywords))
    }
  }

  private isFactSeekingQuery(query: string): boolean {
    const normalized = String(query ?? '').toLowerCase().trim()

    if (!normalized) {
      return false
    }

    return [
      /^quais\s+s[ãa]o\b/,
      /^qual\b/,
      /^quando\b/,
      /^liste\b/,
      /^me\s+liste\b/,
      /^cite\b/,
      /^diga\b/,
      /^quantos?\b/,
      /\b3 cen[aá]rios\b/,
      /\bsegundo o documento\b/,
      /\bno documento\b/,
      /\bquais os\b/,
      /\bquais as\b/
    ].some((pattern) => pattern.test(normalized))
  }

  private createEmbeddings() {
    return new OllamaEmbeddings({
      model: ollamaService.getEmbeddingModel(),
      baseUrl: ollamaService.getStatus().host,
      keepAlive: '20m',
      truncate: true
    })
  }

  private getEmbeddings() {
    if (!this.embeddings) {
      this.embeddings = this.createEmbeddings()
    }

    return this.embeddings
  }

  private getFormatter(): DocumentFormatter {
    if (!this.formatter) {
      this.formatter = new DocumentFormatter(this.preparedDocumentsDir)
    }

    return this.formatter
  }
}

export const knowledgeBase = new KnowledgeBase()
