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
    // code/ 下是本地 git worktree 与审核隔离副本（各自有独立 .git），
    // 不是本工程源码，禁止被测试收集（CODE-07A 验收发现污染：353 文件混入）。
    exclude: ['**/node_modules/**', 'code/**', 'dist/**'],
  },
})
