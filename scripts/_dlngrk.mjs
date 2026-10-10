// Download ngrok 3.39.11 to the project dir so it's in a trusted location
import { createWriteStream } from 'fs';
import { mkdirSync, chmodSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const destDir = resolve(__dirname, '..');
const exePath = resolve(destDir, 'ngrok.exe');

const URL = 'https://bin.equinox.io/a/cJk8dzafvmN/ngrok-v3-3.3.1-windows-amd64.zip';

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = createWriteStream(dest);
    proto.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (e) => { reject(e); });
  });
}

console.log('Downloading ngrok...');
await download(URL, exePath.replace('.exe', '.zip'));
console.log('Downloaded to:', exePath.replace('.exe', '.zip'));

// For now just confirm the zip downloaded
const { statSync } = await import('fs');
const zipPath = exePath.replace('.exe', '.zip');
if (existsSync(zipPath)) {
  console.log('ZIP size:', statSync(zipPath).size, 'bytes');
}
