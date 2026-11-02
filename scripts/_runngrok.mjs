// Robust ngrok download + extract + launch
import { createWriteStream, chmodSync, existsSync, unlinkSync } from 'fs';
import { mkdirSync, createReadStream } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const destDir = resolve(__dirname, '..');
const zipPath = resolve(destDir, 'ngrok-stable-windows-amd64.zip');
const exePath = resolve(destDir, 'ngrok.exe');

// Download with redirect follow
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const handleResponse = (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        console.log(`Redirected to: ${res.headers.location}`);
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    };
    proto.get(url, handleResponse).on('error', reject);
  });
}

// Extract zip manually (no external deps needed)
async function extractZip(zipPath, outDir) {
  const { createGunzip } = await import('zlib');
  const { PassThrough } = await import('stream');
  const { EntryMetadata } = await import('./_zipinfo.mjs').catch(() => null) || {};

  // Use PowerShell to extract
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force; Write-Host 'OK'`
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    ps.stdout.on('data', d => out += d);
    ps.stderr.on('data', d => process.stderr.write(d));
    ps.on('close', code => {
      if (code === 0 && out.includes('OK')) resolve();
      else reject(new Error(`Extract failed: ${code} ${out}`));
    });
  });
}

async function main() {
  const url = 'https://bin.equinox.io/a/cJk8dzafvmN/ngrok-v3-3.3.1-windows-amd64.zip';
  console.log('Downloading ngrok...');
  await downloadFile(url, zipPath);
  console.log('Downloaded!');

  // Extract to ngrok-bin dir
  const extractDir = resolve(destDir, 'ngrok-bin');
  if (existsSync(extractDir)) {
    for (const f of ['ngrok.exe', 'ngrok']) {
      try { unlinkSync(resolve(extractDir, f)); } catch {}
    }
  }
  mkdirSync(extractDir, { recursive: true });

  console.log('Extracting...');
  await extractZip(zipPath, extractDir);

  // Find the exe inside extracted dir
  const files = [];
  const { readdirSync } = await import('fs');
  try {
    readdirSync(extractDir).forEach(f => {
      if (f.endsWith('.exe') || f === 'ngrok') files.push(f);
    });
  } catch {}
  console.log('Extracted files:', files);

  const finalExe = resolve(extractDir, 'ngrok.exe');
  if (existsSync(finalExe)) {
    console.log('ngrok.exe found at:', finalExe);
    // Unblock via PowerShell
    const unblock = spawn('powershell', ['-NoProfile', '-Command', `Unblock-File -Path '${finalExe}'`]);
    await new Promise(r => unblock.on('close', r));

    console.log('Launching ngrok tunnel on port 8787...');
    const ngrok = spawn(finalExe, ['http', '8787', '--host-header=localhost'], {
      stdio: 'inherit',
      detached: true,
    });
    ngrok.unref();
    await new Promise(r => setTimeout(r, 5000));
    console.log('Done — check ngrok dashboard for your live URL.');
  } else {
    console.error('ERROR: ngrok.exe not found after extract!');
    console.error('Files in extract dir:', files);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
