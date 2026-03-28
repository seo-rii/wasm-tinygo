import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
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
