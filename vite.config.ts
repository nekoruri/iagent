import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { cspPlugin } from './vite-plugins/csp'

export default defineConfig({
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      manifest: {
        name: 'iAgent',
        short_name: 'iAgent',
        description: 'ブラウザ上で動作するパーソナルAIアシスタント',
        theme_color: '#0f0f0f',
        background_color: '#0f0f0f',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@openai/') || id.includes('node_modules/openai/')) {
            return 'vendor-agent';
          }
          if (id.includes('node_modules/@modelcontextprotocol/')) {
            return 'vendor-mcp';
          }
          if (id.includes('node_modules/zod/')) {
            return 'vendor-zod';
          }
          if (id.includes('node_modules/marked/') || id.includes('node_modules/dompurify/')) {
            return 'vendor-markdown';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/brave': {
        target: 'https://api.search.brave.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/brave/, ''),
      },
      '/api/weather': {
        target: 'https://api.openweathermap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/weather/, ''),
      },
      '/api/proxy': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy/, '/proxy'),
      },
      '/api/otel': {
        target: 'http://localhost:4318',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/otel/, ''),
      },
    },
  },
})
