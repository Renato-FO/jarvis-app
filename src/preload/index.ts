import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

function subscribe<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)

  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const jarvisAPI = {
  sendMessage: (message: string, messages: unknown[]): void => {
    ipcRenderer.send('ask-jarvis', message, messages)
  },
  onResponse: (callback: (chunk: string) => void) => subscribe('jarvis-chunk', callback),
  onResponseContext: (callback: (payload: unknown) => void) =>
    subscribe('jarvis-context', callback),
  onDone: (callback: (success: boolean) => void) => subscribe('jarvis-done', callback),
  transcribe: (buffer: ArrayBuffer) => ipcRenderer.invoke('transcribe', buffer),
  getKnowledgeState: () => ipcRenderer.invoke('knowledge:get-state'),
  getRuntimeStatus: () => ipcRenderer.invoke('runtime:get-status'),
  getPerformanceSnapshot: () => ipcRenderer.invoke('runtime:get-performance-snapshot'),
  notifyRendererReady: (timestampMs?: number) =>
    ipcRenderer.send(
      'renderer-ready',
      typeof timestampMs === 'number' ? timestampMs : Date.now()
    ),
  selectDocuments: () => ipcRenderer.invoke('knowledge:select-documents'),
  ingestDocuments: (filePaths: string[]) => ipcRenderer.invoke('knowledge:ingest-documents', filePaths),
  removeKnowledgeDocument: (documentId: string) =>
    ipcRenderer.invoke('knowledge:remove-document', documentId),
  reprocessKnowledgeDocument: (documentId: string) =>
    ipcRenderer.invoke('knowledge:reprocess-document', documentId),
  clearKnowledgeDocuments: () => ipcRenderer.invoke('knowledge:clear-documents'),
  getKnowledgeDocumentInsights: (documentId: string, chunkLimit?: number) =>
    ipcRenderer.invoke('knowledge:get-document-insights', documentId, chunkLimit),
  onKnowledgeProgress: (callback: (payload: unknown) => void) =>
    subscribe('knowledge-progress', callback),
  onKnowledgeState: (callback: (payload: unknown) => void) => subscribe('knowledge-state', callback),
  onRuntimeStatus: (callback: (payload: unknown) => void) => subscribe('runtime-status', callback)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('jarvis', jarvisAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.jarvis = jarvisAPI
}
