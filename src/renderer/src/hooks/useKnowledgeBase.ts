import { useEffect, useState } from 'react'
import {
  KnowledgeDocument,
  KnowledgeProgressEvent,
  KnowledgeState
} from '../types/knowledge'

const emptyState: KnowledgeState = {
  documents: [],
  stats: {
    indexedDocuments: 0,
    processingDocuments: 0,
    erroredDocuments: 0,
    totalChunks: 0,
    isReady: false
  }
}

function normalizeState(snapshot: Partial<KnowledgeState> | null | undefined): KnowledgeState {
  return {
    documents: Array.isArray(snapshot?.documents) ? snapshot.documents : [],
    stats: {
      indexedDocuments: Number(snapshot?.stats?.indexedDocuments ?? 0),
      processingDocuments: Number(snapshot?.stats?.processingDocuments ?? 0),
      erroredDocuments: Number(snapshot?.stats?.erroredDocuments ?? 0),
      totalChunks: Number(snapshot?.stats?.totalChunks ?? 0),
      isReady: Boolean(snapshot?.stats?.isReady)
    }
  }
}

function upsertDocument(documents: KnowledgeDocument[] | undefined, record: KnowledgeDocument) {
  const next = Array.isArray(documents) ? [...documents] : []
  const index = next.findIndex((item) => item.id === record.id)

  if (index >= 0) {
    next[index] = record
  } else {
    next.unshift(record)
  }

  return next
}

export function useKnowledgeBase() {
  const [state, setState] = useState<KnowledgeState>(emptyState)
  const [activity, setActivity] = useState<KnowledgeProgressEvent | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    void window.jarvis.getKnowledgeState().then((snapshot) => {
      setState(normalizeState(snapshot))
    })

    const unsubscribeProgress = window.jarvis.onKnowledgeProgress((event) => {
      setActivity(event)

      if (event.record) {
        setState((prev) => ({
          ...prev,
          documents: upsertDocument(prev.documents, event.record!)
        }))
      }
    })

    const unsubscribeState = window.jarvis.onKnowledgeState((snapshot) => {
      const normalized = normalizeState(snapshot)
      setState(normalized)
      setIsImporting(normalized.stats.processingDocuments > 0)
    })

    return () => {
      unsubscribeProgress()
      unsubscribeState()
    }
  }, [])

  const importDocuments = async () => {
    const result = await window.jarvis.selectDocuments()
    const filePaths = Array.isArray(result?.filePaths) ? result.filePaths : []

    if (result?.canceled || filePaths.length === 0) {
      return
    }

    setIsImporting(true)
    await window.jarvis.ingestDocuments(filePaths)
  }

  return {
    state,
    activity,
    isImporting,
    importDocuments
  }
}
