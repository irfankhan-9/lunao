// Self-contained, brand-consistent booking + chatbot widget injector.
// The widget is injected ONLY into compiled/deployed site HTML (server/.sites/),
// never into public/templates-raw/ (AGENTS.md). It is fully scoped under
// `.lunao-w`, bakes in a configurable apiBase, and works on all 8 templates.
import { db } from './db.js';
import { PUBLIC_API_BASE_URL } from './config.js';
import { readSite, writeSite, nicheFromHtml, titleFromHtml } from './sites.js';

const START = '<!-- LUNAO_WIDGETS:START -->';
const END = '<!-- LUNAO_WIDGETS:END -->';

// Per-niche brand theme — these are the templates' REAL palette values, used
// only as a fallback. At runtime the widget auto-detects each page's actual
// brand color / font / radius (see detectTheme in buildScript) so it always
// matches the live site exactly, even for edited or future templates.
const THEME_BY_NICHE = {
  Barber: { accent: '#C9A96E', accentDark: '#1a1712', radius: '4px', font: "'Playfair Display', Georgia, serif", label: 'Book a Chair' },
  Salon: { accent: '#C4856A', accentDark: '#2a1620', radius: '10px', font: "'Fraunces', Georgia, serif", label: 'Book Now' },
  Dentist: { accent: '#0EA5A0', accentDark: '#0b3b3a', radius: '14px', font: "'Plus Jakarta Sans', system-ui, sans-serif", label: 'Book a Visit' },
  HVAC: { accent: '#0A4D8C', accentDark: '#072e54', radius: '12px', font: "'Manrope', system-ui, sans-serif", label: 'Book Service' },
  Gym: { accent: '#F59E0B', accentDark: '#111827', radius: '8px', font: "'Inter', system-ui, sans-serif", label: 'Book a Session' },
  Roofing: { accent: '#C45E04', accentDark: '#1a1a18', radius: '6px', font: "system-ui, sans-serif", label: 'Get a Quote' },
  'Real Estate': { accent: '#C9A86A', accentDark: '#111111', radius: '2px', font: "'Playfair Display', Georgia, serif", label: 'Book a Tour' },
  Site: { accent: '#6d5cff', accentDark: '#15132a', radius: '16px', font: "system-ui, sans-serif", label: 'Book Now' },
};

const SERVICES_BY_NICHE = {
  Barber: ['Classic Haircut', 'Skin Fade', 'Beard Trim', 'Hot Towel Shave', 'Hair + Beard Combo'],
  Salon: ['Haircut & Style', 'Color & Highlights', 'Blowout', 'Keratin Treatment', 'Manicure'],
  Dentist: ['Checkup & Cleaning', 'Teeth Whitening', 'Filling', 'Crown', 'Emergency Visit'],
  HVAC: ['AC Repair', 'Heating Repair', 'Maintenance Tune-Up', 'New Installation', 'Inspection'],
  Gym: ['Free Trial Session', 'Personal Training', 'Group Class', 'Membership Tour', 'Nutrition Coaching'],
  Roofing: ['Free Roof Inspection', 'Roof Repair', 'Full Replacement', 'Gutter Service', 'Storm Damage'],
  'Real Estate': ['Buyer Consultation', 'Home Tour', 'Listing Appointment', 'Market Valuation', 'Investment Call'],
  Site: ['General Appointment', 'Consultation', 'Follow-up'],
};

function themeFor(niche) {
  return THEME_BY_NICHE[niche] || THEME_BY_NICHE.Site;
}

// Pull the clean business name out of "<Name> — <tagline> in <City>".
function businessNameFrom(html) {
  const title = titleFromHtml(html);
  if (!title) return 'Our Studio';
  return title.split(/[—\-|·:]/)[0].trim() || title;
}

function phoneFrom(html) {
  const m = html.match(/href=["']tel:([^"']+)["']/i);
  return m ? m[1].trim() : '';
}

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ---- Widget markup ---------------------------------------------------------

// Reusable inline SVG icons (currentColor so they inherit themed text color).
const CAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const CHAT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function buildBlock(cfg) {
  const theme = cfg.theme;
  const cfgJson = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const both = Boolean(cfg.booking && cfg.chatbot);
  const mono = (cfg.businessName || '?').trim().charAt(0).toUpperCase() || '?';

  const css = `
.lunao-w *{box-sizing:border-box;margin:0;padding:0}
.lunao-w{position:fixed;inset:0 0 auto auto;width:0;height:0;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.lunao-w .lw-h{font-family:var(--lw-font,inherit)}

/* ---- scrim ---- */
.lunao-w .lw-scrim{position:fixed;inset:0;background:rgba(10,10,12,.34);opacity:0;pointer-events:none;transition:opacity .25s ease;z-index:1}
.lunao-w .lw-scrim.show{opacity:1;pointer-events:auto}

/* ---- speed-dial dock ---- */
.lunao-w .lw-dock{position:fixed;right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:flex-end;gap:14px;z-index:2}
.lunao-w .lw-actions{display:flex;flex-direction:column;align-items:flex-end;gap:12px}
.lunao-w .lw-dock.lw-solo .lw-actions{display:none}
.lunao-w .lw-chip{border:0;background:transparent;padding:0;cursor:pointer;display:inline-flex;align-items:center;gap:11px;opacity:0;transform:translateY(14px) scale(.85);pointer-events:none;transition:opacity .25s ease,transform .3s cubic-bezier(.2,.9,.2,1)}
.lunao-w .lw-dock.open .lw-chip{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.lunao-w .lw-dock.open .lw-chip:nth-child(1){transition-delay:.05s}
.lunao-w .lw-dock.open .lw-chip:nth-child(2){transition-delay:.11s}
.lunao-w .lw-chip-label{background:#fff;color:#1a1a1a;font-weight:700;font-size:13px;padding:9px 14px;border-radius:999px;box-shadow:0 6px 22px rgba(0,0,0,.16);white-space:nowrap;font-family:var(--lw-font,inherit)}
.lunao-w .lw-chip-ic{width:46px;height:46px;border-radius:50%;background:var(--lw-accent);color:var(--lw-on-accent);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.22);flex-shrink:0;transition:transform .15s ease}
.lunao-w .lw-chip:hover .lw-chip-ic{transform:scale(1.07)}
.lunao-w .lw-chip-ic svg{width:21px;height:21px}

/* ---- launcher ---- */
.lunao-w .lw-launch{position:relative;width:62px;height:62px;border:0;cursor:pointer;border-radius:50%;background:var(--lw-accent);color:var(--lw-on-accent);box-shadow:0 14px 36px rgba(0,0,0,.30);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease;animation:lw-rise .55s cubic-bezier(.2,.8,.2,1)}
.lunao-w .lw-launch:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 18px 44px rgba(0,0,0,.34)}
.lunao-w .lw-launch:active{transform:scale(.95)}
.lunao-w .lw-launch span{position:absolute;display:flex;align-items:center;justify-content:center;transition:opacity .22s ease,transform .32s cubic-bezier(.2,.9,.2,1)}
.lunao-w .lw-launch span svg{width:27px;height:27px}
.lunao-w .lw-ic-close{opacity:0;transform:rotate(-90deg) scale(.5)}
.lunao-w .lw-dock.open .lw-ic-main{opacity:0;transform:rotate(90deg) scale(.5)}
.lunao-w .lw-dock.open .lw-ic-close{opacity:1;transform:rotate(0) scale(1)}
.lunao-w .lw-launch::after{content:'';position:absolute;inset:0;border-radius:50%;border:2px solid var(--lw-accent);opacity:0;animation:lw-ring 2.4s ease-out 1.4s 3}
.lunao-w .lw-dock.open .lw-launch::after{animation:none}

/* ---- attention tooltip ---- */
.lunao-w .lw-tip{position:absolute;right:74px;bottom:16px;background:#1a1a1a;color:#fff;font-size:12.5px;font-weight:600;padding:8px 13px;border-radius:10px;white-space:nowrap;box-shadow:0 10px 28px rgba(0,0,0,.26);opacity:0;transform:translateX(10px);pointer-events:none;transition:opacity .3s ease,transform .3s ease;font-family:var(--lw-font,inherit)}
.lunao-w .lw-tip.show{opacity:1;transform:translateX(0)}
.lunao-w .lw-tip::after{content:'';position:absolute;right:-5px;top:50%;margin-top:-5px;border:5px solid transparent;border-left-color:#1a1a1a}

/* ---- shared overlay/cards ---- */
.lunao-w .lw-overlay{position:fixed;inset:0;background:rgba(15,15,18,.55);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:18px;z-index:3;animation:lw-fade .25s ease}
.lunao-w .lw-overlay.open{display:flex}
.lunao-w .lw-card{width:100%;max-width:420px;max-height:92vh;overflow:auto;background:#fff;border-radius:var(--lw-radius);box-shadow:0 30px 80px rgba(0,0,0,.4);animation:lw-pop .3s cubic-bezier(.2,.9,.2,1)}
.lunao-w .lw-head{background:var(--lw-accent);color:var(--lw-on-accent);padding:16px 18px;display:flex;align-items:center;justify-content:space-between;border-radius:var(--lw-radius) var(--lw-radius) 0 0}
.lunao-w .lw-head-l{display:flex;align-items:center;gap:11px;min-width:0}
.lunao-w .lw-ava{width:38px;height:38px;border-radius:50%;background:var(--lw-accent-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;font-family:var(--lw-font,inherit)}
.lunao-w .lw-head h3{font-size:16.5px;font-weight:800;font-family:var(--lw-font,inherit);line-height:1.15}
.lunao-w .lw-head p{font-size:11.5px;opacity:.82;margin-top:2px}
.lunao-w .lw-on{display:inline-block;width:7px;height:7px;border-radius:50%;background:#33d17a;margin-right:5px;vertical-align:middle}
.lunao-w .lw-x{background:rgba(0,0,0,.14);border:0;color:currentColor;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:17px;line-height:1;flex-shrink:0;transition:background .15s}
.lunao-w .lw-x:hover{background:rgba(0,0,0,.24)}
.lunao-w .lw-body{padding:18px 20px}
.lunao-w .lw-field{margin-bottom:13px}
.lunao-w .lw-field label{display:block;font-size:12px;font-weight:700;color:#333;margin-bottom:5px}
.lunao-w .lw-field input,.lunao-w .lw-field select,.lunao-w .lw-field textarea{width:100%;border:1.5px solid #e3e3e3;border-radius:11px;padding:11px 13px;font-size:14px;font-family:inherit;background:#fafafa;transition:border-color .15s,box-shadow .15s}
.lunao-w .lw-field input:focus,.lunao-w .lw-field select:focus,.lunao-w .lw-field textarea:focus{outline:0;border-color:var(--lw-accent);box-shadow:0 0 0 3px var(--lw-accent-soft);background:#fff}
.lunao-w .lw-row{display:flex;gap:10px}.lunao-w .lw-row>*{flex:1}
.lunao-w .lw-submit{width:100%;border:0;cursor:pointer;background:var(--lw-accent);color:var(--lw-on-accent);font-weight:800;font-size:15px;padding:14px;border-radius:12px;margin-top:4px;transition:filter .15s,transform .12s}
.lunao-w .lw-submit:hover{filter:brightness(1.06)}.lunao-w .lw-submit:active{transform:scale(.98)}
.lunao-w .lw-submit:disabled{opacity:.6;cursor:default}
.lunao-w .lw-fine{display:block;text-align:center;font-size:11px;color:#999;margin-top:10px}
.lunao-w .lw-success{text-align:center;padding:26px 22px}
.lunao-w .lw-check{width:64px;height:64px;border-radius:50%;background:var(--lw-accent-soft);color:var(--lw-accent);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;animation:lw-pop .4s cubic-bezier(.2,.9,.2,1)}
.lunao-w .lw-check svg{width:32px;height:32px}
.lunao-w .lw-success h4{font-size:19px;font-weight:800;color:#1a1a1a;margin-bottom:6px;font-family:var(--lw-font,inherit)}
.lunao-w .lw-success p{font-size:13px;color:#666;line-height:1.5}

/* ---- chat panel ---- */
.lunao-w .lw-panel{position:fixed;right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(96px + env(safe-area-inset-bottom,0px));width:368px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100vh - 130px);background:#fff;border-radius:var(--lw-radius);box-shadow:0 26px 70px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;z-index:3;animation:lw-pop .28s cubic-bezier(.2,.9,.2,1)}
.lunao-w .lw-panel.open{display:flex}
.lunao-w .lw-panel .lw-head{border-radius:var(--lw-radius) var(--lw-radius) 0 0}
.lunao-w .lw-msgs{flex:1;overflow-y:auto;padding:16px;background:#f6f6f7;display:flex;flex-direction:column;gap:10px}
.lunao-w .lw-msg{max-width:82%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.45;animation:lw-rise .3s ease}
.lunao-w .lw-msg.bot{align-self:flex-start;background:#fff;color:#222;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.lunao-w .lw-msg.me{align-self:flex-end;background:var(--lw-accent);color:var(--lw-on-accent);border-bottom-right-radius:4px}
.lunao-w .lw-typing{align-self:flex-start;background:#fff;border-radius:14px;padding:12px 14px;display:flex;gap:4px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.lunao-w .lw-typing span{width:7px;height:7px;border-radius:50%;background:#bbb;animation:lw-blink 1.2s infinite}
.lunao-w .lw-typing span:nth-child(2){animation-delay:.2s}.lunao-w .lw-typing span:nth-child(3){animation-delay:.4s}
.lunao-w .lw-compose{display:flex;gap:8px;padding:12px;border-top:1px solid #eee;background:#fff}
.lunao-w .lw-compose input{flex:1;border:1.5px solid #e3e3e3;border-radius:999px;padding:11px 15px;font-size:14px;font-family:inherit}
.lunao-w .lw-compose input:focus{outline:0;border-color:var(--lw-accent);box-shadow:0 0 0 3px var(--lw-accent-soft)}
.lunao-w .lw-send{border:0;cursor:pointer;background:var(--lw-accent);color:var(--lw-on-accent);width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lunao-w .lw-send svg{width:18px;height:18px}

@keyframes lw-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes lw-fade{from{opacity:0}to{opacity:1}}
@keyframes lw-pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
@keyframes lw-blink{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@keyframes lw-ring{0%{opacity:.65;transform:scale(1)}100%{opacity:0;transform:scale(1.75)}}
@keyframes lw-sheet{from{transform:translateY(100%)}to{transform:translateY(0)}}

@media (max-width:480px){
  .lunao-w .lw-dock{right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px))}
  .lunao-w .lw-tip{display:none}
  .lunao-w .lw-overlay{align-items:flex-end;padding:0}
  .lunao-w .lw-card{max-width:100%;border-radius:20px 20px 0 0;max-height:94vh;animation:lw-sheet .32s cubic-bezier(.2,.9,.2,1)}
  .lunao-w .lw-panel{left:0;right:0;bottom:0;top:auto;width:100%;max-width:100%;height:84vh;max-height:90vh;border-radius:20px 20px 0 0;animation:lw-sheet .32s cubic-bezier(.2,.9,.2,1)}
}
@media (prefers-reduced-motion:reduce){.lunao-w *,.lunao-w *::after{animation:none!important;transition:opacity .15s ease!important}}
`;

  const chips = [];
  if (cfg.chatbot) {
    chips.push(`<button class="lw-chip" id="lw-act-chat" type="button" aria-label="Chat to book"><span class="lw-chip-label">Chat to book</span><span class="lw-chip-ic">${CHAT_SVG}</span></button>`);
  }
  if (cfg.booking) {
    chips.push(`<button class="lw-chip" id="lw-act-book" type="button" aria-label="${escapeHtml(theme.label)}"><span class="lw-chip-label">${escapeHtml(theme.label)}</span><span class="lw-chip-ic">${CAL_SVG}</span></button>`);
  }

  // Launcher's resting icon: booking-forward when available, else chat.
  const launchIcon = cfg.booking ? CAL_SVG : CHAT_SVG;
  const dockClass = both ? 'lw-dock' : 'lw-dock lw-solo';

  const serviceOptions = cfg.services.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  const timeSlots = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM']
    .map((t) => `<option value="${t}">${t}</option>`)
    .join('');

  const bookingModal = cfg.booking
    ? `<div class="lw-overlay" id="lw-book-overlay">
        <div class="lw-card" role="dialog" aria-modal="true">
          <div class="lw-head">
            <div class="lw-head-l">
              <span class="lw-ava">${escapeHtml(mono)}</span>
              <div><h3>${escapeHtml(theme.label)}</h3><p>${escapeHtml(cfg.businessName)}</p></div>
            </div>
            <button class="lw-x" id="lw-book-close" aria-label="Close">${CLOSE_SVG}</button>
          </div>
          <div class="lw-body" id="lw-book-body">
            <form id="lw-book-form">
              <div class="lw-field"><label>Your name</label><input name="name" type="text" required placeholder="Jane Doe"></div>
              <div class="lw-field"><label>Phone</label><input name="phone" type="tel" required placeholder="${escapeHtml(cfg.phone || '(555) 000-0000')}"></div>
              <div class="lw-field"><label>Service</label><select name="service" required>${serviceOptions}</select></div>
              <div class="lw-row">
                <div class="lw-field"><label>Date</label><input name="date" type="date" required></div>
                <div class="lw-field"><label>Time</label><select name="time" required>${timeSlots}</select></div>
              </div>
              <div class="lw-field"><label>Notes (optional)</label><textarea name="notes" rows="2" placeholder="Anything we should know?"></textarea></div>
              <button class="lw-submit" type="submit">Confirm Booking</button>
              <span class="lw-fine">We'll text you to confirm within minutes.</span>
            </form>
          </div>
        </div>
      </div>`
    : '';

  const chatPanel = cfg.chatbot
    ? `<div class="lw-panel" id="lw-chat-panel">
        <div class="lw-head">
          <div class="lw-head-l">
            <span class="lw-ava">${escapeHtml(mono)}</span>
            <div><h3>${escapeHtml(cfg.businessName)}</h3><p><span class="lw-on"></span>Booking assistant · online</p></div>
          </div>
          <button class="lw-x" id="lw-chat-close" aria-label="Close">${CLOSE_SVG}</button>
        </div>
        <div class="lw-msgs" id="lw-chat-msgs"></div>
        <form class="lw-compose" id="lw-chat-form">
          <input id="lw-chat-input" type="text" placeholder="Type your message…" autocomplete="off">
          <button class="lw-send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>
        </form>
      </div>`
    : '';

  const rootStyle = `--lw-accent:${theme.accent};--lw-accent-dark:${theme.accentDark};--lw-accent-soft:${hexA(theme.accent, 0.16)};--lw-on-accent:${onAccent(theme.accent)};--lw-radius:${theme.radius};--lw-font:${theme.font}`;

  const script = buildScript(cfgJson);

  return `${START}
<style>${css}</style>
<div class="lunao-w" id="lunao-widget-root" style="${rootStyle}">
  <div class="lw-scrim" id="lw-scrim"></div>
  <div class="${dockClass}" id="lw-dock">
    <div class="lw-tip" id="lw-tip">Book in seconds</div>
    <div class="lw-actions">${chips.join('')}</div>
    <button class="lw-launch" id="lw-launch" type="button" aria-label="Booking options">
      <span class="lw-ic-main">${launchIcon}</span>
      <span class="lw-ic-close">${CLOSE_SVG}</span>
    </button>
  </div>
  ${bookingModal}
  ${chatPanel}
</div>
<script>${script}</script>
${END}`;
}

// hex (or rgb string) + alpha -> rgba() for soft accent tints.
function hexA(hex, a) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(109,92,255,${a})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

function hexToRgb(hex) {
  const h = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(h)) return null;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Choose readable text color (dark vs white) for text sitting on the accent.
function onAccent(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum > 0.62 ? '#1a1a1a' : '#ffffff';
}

// Browser-side logic. Written with string concatenation (no template literals)
// so it survives being embedded inside this module's template string.
function buildScript(cfgJson) {
  return `(function(){
  if(window.__lunaoWidget)return;window.__lunaoWidget=true;
  var CFG=${cfgJson};
  var base=CFG.apiBase.replace(/\\/+$/,'');
  function $(id){return document.getElementById(id);}

  // ---- Sound (tiny Web Audio, brand-neutral) ----
  var AC=window.AudioContext||window.webkitAudioContext,ax=null;
  function tone(f,d,t,g){try{if(!ax)ax=new AC();var o=ax.createOscillator(),v=ax.createGain();o.type=t||'sine';o.frequency.value=f;o.connect(v);v.connect(ax.destination);var n=ax.currentTime;v.gain.setValueAtTime(0,n);v.gain.linearRampToValueAtTime(g||0.05,n+0.01);v.gain.exponentialRampToValueAtTime(0.0001,n+d);o.start(n);o.stop(n+d);}catch(e){}}
  var snd={open:function(){tone(523,0.12,'sine');setTimeout(function(){tone(784,0.14,'sine');},80);},
    expand:function(){tone(440,0.09,'sine');setTimeout(function(){tone(660,0.1,'sine');},55);},
    collapse:function(){tone(560,0.08,'sine');setTimeout(function(){tone(400,0.1,'sine');},55);},
    select:function(){tone(620,0.07,'triangle');},
    send:function(){tone(660,0.08,'triangle');},
    recv:function(){tone(440,0.1,'sine');},
    success:function(){tone(523,0.12);setTimeout(function(){tone(659,0.12);},90);setTimeout(function(){tone(880,0.2);},180);}};

  // ---- Runtime brand detection: make the widget match the live site ----
  function parseColor(s){if(!s)return null;s=s.trim();
    var h=s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(h){var x=h[1];if(x.length===3)x=x[0]+x[0]+x[1]+x[1]+x[2]+x[2];var n=parseInt(x,16);return[(n>>16)&255,(n>>8)&255,n&255,1];}
    var m=s.match(/rgba?\\(([^)]+)\\)/i);
    if(m){var p=m[1].split(',').map(function(v){return parseFloat(v);});return[p[0]||0,p[1]||0,p[2]||0,p.length>3?p[3]:1];}
    return null;}
  function lum(c){return(0.299*c[0]+0.587*c[1]+0.114*c[2])/255;}
  function extreme(c){var l=lum(c);return l>0.9||l<0.05;}
  function darken(c,a){return[Math.round(c[0]*(1-a)),Math.round(c[1]*(1-a)),Math.round(c[2]*(1-a))];}
  function css(c){return'rgb('+c[0]+','+c[1]+','+c[2]+')';}
  function findAccent(){
    var sels=['.btn-nav-book','.btn-primary','.btn-book','.btn-submit','.btn-mobile-book','.btn-offer-book','a[href*="book" i].btn','button[type=submit]','.btn'];
    for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(!el)continue;var c=parseColor(getComputedStyle(el).backgroundColor);if(c&&c[3]>0.5&&!extreme(c))return c;}
    var vars=['--gold','--rose','--teal','--amber-dark','--amber','--accent','--primary','--brand','--main-color'];
    var rs=getComputedStyle(document.documentElement);
    for(var j=0;j<vars.length;j++){var v=rs.getPropertyValue(vars[j]);if(v){var cc=parseColor(v.trim());if(cc&&!extreme(cc))return cc;}}
    return null;}
  function findFont(){var sels=['h1','h2','.hero-title','.section-title','.logo-text'];for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el){var f=getComputedStyle(el).fontFamily;if(f)return f;}}return null;}
  function findRadius(){var sels=['.btn-primary','.btn-nav-book','.btn-submit','.btn'];for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el){var r=getComputedStyle(el).borderTopLeftRadius;if(r){var n=parseFloat(r);if(!isNaN(n))return Math.min(n,20)+'px';}}}return null;}
  function detectTheme(){try{
    var root=$('lunao-widget-root');if(!root)return;
    var acc=findAccent();
    if(acc){root.style.setProperty('--lw-accent',css(acc));
      root.style.setProperty('--lw-accent-dark',css(darken(acc,0.6)));
      root.style.setProperty('--lw-accent-soft','rgba('+acc[0]+','+acc[1]+','+acc[2]+',0.16)');
      root.style.setProperty('--lw-on-accent',lum(acc)>0.62?'#1a1a1a':'#ffffff');}
    var f=findFont();if(f)root.style.setProperty('--lw-font',f);
    var r=findRadius();if(r)root.style.setProperty('--lw-radius',r);
  }catch(e){}}
  function post(path,data){
    var cleanP=path.startsWith('/')?path:('/'+path);
    var url=base;
    if(!url){
      url=cleanP;
    } else {
      url=url.replace(/\/+$/,'');
      if(cleanP.startsWith('/api/') && url.endsWith('/api')){
        url=url+cleanP.substring(4);
      } else {
        url=url+cleanP;
      }
    }
    var key=(data&&data.idempotencyKey)||('bk_w_'+Date.now().toString(36)+'_'+Math.random().toString(36).substring(2,8));
    var payload=Object.assign({},data,{idempotencyKey:key});
    return fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Idempotency-Key':key},
      body:JSON.stringify(payload)
    }).then(function(r){return r.json();});
  }

  // ---- Booking modal ----
  var ov=$('lw-book-overlay');
  function openBook(){if(!ov)return;snd.open();ov.classList.add('open');var n=ov.querySelector('input[name=name]');if(n)setTimeout(function(){n.focus();},50);}
  function closeBook(){if(ov)ov.classList.remove('open');}
  if($('lw-book-close')){$('lw-book-close').addEventListener('click',closeBook);}
  if(ov){ov.addEventListener('click',function(e){if(e.target===ov)closeBook();});}
  function bookSuccess(name){snd.success();var b=$('lw-book-body');if(b)b.innerHTML='<div class="lw-success"><div class="lw-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div><h4>Booking received!</h4><p>Thanks '+(name||'')+', we\\'ve got your request and will text you shortly to confirm.</p></div>';}
  var bf=$('lw-book-form');
  if(bf){bf.addEventListener('submit',function(e){e.preventDefault();var fd=new FormData(bf);var btn=bf.querySelector('.lw-submit');if(btn){btn.disabled=true;btn.textContent='Booking…';}
    post('/api/bookings',{slug:CFG.slug,businessName:CFG.businessName,source:'form',customerName:fd.get('name'),phone:fd.get('phone'),service:fd.get('service'),date:fd.get('date'),time:fd.get('time'),notes:fd.get('notes')})
    .then(function(res){if(res&&res.ok){bookSuccess(fd.get('name'));}else{if(btn){btn.disabled=false;btn.textContent='Confirm Booking';}alert((res&&res.error)||'Something went wrong, please try again.');}})
    .catch(function(){if(btn){btn.disabled=false;btn.textContent='Confirm Booking';}alert('Network error, please try again.');});});}

  // ---- Progressive enhancement of the template's own booking form ----
  if(CFG.booking){enhanceNativeForm();}
  function enhanceNativeForm(){try{
    var scope=document.getElementById('book')||document;
    var forms=scope.querySelectorAll('form');
    forms.forEach(function(f){if(f.id==='lw-book-form'||f.id==='lw-chat-form'||f.__lw)return;f.__lw=true;
      f.addEventListener('submit',function(e){
        var phone=f.querySelector('input[type=tel],input[name*=phone i],input[id*=phone i]');
        if(!phone)return; // not a booking form
        var g=function(sel){var el=f.querySelector(sel);return el?el.value:'';};
        var data={slug:CFG.slug,businessName:CFG.businessName,source:'form',
          customerName:g('input[id*=name i],input[name*=name i],input[type=text]'),
          phone:phone.value,
          service:g('select[id*=service i],select[name*=service i],select'),
          date:g('input[type=date]'),
          time:g('select[id*=time i],input[id*=time i]'),
          notes:g('textarea')};
        post('/api/bookings',data).then(function(){snd.success();}).catch(function(){});
        // let the template's own success UI proceed too
      },true);
    });
  }catch(e){}}

  // ---- Chatbot ----
  var chPanel=null,chMsgs=null,chForm=null,chInput=null,chSession=null,chGreeted=false;
  function add(text,who){if(!chMsgs)return;var d=document.createElement('div');d.className='lw-msg '+(who==='me'?'me':'bot');d.textContent=text;chMsgs.appendChild(d);chMsgs.scrollTop=chMsgs.scrollHeight;}
  function typing(on){if(!chMsgs)return;var t=$('lw-typing-ind');if(on){if(t)return;var d=document.createElement('div');d.className='lw-typing';d.id='lw-typing-ind';d.innerHTML='<span></span><span></span><span></span>';chMsgs.appendChild(d);chMsgs.scrollTop=chMsgs.scrollHeight;}else if(t){t.remove();}}
  function turn(message){typing(true);post('/api/chat',{slug:CFG.slug,sessionId:chSession,message:message,businessName:CFG.businessName,services:(CFG.services||[]).join(', ')}).then(function(res){typing(false);if(res&&res.ok){chSession=res.sessionId;if(res.reply){add(res.reply,'bot');snd.recv();}if(res.done)snd.success();}else{add('Sorry, something went wrong. Please call us '+(CFG.phone||'')+'.','bot');}}).catch(function(){typing(false);add('Connection issue — please try again.','bot');});}
  function openChat(){if(!chPanel)return;chPanel.classList.add('open');snd.open();if(!chGreeted){chGreeted=true;turn('');}if(chInput)setTimeout(function(){chInput.focus();},50);}
  function closeChat(){if(chPanel)chPanel.classList.remove('open');}
  if(CFG.chatbot){
    chPanel=$('lw-chat-panel');chMsgs=$('lw-chat-msgs');chForm=$('lw-chat-form');chInput=$('lw-chat-input');
    if($('lw-chat-close'))$('lw-chat-close').addEventListener('click',closeChat);
    if(chForm)chForm.addEventListener('submit',function(e){e.preventDefault();var v=chInput.value.trim();if(!v)return;add(v,'me');snd.send();chInput.value='';turn(v);});
  }

  // ---- Speed-dial launcher ----
  var dock=$('lw-dock'),launch=$('lw-launch'),scrim=$('lw-scrim'),tip=$('lw-tip');
  var both=CFG.booking&&CFG.chatbot;
  function hideTip(){if(tip)tip.classList.remove('show');}
  function openMenu(){dock.classList.add('open');if(scrim)scrim.classList.add('show');hideTip();snd.expand();}
  function closeMenu(){dock.classList.remove('open');if(scrim)scrim.classList.remove('show');snd.collapse();}
  function toggleMenu(){dock.classList.contains('open')?closeMenu():openMenu();}
  if(launch){launch.addEventListener('click',function(){hideTip();
    if(both){toggleMenu();}
    else if(CFG.booking){openBook();}
    else{openChat();}
  });}
  if(scrim)scrim.addEventListener('click',closeMenu);
  if($('lw-act-book'))$('lw-act-book').addEventListener('click',function(){snd.select();closeMenu();openBook();});
  if($('lw-act-chat'))$('lw-act-chat').addEventListener('click',function(){snd.select();closeMenu();openChat();});

  // One-time attention tooltip (calms down quickly).
  setTimeout(function(){if(tip&&dock&&!dock.classList.contains('open')){tip.classList.add('show');setTimeout(hideTip,5000);}},1600);
})();`;
}

// ---- Public API ------------------------------------------------------------

export function removeWidget(html) {
  const re = new RegExp(`\\s*${START}[\\s\\S]*?${END}`, 'g');
  return html.replace(re, '');
}

export function buildWidgetConfig(slug, html) {
  const niche = nicheFromHtml(html);
  const apiBase = PUBLIC_API_BASE_URL;

  return {
    apiBase,
    slug,
    businessName: businessNameFrom(html),
    phone: phoneFrom(html),
    niche,
    services: SERVICES_BY_NICHE[niche] || SERVICES_BY_NICHE.Site,
    theme: themeFor(niche),
  };
}

// Idempotently inject (or refresh) the widget block before </body>.
export function injectWidget(html, { booking, chatbot, slug }) {
  let out = removeWidget(html);
  if (!booking && !chatbot) return out;
  const cfg = { ...buildWidgetConfig(slug, html), booking, chatbot };
  const block = buildBlock(cfg);
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${block}\n</body>`);
  } else {
    out = `${out}\n${block}`;
  }
  return out;
}

// ---- Add-on persistence + apply -------------------------------------------

const upsertAddons = db.prepare(`
  INSERT INTO site_addons (slug, booking_enabled, chatbot_enabled, updated_at)
  VALUES (@slug, @booking, @chatbot, @updated_at)
  ON CONFLICT(slug) DO UPDATE SET
    booking_enabled=excluded.booking_enabled,
    chatbot_enabled=excluded.chatbot_enabled,
    updated_at=excluded.updated_at
`);

export function getAddons(slug) {
  const row = db.prepare('SELECT booking_enabled, chatbot_enabled FROM site_addons WHERE slug = ?').get(slug);
  return {
    booking: row ? Boolean(row.booking_enabled) : false,
    chatbot: row ? Boolean(row.chatbot_enabled) : false,
  };
}

// Re-inject/remove the widget in the site's HTML, persist toggles, return new HTML+url.
export async function setAddons(slug, { booking, chatbot }) {
  const current = await readSite(slug);
  const updated = injectWidget(current, { booking, chatbot, slug });
  const url = await writeSite(slug, updated);
  upsertAddons.run({ slug, booking: booking ? 1 : 0, chatbot: chatbot ? 1 : 0, updated_at: Date.now() });
  return { html: updated, url, addons: { booking, chatbot } };
}
