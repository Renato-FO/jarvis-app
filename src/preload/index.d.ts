import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    jarvis: {
      sendMessage: (message: string) => void
      onResponse: (callback: (chunk: string) => void) => void
      transcribe: (buffer: ArrayBuffer) => string
    }
  }
}
