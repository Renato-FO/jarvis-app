import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

interface PrepareDocumentInput {
  filePath: string
  extension: string
  rawContent: string
}

interface PrepareDocumentOutput {
  content: string
  outputPath: string
}

export class DocumentFormatter {
  constructor(private readonly outputDir: string) {
    fs.mkdirSync(this.outputDir, { recursive: true })
  }

  buildPreparedOutputPath(filePath: string): string {
    const hash = crypto.createHash('sha1').update(path.resolve(filePath)).digest('hex').slice(0, 12)
    const baseName = path.basename(filePath, path.extname(filePath)).replace(/[^\w\-]+/g, '-')
    return path.join(this.outputDir, `${baseName}-${hash}.md`)
  }

  prepareForAI({ filePath, extension, rawContent }: PrepareDocumentInput): PrepareDocumentOutput {
    const normalizedText = this.normalizeRawText(String(rawContent ?? ''))
    const structuredBody = this.formatByExtension(normalizedText, extension)
    const cleanedBody = this.cleanupStructuredText(structuredBody)
    const finalContent = this.buildPreparedDocument(filePath, extension, cleanedBody)
    const outputPath = this.writePreparedVersion(filePath, finalContent)

    return {
      content: finalContent,
      outputPath
    }
  }

  createChunks(text: string, chunkSize: number, overlap: number): string[] {
    const safeText = String(text ?? '')
    const sections = safeText
      .split(/\n{2,}/)
      .map((section) => section.trim())
      .filter(Boolean)

    const chunks: string[] = []
    let currentChunk = ''

    const pushChunk = () => {
      const chunk = currentChunk.trim()
      if (chunk) {
        chunks.push(chunk)
      }
      currentChunk = ''
    }

    for (const section of sections) {
      if (section.length > chunkSize) {
        pushChunk()
        this.splitLargeSection(section, chunkSize).forEach((part) => {
          if (part.trim()) {
            chunks.push(part.trim())
          }
        })
        continue
      }

      const candidate = currentChunk ? `${currentChunk}\n\n${section}` : section

      if (candidate.length > chunkSize) {
        pushChunk()
        currentChunk = section
        continue
      }

      currentChunk = candidate
    }

    pushChunk()

    if (chunks.length <= 1 || overlap <= 0) {
      return chunks
    }

    return chunks.map((chunk, index) => {
      if (index === 0) {
        return chunk
      }

      const tail = this.extractOverlap(chunks[index - 1], overlap)
      return `${tail}\n\n${chunk}`.trim()
    })
  }

  private normalizeRawText(text: string): string {
    return String(text ?? '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/(\w)-\n(\w)/g, '$1$2')
      .replace(/\t/g, '  ')
      .replace(/[ \u00A0]+$/gm, '')
      .trim()
  }

  private formatByExtension(text: string, extension: string): string {
    if (extension === '.json') {
      return this.formatJsonDocument(text)
    }

    if (extension === '.csv') {
      return this.formatCsvDocument(text)
    }

    if (this.isCodeExtension(extension)) {
      return this.formatCodeDocument(text, extension)
    }

    return this.formatNarrativeDocument(text)
  }

  private formatNarrativeDocument(text: string): string {
    const withoutNoise = text
      .replace(/PUBLIC SAPUI5: UI Development Toolkit for HTML5/g, '')
      .replace(/SAPUI5: UI Development Toolkit for HTML5/g, '')
      .replace(/\[page \d+\]/gi, '')
      .replace(/<PropertyValue[^>]*>/g, '')
      .replace(/<Record[^>]*>/g, '')
      .replace(/<\/Record>/g, '')

    return this.reflowParagraphs(this.removeRepeatedPdfNoise(withoutNoise))
  }

  private formatJsonDocument(text: string): string {
    try {
      const parsed = JSON.parse(text)
      const flattened = this.flattenJson(parsed)
      const pretty = JSON.stringify(parsed, null, 2)

      return [
        '## Estrutura extraída',
        flattened.length > 0 ? flattened.map((line) => `- ${line}`).join('\n') : '- JSON vazio',
        '## Conteúdo normalizado',
        '```json',
        pretty,
        '```'
      ].join('\n\n')
    } catch {
      return this.reflowParagraphs(text)
    }
  }

  private formatCsvDocument(text: string): string {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      return ''
    }

    const header = lines[0].split(',').map((cell) => cell.trim())
    const body = lines.slice(1, 26)

    const preview = body
      .map((line, index) => {
        const cells = line.split(',').map((cell) => cell.trim())
        const pairs = header
          .map((column, columnIndex) => `${column}: ${cells[columnIndex] ?? ''}`)
          .join(' | ')

        return `${index + 1}. ${pairs}`
      })
      .join('\n')

    return [
      '## Colunas detectadas',
      header.map((column) => `- ${column}`).join('\n'),
      '## Linhas estruturadas',
      preview || 'Sem linhas com conteúdo.'
    ].join('\n\n')
  }

  private formatCodeDocument(text: string, extension: string): string {
    const symbols = this.extractCodeSymbols(text)
    const language = extension.replace('.', '') || 'txt'
    const normalizedCode = text.replace(/\n{3,}/g, '\n\n')

    return [
      '## Símbolos detectados',
      symbols.length > 0 ? symbols.map((symbol) => `- ${symbol}`).join('\n') : '- Nenhum símbolo principal detectado',
      '## Código normalizado',
      `\`\`\`${language}`,
      normalizedCode,
      '```'
    ].join('\n\n')
  }

  private cleanupStructuredText(text: string): string {
    return text
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]+\n/g, '\n')
      .trim()
  }

  private buildPreparedDocument(filePath: string, extension: string, body: string): string {
    const documentName = path.basename(filePath)
    const documentType = extension.replace('.', '').toUpperCase() || 'FILE'
    const absolutePath = path.resolve(filePath)

    return [
      '# Documento preparado para IA',
      '',
      `- Nome: ${documentName}`,
      `- Tipo: ${documentType}`,
      `- Origem: ${absolutePath}`,
      '- Objetivo: conteúdo reorganizado para busca semântica, RAG e embeddings.',
      '',
      '## Conteúdo preparado',
      '',
      body
    ].join('\n')
  }

  private writePreparedVersion(filePath: string, content: string): string {
    const outputPath = this.buildPreparedOutputPath(filePath)

    fs.writeFileSync(outputPath, content, 'utf-8')
    return outputPath
  }

  private removeRepeatedPdfNoise(text: string): string {
    const lines = text.split('\n')
    const counts = new Map<string, number>()

    for (const line of lines) {
      const normalized = line.trim()
      if (!normalized) continue
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    }

    return lines
      .filter((line) => {
        const normalized = line.trim()
        if (!normalized) return true

        const repetitions = counts.get(normalized) ?? 0
        const looksLikeChrome =
          repetitions >= 3 &&
          normalized.length <= 90 &&
          !/[.!?:;]$/.test(normalized) &&
          !/^[-*•]/.test(normalized) &&
          !/^\d+[.)]/.test(normalized)

        return !looksLikeChrome
      })
      .join('\n')
  }

  private reflowParagraphs(text: string): string {
    const lines = text.split('\n')
    const rebuilt: string[] = []

    for (const rawLine of lines) {
      const line = rawLine.trim()

      if (!line) {
        if (rebuilt[rebuilt.length - 1] !== '') {
          rebuilt.push('')
        }
        continue
      }

      if (this.isStructuralLine(line) || rebuilt.length === 0 || rebuilt[rebuilt.length - 1] === '') {
        rebuilt.push(line)
        continue
      }

      const previous = rebuilt[rebuilt.length - 1]
      rebuilt[rebuilt.length - 1] = this.shouldMergeLines(previous, line)
        ? `${previous} ${line}`.replace(/\s+/g, ' ').trim()
        : `${previous}\n${line}`
    }

    return rebuilt.join('\n')
  }

  private splitLargeSection(section: string, chunkSize: number): string[] {
    const sentences = section
      .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú0-9#-])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)

    if (sentences.length <= 1) {
      return this.splitByLength(section, chunkSize)
    }

    const parts: string[] = []
    let current = ''

    for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence}` : sentence

      if (candidate.length > chunkSize) {
        if (current) {
          parts.push(current)
          current = sentence
          continue
        }

        parts.push(...this.splitByLength(sentence, chunkSize))
        current = ''
        continue
      }

      current = candidate
    }

    if (current) {
      parts.push(current)
    }

    return parts
  }

  private splitByLength(text: string, maxLength: number): string[] {
    const parts: string[] = []
    let cursor = 0

    while (cursor < text.length) {
      const slice = text.slice(cursor, cursor + maxLength).trim()
      if (slice) {
        parts.push(slice)
      }
      cursor += maxLength
    }

    return parts
  }

  private extractOverlap(text: string, overlap: number): string {
    const start = Math.max(0, text.length - overlap)
    const slice = text.slice(start)
    const paragraphBoundary = slice.indexOf('\n\n')
    return (paragraphBoundary >= 0 ? slice.slice(paragraphBoundary + 2) : slice).trim()
  }

  private flattenJson(value: unknown, prefix = ''): string[] {
    if (value === null || value === undefined) {
      return prefix ? [`${prefix}: null`] : ['null']
    }

    if (typeof value !== 'object') {
      return [prefix ? `${prefix}: ${String(value)}` : String(value)]
    }

    if (Array.isArray(value)) {
      return value.flatMap((item, index) => this.flattenJson(item, `${prefix}[${index}]`))
    }

    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key
      return this.flattenJson(child, nextPrefix)
    })
  }

  private extractCodeSymbols(text: string): string[] {
    const patterns = [
      /\bclass\s+([A-Z][A-Za-z0-9_]*)/g,
      /\bfunction\s+([A-Za-z0-9_]+)/g,
      /\b(const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g,
      /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
      /\binterface\s+([A-Z][A-Za-z0-9_]*)/g,
      /\btype\s+([A-Z][A-Za-z0-9_]*)\s*=/g
    ]

    const matches = new Set<string>()

    patterns.forEach((pattern) => {
      for (const match of text.matchAll(pattern)) {
        const name = match[2] ?? match[1]
        if (name) {
          matches.add(name)
        }
      }
    })

    return Array.from(matches).slice(0, 24)
  }

  private isCodeExtension(extension: string): boolean {
    return new Set([
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.html',
      '.css',
      '.xml',
      '.yml',
      '.yaml'
    ]).has(extension)
  }

  private isStructuralLine(line: string): boolean {
    return (
      /^#{1,6}\s/.test(line) ||
      /^[-*•]\s/.test(line) ||
      /^\d+[.)]\s/.test(line) ||
      /^```/.test(line) ||
      /^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9\s/-]{2,}$/.test(line)
    )
  }

  private shouldMergeLines(previous: string, current: string): boolean {
    if (/[.:!?]$/.test(previous)) {
      return false
    }

    if (this.isStructuralLine(current)) {
      return false
    }

    return true
  }
}
