import fs from 'fs';

const filesToPatch = [
  'public/templates-raw/hvac-template-02.html',
  'public/hvac-template-02.html',
  'hvac-template-02.html',
  'public/templates-raw/barber-template-03.html',
  'public/barber-template-03.html',
  'barber-template-03.html',
  'public/templates-raw/salon-template-02.html',
  'public/salon-template-02.html',
  'salon-template-02.html',
  'public/templates-raw/gym-template-02.html',
  'public/gym-template-02.html',
  'gym-template-02.html',
  'sites/summit-befrnfarber-hub-austin/index.html',
];

const swUnregisterScript = `<script>
    // Immediate kill-switch for any stale service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (var i = 0; i < registrations.length; i++) {
          registrations[i].unregister();
        }
      });
    }
  </script>`;

for (const relPath of filesToPatch) {
  if (!fs.existsSync(relPath)) continue;
  let html = fs.readFileSync(relPath, 'utf8');
  let modified = false;

  // 1. Ensure stale Service Worker registration is completely removed
  if (html.includes("navigator.serviceWorker.register('/sw.js')")) {
    html = html.replace(/navigator\.serviceWorker\.register\('\/sw\.js'\)[\s\S]*?\.catch\(error => \{[\s\S]*?\}\);/g, '/* Service worker registration removed */');
    modified = true;
  }

  // 2. Inject unregister script if not already present
  if (!html.includes('// Immediate kill-switch for any stale service workers')) {
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n  ${swUnregisterScript}`);
      modified = true;
    }
  }

  // 3. Patch walk / hydrateDOMPlaceholders with robust guards:
  // - Skip script & style tags
  // - Ensure key is non-empty string of length >= 2
  // - Guard text & attribute replaceAll
  const oldWalkTarget = `      // Hydrate text nodes and attribute values across static DOM
      const walk = (node) => {
        if (node.nodeType === 3) { // Text node
          let text = node.nodeValue;
          let changed = false;
          replacements.forEach(([key, val]) => {
            if (text.includes(key)) {
              text = text.replaceAll(key, val);
              changed = true;
            }
          });
          if (changed) node.nodeValue = text;
        } else if (node.nodeType === 1) { // Element node
          ['href', 'src', 'alt', 'title', 'aria-label'].forEach(attr => {
            if (node.hasAttribute(attr)) {
              let val = node.getAttribute(attr);
              let changed = false;
              replacements.forEach(([k, v]) => {
                if (val.includes(k)) {
                  val = val.replaceAll(k, v);
                  changed = true;
                }
              });
              if (changed) node.setAttribute(attr, val);
            }
          });
          for (let child of node.childNodes) {
            walk(child);
          }
        }
      };`;

  const newWalkReplacement = `      // Hydrate text nodes and attribute values across static DOM
      const walk = (node) => {
        if (!node) return;
        if (node.nodeType === 1 && (node.tagName === 'SCRIPT' || node.tagName === 'STYLE')) return;
        if (node.nodeType === 3) { // Text node
          let text = node.nodeValue;
          if (!text) return;
          let changed = false;
          replacements.forEach(([key, val]) => {
            if (key && typeof key === 'string' && key.trim().length > 1 && text.includes(key)) {
              text = text.replaceAll(key, val || '');
              changed = true;
            }
          });
          if (changed) node.nodeValue = text;
        } else if (node.nodeType === 1) { // Element node
          ['href', 'src', 'alt', 'title', 'aria-label'].forEach(attr => {
            if (node.hasAttribute(attr)) {
              let val = node.getAttribute(attr);
              if (!val) return;
              let changed = false;
              replacements.forEach(([k, v]) => {
                if (k && typeof k === 'string' && k.trim().length > 1 && val.includes(k)) {
                  val = val.replaceAll(k, v || '');
                  changed = true;
                }
              });
              if (changed) node.setAttribute(attr, val);
            }
          });
          for (let child of node.childNodes) {
            walk(child);
          }
        }
      };`;

  if (html.includes(oldWalkTarget)) {
    html = html.replace(oldWalkTarget, newWalkReplacement);
    modified = true;
  }

  // 4. Specifically for summit-befrnfarber-hub-austin, fix empty strings in replacements array
  if (relPath.includes('summit-befrnfarber-hub-austin')) {
    html = html.replace(/\['',\s*business\.city\]/g, "['Austin, TX', business.city]");
    html = html.replace(/\['',\s*business\.phone\]/g, "['(512) 555-0842', business.phone]");
    html = html.replace(/\['',\s*business\.bookingUrl\]/g, "['#booking', business.bookingUrl]");
    html = html.replace(/\['',\s*business\.instagram\]/g, "['https://instagram.com/summitbarber', business.instagram]");
    html = html.replace(/\['',\s*business\.tiktok\]/g, "['https://tiktok.com/@summitbarber', business.tiktok]");
    html = html.replace(/\['',\s*business\.youtube\]/g, "['https://youtube.com/@summitbarber', business.youtube]");
    html = html.replace(/\['',\s*business\.googleMaps\]/g, "['https://maps.google.com/?q=Summit+Barber+Austin', business.googleMaps]");
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(relPath, html, 'utf8');
    console.log(`✅ Successfully patched ${relPath}`);
  } else {
    console.log(`ℹ️ No changes needed for ${relPath}`);
  }
}
