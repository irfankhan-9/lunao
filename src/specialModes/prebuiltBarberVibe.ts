// Isolated Pre-Built Luxury Barber Shop Vibe Template for Sales Closer & UGC Modes
// Strictly active ONLY when isSpecialModeActive() === true (sales or ugc mode).
// Standard users never load or see this module's special UI.

import type { SiteHistoryEntry } from '../lib/pipelineClient';

export const SPECIAL_BARBER_VIBE_ID = 'hist_special_barber_vibe_01';
export const SPECIAL_BARBER_VIBE_SLUG = 'studio-sovereign-blade-barber';
export const SPECIAL_BARBER_VIBE_TITLE = 'Sovereign Blade Barber Lounge';
export const SPECIAL_BARBER_VIBE_NICHE = 'Barber';

// Clean, natural AI-style prompt with zero mention of placeholders or internal tags
export const SPECIAL_BARBER_VIBE_PROMPT =
  'Design a dark luxury website for an executive barber shop and grooming lounge with deep obsidian backgrounds, warm brushed gold accents, and smooth scroll-reveal animations. Include a full-screen hero section with live chair status and click-to-call appointment booking, an interactive service menu with pricing for precision fades and hot-towel straight-razor shaves, a master barbers showcase, a vintage lounge atmosphere gallery, verified client reviews, and a footer with location hours.';

export const SPECIAL_BARBER_PREVIEW_MAP: Record<string, string> = {
  BUSINESS_NAME: 'Sovereign Blade Barber Lounge',
  PHONE: '(512) 555-0199',
  CITY: 'Austin, TX',
  ADDRESS: '408 Congress Ave, Austin, TX',
};

export function isSpecialBarberPrompt(promptText: string): boolean {
  const clean = (promptText || '').trim().toLowerCase();
  if (!clean) return false;
  if (clean === SPECIAL_BARBER_VIBE_PROMPT.toLowerCase()) return true;
  if (
    clean.includes('barber') ||
    clean.includes('grooming lounge') ||
    clean.includes('hot-towel') ||
    clean.includes('straight-razor') ||
    clean.includes('sovereign blade')
  ) {
    return true;
  }
  return false;
}

// 100% compliant with Lunao Rebranding Engine (uses ONLY {{BUSINESS_NAME}}, {{PHONE}}, {{CITY}}, {{ADDRESS}})
export const SPECIAL_BARBER_RAW_HTML = `<!DOCTYPE html>
<html lang="en" data-lunao-barber-vibe="true">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{BUSINESS_NAME}} | {{CITY}}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-obsidian: #0A0A09;
      --bg-surface: #121210;
      --bg-elevated: #1A1917;
      --gold: #C9A96E;
      --gold-bright: #E5C78E;
      --gold-dim: rgba(201, 169, 110, 0.16);
      --text-cream: #F6F2EA;
      --text-muted: #A69F91;
      --border-gold: rgba(201, 169, 110, 0.22);
      --border-subtle: rgba(255, 255, 255, 0.07);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      scroll-behavior: smooth;
      background-color: var(--bg-obsidian);
      color: var(--text-cream);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      background-color: var(--bg-obsidian);
      color: var(--text-cream);
      line-height: 1.6;
      overflow-x: hidden;
    }

    h1, h2, h3, h4, .serif {
      font-family: 'Playfair Display', Georgia, serif;
    }

    a {
      color: inherit;
      text-decoration: none;
      transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .container {
      width: 100%;
      max-width: 1220px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Keyframe Animations */
    @keyframes floatGlow {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.45; }
      50% { transform: translate3d(15px, -18px, 0) scale(1.08); opacity: 0.7; }
    }

    @keyframes pulseDot {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.45); opacity: 0.45; }
    }

    @keyframes heroReveal {
      from { opacity: 0; transform: translateY(26px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .reveal {
      opacity: 0;
      transform: translateY(28px);
      transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .reveal.visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* Sticky Luxury Header */
    header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background: rgba(10, 10, 9, 0.84);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-bottom: 1px solid var(--border-gold);
    }

    .nav-bar {
      height: 82px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }

    .brand-identity {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-emblem {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(201, 169, 110, 0.22), rgba(201, 169, 110, 0.05));
      border: 1px solid var(--gold);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--gold);
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      font-size: 18px;
      box-shadow: 0 4px 20px rgba(201, 169, 110, 0.15);
    }

    .brand-name {
      font-family: 'Playfair Display', serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.01em;
      color: var(--text-cream);
    }

    .brand-sub {
      display: block;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      color: var(--gold);
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 32px;
    }

    .nav-links a {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--text-muted);
    }

    .nav-links a:hover {
      color: var(--gold-bright);
    }

    .btn-gold {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: linear-gradient(135deg, #D8B77B 0%, #B89150 100%);
      color: #0A0A09;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 13px 24px;
      border-radius: 10px;
      box-shadow: 0 10px 28px rgba(201, 169, 110, 0.25);
    }

    .btn-gold:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 34px rgba(201, 169, 110, 0.38);
      background: linear-gradient(135deg, #E5C78E 0%, #C9A96E 100%);
    }

    .btn-outline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-cream);
      border: 1px solid var(--border-gold);
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 13px 24px;
      border-radius: 10px;
    }

    .btn-outline:hover {
      border-color: var(--gold-bright);
      background: rgba(201, 169, 110, 0.1);
      transform: translateY(-2px);
    }

    /* Hero Section */
    .hero {
      position: relative;
      min-height: 94vh;
      padding: 148px 0 96px;
      display: flex;
      align-items: center;
      overflow: hidden;
      background:
        radial-gradient(circle at 82% 22%, rgba(201, 169, 110, 0.16), transparent 42%),
        radial-gradient(circle at 18% 78%, rgba(201, 169, 110, 0.1), transparent 48%),
        linear-gradient(180deg, rgba(10, 10, 9, 0.72) 0%, rgba(10, 10, 9, 0.94) 100%),
        url('https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1920&q=85') center/cover no-repeat;
    }

    .hero-glow {
      position: absolute;
      width: 460px;
      height: 460px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(201, 169, 110, 0.22) 0%, transparent 70%);
      top: 12%;
      right: 8%;
      pointer-events: none;
      animation: floatGlow 9s ease-in-out infinite;
    }

    .hero-grid {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 56px;
      align-items: center;
    }

    .chair-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      border-radius: 999px;
      background: rgba(26, 25, 23, 0.88);
      border: 1px solid var(--border-gold);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--gold-bright);
      margin-bottom: 24px;
      animation: heroReveal 0.7s ease-out both;
    }

    .chair-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 12px #10B981;
      animation: pulseDot 2s infinite;
    }

    .hero h1 {
      font-size: clamp(40px, 5.4vw, 68px);
      line-height: 1.08;
      margin-bottom: 22px;
      color: var(--text-cream);
      animation: heroReveal 0.85s ease-out 0.1s both;
    }

    .hero h1 em {
      color: var(--gold);
      font-style: italic;
    }

    .hero-lead {
      font-size: 17px;
      color: var(--text-muted);
      max-width: 580px;
      margin-bottom: 34px;
      animation: heroReveal 0.95s ease-out 0.2s both;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-bottom: 44px;
      animation: heroReveal 1s ease-out 0.3s both;
    }

    .hero-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      padding-top: 28px;
      border-top: 1px solid var(--border-subtle);
      animation: heroReveal 1.1s ease-out 0.4s both;
    }

    .metric-val {
      font-family: 'Playfair Display', serif;
      font-size: 28px;
      font-weight: 700;
      color: var(--gold-bright);
      line-height: 1.1;
    }

    .metric-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Hero Showcase Card */
    .hero-card {
      background: linear-gradient(160deg, rgba(26, 25, 23, 0.95), rgba(18, 18, 16, 0.92));
      border: 1px solid var(--border-gold);
      border-radius: 22px;
      padding: 28px;
      box-shadow: 0 28px 64px rgba(0, 0, 0, 0.65);
      animation: heroReveal 1s ease-out 0.25s both;
    }

    .hero-card-img {
      width: 100%;
      height: 270px;
      object-fit: cover;
      border-radius: 14px;
      margin-bottom: 22px;
      border: 1px solid var(--border-subtle);
    }

    .hero-card-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 16px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .section {
      padding: 100px 0;
      border-top: 1px solid var(--border-subtle);
    }

    .section-header {
      text-align: center;
      max-width: 680px;
      margin: 0 auto 56px;
    }

    .eyebrow {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.24em;
      color: var(--gold);
      margin-bottom: 12px;
    }

    .section-title {
      font-size: clamp(32px, 4vw, 48px);
      line-height: 1.15;
      margin-bottom: 14px;
    }

    .section-desc {
      color: var(--text-muted);
      font-size: 15px;
    }

    /* Interactive Service Filter Tabs */
    .service-tabs {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 40px;
    }

    .tab-btn {
      padding: 10px 20px;
      border-radius: 999px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.25s ease;
    }

    .tab-btn.active, .tab-btn:hover {
      background: var(--gold);
      color: #0A0A09;
      border-color: var(--gold);
      font-weight: 700;
    }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 22px;
    }

    .service-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 18px;
      padding: 28px;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .service-card:hover {
      border-color: var(--gold);
      transform: translateY(-4px);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
    }

    .service-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }

    .service-name {
      font-size: 21px;
      font-weight: 600;
      color: var(--text-cream);
    }

    .service-price {
      font-family: 'Playfair Display', serif;
      font-size: 24px;
      font-weight: 700;
      color: var(--gold-bright);
      white-space: nowrap;
    }

    .service-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid var(--border-subtle);
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Master Barbers Grid */
    .barbers-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
    }

    .barber-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 20px;
      overflow: hidden;
      transition: all 0.35s ease;
    }

    .barber-card:hover {
      border-color: var(--gold);
      transform: translateY(-6px);
    }

    .barber-img {
      width: 100%;
      height: 320px;
      object-fit: cover;
      display: block;
    }

    .barber-body {
      padding: 24px;
    }

    .barber-role {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--gold);
      margin-bottom: 6px;
    }

    .barber-name {
      font-size: 22px;
      margin-bottom: 10px;
    }

    /* Gallery Grid */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 18px;
    }

    .gallery-item {
      position: relative;
      border-radius: 16px;
      overflow: hidden;
      height: 260px;
      border: 1px solid var(--border-subtle);
    }

    .gallery-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.6s ease;
    }

    .gallery-item:hover img {
      transform: scale(1.07);
    }

    /* Reviews Grid */
    .reviews-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    .review-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 18px;
      padding: 28px;
    }

    .stars {
      color: var(--gold);
      font-size: 15px;
      letter-spacing: 2px;
      margin-bottom: 14px;
    }

    /* Footer */
    footer {
      background: #070706;
      border-top: 1px solid var(--border-gold);
      padding: 72px 0 40px;
    }

    .footer-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr;
      gap: 40px;
      margin-bottom: 48px;
    }

    @media (max-width: 920px) {
      .hero-grid, .services-grid, .barbers-grid, .reviews-grid, .footer-grid {
        grid-template-columns: 1fr;
      }
      .gallery-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .nav-links {
        display: none;
      }
    }
  </style>
</head>
<body>

  <!-- STICKY LUXURY HEADER -->
  <header>
    <div class="container nav-bar">
      <a href="#top" class="brand-identity">
        <div class="brand-emblem">✦</div>
        <div>
          <span class="brand-name">{{BUSINESS_NAME}}</span>
          <span class="brand-sub">Executive Grooming • {{CITY}}</span>
        </div>
      </a>

      <nav class="nav-links">
        <a href="#services">Service Menu</a>
        <a href="#barbers">Master Barbers</a>
        <a href="#atmosphere">Lounge</a>
        <a href="#reviews">Client Reviews</a>
        <a href="#visit">Location</a>
      </nav>

      <a href="tel:{{PHONE}}" class="btn-gold">Call {{PHONE}}</a>
    </div>
  </header>

  <!-- CINEMATIC FULL-SCREEN HERO -->
  <section id="top" class="hero">
    <div class="hero-glow"></div>
    <div class="container hero-grid">
      <div>
        <div class="chair-pill">
          <span class="chair-dot"></span>
          <span>Live Chair Status: Accepting Walk-Ins &amp; Bookings in {{CITY}}</span>
        </div>
        <h1>Bespoke Tailored Cuts &amp; <em>Hot-Towel Rituals</em> in {{CITY}}</h1>
        <p class="hero-lead">
          Welcome to <strong>{{BUSINESS_NAME}}</strong>. Experience old-world straight-razor craftsmanship, precision skin fades, and private lounge hospitality at {{ADDRESS}}.
        </p>
        <div class="hero-actions">
          <a href="tel:{{PHONE}}" class="btn-gold">Book Your Chair • {{PHONE}}</a>
          <a href="#services" class="btn-outline">Explore Service Menu</a>
        </div>
        <div class="hero-metrics">
          <div>
            <div class="metric-val">4.9 ★</div>
            <div class="metric-label">Top-Rated Lounge in {{CITY}}</div>
          </div>
          <div>
            <div class="metric-val">45 Min</div>
            <div class="metric-label">Unrushed Precision Sessions</div>
          </div>
          <div>
            <div class="metric-val">100%</div>
            <div class="metric-label">Master Craft Guarantee</div>
          </div>
        </div>
      </div>

      <div class="hero-card">
        <img
          class="hero-card-img"
          src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1000&q=85"
          alt="{{BUSINESS_NAME}} Executive Chair"
        />
        <div class="hero-card-badge">
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:var(--gold);font-weight:700;">Signature Ritual</div>
            <div class="serif" style="font-size:20px;font-weight:600;color:var(--text-cream);">The Executive Cut &amp; Steam Shave</div>
          </div>
          <div class="serif" style="font-size:26px;font-weight:700;color:var(--gold-bright);">$85</div>
        </div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">
          Tailored scissor &amp; taper cut, eucalyptus hot-towel straight-razor shave, charcoal facial mist, and shoulder massage.
        </p>
        <a href="tel:{{PHONE}}" class="btn-gold" style="width:100%;">Reserve Immediate Chair • {{PHONE}}</a>
      </div>
    </div>
  </section>

  <!-- INTERACTIVE SIGNATURE SERVICE MENU -->
  <section id="services" class="section">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">Craft &amp; Rituals</span>
        <h2 class="section-title">Signature Grooming Menu</h2>
        <p class="section-desc">
          Every appointment at {{BUSINESS_NAME}} includes a personal style consultation, hot-towel neck shave, and complimentary espresso or top-shelf pour.
        </p>
      </div>

      <div class="service-tabs reveal">
        <button type="button" class="tab-btn active" data-filter="all">All Services</button>
        <button type="button" class="tab-btn" data-filter="cuts">Precision Cuts &amp; Fades</button>
        <button type="button" class="tab-btn" data-filter="shaves">Beard &amp; Razor Shaves</button>
        <button type="button" class="tab-btn" data-filter="vip">Executive Packages</button>
      </div>

      <div class="services-grid">
        <div class="service-card reveal" data-category="cuts">
          <div>
            <div class="service-top">
              <h3 class="service-name">The Sovereign Bespoke Haircut</h3>
              <span class="service-price">$50</span>
            </div>
            <p style="font-size:14px;color:var(--text-muted);">
              Precision shear work and seamless taper tailored to your cranial structure, finished with hot-towel straight-razor neck detailing and invigorating tonic.
            </p>
          </div>
          <div class="service-meta">
            <span>⏱ 45 Minutes • Master Barber</span>
            <a href="tel:{{PHONE}}" style="color:var(--gold);font-weight:700;">Book via {{PHONE}} →</a>
          </div>
        </div>

        <div class="service-card reveal" data-category="cuts">
          <div>
            <div class="service-top">
              <h3 class="service-name">Zero-Fade &amp; Razor Lineup</h3>
              <span class="service-price">$55</span>
            </div>
            <p style="font-size:14px;color:var(--text-muted);">
              Ultra-clean foil skin fade blended with surgical accuracy, crisp razor edge-up, invigorating shampoo, and matte texture styling.
            </p>
          </div>
          <div class="service-meta">
            <span>⏱ 45 Minutes • Skin Fade Specialist</span>
            <a href="tel:{{PHONE}}" style="color:var(--gold);font-weight:700;">Book via {{PHONE}} →</a>
          </div>
        </div>

        <div class="service-card reveal" data-category="shaves">
          <div>
            <div class="service-top">
              <h3 class="service-name">Royal Hot-Towel Straight-Razor Shave</h3>
              <span class="service-price">$55</span>
            </div>
            <p style="font-size:14px;color:var(--text-muted);">
              Three-stage essential oil steam towels, rich sandalwood lather, two-pass straight-razor shave, and cooling alum block finish.
            </p>
          </div>
          <div class="service-meta">
            <span>⏱ 40 Minutes • Traditional Ritual</span>
            <a href="tel:{{PHONE}}" style="color:var(--gold);font-weight:700;">Book via {{PHONE}} →</a>
          </div>
        </div>

        <div class="service-card reveal" data-category="shaves">
          <div>
            <div class="service-top">
              <h3 class="service-name">Beard Sculpting &amp; Conditioning</h3>
              <span class="service-price">$40</span>
            </div>
            <p style="font-size:14px;color:var(--text-muted);">
              Architectural beard shaping, cheek and neckline straight-razor definition, aromatic steam towel, and organic cedarwood oil treatment.
            </p>
          </div>
          <div class="service-meta">
            <span>⏱ 30 Minutes • Beard Architecture</span>
            <a href="tel:{{PHONE}}" style="color:var(--gold);font-weight:700;">Book via {{PHONE}} →</a>
          </div>
        </div>

        <div class="service-card reveal" data-category="vip">
          <div>
            <div class="service-top">
              <h3 class="service-name">The Executive Full Service</h3>
              <span class="service-price">$85</span>
            </div>
            <p style="font-size:14px;color:var(--text-muted);">
              Our flagship experience combining the Sovereign Bespoke Haircut with a sculpted beard trim or royal hot-towel shave and charcoal peel mask.
            </p>
          </div>
          <div class="service-meta">
            <span>⏱ 75 Minutes • Most Popular</span>
            <a href="tel:{{PHONE}}" style="color:var(--gold);font-weight:700;">Book via {{PHONE}} →</a>
          </div>
        </div>

        <div class="service-card reveal" data-category="vip">
          <div>
            <div class="service-top">
              <h3 class="service-name">Chairman's Private Grooming Ritual</h3>
              <span class="service-price">$115</span>
            </div>
            <p style="font-size:14px;color:var(--text-muted);">
              Complete transformation: bespoke cut, hot-towel straight-razor shave, detoxifying facial steam, scalp massage, and eyebrow detailing.
            </p>
          </div>
          <div class="service-meta">
            <span>⏱ 90 Minutes • VIP Lounge</span>
            <a href="tel:{{PHONE}}" style="color:var(--gold);font-weight:700;">Book via {{PHONE}} →</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- MASTER BARBERS SHOWCASE -->
  <section id="barbers" class="section" style="background:var(--bg-surface);">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">The Artisans</span>
        <h2 class="section-title">Meet Our Master Barbers</h2>
        <p class="section-desc">
          Trained in classical European scissor tailoring and modern precision fading in {{CITY}}.
        </p>
      </div>

      <div class="barbers-grid">
        <div class="barber-card reveal">
          <img class="barber-img" src="https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80" alt="Master Barber" />
          <div class="barber-body">
            <div class="barber-role">Founder &amp; Master Barber • 14 Yrs</div>
            <h3 class="barber-name">Marcus Vance</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
              Specializes in executive scissor cuts, classic pompadours, and traditional Italian hot-towel razor work.
            </p>
            <a href="tel:{{PHONE}}" class="btn-outline" style="width:100%;padding:10px 16px;font-size:12px;">Book Chair with Marcus</a>
          </div>
        </div>

        <div class="barber-card reveal">
          <img class="barber-img" src="https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80" alt="Senior Barber" />
          <div class="barber-body">
            <div class="barber-role">Lead Fade Architect • 9 Yrs</div>
            <h3 class="barber-name">Julian Cross</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
              Renowned for seamless zero-fades, textured crop styling, and razor-sharp geometric beard sculpting.
            </p>
            <a href="tel:{{PHONE}}" class="btn-outline" style="width:100%;padding:10px 16px;font-size:12px;">Book Chair with Julian</a>
          </div>
        </div>

        <div class="barber-card reveal">
          <img class="barber-img" src="https://images.unsplash.com/photo-1517832607067-4db24a2ae47c?auto=format&fit=crop&w=800&q=80" alt="Shave Specialist" />
          <div class="barber-body">
            <div class="barber-role">Straight-Razor Specialist • 11 Yrs</div>
            <h3 class="barber-name">Mateo Reyes</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
              Master of luxury beard conditioning, hot-towel apothecary rituals, and tailored gentleman contours.
            </p>
            <a href="tel:{{PHONE}}" class="btn-outline" style="width:100%;padding:10px 16px;font-size:12px;">Book Chair with Mateo</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- LOUNGE ATMOSPHERE GALLERY -->
  <section id="atmosphere" class="section">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">The Sanctuary</span>
        <h2 class="section-title">Inside {{BUSINESS_NAME}}</h2>
        <p class="section-desc">
          Custom Belmont leather chairs, warm mahogany millwork, and an unhurried private club atmosphere in the heart of {{CITY}}.
        </p>
      </div>

      <div class="gallery-grid reveal">
        <div class="gallery-item">
          <img src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80" alt="Lounge Interior" />
        </div>
        <div class="gallery-item">
          <img src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80" alt="Precision Detailing" />
        </div>
        <div class="gallery-item">
          <img src="https://images.unsplash.com/photo-1621607512214-68297480165e?auto=format&fit=crop&w=800&q=80" alt="Artisan Tools" />
        </div>
        <div class="gallery-item">
          <img src="https://images.unsplash.com/photo-1593702288056-7927b442d0fa?auto=format&fit=crop&w=800&q=80" alt="Hot Towel Shave" />
        </div>
      </div>
    </div>
  </section>

  <!-- VERIFIED CLIENT REVIEWS -->
  <section id="reviews" class="section" style="background:var(--bg-surface);">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">Client Acclaim</span>
        <h2 class="section-title">Trusted by Gentlemen Across {{CITY}}</h2>
        <p class="section-desc">
          Consistent five-star craftsmanship and unmatched attention to detail.
        </p>
      </div>

      <div class="reviews-grid">
        <div class="review-card reveal">
          <div class="stars">★★★★★</div>
          <p style="font-size:14px;color:var(--text-cream);margin-bottom:18px;">
            "Hands down the finest grooming experience in {{CITY}}. The hot-towel straight-razor shave and skin fade at {{BUSINESS_NAME}} are unmatched."
          </p>
          <div style="font-size:12px;color:var(--gold);font-weight:700;">— Alexander H. • Executive Client</div>
        </div>

        <div class="review-card reveal">
          <div class="stars">★★★★★</div>
          <p style="font-size:14px;color:var(--text-cream);margin-bottom:18px;">
            "From the espresso on arrival to the precision scissor work, {{BUSINESS_NAME}} feels like a private members club. Worth every dollar."
          </p>
          <div style="font-size:12px;color:var(--gold);font-weight:700;">— Devon K. • Regular Member</div>
        </div>

        <div class="review-card reveal">
          <div class="stars">★★★★★</div>
          <p style="font-size:14px;color:var(--text-cream);margin-bottom:18px;">
            "Finally found a master barber in {{CITY}} who understands beard architecture and natural tapers. I never go anywhere else."
          </p>
          <div style="font-size:12px;color:var(--gold);font-weight:700;">— Liam R. • Verified Client</div>
        </div>
      </div>
    </div>
  </section>

  <!-- LOCATION & HOURS FOOTER -->
  <footer id="visit">
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="brand-identity" style="margin-bottom:16px;">
            <div class="brand-emblem">✦</div>
            <div>
              <span class="brand-name">{{BUSINESS_NAME}}</span>
              <span class="brand-sub">{{CITY}}</span>
            </div>
          </div>
          <p style="font-size:14px;color:var(--text-muted);max-width:360px;margin-bottom:20px;">
            Elevating traditional barbering into an executive ritual. Walk-ins welcome; direct phone reservations recommended.
          </p>
          <a href="tel:{{PHONE}}" class="btn-gold">Call {{PHONE}} to Book</a>
        </div>

        <div>
          <h4 class="serif" style="font-size:18px;color:var(--gold);margin-bottom:14px;">Lounge Location</h4>
          <p style="font-size:14px;color:var(--text-cream);margin-bottom:8px;">{{ADDRESS}}</p>
          <p style="font-size:14px;color:var(--text-muted);margin-bottom:12px;">{{CITY}}</p>
          <p style="font-size:14px;margin-bottom:6px;">
            <a href="tel:{{PHONE}}" style="color:var(--gold-bright);font-weight:700;">{{PHONE}}</a>
          </p>
          <p style="font-size:13px;color:var(--text-muted);">
            <a href="mailto:concierge@{{BUSINESS_NAME}}">concierge@{{BUSINESS_NAME}}</a>
          </p>
        </div>

        <div>
          <h4 class="serif" style="font-size:18px;color:var(--gold);margin-bottom:14px;">Grooming Hours</h4>
          <p style="font-size:13px;color:var(--text-cream);margin-bottom:6px;">Mon – Fri: 9:00 AM – 8:00 PM</p>
          <p style="font-size:13px;color:var(--text-cream);margin-bottom:6px;">Saturday: 8:30 AM – 6:00 PM</p>
          <p style="font-size:13px;color:var(--text-muted);">Sunday: Private Bookings &amp; VIP</p>
        </div>
      </div>

      <div style="padding-top:28px;border-top:1px solid var(--border-subtle);display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;font-size:12px;color:var(--text-muted);">
        <span>© 2025 {{BUSINESS_NAME}} • {{ADDRESS}}, {{CITY}}</span>
        <span>Direct Reservations: <a href="tel:{{PHONE}}" style="color:var(--gold);">{{PHONE}}</a></span>
      </div>
    </div>
  </footer>

  <script>
    (function() {
      // Smooth scroll-reveal observer
      var reveals = document.querySelectorAll('.reveal');
      if ('IntersectionObserver' in window) {
        var obs = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
            }
          });
        }, { threshold: 0.12 });
        reveals.forEach(function(el) { obs.observe(el); });
      } else {
        reveals.forEach(function(el) { el.classList.add('visible'); });
      }

      // Interactive service category tabs
      var tabs = document.querySelectorAll('.tab-btn');
      var cards = document.querySelectorAll('.service-card');
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          var filter = tab.getAttribute('data-filter');
          cards.forEach(function(card) {
            var cat = card.getAttribute('data-category');
            if (!filter || filter === 'all' || cat === filter) {
              card.style.display = 'flex';
            } else {
              card.style.display = 'none';
            }
          });
        });
      });
    })();
  </script>
</body>
</html>`;

export function getSpecialBarberHistoryEntry(): SiteHistoryEntry {
  return {
    id: SPECIAL_BARBER_VIBE_ID,
    parentSlug: SPECIAL_BARBER_VIBE_SLUG,
    title: SPECIAL_BARBER_VIBE_TITLE,
    niche: SPECIAL_BARBER_VIBE_NICHE,
    html: SPECIAL_BARBER_RAW_HTML,
    snapshotLabel: 'Luxury Dark Barber Shop',
    isTemplate: false,
    templateId: null,
    templateName: null,
    createdAt: Date.now() - 120000,
  };
}
