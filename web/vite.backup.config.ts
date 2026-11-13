import { defineConfig } from 'vite'

// Compiles src/lib/backupBook.ts (and the export code it shares with the app) into one plain module
// the weekly-report function can import. Run by `npm run build`, so the server copy never drifts.
export default defineConfig({
  logLevel: 'warn',
  build: {
    lib: { entry: 'src/lib/backupBook.ts', formats: ['es'], fileName: () => 'backupBook.js' },
    outDir: '../supabase/functions/_shared/generated',
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
    copyPublicDir: false,
    reportCompressedSize: false,
  },
})
