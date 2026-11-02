import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// One id per build. The running app compares it with /version.json (never
// cached) and updates itself when a newer build is live — nobody has to know
// about hard refreshes.
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12) || `${Date.now().toString(36)}`
const BUILT_AT = new Date().toISOString()

function versionFile(): Plugin {
  return {
    name: 'influenceflow-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: BUILD_ID, builtAt: BUILT_AT }) })
    },
    // Dev server: answer /version.json too, so the checker never 404s locally.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.includes('version.json')) return next()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ version: BUILD_ID, builtAt: BUILT_AT }))
      })
    },
  }
}

// GitHub Pages project site: https://dhurimhalili.github.io/influenceflow-crm/
export default defineConfig({
  plugins: [react(), versionFile()],
  base: '/influenceflow-crm/',
  // Pure modules shared with the edge functions (negotiation rules) live in supabase/functions/_shared.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), path.resolve(__dirname, '../supabase/functions/_shared')] } },
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_ID),
    __APP_BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})

