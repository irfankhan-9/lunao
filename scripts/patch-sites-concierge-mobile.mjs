// scripts/patch-sites-concierge-mobile.mjs
// Ensures all compiled client sites using the concierge toggle render ONLY the single magic emoji on mobile.

import fs from 'fs';
import path from 'path';

const CSS_SNIPPET = `<style id="lunao-fab-mobile-lock">
@media (max-width: 900px) {
  .atelier-concierge-fab-container {
    bottom: calc(18px + env(safe-area-inset-bottom, 0px)) !important;
    right: 16px !important;
  }
  .atelier-concierge-fab {
    width: 48px !important;
    height: 48px !important;
    min-width: 48px !important;
    max-width: 48px !important;
    padding: 0 !important;
    border-radius: 50% !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 0 !important;
    box-shadow: 0 8px 24px rgba(61, 43, 31, 0.2), 0 0 16px rgba(184, 134, 11, 0.28) !important;
    overflow: hidden !important;
  }
  .atelier-concierge-fab .fab-label-text,
  .atelier-concierge-fab .fab-chevron,
  .atelier-concierge-fab span:not(.brand-spinner-icon) {
    display: none !important;
    visibility: hidden !important;
    width: 0 !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    font-size: 0 !important;
    line-height: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  .atelier-concierge-fab .brand-spinner-icon {
    font-size: 1.45rem !important;
    line-height: 1 !important;
    margin: 0 !important;
    padding: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
}
</style>`;

const sitesDir = path.resolve('sites');
const entries = fs.readdirSync(sitesDir, { withFileTypes: true });

let patchedCount = 0;

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const indexPath = path.join(sitesDir, entry.name, 'index.html');
  if (!fs.existsSync(indexPath)) continue;

  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('atelier-concierge-fab')) continue;

  let modified = false;

  // 1. Update button markup to use .fab-label-text if needed
  if (html.includes('<span>CONCIERGE</span>')) {
    html = html.replace('<span>CONCIERGE</span>', '<span class="fab-label-text">CONCIERGE</span>');
    modified = true;
  }

  // 2. Ensure CSS lock snippet is present right before </head>
  if (!html.includes('id="lunao-fab-mobile-lock"')) {
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${CSS_SNIPPET}\n</head>`);
      modified = true;
    } else if (html.includes('</style>')) {
      html = html.replace('</style>', `${CSS_SNIPPET}\n</style>`);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(indexPath, html, 'utf8');
    patchedCount++;
    if (entry.name === 'irfan-kh-cedar-park' || patchedCount <= 5) {
      console.log(`Patched site: ${entry.name}`);
    }
  }
}

console.log(`Successfully patched ${patchedCount} sites in sites/ directory.`);
