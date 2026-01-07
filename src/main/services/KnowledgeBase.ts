import { create, insert, search, count, type Orama } from '@orama/orama'
import { persist, restore } from '@orama/plugin-data-persistence'
import { Ollama } from 'ollama'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdf = require('pdf-parse-new')

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' })

export class KnowledgeBase {
  private db: Orama<any> | null = null
  private dbPath: string = ''
  private manifestPath: string = ''
  private processedFiles: string[] = [] // Lista em memória dos arquivos lidos

  async initialize() {
    // Define caminhos na RAIZ do projeto (onde está o package.json)
    const rootDir = process.cwd()
    this.dbPath = path.join(rootDir, 'jarvis-memory.json')
    this.manifestPath = path.join(rootDir, 'docs.json')

    console.log(`[KnowledgeBase] DB: ${this.dbPath}`)
    console.log(`[KnowledgeBase] Manifest: ${this.manifestPath}`)

    // 1. Carrega o Manifesto (docs.json)
    this.loadManifest()

    // 2. Carrega o Banco Vetorial
    try {
      if (fs.existsSync(this.dbPath)) {
        const dbData = fs.readFileSync(this.dbPath, 'utf-8')
        this.db = (await restore('json', dbData)) as Orama<any>
        const totalDocs = await count(this.db)
        console.log(`[KnowledgeBase] DB carregado. Itens: ${totalDocs}`)
        return
      }
    } catch (e) {
      console.error('[KnowledgeBase] Erro ao carregar DB.', e)
    }

    console.log('[KnowledgeBase] Criando nova base...')
    this.db = await create({
      schema: {
        content: 'string',
        source: 'string', // Nome do arquivo
        embedding: 'vector[768]'
      }
    })
  }

  // --- MANIFESTO (docs.json) ---
  private loadManifest() {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const data = fs.readFileSync(this.manifestPath, 'utf-8')
        this.processedFiles = JSON.parse(data)
        console.log(`[Manifest] Arquivos já processados: ${this.processedFiles.length}`)
      } else {
        this.processedFiles = []
      }
    } catch (e) {
      console.error('[Manifest] Erro ao ler docs.json', e)
      this.processedFiles = []
    }
  }

  private saveManifest() {
    try {
      fs.writeFileSync(this.manifestPath, JSON.stringify(this.processedFiles, null, 2))
    } catch (e) {
      console.error('[Manifest] Erro ao salvar docs.json', e)
    }
  }

  // Verifica se está na lista (Instantâneo)
  isDocumentIndexed(fileName: string): boolean {
    return this.processedFiles.includes(fileName)
  }
  // -----------------------------

  async ingestPDF(filePath: string) {
    if (!this.db) return
    const fileName = path.basename(filePath)

    // Dupla checagem
    if (this.isDocumentIndexed(fileName)) {
      console.log(`[Skip] ${fileName} já está no docs.json.`)
      return
    }

    console.log(`[KnowledgeBase] Processando PDF: ${fileName}`)

    const dataBuffer = fs.readFileSync(filePath)
    const data = await pdf(dataBuffer)

    const cleanContent = this.sanitizeContent(data.text)
    const chunks = this.splitText(cleanContent, 1200, 400)

    console.log(`[KnowledgeBase] Indexando ${chunks.length} fragmentos...`)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const response = await ollama.embeddings({
        model: 'nomic-embed-text',
        prompt: chunk
      })

      await insert(this.db, {
        content: chunk,
        source: fileName,
        embedding: response.embedding
      })
      this.updateProgressBar(i + 1, chunks.length)
    }

    console.log('\n[KnowledgeBase] Vetorização concluída.')

    // Salva DB e atualiza Manifesto
    await this.saveToDisk()

    this.processedFiles.push(fileName)
    this.saveManifest()

    console.log(`[KnowledgeBase] Manifesto atualizado: ${fileName}`)
  }

  private sanitizeContent(text: string): string {
    return text
      .replace(/PUBLIC SAPUI5: UI Development Toolkit for HTML5/g, '')
      .replace(/SAPUI5: UI Development Toolkit for HTML5/g, '')
      .replace(/\[page \d+\]/g, '')
      .replace(/<PropertyValue[^>]*>/g, '')
      .replace(/<Record[^>]*>/g, '')
      .replace(/<\/Record>/g, '')
      .replace(/\n+/g, '\n')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private updateProgressBar(current: number, total: number) {
    const width = 30
    const percentage = Math.round((current / total) * 100)
    const filled = Math.round((width * percentage) / 100)
    const empty = width - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    process.stdout.write(`\r[Indexando] ${bar} ${percentage}% | ${current}/${total}`)
  }

  private async saveToDisk() {
    if (!this.db) return
    console.log('[KnowledgeBase] Salvando DB...')
    const dbData = (await persist(this.db as any, 'json')) as string
    fs.writeFileSync(this.dbPath, dbData)
  }

  private splitText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = []
    let start = 0
    while (start < text.length) {
      const end = start + chunkSize
      chunks.push(text.slice(start, end))
      start += chunkSize - overlap
    }
    return chunks
  }

  async searchRelevantContext(query: string): Promise<string> {
    if (!this.db) return ''
    const queryEmbedding = await ollama.embeddings({ model: 'nomic-embed-text', prompt: query })

    const searchResult = await search(this.db, {
      mode: 'hybrid',
      term: query,
      vector: { value: queryEmbedding.embedding, property: 'embedding' },
      similarity: 0.4,
      limit: 5
    })

    if (searchResult.count === 0) return ''
    const validHits = searchResult.hits.filter((h) => h.document.content.length > 50)
    return validHits
      .map((hit) => `[Fonte: ${hit.document.source}]\n${hit.document.content}`)
      .join('\n\n')
  }
}

export const knowledgeBase = new KnowledgeBase()
