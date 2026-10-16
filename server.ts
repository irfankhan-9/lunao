import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable immediate standalone listen in server/index.js so we can attach Vite middlewares
process.env.NO_SERVER_LISTEN = 'true';
const { app, startBackgroundServices } = await import('./server/index.js');

const PORT = Number(process.env.PORT) || 3000;
const isDev = process.env.NODE_ENV !== 'production';

const PWA_DIST = path.resolve(__dirname, 'lunaoownerpwa', 'dist');
app.use('/owner', (req, res, next) => {
  if (fs.existsSync(PWA_DIST)) {
    if (req.path === '/' || req.path === '' || !req.path.includes('.')) {
      return res.sendFile(path.resolve(PWA_DIST, 'index.html'));
    }
    return express.static(PWA_DIST)(req, res, () => {
      res.sendFile(path.resolve(PWA_DIST, 'index.html'));
    });
  }
  next();
});

if (isDev) {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  if (typeof startBackgroundServices === 'function') {
    startBackgroundServices();
  }
  console.log(`\n🚀 Lunao Full-Stack running on http://0.0.0.0:${PORT}\n`);
});
