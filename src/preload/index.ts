import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const jarvisAPI = {
  sendMessage: (message: string): void => {
    ipcRenderer.send('ask-jarvis', message)
  },
  onResponse: (callback: (chunk: string) => void): void => {
    // Limpa ouvintes antigos para evitar duplicação em re-renders do React
    ipcRenderer.removeAllListeners('jarvis-chunk')
    ipcRenderer.on('jarvis-chunk', (_event, chunk) => callback(chunk))
  },
  transcribe: (buffer: ArrayBuffer) => ipcRenderer.invoke('transcribe', buffer)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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
  window.api = api
}
