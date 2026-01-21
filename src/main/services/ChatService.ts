import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export class ChatService {
  private filePath: string

  constructor() {
    // Salva em C:\Users\Nome\AppData\Roaming\seu-app\chat-history.json
    this.filePath = path.join(app.getPath('userData'), 'chat-history.json')
  }

  // Carrega tudo
  getHistory(): ChatMessage[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        return JSON.parse(data)
      }
      return []
    } catch (error) {
      console.error('[ChatService] Erro ao ler histórico:', error)
      return []
    }
  }

  // Salva uma nova mensagem (append)
  saveMessage(message: ChatMessage) {
    try {
      const history = this.getHistory()
      history.push(message)
      // Mantém apenas as últimas 500 mensagens para não ficar gigante
      if (history.length > 500) history.shift()

      fs.writeFileSync(this.filePath, JSON.stringify(history, null, 2))
    } catch (error) {
      console.error('[ChatService] Erro ao salvar mensagem:', error)
    }
  }

  // Limpa tudo
  clearHistory() {
    try {
      fs.writeFileSync(this.filePath, '[]')
    } catch (error) {
      console.error('[ChatService] Erro ao limpar:', error)
    }
  }
}

export const chatService = new ChatService()
