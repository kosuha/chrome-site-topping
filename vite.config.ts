import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig(({ command, mode }) => {
  const isDevPreview = process.env.DEV_PREVIEW === 'true';
  
  if (isDevPreview) {
    // 개발 미리보기 모드
    return {
      plugins: [react()],
      server: {
        open: '/dev.html'
      }
    };
  }
  
  // 일반 개발/빌드 모드 (Chrome Extension)
  return {
    plugins: [
      react(),
      crx({ manifest })
    ],
    build: {
      rollupOptions: {
        input: {
          background: 'src/background.ts',
          content: 'src/content.tsx'
        }
      }
    }
  };
})