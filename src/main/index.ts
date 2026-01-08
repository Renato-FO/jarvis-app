import { app, shell, BrowserWindow, ipcMain, IpcMainEvent, session } from 'electron'
import { join } from 'path'
import path from 'path'
import fs from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { spawn } from 'child_process'
import os from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Ollama } from 'ollama'
import { SYSTEM_PROMPT } from '../files/system_prompt'
import { knowledgeBase } from './services/KnowledgeBase'

var ollama = new Ollama({ host: 'http://127.0.0.1:11434' })
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
var OLLAMA_MODEL = 'qwen3-coder:30b'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
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
  console.log(` ${c.yellow}> MEMORY:${c.reset}    ${c.blue}* KNOWLEDGE BASE LOADED${c.reset}`)
  console.log(` ${c.yellow}> MODE:${c.reset}      ${c.red}* ADMINISTRATOR ACCESS${c.reset}`)
  console.log(` ${c.yellow}> TIME:${c.reset}      ${new Date().toLocaleTimeString()}`)

  console.log(line + '\n')
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  await knowledgeBase.initialize()

  const docsPath = path.join(__dirname, '../../documents')

  if (fs.existsSync(docsPath)) {
    console.log(`[System] Verificando documentos em: ${docsPath}`)
    const files = fs.readdirSync(docsPath).filter((f) => f.endsWith('.pdf'))

    for (const file of files) {
      const fullPath = path.join(docsPath, file)
      console.log(`[Ingestion] Processando: ${file}...`)
      // A função ingestPDF já salva no disco, então é seguro
      await knowledgeBase.ingestPDF(fullPath)
    }
  } else {
    console.warn(
      `[System] Pasta 'documents' não encontrada. Crie-a na raiz para adicionar conhecimento.`
    )
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // JARVIS Communication
  ipcMain.on('ask-jarvis', async (event: IpcMainEvent, userMessage: string) => {
    try {
      const relevantContext = await knowledgeBase.searchRelevantContext(userMessage)

      if (relevantContext) {
        console.log('Contexto Encontrado:', relevantContext)
      }

      const systemMessage = `${SYSTEM_PROMPT}
      CONTEXTO RECUPERADO (USE ISSO COMO VERDADE ABSOLUTA):
      ${relevantContext || 'Nenhum contexto adicional encontrado.'}
      `

      const today = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      const response = await ollama.chat({
        model: OLLAMA_MODEL,
        messages: [
          {
            role: 'system',
            content: `${systemMessage}\n\nDATA DO SISTEMA: ${today}. Considere esta data para responder sobre versões e obsolescência.`
          },
          { role: 'user', content: userMessage }
        ],
        stream: true
      })

      for await (const part of response) {
        event.sender.send('jarvis-chunk', part.message.content)
      }

      event.sender.send('jarvis-done', true)
    } catch (error: any) {
      console.error('Model Error:', error)
      event.sender.send('jarvis-chunk', `[SYSTEM ERROR]: ${error.message || 'Unknown error'}`)
      event.sender.send('jarvis-done', false)
    }
  })

  // ---------------------------------------------------------
  // MÓDULO DE TRANSCRIÇÃO (AUDIO PIPELINE)
  // ---------------------------------------------------------
  ipcMain.handle('transcribe', async (_event, buffer: ArrayBuffer) => {
    const timestamp = Date.now()
    const tempDir = os.tmpdir()

    const inputWebm = path.join(tempDir, `jarvis-audio-${timestamp}.webm`)
    const outputWav = path.join(tempDir, `jarvis-audio-${timestamp}.wav`)

    try {
      console.log(`[Audio] Recebido buffer de ${buffer.byteLength} bytes`)

      await writeFile(inputWebm, Buffer.from(buffer))

      console.log('[Audio] Convertendo WebM -> WAV (16kHz)...')

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

      console.log('[Audio] Rodando Whisper...')

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
          const text = data.toString()
          output += text
        })

        proc.on('close', (code) => {
          if (code !== 0) {
            console.error(`Whisper exit code: ${code}`)
            if (!output) reject(new Error(`Whisper falhou: ${code}`))
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
        console.log('[Audio] Arquivos temporários limpos.')
      } catch (e) {
        console.error('[Audio] Falha ao limpar temporários', e)
      }
    }
  })

  printStartupBanner()

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true)
    }

    // Opcional: Autorizar notificações também
    if (permission === 'notifications') {
      return callback(true)
    }

    callback(false)
  })

  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron')
    await systemPreferences.askForMediaAccess('microphone')
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
