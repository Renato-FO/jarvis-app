# J.A.R.V.I.S.

Local-first neural memory workspace built with Electron, React, TypeScript, and Ollama.

J.A.R.V.I.S. combines a cinematic desktop interface with a practical document-aware assistant. It can ingest local files, prepare them for retrieval, answer with grounded context, and expose the state of its memory system through a UI centered around the `Central Core`.

## Highlights

- Local desktop app powered by Electron + React.
- Ollama-based chat and embeddings runtime.
- Document ingestion pipeline with preparation, chunking, and indexing.
- Hybrid retrieval flow for stronger factual answers.
- Source-aware responses with explicit `Sources:` output when context is used.
- Memory operations directly in the UI: inspect, reprocess, remove, and clear documents.
- Holographic `Central Core` UI with performance-aware rendering during streaming.
- Runtime observability for response timing, memory usage, CPU, and frame behavior.

## Experience Layers

- `Central Core`: the main visual and operational centerpiece.
- `Memory Bay`: document management, previews, reprocessing, and memory visibility.
- `Dialogue Layer`: streaming chat with grounded or general answers.
- `System Pulse`: runtime, model, and memory health visibility.

## Tech Stack

- Electron
- React 19
- TypeScript
- Vite via `electron-vite`
- LangChain
- Ollama
- SQLite via `better-sqlite3`
- Tailwind CSS
- `react-markdown` + `rehype-highlight`

## Requirements

Before running the app locally, make sure you have:

- Node.js and npm installed
- Ollama installed and available on your machine
- The required Ollama chat and embedding models pulled locally

The app validates the Ollama environment on startup and attempts to surface runtime status inside the UI.

## Getting Started

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run dev
```

### Type-check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

### Format

```bash
npm run format
```

## Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Project Structure

```text
src/
  main/        Electron main process, IPC, runtime boot, Ollama integration
  preload/     Safe bridge between main and renderer
  renderer/    React UI, hooks, components, and visual system
  files/       Prompt and support files used by the app
model/         Local speech/Whisper runtime assets
documents/     Local document workspace
```

## Current Workflow

1. Import documents into the local memory workspace.
2. Prepare and index them into the knowledge base.
3. Ask questions through the `Dialogue Layer`.
4. Let J.A.R.V.I.S. decide between grounded document answers and useful general answers.
5. Inspect memory health, sources, and runtime behavior from the UI.

## Documentation

- [`codex.md`](./codex.md): project guidelines and task execution flow

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
