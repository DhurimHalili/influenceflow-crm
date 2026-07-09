import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://dhurimhalili.github.io/influenceflow-crm/
export default defineConfig({
  plugins: [react()],
  base: '/influenceflow-crm/',
})
