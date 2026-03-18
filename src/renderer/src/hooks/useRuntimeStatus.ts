import { useEffect, useState } from 'react'
import { RuntimeStatusSnapshot } from '../types/runtime'

const emptyRuntimeStatus: RuntimeStatusSnapshot = {
  host: 'http://127.0.0.1:11434',
  phase: 'idle',
  message: 'Aguardando validação do Ollama.',
  serverReachable: false,
  chatModel: 'qwen3-coder:30b',
  embeddingModel: 'nomic-embed-text:latest',
  chatModelInstalled: false,
  embeddingModelInstalled: false,
  chatModelLoaded: false,
  embeddingModelLoaded: false,
  lastError: null
}

export function useRuntimeStatus() {
  const [status, setStatus] = useState<RuntimeStatusSnapshot>(emptyRuntimeStatus)

  useEffect(() => {
    void window.jarvis.getRuntimeStatus().then((snapshot) => {
      setStatus(snapshot)
    })

    const unsubscribe = window.jarvis.onRuntimeStatus((snapshot) => {
      setStatus(snapshot)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return status
}
