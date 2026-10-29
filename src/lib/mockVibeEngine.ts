// Mocked Vibe Coding Engine for Lunao Template Lab Studio
// 100% functional, responsive, and completely isolated from external AI API keys / servers.
// Generates bespoke, high-converting HTML landing pages and applies responsive live edits
// with realistic token streaming and thinking states.

interface VibeEditParams {
  html: string;
  instruction: string;
  history?: any[];
  anthropicApiKey?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function extractBusinessNameAndCity(prompt: string, defaultName: string, defaultCity: string): { name: string; city: string } {
  let name = defaultName;
  let city = defaultCity;

  // Check for city pattern (e.g. "in Austin", "in Miami, FL", "in Dallas")
  const cityMatch = prompt.match(/\bin\s+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2})?)/i);
  if (cityMatch && cityMatch[1]) {
    city = cityMatch[1].trim();
  }

  // Check for brand name pattern (e.g. "for Apex Barber", "named Sovereign Lounge", "called Everest")
  const nameMatch = prompt.match(/(?:for|named|called)\s+([A-Z][a-zA-Z0-9\s'&]+?)(?:\s+in|\s+with|\s*$)/i);
  if (nameMatch && nameMatch[1]) {
    const raw = nameMatch[1].trim();
    if (raw.length > 2 && raw.length < 40) {
      name = raw;
    }
  }

  return { name, city };
}

function generateBespokeTemplate(prompt: string): string {
  const p = prompt.toLowerCase();

  // 1. Barber / Men's Grooming
  if (p.includes('barber') || p.includes('grooming') || p.includes('fade') || p.includes('shave')) {
    const { name, city } = extractBusinessNameAndCity(prompt, 'Vintage Cuts Barber Lounge', 'Austin, TX');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — Premier Barbering & Grooming</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,800;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0C0A09;
      --card-bg: #1C1917;
      --border: rgba(255, 255, 255, 0.1);
      --gold: #F59E0B;
      --gold-hover: #D97706;
      --text: #F5F5F4;
      --muted: #A8A29E;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', sans-serif;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    h1, h2, h3, .font-serif { font-family: 'Playfair Display', serif; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
    
    /* Header */
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(16px);
      background: rgba(12, 10, 9, 0.85);
      border-bottom: 1px solid var(--border);
      padding: 16px 0;
    }
    .nav-inner { display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.5px; text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .brand-accent { color: var(--gold); }
    .nav-btn {
      background: var(--gold);
      color: #000;
      font-weight: 700;
      font-size: 13px;
      padding: 10px 20px;
      border-radius: 9999px;
      text-decoration: none;
      transition: all 0.2s;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .nav-btn:hover { background: var(--gold-hover); transform: translateY(-1px); }

    /* Hero */
    .hero {
      padding: 90px 0 70px;
      text-align: center;
      position: relative;
      background: radial-gradient(circle at 50% 20%, rgba(245, 158, 11, 0.08) 0%, transparent 60%);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--gold);
      font-size: 12px;
      font-weight: 700;
      padding: 6px 16px;
      border-radius: 9999px;
      margin-bottom: 24px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .hero h1 {
      font-size: clamp(38px, 6vw, 68px);
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 24px;
      color: #fff;
    }
    .hero p {
      font-size: clamp(16px, 2vw, 20px);
      color: var(--muted);
      max-width: 680px;
      margin: 0 auto 36px;
    }
    .cta-group { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; }
    .btn-primary {
      background: var(--gold);
      color: #000;
      font-weight: 800;
      font-size: 15px;
      padding: 14px 32px;
      border-radius: 9999px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.3);
    }
    .btn-secondary {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: #fff;
      font-weight: 700;
      font-size: 15px;
      padding: 14px 28px;
      border-radius: 9999px;
      text-decoration: none;
    }

    /* Trust Stats */
    .stats {
      padding: 40px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      margin-bottom: 70px;
    }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; text-align: center; }
    .stat-number { font-size: 32px; font-weight: 800; color: var(--gold); }
    .stat-label { font-size: 13px; color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Services */
    .services { padding: 40px 0 80px; }
    .section-head { text-align: center; margin-bottom: 50px; }
    .section-head h2 { font-size: 36px; color: #fff; margin-bottom: 12px; }
    .section-head p { color: var(--muted); font-size: 15px; }
    .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
    .service-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      transition: all 0.2s;
    }
    .service-card:hover { border-color: rgba(245, 158, 11, 0.4); transform: translateY(-3px); }
    .service-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
    .service-title { font-size: 19px; font-weight: 700; color: #fff; }
    .service-price { font-size: 20px; font-weight: 800; color: var(--gold); }
    .service-desc { font-size: 14px; color: var(--muted); line-height: 1.5; }

    /* Reviews */
    .reviews { background: rgba(28, 25, 23, 0.4); padding: 70px 0; border-top: 1px solid var(--border); }
    .review-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      max-width: 760px;
      margin: 0 auto;
      text-align: center;
    }
    .stars { color: var(--gold); font-size: 20px; margin-bottom: 16px; }
    .review-quote { font-size: 17px; font-style: italic; color: #fff; margin-bottom: 16px; line-height: 1.6; }
    .reviewer { font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

    /* Footer */
    footer { padding: 40px 0; border-top: 1px solid var(--border); text-align: center; font-size: 13px; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <div class="container nav-inner">
      <a href="#" class="brand">
        <span>💈</span> ${name}
      </a>
      <a href="tel:5125550199" class="nav-btn">Call (512) 555-0199</a>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="container">
        <div class="pill">✦ Master Barbering in ${city} ✦</div>
        <h1>Elevate Your Grooming Standard.</h1>
        <p>Bespoke hot towel shears, precision skin fades, and artisan beard sculpts tailored for discerning gentlemen.</p>
        <div class="cta-group">
          <a href="tel:5125550199" class="btn-primary"><span>📞</span> Call (512) 555-0199</a>
          <a href="#services" class="btn-secondary">View Menu & Rates</a>
        </div>
      </div>
    </section>

    <section class="stats">
      <div class="container stats-grid">
        <div>
          <div class="stat-number">4.9 ★</div>
          <div class="stat-label">Google Rating (340+ Reviews)</div>
        </div>
        <div>
          <div class="stat-number">12+</div>
          <div class="stat-label">Years of Master Craftsmanship</div>
        </div>
        <div>
          <div class="stat-number">100%</div>
          <div class="stat-label">Satisfaction Guarantee</div>
        </div>
      </div>
    </section>

    <section id="services" class="services">
      <div class="container">
        <div class="section-head">
          <h2>Signature Services</h2>
          <p>Every cut includes hot towel neck shave, styling product, and tailored consultation.</p>
        </div>
        <div class="services-grid">
          <div class="service-card">
            <div class="service-top">
              <h3 class="service-title">The Executive Cut</h3>
              <span class="service-price">$48</span>
            </div>
            <p class="service-desc">Precision shear & clipper work, tailored neckline taper, clarifying wash, and signature pomade styling.</p>
          </div>
          <div class="service-card">
            <div class="service-top">
              <h3 class="service-title">Artisan Beard Sculpt</h3>
              <span class="service-price">$34</span>
            </div>
            <p class="service-desc">Hot towel essential oil wrap, straight razor edging, length balance, and nourishing balm treatment.</p>
          </div>
          <div class="service-card">
            <div class="service-top">
              <h3 class="service-title">The Full Sovereign</h3>
              <span class="service-price">$75</span>
            </div>
            <p class="service-desc">Complete signature haircut paired with full artisan beard sculpting and revitalizing facial compress.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="reviews">
      <div class="container">
        <div class="review-card">
          <div class="stars">★★★★★</div>
          <p class="review-quote">&ldquo;Easily the cleanest fade and sharpest beard line-up in ${city}. The atmosphere is unmatched and the attention to detail is world-class.&rdquo;</p>
          <div class="reviewer">— Marcus Vance · Verified Client</div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <p>© ${new Date().getFullYear()} ${name} · ${city} · All Rights Reserved.</p>
    </div>
  </footer>
</body>
</html>`;
  }

  // 2. HVAC & Climate Control
  if (p.includes('hvac') || p.includes('heat') || p.includes('cooling') || p.includes('air conditioning') || p.includes('furnace')) {
    const { name, city } = extractBusinessNameAndCity(prompt, 'Everest Climate Systems', 'Austin, TX');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — Precision HVAC & 24/7 Climate Control</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0284C7;
      --primary-dark: #0369A1;
      --accent: #F59E0B;
      --bg: #0F172A;
      --card: #1E293B;
      --border: rgba(255, 255, 255, 0.1);
      --text: #F8FAFC;
      --muted: #94A3B8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Plus Jakarta Sans', sans-serif; line-height: 1.6; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
    header { background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); padding: 18px 0; position: sticky; top: 0; z-index: 50; }
    .nav-inner { display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 20px; font-weight: 800; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .nav-cta { background: var(--primary); color: #fff; font-weight: 700; font-size: 13px; padding: 10px 22px; border-radius: 8px; text-decoration: none; }
    .hero { padding: 80px 0 60px; text-align: center; }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(2, 132, 199, 0.15); border: 1px solid rgba(2, 132, 199, 0.4); color: #38BDF8; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 9999px; margin-bottom: 24px; text-transform: uppercase; }
    .hero h1 { font-size: clamp(36px, 5.5vw, 64px); font-weight: 800; color: #fff; line-height: 1.15; margin-bottom: 20px; }
    .hero p { font-size: 18px; color: var(--muted); max-width: 650px; margin: 0 auto 32px; }
    .cta-btn { background: #E11D48; color: #fff; font-weight: 800; font-size: 16px; padding: 16px 36px; border-radius: 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 10px; box-shadow: 0 10px 25px -5px rgba(225, 29, 72, 0.4); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin: 60px 0; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 28px; }
    .card h3 { font-size: 19px; color: #fff; margin-bottom: 10px; }
    .card p { font-size: 14px; color: var(--muted); }
    footer { border-top: 1px solid var(--border); padding: 36px 0; text-align: center; font-size: 13px; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <div class="container nav-inner">
      <a href="#" class="brand">❄️ ${name}</a>
      <a href="tel:5125550199" class="nav-cta">Call (512) 555-0199</a>
    </div>
  </header>
  <main>
    <section class="hero">
      <div class="container">
        <div class="badge">✦ 24/7 Immediate Emergency Dispatch in ${city} ✦</div>
        <h1>Reliable Heating & Air Conditioning Systems.</h1>
        <p>Licensed HVAC engineering, rapid diagnostic calls, inverter heat pumps, and hospital-grade indoor air purity.</p>
        <a href="tel:5125550199" class="cta-btn">🚨 Call Emergency Dispatch: (512) 555-0199</a>
        <div class="grid">
          <div class="card">
            <h3>Emergency AC Repair</h3>
            <p>Same-day emergency diagnostic trucks fully stocked with factory parts for all major compressor brands.</p>
          </div>
          <div class="card">
            <h3>Heat Pump Systems</h3>
            <p>Ultra-efficient dual-fuel heating and cooling systems lowering electric bills by up to 40%.</p>
          </div>
          <div class="card">
            <h3>Duct & Air Purification</h3>
            <p>Hospital-grade UV-C purification, whole-home dehumidifiers, and laser-sealed ductwork balancing.</p>
          </div>
        </div>
      </div>
    </section>
  </main>
  <footer>
    <div class="container">
      <p>© ${new Date().getFullYear()} ${name} · ${city} · Licensed & Insured HVAC Specialists.</p>
    </div>
  </footer>
</body>
</html>`;
  }

  // 3. Dentist / Dental Clinic
  if (p.includes('dent') || p.includes('teeth') || p.includes('smile') || p.includes('implant') || p.includes('ortho')) {
    const { name, city } = extractBusinessNameAndCity(prompt, 'Lumina Dental Studio', 'Austin, TX');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — Modern Cosmetic & Family Dentistry</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --primary: #0D9488; --dark: #0F172A; --bg: #FFFFFF; --card: #F8FAFC; --border: #E2E8F0; --text: #1E293B; --muted: #64748B; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Plus Jakarta Sans', sans-serif; line-height: 1.6; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
    header { background: #fff; border-bottom: 1px solid var(--border); padding: 18px 0; position: sticky; top: 0; z-index: 50; }
    .nav-inner { display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 20px; font-weight: 800; color: var(--dark); text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .btn { background: var(--primary); color: #fff; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 9999px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
    .hero { padding: 80px 0 60px; text-align: center; }
    .badge { display: inline-block; background: #CCFBF1; color: #0F766E; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 9999px; margin-bottom: 20px; text-transform: uppercase; }
    .hero h1 { font-size: clamp(34px, 5vw, 56px); font-weight: 800; color: var(--dark); line-height: 1.15; margin-bottom: 20px; }
    .hero p { font-size: 18px; color: var(--muted); max-width: 650px; margin: 0 auto 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin: 60px 0; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px; text-align: left; }
    .card h3 { font-size: 19px; color: var(--dark); margin-bottom: 8px; }
    .card p { font-size: 14px; color: var(--muted); }
    footer { border-top: 1px solid var(--border); padding: 36px 0; text-align: center; font-size: 13px; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <div class="container nav-inner">
      <a href="#" class="brand">🦷 ${name}</a>
      <a href="tel:5125550199" class="btn">Call (512) 555-0199</a>
    </div>
  </header>
  <main class="container">
    <section class="hero">
      <div class="badge">✦ Gentle Care & Advanced Aesthetics in ${city} ✦</div>
      <h1>World-Class Smiles in Total Comfort.</h1>
      <p>Digital porcelain veneers, precision dental implants, and anxiety-free family dental care.</p>
      <a href="tel:5125550199" class="btn"><span>📞</span> Call To Book: (512) 555-0199</a>
      <div class="grid">
        <div class="card">
          <h3>Cosmetic Smile Makeovers</h3>
          <p>Ultra-thin porcelain veneers and laser teeth whitening designed for natural elegance.</p>
        </div>
        <div class="card">
          <h3>Permanent Dental Implants</h3>
          <p>3D-guided surgical placement restoring 100% natural chewing strength and facial structure.</p>
        </div>
        <div class="card">
          <h3>Gentle Family Dentistry</h3>
          <p>Relaxing cleanings, painless preventative care, and emergency tooth relief.</p>
        </div>
      </div>
    </section>
  </main>
  <footer>
    <div class="container">
      <p>© ${new Date().getFullYear()} ${name} · ${city} · Gentle, modern dental aesthetics.</p>
    </div>
  </footer>
</body>
</html>`;
  }

  // 4. General / High-Ticket Local Business Default
  const { name, city } = extractBusinessNameAndCity(prompt, 'Apex Business Solutions', 'Austin, TX');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — Premier Local Solutions in ${city}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #F59E0B;
      --primary-dark: #D97706;
      --bg: #09090B;
      --card: #18181B;
      --border: rgba(255, 255, 255, 0.1);
      --text: #FAFAFA;
      --muted: #A1A1AA;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Plus Jakarta Sans', sans-serif; line-height: 1.6; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
    header { background: rgba(9, 9, 11, 0.85); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border); padding: 18px 0; position: sticky; top: 0; z-index: 50; }
    .nav-inner { display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 20px; font-weight: 800; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .nav-btn { background: var(--primary); color: #000; font-weight: 700; font-size: 13px; padding: 10px 22px; border-radius: 9999px; text-decoration: none; }
    .hero { padding: 80px 0 60px; text-align: center; }
    .pill { display: inline-flex; align-items: center; gap: 8px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); color: var(--primary); font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 9999px; margin-bottom: 24px; text-transform: uppercase; }
    .hero h1 { font-size: clamp(34px, 5.5vw, 60px); font-weight: 800; color: #fff; line-height: 1.15; margin-bottom: 20px; }
    .hero p { font-size: 18px; color: var(--muted); max-width: 660px; margin: 0 auto 32px; }
    .cta-btn { background: var(--primary); color: #000; font-weight: 800; font-size: 16px; padding: 15px 36px; border-radius: 9999px; text-decoration: none; display: inline-flex; align-items: center; gap: 10px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin: 60px 0; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px; text-align: left; }
    .card h3 { font-size: 19px; color: #fff; margin-bottom: 10px; }
    .card p { font-size: 14px; color: var(--muted); }
    footer { border-top: 1px solid var(--border); padding: 36px 0; text-align: center; font-size: 13px; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <div class="container nav-inner">
      <a href="#" class="brand">✦ ${name}</a>
      <a href="tel:5125550199" class="nav-btn">Call (512) 555-0199</a>
    </div>
  </header>
  <main class="container">
    <section class="hero">
      <div class="pill">✦ Leading Local Specialists in ${city} ✦</div>
      <h1>High-Standard Execution. Zero Compromise.</h1>
      <p>Precision craftsmanship, responsive local service, and verified 5-star customer satisfaction.</p>
      <a href="tel:5125550199" class="cta-btn"><span>📞</span> Call Direct: (512) 555-0199</a>
      <div class="grid">
        <div class="card">
          <h3>Bespoke Excellence</h3>
          <p>Every detail engineered to the highest standard with meticulous attention and premium materials.</p>
        </div>
        <div class="card">
          <h3>Fast Local Turnaround</h3>
          <p>Prompt communication, reliable schedules, and direct accountability for every client project.</p>
        </div>
        <div class="card">
          <h3>Verified Satisfaction</h3>
          <p>Hundreds of 5-star local ratings backed by our ironclad 100% satisfaction commitment.</p>
        </div>
      </div>
    </section>
  </main>
  <footer>
    <div class="container">
      <p>© ${new Date().getFullYear()} ${name} · ${city} · All Rights Reserved.</p>
    </div>
  </footer>
</body>
</html>`;
}

function applyHtmlRefinements(baseHtml: string, instruction: string): string {
  let updated = baseHtml;
  const inst = instruction.toLowerCase();

  // 1. Color themes
  if (inst.includes('gold') || inst.includes('amber')) {
    const override = `<style id="lunao-vibe-gold">
      :root { --primary: #F59E0B !important; --gold: #F59E0B !important; }
      .nav-btn, .btn-primary, .cta-btn, .btn { background: #F59E0B !important; color: #000000 !important; }
    </style>`;
    updated = updated.includes('</head>') ? updated.replace('</head>', `${override}</head>`) : updated + override;
  } else if (inst.includes('emerald') || inst.includes('green')) {
    const override = `<style id="lunao-vibe-emerald">
      :root { --primary: #10B981 !important; }
      .nav-btn, .btn-primary, .cta-btn, .btn { background: #10B981 !important; color: #ffffff !important; }
    </style>`;
    updated = updated.includes('</head>') ? updated.replace('</head>', `${override}</head>`) : updated + override;
  } else if (inst.includes('dark') || inst.includes('black') || inst.includes('obsidian')) {
    const override = `<style id="lunao-vibe-dark">
      body { background-color: #09090B !important; color: #FAFAFA !important; }
      header { background: rgba(9, 9, 11, 0.9) !important; border-color: rgba(255,255,255,0.1) !important; }
      .card, .service-card, .review-card { background: #18181B !important; border-color: rgba(255,255,255,0.1) !important; color: #FAFAFA !important; }
    </style>`;
    updated = updated.includes('</head>') ? updated.replace('</head>', `${override}</head>`) : updated + override;
  }

  // 2. Sections: Reviews / Testimonials
  if (inst.includes('review') || inst.includes('testimonial') || inst.includes('stars')) {
    const reviewBlock = `
    <section style="padding:60px 20px;background:rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.1);text-align:center;">
      <div style="max-width:800px;margin:0 auto;">
        <div style="color:#F59E0B;font-size:22px;margin-bottom:12px;">★★★★★</div>
        <h3 style="font-size:24px;font-weight:700;margin-bottom:12px;">Rated 4.9 / 5.0 from Over 300+ Local Clients</h3>
        <p style="opacity:0.8;font-size:15px;line-height:1.6;">"Absolute top-tier service and professional experience. Exceeded all expectations!" — Verified Local Customer</p>
      </div>
    </section>`;
    if (updated.includes('</main>')) {
      updated = updated.replace('</main>', `${reviewBlock}</main>`);
    } else if (updated.includes('</body>')) {
      updated = updated.replace('</body>', `${reviewBlock}</body>`);
    } else {
      updated += reviewBlock;
    }
  }

  // 3. Sections: Pricing / Plans
  if (inst.includes('price') || inst.includes('pricing') || inst.includes('package') || inst.includes('tier')) {
    const pricingBlock = `
    <section style="padding:70px 20px;border-top:1px solid rgba(255,255,255,0.1);text-align:center;">
      <div style="max-width:1000px;margin:0 auto;">
        <h2 style="font-size:32px;font-weight:800;margin-bottom:12px;">Transparent Packages & Rates</h2>
        <p style="opacity:0.75;margin-bottom:40px;">Select the ideal option tailored to your requirements.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:28px;">
            <h4 style="font-size:18px;font-weight:700;margin-bottom:8px;">Standard</h4>
            <div style="font-size:32px;font-weight:800;color:#F59E0B;margin-bottom:16px;">$99</div>
            <p style="font-size:14px;opacity:0.8;margin-bottom:20px;">Essential local service & full diagnostic guarantee.</p>
            <a href="tel:5125550199" style="display:block;background:#F59E0B;color:#000;font-weight:700;padding:12px;border-radius:8px;text-decoration:none;">Book Standard</a>
          </div>
          <div style="background:rgba(255,255,255,0.08);border:2px solid #F59E0B;border-radius:14px;padding:28px;">
            <h4 style="font-size:18px;font-weight:700;margin-bottom:8px;">Premium Executive</h4>
            <div style="font-size:32px;font-weight:800;color:#F59E0B;margin-bottom:16px;">$189</div>
            <p style="font-size:14px;opacity:0.8;margin-bottom:20px;">Comprehensive full-service VIP treatment & priority access.</p>
            <a href="tel:5125550199" style="display:block;background:#F59E0B;color:#000;font-weight:700;padding:12px;border-radius:8px;text-decoration:none;">Book Premium</a>
          </div>
        </div>
      </div>
    </section>`;
    if (updated.includes('</main>')) {
      updated = updated.replace('</main>', `${pricingBlock}</main>`);
    } else if (updated.includes('</body>')) {
      updated = updated.replace('</body>', `${pricingBlock}</body>`);
    } else {
      updated += pricingBlock;
    }
  }

  // 4. Sections: FAQ
  if (inst.includes('faq') || inst.includes('questions')) {
    const faqBlock = `
    <section style="padding:60px 20px;border-top:1px solid rgba(255,255,255,0.1);">
      <div style="max-width:800px;margin:0 auto;">
        <h2 style="font-size:28px;font-weight:800;text-align:center;margin-bottom:32px;">Frequently Asked Questions</h2>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;margin-bottom:16px;">
          <h4 style="font-weight:700;margin-bottom:6px;">How quickly can I get an appointment?</h4>
          <p style="font-size:14px;opacity:0.8;">Same-day and next-day reservations are available daily by phone.</p>
        </div>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;">
          <h4 style="font-weight:700;margin-bottom:6px;">What is your satisfaction guarantee?</h4>
          <p style="font-size:14px;opacity:0.8;">We stand 100% behind our craftsmanship with direct warranties on all work performed.</p>
        </div>
      </div>
    </section>`;
    if (updated.includes('</main>')) {
      updated = updated.replace('</main>', `${faqBlock}</main>`);
    } else if (updated.includes('</body>')) {
      updated = updated.replace('</body>', `${faqBlock}</body>`);
    } else {
      updated += faqBlock;
    }
  }

  // Clean comment stamp
  const tag = `\n<!-- Lunao Studio Refinement: ${instruction.replace(/-->/g, '').slice(0, 80)} -->\n`;
  if (updated.includes('</head>')) {
    updated = updated.replace('</head>', `${tag}</head>`);
  } else {
    updated += tag;
  }

  return updated;
}

export async function runMockedVibeCodeAiEdit(
  params: VibeEditParams,
  onChunk: (fullHtmlSoFar: string, delta: string) => void,
  onThinking?: (text: string) => void,
  onStart?: () => void
): Promise<string> {
  if (onStart) onStart();

  const isBlank = !params.html || params.html.trim().length < 250 || params.html.includes('body{}');

  // Stream realistic thinking state
  if (onThinking) {
    onThinking('Analyzing visual hierarchy, typography tokens, and conversion architecture… ');
    await sleep(220);
    onThinking('Synthesizing bespoke responsive styling and high-ticket layout… ');
    await sleep(240);
    onThinking('Compiling interactive CTA elements and mobile optimizations… ');
    await sleep(200);
  }

  let finalHtml = '';
  if (isBlank) {
    finalHtml = generateBespokeTemplate(params.instruction || '');
  } else {
    finalHtml = applyHtmlRefinements(params.html, params.instruction || '');
  }

  // Stream HTML in progressive token chunks so the UI streams realistically
  const chunkSize = Math.max(200, Math.floor(finalHtml.length / 6));
  let accumulated = '';
  for (let i = 0; i < finalHtml.length; i += chunkSize) {
    const chunk = finalHtml.slice(i, i + chunkSize);
    accumulated += chunk;
    onChunk(accumulated, chunk);
    await sleep(40);
  }

  // Ensure full completion is delivered
  onChunk(finalHtml, '');
  return finalHtml;
}
