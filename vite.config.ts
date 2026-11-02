import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {},
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        // The pipeline writes per-site HTML to ./sites/<slug>/index.html
        // (and the API proxies /sites/* -> :8787 for DRY_RUN previews).
        // Vite's default file watcher picks those up as full-page reload
        // events, which kicks the user back to the Dashboard mid-deploy.
        // Ignore the generated sites directory so the dev server only
        // reacts to real source-file changes.
        ignored: [
          '**/sites/**',
          '**/server/.data/**',
          '**/server/.sites/**',
        ],
      },
      // Proxy the real pipeline backend (Express on :8787) during development.
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          // SSE streams from /api/campaign/run and /api/site-deploy/run can run
          // 50–120 s (Cloudflare deploy + SMS dispatch). Bump timeout to 3 min.
          timeout: 180_000,
        },
        '/sites': { target: 'http://localhost:8787', changeOrigin: true },
      },
    },
  };
});
