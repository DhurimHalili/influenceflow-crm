import { createHash } from 'node:crypto'
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

// GitHub Pages can't send response headers, so the built index.html carries its
// own Content-Security-Policy <meta>. Inline scripts are allowed by hash only
// (computed here, so editing them can never silently break the page). Build
// only: the dev server injects its own inline scripts and HMR socket.
function contentSecurityPolicy(): Plugin {
  let supabase = ''
  return {
    name: 'influenceflow-csp',
    apply: 'build',
    configResolved(config) {
      const url = config.env.VITE_SUPABASE_URL
      if (url) supabase = new URL(url).host
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          // Browsers hash the parsed text, where CRLF is already LF (Windows checkouts).
          .map((m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`)
        const api = supabase ? ` https://${supabase} wss://${supabase}` : ''
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          // Pictures are signed URLs from the private avatars bucket; blob/data = the crop editor + favicon frames.
          `img-src 'self' data: blob:${supabase ? ` https://${supabase}` : ''}`,
          `connect-src 'self'${api} https://api.pwnedpasswords.com`,
          "frame-src 'self'",
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          'upgrade-insecure-requests',
        ].join('; ')
        return html.replace(
          /<meta charset="UTF-8" \/>/,
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
        )
      },
    },
  }
}

// GitHub Pages project site: https://dhurimhalili.github.io/influenceflow-crm/
export default defineConfig({
  plugins: [react(), versionFile(), contentSecurityPolicy()],
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

