import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // The PWA's dev server proxies all /api/* traffic to the Lunao backend
      // on :8787 so the same-origin auth headers (cookies, bearer tokens)
      // work without CORS gymnastics. Change the target via the
      // LUNAO_API_BASE_URL env var when proxying to a remote backend.
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: process.env.LUNAO_API_BASE_URL || 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
          ws: false,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      // Single-bundle build so a single global PWA at owner.lunao.com can be
      // hosted statically without per-tenant rebuilds.
      target: 'es2020',
      sourcemap: false,
    },
  };
});
