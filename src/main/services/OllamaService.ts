import { spawn } from 'child_process'
import { Ollama } from 'ollama'

const OLLAMA_HOST = 'http://127.0.0.1:11434'
const CHAT_MODEL = 'qwen3-coder:30b'
const EMBEDDING_MODEL = 'nomic-embed-text:latest'
const KEEP_ALIVE = '20m'

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

export class OllamaService {
  private client = new Ollama({ host: OLLAMA_HOST })
  private startupPromise: Promise<void> | null = null
  private warmupPromises = new Map<string, Promise<void>>()
  private listeners = new Set<(status: OllamaRuntimeStatus) => void>()
  private status: OllamaRuntimeStatus = {
    host: OLLAMA_HOST,
    phase: 'idle',
    message: 'Aguardando validação do Ollama.',
    serverReachable: false,
    chatModel: CHAT_MODEL,
    embeddingModel: EMBEDDING_MODEL,
    chatModelInstalled: false,
    embeddingModelInstalled: false,
    chatModelLoaded: false,
    embeddingModelLoaded: false,
    lastError: null
  }

  getClient() {
    return this.client
  }

  getChatModel() {
    return CHAT_MODEL
  }

  getEmbeddingModel() {
    return EMBEDDING_MODEL
  }

  getStatus() {
    return { ...this.status }
  }

  subscribe(listener: (status: OllamaRuntimeStatus) => void) {
    this.listeners.add(listener)
    listener(this.getStatus())

    return () => {
      this.listeners.delete(listener)
    }
  }

  async ensureStartupValidation() {
    if (this.startupPromise) {
      return this.startupPromise
    }

    this.startupPromise = this.validateEnvironment().finally(() => {
      this.startupPromise = null
    })

    return this.startupPromise
  }

  async ensureChatReady() {
    await this.ensureStartupValidation()
    await this.ensureModelLoaded(CHAT_MODEL, 'chat')
  }

  async ensureEmbeddingReady() {
    await this.ensureStartupValidation()
    await this.ensureModelLoaded(EMBEDDING_MODEL, 'embedding')
  }

  async createEmbedding(prompt: string): Promise<number[]> {
    const safePrompt = String(prompt ?? '').trim()

    try {
      await this.ensureEmbeddingReady()

      if (!safePrompt) {
        throw new Error('Nao foi possivel gerar embedding: prompt vazio.')
      }

      const response = await this.client.embeddings({
        model: EMBEDDING_MODEL,
        prompt: safePrompt,
        keep_alive: KEEP_ALIVE
      })

      if (!Array.isArray(response?.embedding) || response.embedding.length === 0) {
        throw new Error('Ollama retornou embedding invalido ou vazio.')
      }

      return response.embedding
    } catch (error) {
      const details = getErrorDetails(error)
      throw new Error(
        `[OllamaService.createEmbedding] ${details.message}\nmodel=${EMBEDDING_MODEL}\npromptLength=${safePrompt.length}\nstack=${details.stack}`
      )
    }
  }

  private async validateEnvironment() {
    try {
      this.updateStatus({
        phase: 'validating',
        message: 'Validando servidor e modelos do Ollama...',
        lastError: null
      })

      if (!(await this.isServerReachable())) {
        this.updateStatus({
          phase: 'starting-server',
          message: 'Servidor não respondeu. Tentando iniciar `ollama serve`...'
        })

        this.startServer()
        await this.waitForServer()
      }

      const models = await this.client.list()
      const available = new Set(models.models.map((model) => model.name))

      this.updateStatus({
        serverReachable: true,
        chatModelInstalled: available.has(CHAT_MODEL),
        embeddingModelInstalled: available.has(EMBEDDING_MODEL)
      })

      if (!available.has(CHAT_MODEL)) {
        throw new Error(
          `Modelo de chat ausente: ${CHAT_MODEL}. Instale com \`ollama pull ${CHAT_MODEL}\`.`
        )
      }

      if (!available.has(EMBEDDING_MODEL)) {
        throw new Error(
          `Modelo de embeddings ausente: ${EMBEDDING_MODEL}. Instale com \`ollama pull ${EMBEDDING_MODEL}\`.`
        )
      }

      await this.refreshLoadedModels()
      this.markReady()
    } catch (error: any) {
      this.updateStatus({
        phase: 'error',
        message: error.message || 'Falha ao validar o Ollama.',
        lastError: error.message || 'Falha ao validar o Ollama.'
      })

      throw error
    }
  }

  private async isServerReachable() {
    try {
      await this.client.version()
      this.updateStatus({ serverReachable: true, lastError: null })
      return true
    } catch {
      this.updateStatus({ serverReachable: false })
      return false
    }
  }

  private startServer() {
    try {
      const server = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })

      server.unref()
    } catch (error) {
      console.error('[Ollama] Não foi possível iniciar `ollama serve`.', error)
    }
  }

  private async waitForServer(retries = 15, intervalMs = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      if (await this.isServerReachable()) {
        this.updateStatus({
          message: `Servidor pronto após ${attempt} tentativa(s).`
        })
        return
      }

      await delay(intervalMs)
    }

    throw new Error(
      `O servidor não respondeu em ${OLLAMA_HOST}. Verifique se o Ollama está instalado e em execução.`
    )
  }

  private async ensureModelLoaded(modelName: string, mode: 'chat' | 'embedding') {
    await this.refreshLoadedModels()

    const isAlreadyRunning =
      modelName === CHAT_MODEL ? this.status.chatModelLoaded : this.status.embeddingModelLoaded

    if (isAlreadyRunning) {
      this.markReady()
      return
    }

    const existingWarmup = this.warmupPromises.get(modelName)
    if (existingWarmup) {
      return existingWarmup
    }

    const warmupPromise = this.warmModel(modelName, mode).finally(() => {
      this.warmupPromises.delete(modelName)
    })

    this.warmupPromises.set(modelName, warmupPromise)
    return warmupPromise
  }

  private async warmModel(modelName: string, mode: 'chat' | 'embedding') {
    this.updateStatus({
      phase: mode === 'chat' ? 'warming-chat' : 'warming-embedding',
      message:
        mode === 'chat'
          ? `Carregando modelo de chat ${modelName}...`
          : `Carregando modelo de embeddings ${modelName}...`,
      lastError: null
    })

    if (mode === 'chat') {
      await this.client.generate({
        model: modelName,
        prompt: 'Responda apenas com OK.',
        stream: false,
        keep_alive: KEEP_ALIVE
      })
    } else {
      await this.client.embeddings({
        model: modelName,
        prompt: 'jarvis warmup',
        keep_alive: KEEP_ALIVE
      })
    }

    await this.refreshLoadedModels()
    this.markReady()
  }

  private async refreshLoadedModels() {
    try {
      const runningModels = await this.client.ps()
      const running = new Set(runningModels.models.map((model) => model.name))

      this.updateStatus({
        serverReachable: true,
        chatModelLoaded: running.has(CHAT_MODEL),
        embeddingModelLoaded: running.has(EMBEDDING_MODEL)
      })
    } catch (error) {
      this.updateStatus({
        serverReachable: false,
        chatModelLoaded: false,
        embeddingModelLoaded: false
      })
      throw error
    }
  }

  private markReady() {
    const bothInstalled = this.status.chatModelInstalled && this.status.embeddingModelInstalled
    const bothLoaded = this.status.chatModelLoaded && this.status.embeddingModelLoaded

    this.updateStatus({
      phase: 'ready',
      message: bothLoaded
        ? 'Ollama online. Modelos de chat e embeddings prontos.'
        : bothInstalled
          ? 'Ollama online. Modelos instalados e aguardando uso.'
          : 'Ollama online.',
      lastError: null
    })
  }

  private updateStatus(patch: Partial<OllamaRuntimeStatus>) {
    this.status = {
      ...this.status,
      ...patch
    }

    this.emit()
  }

  private emit() {
    const snapshot = this.getStatus()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

export const ollamaService = new OllamaService()
