import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { JarvisResponseContext, Message, MessageSource } from '../types/chat'
import { RuntimePerformanceSnapshot } from '../types/runtime'

type MachineProfile = 'low' | 'balanced' | 'high'

const BASE_FLUSH_INTERVAL_MS_BY_PROFILE: Record<MachineProfile, number> = {
  low: 84,
  balanced: 46,
  high: 32
}
const PERF_POLL_INTERVAL_MS = 1200
const SOURCE_ID_PATTERN = /\bCTX-\d+\b/gi

export interface StreamDiagnostics {
  machineProfile: MachineProfile
  flushIntervalMs: number
  responseLatencyMs: number | null
  responseDurationMs: number | null
  chunkCount: number
  cpuPercent: number | null
  rssBytes: number | null
  heapUsedBytes: number | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeSourceId(id: string) {
  return String(id ?? '').trim().toUpperCase()
}

function extractUsedSourceIds(text: string): string[] {
  const safeText = String(text ?? '')
  const fontesSectionMatch = safeText.match(/(?:^|\n)Fontes:\s*([\s\S]*)$/i)
  const scope = fontesSectionMatch?.[1] ?? safeText
  const matches = scope.match(SOURCE_ID_PATTERN) ?? []
  const ids = matches.map((value) => normalizeSourceId(value))

  return Array.from(new Set(ids))
}

function resolveResponseSources(text: string, context: JarvisResponseContext | null): MessageSource[] {
  if (!context || !Array.isArray(context.sources) || context.sources.length === 0) {
    return []
  }

  const byId = new Map<string, MessageSource>()
  for (const source of context.sources) {
    const normalizedId = normalizeSourceId(source.id)
    if (!normalizedId) continue

    byId.set(normalizedId, {
      id: normalizedId,
      source: String(source.source ?? 'Fonte desconhecida'),
      excerpt: typeof source.excerpt === 'string' ? source.excerpt : undefined
    })
  }

  const usedIds = extractUsedSourceIds(text)
  if (usedIds.length === 0) {
    return []
  }

  return usedIds.map((sourceId) => byId.get(sourceId)).filter((item): item is MessageSource => Boolean(item))
}

function detectMachineProfile(): MachineProfile {
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 4
  const deviceMemory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0)

  if (hardwareConcurrency <= 4 || (deviceMemory > 0 && deviceMemory <= 4)) {
    return 'low'
  }

  if (hardwareConcurrency >= 12 && (deviceMemory === 0 || deviceMemory >= 12)) {
    return 'high'
  }

  return 'balanced'
}

function computeCpuPercent(
  current: RuntimePerformanceSnapshot,
  previous: RuntimePerformanceSnapshot | null
) {
  if (!previous) return null

  const elapsedMs = current.timestampMs - previous.timestampMs
  if (elapsedMs <= 0) return null

  const deltaUserMicros = current.cpuUserMicros - previous.cpuUserMicros
  const deltaSystemMicros = current.cpuSystemMicros - previous.cpuSystemMicros
  const totalCpuMicros = Math.max(0, deltaUserMicros + deltaSystemMicros)
  const normalizedCpuPercent =
    (totalCpuMicros / (elapsedMs * 1000 * Math.max(1, current.cpuCount))) * 100

  return clamp(normalizedCpuPercent, 0, 100)
}

export function useJarvis() {
  const machineProfile = detectMachineProfile()
  const baseFlushInterval = BASE_FLUSH_INTERVAL_MS_BY_PROFILE[machineProfile]
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [streamDiagnostics, setStreamDiagnostics] = useState<StreamDiagnostics>({
    machineProfile,
    flushIntervalMs: baseFlushInterval,
    responseLatencyMs: null,
    responseDurationMs: null,
    chunkCount: 0,
    cpuPercent: null,
    rssBytes: null,
    heapUsedBytes: null
  })
  const messagesRef = useRef<Message[]>([])
  const pendingChunkRef = useRef('')
  const flushTimerRef = useRef<number | null>(null)
  const flushScheduledAtRef = useRef<number | null>(null)
  const flushIntervalRef = useRef(baseFlushInterval)
  const machineProfileRef = useRef(machineProfile)
  const requestStartedAtRef = useRef<number | null>(null)
  const firstChunkAtRef = useRef<number | null>(null)
  const streamedChunkCountRef = useRef(0)
  const previousRuntimeSnapshotRef = useRef<RuntimePerformanceSnapshot | null>(null)
  const responseContextRef = useRef<JarvisResponseContext | null>(null)

  const updateFlushInterval = useEffectEvent((chunkLength: number, timerLagMs: number) => {
    const profileBase =
      BASE_FLUSH_INTERVAL_MS_BY_PROFILE[machineProfileRef.current] ??
      BASE_FLUSH_INTERVAL_MS_BY_PROFILE.balanced
    const minimum = Math.max(24, Math.round(profileBase * 0.65))
    const maximum = Math.max(96, Math.round(profileBase * 2.6))
    let nextInterval = flushIntervalRef.current

    if (timerLagMs > 20 || chunkLength > 720) {
      nextInterval += 8
    } else if (timerLagMs < 8 && chunkLength < 220) {
      nextInterval -= 4
    }

    nextInterval = clamp(nextInterval, minimum, maximum)

    if (nextInterval === flushIntervalRef.current) return

    flushIntervalRef.current = nextInterval
    setStreamDiagnostics((prev) => ({
      ...prev,
      flushIntervalMs: nextInterval
    }))
  })

  const flushPendingChunk = useEffectEvent((timerLagMs = 0) => {
    const chunk = pendingChunkRef.current
    if (!chunk) return

    updateFlushInterval(chunk.length, timerLagMs)
    pendingChunkRef.current = ''

    setMessages((prev) => {
      const safePrev = Array.isArray(prev) ? prev : []
      const lastMsg = safePrev[safePrev.length - 1]

      if (!lastMsg || lastMsg.sender !== 'jarvis') {
        const nextMessages = [
          ...safePrev,
          {
            id: `jarvis-${Date.now()}`,
            sender: 'jarvis' as const,
            text: chunk,
            timestamp: new Date(),
            isStreaming: true
          }
        ]

        messagesRef.current = nextMessages
        return nextMessages
      }

      const nextMessages = [
        ...safePrev.slice(0, -1),
        {
          ...lastMsg,
          text: `${String(lastMsg.text ?? '')}${chunk}`,
          isStreaming: true
        }
      ]

      messagesRef.current = nextMessages
      return nextMessages
    })
  })

  const scheduleChunkFlush = useEffectEvent(() => {
    if (flushTimerRef.current !== null) return

    const interval = flushIntervalRef.current
    flushScheduledAtRef.current = performance.now()
    flushTimerRef.current = window.setTimeout(() => {
      const timerLagMs =
        flushScheduledAtRef.current === null
          ? 0
          : performance.now() - flushScheduledAtRef.current - interval
      flushTimerRef.current = null
      flushScheduledAtRef.current = null
      flushPendingChunk(Math.max(0, timerLagMs))
    }, interval)
  })

  useEffect(() => {
    const unsubscribeContext = window.jarvis.onResponseContext((payload) => {
      const safePayload = payload as Partial<JarvisResponseContext>
      responseContextRef.current = {
        retrievalMode: safePayload?.retrievalMode === 'fact' ? 'fact' : 'exploratory',
        sources: Array.isArray(safePayload?.sources)
          ? safePayload.sources
              .map((source) => ({
                id: String(source?.id ?? ''),
                source: String(source?.source ?? ''),
                excerpt: typeof source?.excerpt === 'string' ? source.excerpt : undefined
              }))
              .filter((source) => source.id && source.source)
          : []
      }
    })

    const unsubscribeChunk = window.jarvis.onResponse((chunk: string) => {
      const now = performance.now()
      streamedChunkCountRef.current += 1

      if (firstChunkAtRef.current === null && requestStartedAtRef.current !== null) {
        firstChunkAtRef.current = now
        setStreamDiagnostics((prev) => ({
          ...prev,
          responseLatencyMs: Math.max(0, Math.round(now - requestStartedAtRef.current!))
        }))
      }

      setStreamDiagnostics((prev) => ({
        ...prev,
        chunkCount: streamedChunkCountRef.current
      }))

      pendingChunkRef.current += typeof chunk === 'string' ? chunk : String(chunk ?? '')
      scheduleChunkFlush()
    })

    const unsubscribeDone = window.jarvis.onDone(() => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushScheduledAtRef.current = null

      flushPendingChunk()

      setMessages((prev) => {
        const safePrev = Array.isArray(prev) ? prev : []
        const lastMsg = safePrev[safePrev.length - 1]
        if (!lastMsg || lastMsg.sender !== 'jarvis') return safePrev

        const resolvedSources = resolveResponseSources(
          String(lastMsg.text ?? ''),
          responseContextRef.current
        )

        const nextMessages = [
          ...safePrev.slice(0, -1),
          {
            ...lastMsg,
            isStreaming: false,
            sources: resolvedSources.length > 0 ? resolvedSources : undefined
          }
        ]

        messagesRef.current = nextMessages
        return nextMessages
      })
      const requestDurationMs =
        requestStartedAtRef.current === null
          ? null
          : Math.max(0, Math.round(performance.now() - requestStartedAtRef.current))

      setStreamDiagnostics((prev) => ({
        ...prev,
        responseDurationMs: requestDurationMs
      }))

      if (requestDurationMs !== null) {
        const latency = firstChunkAtRef.current
          ? Math.max(0, Math.round(firstChunkAtRef.current - requestStartedAtRef.current!))
          : null

        console.info(
          '[Jarvis][StreamMetrics]',
          JSON.stringify(
            {
              profile: machineProfileRef.current,
              chunks: streamedChunkCountRef.current,
              latencyMs: latency,
              durationMs: requestDurationMs,
              flushIntervalMs: flushIntervalRef.current
            },
            null,
            2
          )
        )
      }

      setIsProcessing(false)
      responseContextRef.current = null
    })

    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushScheduledAtRef.current = null

      pendingChunkRef.current = ''
      responseContextRef.current = null
      unsubscribeContext()
      unsubscribeChunk()
      unsubscribeDone()
    }
  }, [])

  useEffect(() => {
    if (!isProcessing) return

    let cancelled = false

    const pollRuntimeStats = () => {
      void window.jarvis
        .getPerformanceSnapshot()
        .then((snapshot) => {
          if (cancelled) return

          const cpuPercent = computeCpuPercent(snapshot, previousRuntimeSnapshotRef.current)
          previousRuntimeSnapshotRef.current = snapshot

          setStreamDiagnostics((prev) => ({
            ...prev,
            cpuPercent: cpuPercent ?? prev.cpuPercent,
            rssBytes: snapshot.rssBytes,
            heapUsedBytes: snapshot.heapUsedBytes,
            responseDurationMs:
              requestStartedAtRef.current === null
                ? prev.responseDurationMs
                : Math.max(0, Math.round(performance.now() - requestStartedAtRef.current))
          }))
        })
        .catch(() => {
          // Ignora falha pontual de metricas para nao interromper o streaming.
        })
    }

    pollRuntimeStats()
    const interval = window.setInterval(pollRuntimeStats, PERF_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isProcessing])

  const sendMessage = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isProcessing) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date()
    }

    const history = messagesRef.current

    setMessages((prev) => {
      const safePrev = Array.isArray(prev) ? prev : []
      const nextMessages = [...safePrev, userMsg]
      messagesRef.current = nextMessages
      return nextMessages
    })

    const detectedProfile = detectMachineProfile()
    const detectedBaseFlush =
      BASE_FLUSH_INTERVAL_MS_BY_PROFILE[detectedProfile] ??
      BASE_FLUSH_INTERVAL_MS_BY_PROFILE.balanced

    machineProfileRef.current = detectedProfile
    flushIntervalRef.current = detectedBaseFlush
    requestStartedAtRef.current = performance.now()
    firstChunkAtRef.current = null
    streamedChunkCountRef.current = 0
    previousRuntimeSnapshotRef.current = null
    responseContextRef.current = null

    setStreamDiagnostics((prev) => ({
      ...prev,
      machineProfile: detectedProfile,
      flushIntervalMs: detectedBaseFlush,
      responseLatencyMs: null,
      responseDurationMs: 0,
      chunkCount: 0,
      cpuPercent: null
    }))

    setIsProcessing(true)
    window.jarvis.sendMessage(trimmed, history)
  }

  return { messages, sendMessage, isProcessing, streamDiagnostics }
}
