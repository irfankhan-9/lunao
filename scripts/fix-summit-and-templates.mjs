import fs from 'fs';

function patchHtmlFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let html = fs.readFileSync(filePath, 'utf8');
  const original = html;

  // 1. Remove any SW register calls
  html = html.replace(/navigator\.serviceWorker\.register\('\/sw\.js'\)[\s\S]*?\.catch\(error => \{[\s\S]*?\}\);/g, '/* sw disabled */');

  // 2. Ensure SW unregister kill switch is in <head>
  if (!html.includes('id="sw-killswitch"')) {
    const swKillSwitch = `<script id="sw-killswitch">
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (var i = 0; i < registrations.length; i++) {
          registrations[i].unregister();
        }
      });
    }
  </script>`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n  ${swKillSwitch}`);
    }
  }

  // 3. Fix empty string keys in replacements array
  html = html.replace(/\['',\s*business\.city\]/g, "['Austin, TX', business.city]");
  html = html.replace(/\['',\s*business\.phone\]/g, "['(512) 555-0842', business.phone]");
  html = html.replace(/\['',\s*business\.bookingUrl\]/g, "['#booking', business.bookingUrl]");
  html = html.replace(/\['',\s*business\.instagram\]/g, "['https://instagram.com/summitbarber', business.instagram]");
  html = html.replace(/\['',\s*business\.tiktok\]/g, "['https://tiktok.com/@summitbarber', business.tiktok]");
  html = html.replace(/\['',\s*business\.youtube\]/g, "['https://youtube.com/@summitbarber', business.youtube]");
  html = html.replace(/\['',\s*business\.googleMaps\]/g, "['https://maps.google.com/?q=Summit+Barber+Austin', business.googleMaps]");

  // 4. Robust guard in walk function to completely avoid empty string replacement
  const walkStart = html.indexOf('const walk = (node) => {');
  if (walkStart !== -1) {
    const walkEnd = html.indexOf('walk(document.body);', walkStart);
    if (walkEnd !== -1) {
      const safeWalk = `const walk = (node) => {
        if (!node) return;
        if (node.nodeType === 1 && (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT')) return;
        if (node.nodeType === 3) {
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
          return;
        }
        if (node.nodeType === 1) {
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
      };

      `;
      html = html.substring(0, walkStart) + safeWalk + html.substring(walkEnd);
    }
  }

  // 5. Ensure transition veil is permanently hidden
  html = html.replace('class="page-transition-veil active"', 'class="page-transition-veil"');
  if (!html.includes('.page-transition-veil { display: none !important;')) {
    html = html.replace('.page-transition-veil {', '.page-transition-veil { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;');
  }

  if (html !== original) {
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✅ Patched: ${filePath}`);
    return true;
  } else {
    console.log(`ℹ️ Already up-to-date: ${filePath}`);
    return false;
  }
}

const targetFiles = [
  'sites/summit-befrnfarber-hub-austin/index.html',
  'public/barber-template-03.html',
  'barber-template-03.html',
  'public/salon-template-02.html',
  'salon-template-02.html',
  'public/gym-template-02.html',
  'gym-template-02.html',
  'public/hvac-template-02.html',
  'hvac-template-02.html',
  'public/templates-raw/barber-template-03.html',
  'public/templates-raw/salon-template-02.html',
  'public/templates-raw/gym-template-02.html',
  'public/templates-raw/hvac-template-02.html',
];

targetFiles.forEach(f => {
  try {
    patchHtmlFile(f);
  } catch (err) {
    console.error(`❌ Error patching ${f}:`, err.message);
  }
});
