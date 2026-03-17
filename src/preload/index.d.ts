import { ElectronAPI } from '@electron-toolkit/preload'
import { Message } from '../renderer/src/types/chat'
import {
  KnowledgeProgressEvent,
  KnowledgeState
} from '../renderer/src/types/knowledge'
import { OllamaRuntimeStatus } from '../renderer/src/types/runtime'

declare global {
  interface Window {
    electron: ElectronAPI
    jarvis: {
      sendMessage: (message: string, messages: Message[]) => void
      onResponse: (callback: (chunk: string) => void) => () => void
      onDone: (callback: (success: boolean) => void) => () => void
      transcribe: (buffer: ArrayBuffer) => Promise<string>
      getKnowledgeState: () => Promise<KnowledgeState>
      getRuntimeStatus: () => Promise<OllamaRuntimeStatus>
      selectDocuments: () => Promise<{ canceled: boolean; filePaths: string[] }>
      ingestDocuments: (filePaths: string[]) => Promise<KnowledgeState>
      onKnowledgeProgress: (callback: (payload: KnowledgeProgressEvent) => void) => () => void
      onKnowledgeState: (callback: (payload: KnowledgeState) => void) => () => void
      onRuntimeStatus: (callback: (payload: OllamaRuntimeStatus) => void) => () => void
    }
  }
}
