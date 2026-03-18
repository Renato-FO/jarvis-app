import { ElectronAPI } from '@electron-toolkit/preload'
import { Message } from '../renderer/src/types/chat'
import {
  KnowledgeDocumentInsights,
  KnowledgeProgressEvent,
  KnowledgeState
} from '../renderer/src/types/knowledge'
import { RuntimePerformanceSnapshot, RuntimeStatusSnapshot } from '../renderer/src/types/runtime'
import { JarvisResponseContext } from '../renderer/src/types/chat'

declare global {
  interface Window {
    electron: ElectronAPI
    jarvis: {
      sendMessage: (message: string, messages: Message[]) => void
      onResponse: (callback: (chunk: string) => void) => () => void
      onResponseContext: (callback: (payload: JarvisResponseContext) => void) => () => void
      onDone: (callback: (success: boolean) => void) => () => void
      transcribe: (buffer: ArrayBuffer) => Promise<string>
      getKnowledgeState: () => Promise<KnowledgeState>
      getRuntimeStatus: () => Promise<RuntimeStatusSnapshot>
      getPerformanceSnapshot: () => Promise<RuntimePerformanceSnapshot>
      notifyRendererReady: (timestampMs?: number) => void
      selectDocuments: () => Promise<{ canceled: boolean; filePaths: string[] }>
      ingestDocuments: (filePaths: string[]) => Promise<KnowledgeState>
      removeKnowledgeDocument: (documentId: string) => Promise<KnowledgeState>
      reprocessKnowledgeDocument: (documentId: string) => Promise<KnowledgeState>
      clearKnowledgeDocuments: () => Promise<KnowledgeState>
      getKnowledgeDocumentInsights: (
        documentId: string,
        chunkLimit?: number
      ) => Promise<KnowledgeDocumentInsights | null>
      onKnowledgeProgress: (callback: (payload: KnowledgeProgressEvent) => void) => () => void
      onKnowledgeState: (callback: (payload: KnowledgeState) => void) => () => void
      onRuntimeStatus: (callback: (payload: RuntimeStatusSnapshot) => void) => () => void
    }
  }
}
