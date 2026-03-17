import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
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
const MAX_CONTEXT_CHARS = 5200
const MAX_CONTEXT_HIT_CHARS = 1200
const VECTOR_STORE_FILENAME = 'jarvis-memory-langchain.json'

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

export type KnowledgeDocumentStatus = 'ready' | 'processing' | 'error'

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
    totalChunks: number
    isReady: boolean
  }
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
    | 'document-formatting'
    | 'chunk-progress'
    | 'document-complete'
    | 'document-error'
    | 'document-skipped'
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
  private memoryPath = ''
  private manifestPath = ''
  private preparedDocumentsDir = ''
  private processedFiles: KnowledgeDocumentRecord[] = []
  private activeDocuments = new Set<string>()
  private formatter: DocumentFormatter | null = null

  async initialize() {
    const rootDir = path.join(app.getPath('userData'), 'knowledge')
    fs.mkdirSync(rootDir, { recursive: true })

    this.memoryPath = path.join(rootDir, VECTOR_STORE_FILENAME)
    this.manifestPath = path.join(rootDir, 'docs.json')
    this.preparedDocumentsDir = path.join(rootDir, 'prepared')
    this.formatter = new DocumentFormatter(this.preparedDocumentsDir)
    this.embeddings = this.createEmbeddings()
    this.vectorStore = await MemoryVectorStore.fromExistingIndex(this.embeddings)

    console.log(`[KnowledgeBase][LangChain] Memory store: ${this.memoryPath}`)
    console.log(`[KnowledgeBase][LangChain] Manifest: ${this.manifestPath}`)

    this.loadManifest()
    await this.restoreVectorStore()

    if (!fs.existsSync(this.memoryPath) && this.processedFiles.length > 0) {
      this.processedFiles = this.processedFiles.map((record) => ({
        ...record,
        status: 'error',
        lastError: 'Reindexação necessária após migração do RAG para LangChain.'
      }))
      this.saveManifest()
      console.warn(
        '[KnowledgeBase][LangChain] Manifest antigo detectado sem índice vetorial LangChain. Reindexação necessária.'
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

  async ingestDocument(
    filePath: string,
    onProgress?: (event: KnowledgeProgressEvent) => void
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
    if (existingRecord?.status === 'ready') {
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
      const searchLimit = retrievalMode === 'fact' ? 20 : SEARCH_RESULT_LIMIT
      const maxContextChars = retrievalMode === 'fact' ? 2600 : MAX_CONTEXT_CHARS
      const maxContextHitChars = retrievalMode === 'fact' ? 820 : MAX_CONTEXT_HIT_CHARS
      const queryKeywords = this.extractQueryKeywords(query)

      stage = 'embed-query'
      await ollamaService.ensureEmbeddingReady()
      const queryEmbedding = await this.getEmbeddings().embedQuery(String(query ?? ''))

      stage = 'vector-search'
      const searchResult = await this.vectorStore.similaritySearchVectorWithScore(
        queryEmbedding,
        searchLimit
      )

      if (!Array.isArray(searchResult) || searchResult.length === 0) {
        return {
          contextText: '',
          sources: [],
          retrievalMode
        }
      }

      hitCount = searchResult.length
      stage = 'build-context'

      const rankedHits = searchResult
        .map(([document, similarity]) => {
          const source =
            typeof document.metadata?.source === 'string'
              ? document.metadata.source
              : 'Fonte desconhecida'
          const content = typeof document.pageContent === 'string' ? document.pageContent : ''
          const keywordScore = this.scoreHitAgainstQuery(queryKeywords, source, content)

          return {
            document,
            source,
            content,
            similarity,
            keywordScore
          }
        })
        .filter((entry) => entry.content.length > 50)
        .sort((left, right) => {
          const leftComposite = left.keywordScore.score + left.similarity * 10
          const rightComposite = right.keywordScore.score + right.similarity * 10
          return rightComposite - leftComposite
        })

      const filteredHits =
        retrievalMode === 'fact'
          ? (() => {
              const strictHits = rankedHits
                .filter(
                  (entry) =>
                    entry.keywordScore.overlapCount >= 3 || entry.keywordScore.score >= 24
                )
                .slice(0, 3)

              if (strictHits.length > 0) {
                return strictHits
              }

              const broaderHits = rankedHits
                .filter(
                  (entry) =>
                    entry.keywordScore.overlapCount >= 1 ||
                    entry.keywordScore.score >= 8 ||
                    entry.similarity >= 0.18
                )
                .slice(0, 4)

              return broaderHits.length > 0 ? broaderHits : rankedHits.slice(0, 3)
            })()
          : rankedHits.slice(0, SEARCH_RESULT_LIMIT)

      const contextBlocks: string[] = []
      const sources: RetrievedContextSource[] = []
      let usedChars = 0

      for (const [index, entry] of filteredHits.entries()) {
        const trimmedContent = this.trimToBudget(entry.content, maxContextHitChars)
        const contextId = `CTX-${index + 1}`
        const block = [
          `[${contextId} | Fonte: ${entry.source} | similarity=${entry.similarity.toFixed(4)} | keywordScore=${entry.keywordScore.score} | overlap=${entry.keywordScore.overlapCount}]`,
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

  private async restoreVectorStore() {
    if (!this.vectorStore || !fs.existsSync(this.memoryPath)) {
      return
    }

    try {
      const raw = fs.readFileSync(this.memoryPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const records = Array.isArray(parsed) ? parsed : []

      if (records.length === 0) {
        return
      }

      const documents = records.map(
        (record) =>
          new Document({
            pageContent: String(record.pageContent ?? ''),
            metadata:
              record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
            id: record.id ? String(record.id) : undefined
          })
      )
      const vectors = records.map((record) =>
        Array.isArray(record.embedding) ? record.embedding.map((value) => Number(value)) : []
      )

      await this.vectorStore.addVectors(vectors, documents)
      console.log(`[KnowledgeBase][LangChain] Restored ${records.length} vectors from disk.`)
    } catch (error) {
      console.error(
        buildDiagnosticError(
          'KnowledgeBase.restoreVectorStore',
          { memoryPath: this.memoryPath },
          error
        )
      )
    }
  }

  private loadManifest() {
    try {
      if (!fs.existsSync(this.manifestPath)) {
        this.processedFiles = []
        return
      }

      const data = fs.readFileSync(this.manifestPath, 'utf-8')
      const parsed = JSON.parse(data)

      this.processedFiles = Array.isArray(parsed)
        ? parsed.map((item) => ({
            id: String(item.id ?? item.path ?? item.name),
            name: String(item.name ?? 'Documento'),
            path: String(item.path ?? ''),
            type: String(item.type ?? 'file'),
            status: this.normalizeStatus(item.status),
            indexedAt: item.indexedAt ? String(item.indexedAt) : null,
            size: Number(item.size ?? 0),
            chunks: Number(item.chunks ?? 0),
            lastError: item.lastError ? String(item.lastError) : ''
          }))
        : []
    } catch (error) {
      console.error('[Manifest] Failed to read docs.json', error)
      this.processedFiles = []
    }
  }

  private saveManifest() {
    try {
      fs.writeFileSync(this.manifestPath, JSON.stringify(this.processedFiles, null, 2))
    } catch (error) {
      console.error('[Manifest] Failed to save docs.json', error)
    }
  }

  private normalizeStatus(value: unknown): KnowledgeDocumentStatus {
    if (value === 'processing' || value === 'error' || value === 'ready') {
      return value
    }
    return 'ready'
  }

  private findRecord(filePath: string): KnowledgeDocumentRecord | undefined {
    const resolvedPath = path.resolve(filePath)

    return this.processedFiles.find(
      (record) => record.path && path.resolve(record.path) === resolvedPath
    )
  }

  private upsertRecord(record: KnowledgeDocumentRecord) {
    const index = this.processedFiles.findIndex((item) => item.id === record.id)

    if (index >= 0) {
      this.processedFiles[index] = record
      return
    }

    this.processedFiles.push(record)
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
      const records: PersistedVectorRecord[] = this.vectorStore.memoryVectors.map((vector) => ({
        id: vector.id,
        pageContent: String(vector.content ?? ''),
        metadata: vector.metadata ?? {},
        embedding: Array.isArray(vector.embedding) ? vector.embedding : []
      }))

      fs.writeFileSync(this.memoryPath, JSON.stringify(records, null, 2), 'utf-8')
      console.log(
        `[KnowledgeBase][LangChain] Saved ${records.length} vectors to ${this.memoryPath}.`
      )
    } catch (error) {
      throw buildDiagnosticError(
        'KnowledgeBase.saveToDisk',
        { memoryPath: this.memoryPath },
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

    const normalized = this.normalizeSearchText(query)
    const tokens = normalized.match(/[a-z0-9]+/g) ?? []
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

  private scoreHitAgainstQuery(queryKeywords: string[], source: string, content: string) {
    const normalizedSource = this.normalizeSearchText(source)
    const normalizedContent = this.normalizeSearchText(content.slice(0, 1600))
    let overlapCount = 0
    let score = 0

    for (const keyword of queryKeywords) {
      const inSource = normalizedSource.includes(keyword)
      const inContent = normalizedContent.includes(keyword)

      if (inSource || inContent) {
        overlapCount += 1
        score += inSource ? 12 : 0
        score += inContent ? 5 : 0
      }
    }

    return {
      overlapCount,
      score
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
