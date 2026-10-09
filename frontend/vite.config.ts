/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 开发与生产预览共用同一份 /api 代理定义，避免 dev / preview 行为分叉。
  // 目标默认 8787（与既有 dev 约定一致），可用 AGRISCOPE_API_TARGET 覆盖
  // （例如把 production preview 指向独立端口的 production-like backend）。
  const API_PROXY_TARGET = loadEnv(mode, '.', 'AGRISCOPE_').AGRISCOPE_API_TARGET || 'http://127.0.0.1:8787';
  const apiProxy = { '/api': { target: API_PROXY_TARGET } };

  return {
    plugins: [react()],
    server: { host: true, port: 5173, proxy: apiProxy },
    // production preview 必需：与 server.proxy 完全一致的 /api 代理，否则 `vite preview` 下所有 /api 请求都会 404。
    preview: { proxy: apiProxy },
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
  };
});
