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
  onDone: (callback: (success: boolean) => void) => subscribe('jarvis-done', callback),
  transcribe: (buffer: ArrayBuffer) => ipcRenderer.invoke('transcribe', buffer),
  getKnowledgeState: () => ipcRenderer.invoke('knowledge:get-state'),
  getRuntimeStatus: () => ipcRenderer.invoke('runtime:get-status'),
  selectDocuments: () => ipcRenderer.invoke('knowledge:select-documents'),
  ingestDocuments: (filePaths: string[]) => ipcRenderer.invoke('knowledge:ingest-documents', filePaths),
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
