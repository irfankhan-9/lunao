import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Official Lunao Logo SVG: Rich Royal Blue Background with Crisp White Bold 'L'
const lunaoLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="lunaoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#1D4ED8" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.18" />
    </filter>
  </defs>

  <!-- Blue Squircle Background -->
  <rect width="512" height="512" rx="124" fill="url(#lunaoGrad)" />
  <rect width="510" height="510" x="1" y="1" rx="123" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" />

  <!-- Bold Modern White 'L' -->
  <path d="M 164 126 C 164 118 170 114 178 114 L 226 114 C 234 114 240 118 240 126 L 240 324 L 340 324 C 348 324 354 330 354 338 L 354 384 C 354 392 348 396 340 396 L 178 396 C 170 396 164 392 164 384 Z" 
        fill="#FFFFFF" 
        filter="url(#shadow)" />
</svg>`;

// Maskable version (for Android adaptive icons) with safe margins
const maskableLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="lunaoGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#1D4ED8" />
    </linearGradient>
  </defs>
  <!-- Full-bleed background for maskable -->
  <rect width="512" height="512" fill="url(#lunaoGradMask)" />
  <!-- Centered Bold White L within safe zone -->
  <path d="M 174 136 C 174 128 180 124 188 124 L 232 124 C 240 124 246 128 246 136 L 246 324 L 332 324 C 340 324 346 330 346 338 L 346 380 C 346 388 340 392 332 392 L 188 392 C 180 392 174 388 174 380 Z" fill="#FFFFFF" />
</svg>`;

async function main() {
  console.log('Generating Lunao brand icons...');
  const svgBuffer = Buffer.from(lunaoLogoSvg);
  const maskableBuffer = Buffer.from(maskableLogoSvg);

  const png512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer();
  const png192 = await sharp(svgBuffer).resize(192, 192).png().toBuffer();
  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const pngMaskable512 = await sharp(maskableBuffer).resize(512, 512).png().toBuffer();

  // Targets
  const targetDirs = [
    'public',
    'dist',
    'lunaoownerpwa/public',
    'public/owner'
  ];

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // SVG icons
    fs.writeFileSync(path.join(dir, 'icon.svg'), lunaoLogoSvg, 'utf8');
    fs.writeFileSync(path.join(dir, 'favicon.svg'), lunaoLogoSvg, 'utf8');

    // PNG icons
    fs.writeFileSync(path.join(dir, 'pwa-512x512.png'), png512);
    fs.writeFileSync(path.join(dir, 'pwa-192x192.png'), png192);
    fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), png192);
    fs.writeFileSync(path.join(dir, 'pwa-maskable-512x512.png'), pngMaskable512);

    // Favicon (32x32 PNG as ico)
    fs.writeFileSync(path.join(dir, 'favicon.ico'), png32);
    fs.writeFileSync(path.join(dir, 'favicon.png'), png32);

    console.log(`✅ Icons generated for: ${dir}`);
  }

  // Also update root directory favicon.ico and favicon.svg
  fs.writeFileSync('favicon.ico', png32);
  fs.writeFileSync('favicon.svg', lunaoLogoSvg, 'utf8');

  // Update manifest files in lunaoownerpwa and public/owner
  const manifestPaths = [
    'lunaoownerpwa/public/manifest.json',
    'public/owner/manifest.json'
  ];

  for (const mPath of manifestPaths) {
    if (fs.existsSync(mPath)) {
      const json = JSON.parse(fs.readFileSync(mPath, 'utf8'));
      json.theme_color = '#2563EB';
      json.background_color = '#2563EB';
      fs.writeFileSync(mPath, JSON.stringify(json, null, 2), 'utf8');
      console.log(`✅ Updated theme_color to #2563EB in: ${mPath}`);
    }
  }

  console.log('All icons generated successfully!');
}

main().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
