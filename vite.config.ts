/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'public/**'],
    setupFiles: ['./src/test/setup.ts'],
  },
  build: {
    target: 'es2022',
    // Three.js / R3F 留在按需加载的空间场景分包里，是可选三维运行时，不是首屏外壳。
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('/three/') ||
            id.includes('@react-three') ||
            id.includes('three-stdlib') ||
            id.includes('camera-controls') ||
            id.includes('/postprocessing/') ||
            id.includes('/gsap/') ||
            id.includes('@gsap/')
          ) return 'spatial-runtime';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) return 'react-runtime';
          if (id.includes('/motion/') || id.includes('framer-motion')) return 'motion-runtime';
          return undefined;
        },
      },
    },
  },
});
