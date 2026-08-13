import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: '文言文背诵',
        short_name: '文言文',
        description: '面向中小学生的文言文渐进式背诵闯关应用',
        lang: 'zh-CN',
        theme_color: '#FF7043',
        background_color: '#FFF8F0',
        display: 'standalone',
        start_url: '.',
        scope: '/',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 只缓存静态应用资源；启动和数据读取仍必须连接云端 API。
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  // 开发环境代理：前端请求 /gushiwen/* 转发到古诗文库（该站 CORS 不通，必须走代理）
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8878',
        changeOrigin: true,
      },
      '/gushiwen': {
        target: 'http://127.0.0.1:8878',
        changeOrigin: true,
      },
    },
  },
});
