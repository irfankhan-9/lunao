import fs from 'fs';

const masterHtml = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');

let c = masterHtml;
console.log('Start length:', c.length);

c = c.replace(/<title>.*?<\/title>/i, 'TITLE');
console.log('After title:', c.length);

c = c.replace(/<meta name="description" content=".*?"\s*\/?>/i, 'DESC');
console.log('After desc:', c.length);

c = c.replace(/✦ BESPOKE CLIMATE ENGINEERING & INDOOR PURITY ✦/g, 'TAGLINE');
console.log('After tagline 1:', c.length);

c = c.replace(/CONCEALED SLOT DIFFUSERS · HOSPITAL-GRADE PURITY/g, 'TAGLINE');
console.log('After tagline 2:', c.length);

c = c.replace(/<span class="hero-badge">✦ ATELIER THERMODYNAMICS<\/span>/g, 'BADGE');
console.log('After badge:', c.length);

c = c.replace(/<h1 class="hero-title">[\s\S]*?<\/h1>/, 'H1');
console.log('After h1:', c.length);

c = c.replace(/Ultra-quiet variable-speed heat pumps, concealed architectural slot diffusers, hospital-grade air purification, and landmark historic ducting delivered with guaranteed upfront pricing\./g, 'SUBTITLE');
console.log('After subtitle:', c.length);

c = c.replace(/Bespoke Climate &amp; Heat Pump Concierge/g, 'CONCIERGE');
console.log('After concierge 1:', c.length);

c = c.replace(/Bespoke Climate & Heat Pump Concierge/g, 'CONCIERGE');
console.log('After concierge 2:', c.length);

c = c.replace(/✨ AURUM CLIMATE DESK LIVE/g, 'BADGE');
console.log('After badge 2:', c.length);

c = c.replace(/<span class="fab-magic-sparkle">❄️<\/span>/g, 'ICON');
console.log('After icon:', c.length);

c = c.replace(/Unsure which heat pump capacity or VRF layout best suits your residence.*?Inquire with our digital engineering advisory desk.*?\./s, 'DESC');
console.log('After desc 2:', c.length);

c = c.replace(/<button type="button" class="ai-chip".*?Cold-Climate Heat Pumps<\/button>/s, 'CHIP1');
console.log('After chip 1:', c.length);

c = c.replace(/<button type="button" class="ai-chip".*?High-Velocity Historic Ducting<\/button>/s, 'CHIP2');
console.log('After chip 2:', c.length);

c = c.replace(/<button type="button" class="ai-chip".*?Whole-Home Hospital IAQ<\/button>/s, 'CHIP3');
console.log('After chip 3:', c.length);

c = c.replace(/ARCHITECTURAL HVAC DISCIPLINES/g, 'EYEBROW');
console.log('After eyebrow:', c.length);

c = c.replace(/Thermodynamic Systems &amp; Engineering Services/g, 'TITLE');
console.log('After title 1:', c.length);

c = c.replace(/Thermodynamic Systems & Engineering Services/g, 'TITLE');
console.log('After title 2:', c.length);

c = c.replace(/const SERVICES_DATA = \[[\s\S]*?\];/s, 'SERVICES');
console.log('After services:', c.length);

c = c.replace(/const BARBERS_DATA = \[[\s\S]*?\];/s, 'BARBERS');
console.log('After barbers:', c.length);

c = c.replace(/const TEAM_DATA = \[[\s\S]*?\];/s, 'TEAM');
console.log('After team:', c.length);

c = c.replace(/const PRODUCTS_DATA = \[[\s\S]*?\];/s, 'PRODUCTS');
console.log('After products:', c.length);
