import { ElectronAPI } from '@electron-toolkit/preload'
import { Message } from '../renderer/src/types/chat'

declare global {
  interface Window {
    electron: ElectronAPI
    jarvis: {
      sendMessage: (message: string, messages: Message[]) => void
      onResponse: (callback: (chunk: string) => void) => void
      transcribe: (buffer: ArrayBuffer) => string
    }
  }
}
