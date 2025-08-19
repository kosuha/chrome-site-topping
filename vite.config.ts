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
      // 큰 의존성을 분리해 청크 크기 분산
      rollupOptions: {
        input: {
          background: 'src/background.ts',
          content: 'src/content.tsx',
          sidepanel: 'src/sidepanel.tsx'
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react')) return 'vendor-react';
              if (id.includes('@uiw') || id.includes('codemirror')) return 'vendor-codemirror';
              if (id.includes('@supabase')) return 'vendor-supabase';
              if (id.includes('lucide-react')) return 'vendor-icons';
            }
          }
        }
      },
      // 경고 임계치 완만 상향(필요시 조정)
      chunkSizeWarningLimit: 900
    }
  };
})