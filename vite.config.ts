import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const tinyGoCompilePath = '/api/tinygo/compile'
const tinyGoHostCompilerModuleUrl = new URL('./scripts/tinygo-host-compiler.mjs', import.meta.url).href

function createTinyGoHostCompilePlugin() {
  const installMiddleware = (middlewares: { use: (handler: (...args: any[]) => unknown) => void }) => {
    middlewares.use(async (req: any, res: any, next: () => void) => {
      if (!req.url) {
        next()
        return
      }
      const requestUrl = new URL(req.url, 'http://localhost')
      if (requestUrl.pathname !== tinyGoCompilePath) {
        next()
        return
      }
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: 'TinyGo host compile only accepts POST requests' }))
        return
      }

      let requestBody = ''
      for await (const chunk of req) {
        requestBody += String(chunk)
      }

      let payload: {
        entryFileName?: string
        files?: Record<string, string>
        optimize?: string
        panic?: 'print' | 'trap'
        scheduler?: 'none' | 'tasks' | 'asyncify'
        source?: string
        target?: 'wasip1'
      } = {}
      try {
        payload = requestBody.trim() ? JSON.parse(requestBody) : {}
      } catch {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: 'TinyGo host compile received invalid JSON' }))
        return
      }

      try {
        const compilerModule = (await import(
          /* @vite-ignore */ tinyGoHostCompilerModuleUrl
        )) as {
          compileTinyGoHostSource: (options: {
            optimize?: string
            panic?: 'print' | 'trap'
            scheduler?: 'none' | 'tasks' | 'asyncify'
            source: string
            target?: 'wasip1'
          }) => Promise<{
            artifact: { bytes: Uint8Array; entrypoint: '_start' | '_initialize' | null; path: string; size: number }
            target: string
            targetInfo: { scheduler: string }
            toolchain: { version: string }
          }>
          compileTinyGoHostWorkspace: (options: {
            entryFileName?: string
            files: Record<string, string>
            optimize?: string
            panic?: 'print' | 'trap'
            scheduler?: 'none' | 'tasks' | 'asyncify'
            target?: 'wasip1'
          }) => Promise<{
            artifact: { bytes: Uint8Array; entrypoint: '_start' | '_initialize' | null; path: string; size: number }
            target: string
            targetInfo: { scheduler: string }
            toolchain: { version: string }
          }>
        }
        const result =
          payload.files && Object.keys(payload.files).length > 0
            ? await compilerModule.compileTinyGoHostWorkspace({
                entryFileName: payload.entryFileName || 'main.go',
                files: payload.files,
                optimize: payload.optimize,
                panic: payload.panic,
                scheduler: payload.scheduler,
                target: payload.target,
              })
            : await compilerModule.compileTinyGoHostSource({
                optimize: payload.optimize,
                panic: payload.panic,
                scheduler: payload.scheduler,
                source: payload.source || '',
                target: payload.target,
              })
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({
            artifact: {
              bytesBase64: Buffer.from(result.artifact.bytes).toString('base64'),
              entrypoint: result.artifact.entrypoint,
              path: result.artifact.path,
              runnable: result.artifact.entrypoint !== null,
            },
            logs: [
              `tinygo host compile ready: target=${result.target} scheduler=${result.targetInfo.scheduler || 'unknown'} version=${result.toolchain.version}`,
              `tinygo host artifact built: ${result.artifact.path} (${result.artifact.size} bytes)`,
            ],
          }),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        res.statusCode =
          message.includes('TinyGo release fetch failed') || message.includes('toolchain')
            ? 503
            : 422
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: message }))
      }
    })
  }

  return {
    configurePreviewServer(server: { middlewares: { use: (handler: (...args: any[]) => unknown) => void } }) {
      installMiddleware(server.middlewares)
    },
    configureServer(server: { middlewares: { use: (handler: (...args: any[]) => unknown) => void } }) {
      installMiddleware(server.middlewares)
    },
    name: 'tinygo-host-compile',
  }
}

export default defineConfig({
  plugins: [createTinyGoHostCompilePlugin()],
  build: {
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        app: path.resolve(__dirname, 'index.html'),
        runtime: path.resolve(__dirname, 'src/runtime-entry.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => (chunkInfo.name === 'runtime' ? 'runtime.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
