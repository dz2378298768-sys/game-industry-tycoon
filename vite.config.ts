import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@simulation': path.resolve(__dirname, 'src/simulation'),
      '@content': path.resolve(__dirname, 'src/content'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@app': path.resolve(__dirname, 'src/app'),
      '@i18n': path.resolve(__dirname, 'src/i18n'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
