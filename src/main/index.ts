import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  IpcMainEvent,
  session,
  dialog
} from 'electron'
import type { OpenDialogOptions } from 'electron'
import { join } from 'path'
import path from 'path'
import { writeFile, unlink } from 'fs/promises'
import { spawn } from 'child_process'
import os from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { SYSTEM_PROMPT } from '../files/system_prompt'
import { knowledgeBase } from './services/KnowledgeBase'
import { ollamaService } from './services/OllamaService'

const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
const CHAT_HISTORY_BUDGET = 12000

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || error.message
    }
  }

  return {
    message: String(error),
    stack: String(error)
  }
}

function trimMessageHistory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxChars: number
) {
  const selected: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let usedChars = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const content = typeof message?.content === 'string' ? message.content : ''
    const size = content.length

    if (selected.length > 0 && usedChars + size > maxChars) {
      break
    }

    selected.unshift({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content
    })
    usedChars += size
  }

  return selected
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1560,
    height: 940,
    minWidth: 860,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#05111f',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function printStartupBanner() {
  const c = {
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m'
  }

  const logo = `
${c.cyan}${c.bold}
      _       _       ____     __     __   ___     ____
     | |     / \\     |  _ \\    \\ \\   / /   |_ _|   / ___|
  _  | |    / _ \\    | |_) |    \\ \\ / /     | |    \\___ \\
 | |_| |   / ___ \\   |  _ <      \\ V /      | |     ___) |
  \\___/ . /_/   \\_\\. |_| \\_\\ .    \\_/    . |___| . |____/ .
${c.reset}`

  const line = `${c.dim}--------------------------------------------------------${c.reset}`

  console.log('\n' + line)
  console.log(logo)
  console.log(line)
  console.log(` ${c.yellow}> SYSTEM:${c.reset}    ${c.green}* ONLINE${c.reset}`)
  console.log(` ${c.yellow}> MEMORY:${c.reset}    ${c.blue}* STANDBY${c.reset}`)
  console.log(` ${c.yellow}> MODE:${c.reset}      ${c.red}* INTERACTIVE WORKSPACE${c.reset}`)
  console.log(` ${c.yellow}> TIME:${c.reset}      ${new Date().toLocaleTimeString()}`)
  console.log(line + '\n')
}

process.on('uncaughtException', (error) => {
  const details = getErrorDetails(error)
  console.error('[Main][uncaughtException]', details.stack)
})

process.on('unhandledRejection', (reason) => {
  const details = getErrorDetails(reason)
  console.error('[Main][unhandledRejection]', details.stack)
})

app
  .whenReady()
  .then(async () => {
    electronApp.setAppUserModelId('com.electron')

    const broadcastRuntimeStatus = () => {
      const status = ollamaService.getStatus()

      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('runtime-status', status)
      }
    }

    const unsubscribeRuntime = ollamaService.subscribe(() => {
      broadcastRuntimeStatus()
    })

    await knowledgeBase.initialize()
    try {
      await ollamaService.ensureStartupValidation()
      console.log('[Ollama] Ambiente validado com sucesso.')
    } catch (error) {
      console.error('[Ollama] Falha na validação inicial.', error)
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.on('ask-jarvis', async (event: IpcMainEvent, userMessage: string, messages) => {
      let stage = 'ensure-chat-ready'
      try {
        await ollamaService.ensureChatReady()

        stage = 'search-relevant-context'
        const relevantContext = await knowledgeBase.searchRelevantContext(userMessage)
        const sourceLedger =
          relevantContext.sources.length > 0
            ? relevantContext.sources
                .map((source) => `${source.id}: ${source.source}`)
                .join('\n')
            : 'Nenhuma fonte recuperada.'

        console.log(
          [
            '[RAG][RetrievedContext]',
            `query=${JSON.stringify(String(userMessage ?? ''))}`,
            `mode=${relevantContext.retrievalMode}`,
            `sourceCount=${relevantContext.sources.length}`,
            'sources:',
            sourceLedger,
            'context:',
            relevantContext.contextText || 'Nenhum contexto adicional encontrado.'
          ].join('\n')
        )

        const systemMessage = `${SYSTEM_PROMPT}
CONTEXTO RECUPERADO (USE ISSO COMO VERDADE ABSOLUTA QUANDO HOUVER RESPOSTA DIRETA):
${relevantContext.contextText || 'Nenhum contexto adicional encontrado.'}

MODO DE RECUPERACAO:
${relevantContext.retrievalMode}

REGRAS ADICIONAIS DE RESPOSTA:
- Se existir resposta direta no contexto, responda com base nele e nao complemente com conhecimento geral.
- Para perguntas de lista, devolva os itens do contexto sem inventar categorias novas.
- Ao final, inclua "Fontes:" com os IDs realmente usados.

MAPA DE FONTES DISPONIVEIS:
${sourceLedger}
`

        const today = new Date().toLocaleDateString('pt-BR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })

        const history: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(
          messages
        )
          ? messages
              .filter((msg) => msg && typeof msg === 'object')
              .map((msg) => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: String(msg.text ?? '')
              }))
          : []

        const boundedHistory = trimMessageHistory(history, CHAT_HISTORY_BUDGET)

        stage = 'chat-request'
        const finalMessages = [
          {
            role: 'system',
            content: `${systemMessage}\n\nDATA DO SISTEMA: ${today}. Considere esta data para responder sobre versões e obsolescência.`
          },
          ...boundedHistory,
          { role: 'user', content: userMessage }
        ]

        const response = await ollamaService.getClient().chat({
          model: ollamaService.getChatModel(),
          messages: finalMessages,
          stream: true,
          keep_alive: '20m'
        })

        stage = 'chat-stream'
        for await (const part of response) {
          event.sender.send('jarvis-chunk', part.message.content)
        }

        event.sender.send('jarvis-done', true)
      } catch (error: any) {
        const details = getErrorDetails(error)
        const explicitMessage = [
          `[ask-jarvis] ${details.message}`,
          `stage=${stage}`,
          `userMessageLength=${String(userMessage ?? '').length}`,
          `historyLength=${Array.isArray(messages) ? messages.length : 0}`,
          `stack=${details.stack}`
        ].join('\n')

        console.error('Model Error:', explicitMessage)
        event.sender.send(
          'jarvis-chunk',
          `[SYSTEM ERROR]\n${explicitMessage}`
        )
        event.sender.send('jarvis-done', false)
      }
    })

    ipcMain.handle('knowledge:get-state', async () => {
      return knowledgeBase.getSnapshot()
    })

    ipcMain.handle('runtime:get-status', async () => {
      return ollamaService.getStatus()
    })

    ipcMain.handle('knowledge:select-documents', async (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const supportedExtensions = knowledgeBase.getSupportedExtensions()
      const dialogOptions: OpenDialogOptions = {
        title: 'Adicionar documentos à memória do Jarvis',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Documentos suportados',
            extensions: supportedExtensions.map((extension) => extension.replace('.', ''))
          }
        ]
      }

      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      return {
        canceled: result.canceled,
        filePaths: result.filePaths
      }
    })

    ipcMain.handle('knowledge:ingest-documents', async (event, filePaths: string[]) => {
      if (!Array.isArray(filePaths) || filePaths.length === 0) {
        return knowledgeBase.getSnapshot()
      }

      void knowledgeBase
        .ingestDocuments(filePaths, (progress) => {
          event.sender.send('knowledge-progress', progress)
          event.sender.send('knowledge-state', knowledgeBase.getSnapshot())
        })
        .catch((error: any) => {
          event.sender.send('knowledge-progress', {
            type: 'document-error',
            error: error.message || 'Falha ao processar documentos.'
          })
          event.sender.send('knowledge-state', knowledgeBase.getSnapshot())
        })

      return knowledgeBase.getSnapshot()
    })

    ipcMain.handle('transcribe', async (_event, buffer: ArrayBuffer) => {
      const timestamp = Date.now()
      const tempDir = os.tmpdir()
      const inputWebm = path.join(tempDir, `jarvis-audio-${timestamp}.webm`)
      const outputWav = path.join(tempDir, `jarvis-audio-${timestamp}.wav`)

      try {
        console.log(`[Audio] Recebido buffer de ${buffer.byteLength} bytes`)
        await writeFile(inputWebm, Buffer.from(buffer))

        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn(ffmpegPath, [
            '-i',
            inputWebm,
            '-ar',
            '16000',
            '-ac',
            '1',
            '-c:a',
            'pcm_s16le',
            outputWav
          ])

          ffmpeg.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`FFmpeg falhou com código ${code}`))
          })
        })

        const whisperPath = path.join(process.cwd(), 'model/Release', 'whisper-cli.exe')
        const modelPath = path.join(process.cwd(), 'model/Release', 'ggml-base.bin')

        const transcription = await new Promise<string>((resolve, reject) => {
          let output = ''

          const proc = spawn(whisperPath, [
            '-m',
            modelPath,
            '-f',
            outputWav,
            '--language',
            'pt',
            '--beam-size',
            '1',
            '--no-timestamps'
          ])

          proc.stdout.on('data', (data) => {
            output += data.toString()
          })

          proc.on('close', (code) => {
            if (code !== 0 && !output) {
              reject(new Error(`Whisper falhou: ${code}`))
              return
            }

            resolve(output.trim())
          })
        })

        return transcription
      } catch (error: any) {
        console.error('[Transcribe Error]', error)
        return `[Erro de Áudio]: ${error.message}`
      } finally {
        try {
          await unlink(inputWebm).catch(() => {})
          await unlink(outputWav).catch(() => {})
        } catch (cleanupError) {
          console.error('[Audio] Falha ao limpar temporários', cleanupError)
        }
      }
    })

    printStartupBanner()

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (permission === 'media' || permission === 'notifications') {
        callback(true)
        return
      }

      callback(false)
    })

    if (process.platform === 'darwin') {
      const { systemPreferences } = require('electron')
      await systemPreferences.askForMediaAccess('microphone')
    }

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    app.on('before-quit', () => {
      unsubscribeRuntime()
    })
  })
  .catch((error) => {
    console.error('[System] Falha durante inicializacao do app.', error)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
