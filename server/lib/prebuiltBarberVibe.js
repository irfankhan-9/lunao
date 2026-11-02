// Isolated Pre-Built Luxury Barber Shop Vibe Template for Server Template Resolver
// Guarantees zero mismatch when UGC creators or sales reps deploy the bespoke barber vibe template.

export const SPECIAL_BARBER_VIBE_ID = 'hist_special_barber_vibe_01';
export const SPECIAL_BARBER_VIBE_SLUG = 'studio-sovereign-blade-barber';
export const SPECIAL_BARBER_VIBE_TITLE = 'Sovereign Blade Barber Lounge';
export const SPECIAL_BARBER_VIBE_NICHE = 'Barber';

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
    @keyframes goldGlow {
      0%, 100% { box-shadow: 0 0 20px rgba(201, 169, 110, 0.2); }
      50% { box-shadow: 0 0 35px rgba(229, 199, 142, 0.45); }
    }

    @keyframes pulseDot {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.6; }
    }

    /* Top Utility Bar */
    .utility-bar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
      padding: 8px 0;
      color: var(--text-muted);
    }

    .utility-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      background: #22c55e;
      border-radius: 50%;
      animation: pulseDot 2s infinite ease-in-out;
    }

    /* Navigation Header */
    header.site-header {
      position: sticky;
      top: 0;
      z-index: 99;
      background: rgba(10, 10, 9, 0.88);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--border-subtle);
      padding: 18px 0;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 21px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text-cream);
    }

    .brand-logo svg {
      width: 28px;
      height: 28px;
      color: var(--gold);
    }

    .brand-logo span.city-tag {
      font-size: 12px;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-weight: 500;
      color: var(--gold);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding-left: 8px;
      border-left: 1px solid var(--border-gold);
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 28px;
      list-style: none;
    }

    .nav-links a {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }

    .nav-links a:hover {
      color: var(--gold-bright);
    }

    .btn-gold {
      background: linear-gradient(135deg, var(--gold) 0%, #B89255 100%);
      color: #0A0A09;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 12px 24px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 18px rgba(201, 169, 110, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .btn-gold:hover {
      background: linear-gradient(135deg, var(--gold-bright) 0%, var(--gold) 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(201, 169, 110, 0.4);
    }

    .btn-outline {
      background: transparent;
      border: 1px solid var(--border-gold);
      color: var(--text-cream);
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 12px 24px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .btn-outline:hover {
      background: var(--gold-dim);
      border-color: var(--gold-bright);
      color: var(--gold-bright);
    }

    /* Hero Section */
    .hero-section {
      position: relative;
      padding: 100px 0 120px;
      overflow: hidden;
      background: radial-gradient(circle at 75% 25%, rgba(201, 169, 110, 0.09) 0%, transparent 60%);
    }

    .hero-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 60px;
      align-items: center;
    }

    .hero-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--gold);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 20px;
    }

    .hero-eyebrow::before {
      content: '';
      width: 28px;
      height: 1px;
      background: var(--gold);
    }

    .hero-title {
      font-size: 60px;
      line-height: 1.08;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 24px;
      color: var(--text-cream);
    }

    .hero-title span.gold-text {
      background: linear-gradient(135deg, #FBF6EE 0%, var(--gold-bright) 50%, var(--gold) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-description {
      font-size: 18px;
      line-height: 1.65;
      color: var(--text-muted);
      margin-bottom: 36px;
      max-width: 540px;
    }

    .hero-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 48px;
    }

    .hero-trust-strip {
      display: flex;
      align-items: center;
      gap: 32px;
      padding-top: 32px;
      border-top: 1px solid var(--border-subtle);
    }

    .trust-metric h4 {
      font-size: 24px;
      font-weight: 700;
      color: var(--gold-bright);
      margin-bottom: 2px;
    }

    .trust-metric p {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Hero Card Display */
    .hero-card-stack {
      position: relative;
    }

    .hero-main-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-gold);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
    }

    .hero-image-wrap {
      width: 100%;
      height: 380px;
      position: relative;
      background: #191815;
    }

    .hero-image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: contrast(1.08) brightness(0.92);
    }

    .hero-card-body {
      padding: 24px;
      background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-elevated) 100%);
    }

    .card-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .card-meta-row h3 {
      font-size: 18px;
      font-weight: 700;
    }

    .card-meta-row .rating {
      color: var(--gold-bright);
      font-weight: 700;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .card-location {
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Services Section */
    .section-wrap {
      padding: 100px 0;
      position: relative;
    }

    .section-wrap.alt-bg {
      background: var(--bg-surface);
      border-top: 1px solid var(--border-subtle);
      border-bottom: 1px solid var(--border-subtle);
    }

    .section-header {
      text-align: center;
      max-width: 680px;
      margin: 0 auto 60px;
    }

    .section-subtitle {
      color: var(--gold);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .section-title {
      font-size: 40px;
      line-height: 1.15;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .section-desc {
      font-size: 16px;
      color: var(--text-muted);
    }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    .service-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 32px 28px;
      position: relative;
      transition: all 0.3s ease;
    }

    .service-card:hover {
      border-color: var(--border-gold);
      transform: translateY(-4px);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
    }

    .service-card.featured {
      border-color: var(--gold);
      background: linear-gradient(180deg, rgba(201, 169, 110, 0.08) 0%, var(--bg-elevated) 100%);
    }

    .service-badge {
      position: absolute;
      top: -12px;
      right: 24px;
      background: var(--gold);
      color: #0A0A09;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 4px;
    }

    .service-icon {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: var(--gold-dim);
      border: 1px solid var(--border-gold);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--gold-bright);
      margin-bottom: 20px;
    }

    .service-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .service-price-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 14px;
    }

    .service-price {
      font-size: 28px;
      font-weight: 700;
      color: var(--gold-bright);
      font-family: 'Playfair Display', serif;
    }

    .service-duration {
      font-size: 13px;
      color: var(--text-muted);
    }

    .service-card p.service-text {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 24px;
    }

    .service-book-btn {
      width: 100%;
      text-align: center;
      display: block;
      padding: 10px;
      background: transparent;
      border: 1px solid var(--border-gold);
      color: var(--gold-bright);
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .service-book-btn:hover {
      background: var(--gold);
      color: #0A0A09;
    }

    /* Barbers Showcase */
    .barbers-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
    }

    .barber-profile {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      overflow: hidden;
      text-align: center;
    }

    .barber-photo {
      height: 280px;
      width: 100%;
      background: #1a1917;
      overflow: hidden;
    }

    .barber-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }

    .barber-profile:hover .barber-photo img {
      transform: scale(1.05);
    }

    .barber-info {
      padding: 24px;
    }

    .barber-info h4 {
      font-size: 19px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .barber-info p.role {
      font-size: 12px;
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 12px;
    }

    .barber-info p.bio {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.55;
    }

    /* Reviews Section */
    .reviews-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    .review-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 28px;
    }

    .review-stars {
      color: var(--gold-bright);
      margin-bottom: 14px;
      font-size: 15px;
    }

    .review-quote {
      font-size: 15px;
      line-height: 1.6;
      color: var(--text-cream);
      margin-bottom: 18px;
      font-style: italic;
    }

    .review-author {
      font-size: 13px;
      font-weight: 700;
      color: var(--gold);
    }

    /* CTA Call Banner */
    .cta-banner {
      background: linear-gradient(135deg, #1C1A16 0%, var(--bg-surface) 100%);
      border: 1px solid var(--border-gold);
      border-radius: 16px;
      padding: 60px 48px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }

    .cta-banner h2 {
      font-size: 42px;
      margin-bottom: 16px;
    }

    .cta-banner p {
      font-size: 17px;
      color: var(--text-muted);
      max-width: 600px;
      margin: 0 auto 32px;
    }

    /* Footer */
    footer.site-footer {
      background: #060605;
      border-top: 1px solid var(--border-subtle);
      padding: 60px 0 32px;
      font-size: 14px;
      color: var(--text-muted);
    }

    .footer-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr;
      gap: 40px;
      margin-bottom: 48px;
    }

    .footer-brand h3 {
      color: var(--text-cream);
      font-size: 20px;
      margin-bottom: 14px;
    }

    .footer-col h4 {
      color: var(--text-cream);
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 16px;
    }

    .footer-col p {
      line-height: 1.8;
    }

    .footer-bottom {
      padding-top: 28px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      text-align: center;
      font-size: 12px;
      color: #666;
    }

    @media (max-width: 900px) {
      .hero-grid { grid-template-columns: 1fr; gap: 40px; }
      .services-grid, .barbers-grid, .reviews-grid { grid-template-columns: 1fr; }
      .footer-grid { grid-template-columns: 1fr; }
      .hero-title { font-size: 42px; }
    }
  </style>
</head>
<body>

  <!-- Top Announcement Bar -->
  <div class="utility-bar">
    <div class="container utility-content">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span class="status-badge">
          <span class="status-dot"></span>
          Master Barbers On Deck
        </span>
        <span>Executive cuts, beard sculpting & hot towel shaves in {{CITY}}</span>
      </div>
      <div>
        <a href="tel:{{PHONE_RAW}}" style="color: var(--gold-bright); font-weight: 600;">Direct Chair Booking: {{PHONE_DISPLAY}}</a>
      </div>
    </div>
  </div>

  <!-- Header -->
  <header class="site-header">
    <div class="container header-content">
      <a href="#" class="brand-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="3"></circle>
          <circle cx="6" cy="18" r="3"></circle>
          <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
          <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
          <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
        </svg>
        <span>{{BUSINESS_NAME}}</span>
        <span class="city-tag">{{CITY}}</span>
      </a>

      <nav class="nav-links">
        <a href="#services">Services & Pricing</a>
        <a href="#master-barbers">Barbers</a>
        <a href="#experience">Lounge</a>
        <a href="#contact">Location</a>
      </nav>

      <a href="tel:{{PHONE_RAW}}" class="btn-gold">
        Book Appointment
      </a>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="hero-section">
    <div class="container hero-grid">
      <div>
        <div class="hero-eyebrow">The Premier Grooming Standard</div>
        <h1 class="hero-title">
          Classic Craft. <br>
          <span class="gold-text">{{BUSINESS_NAME}}</span>
        </h1>
        <p class="hero-description">
          Experience bespoke grooming designed for discerning gentlemen in {{CITY}}. Precision skin fades, hot-lather straight razor shaves, and custom beard contouring delivered with uncompromising hospitality.
        </p>
        <div class="hero-actions">
          <a href="tel:{{PHONE_RAW}}" class="btn-gold">
            Call To Reserve ({{PHONE_DISPLAY}})
          </a>
          <a href="#services" class="btn-outline">
            View Service Menu
          </a>
        </div>
        <div class="hero-trust-strip">
          <div class="trust-metric">
            <h4>4.9 ★</h4>
            <p>Google Verified (340+)</p>
          </div>
          <div class="trust-metric">
            <h4>10+ Yrs</h4>
            <p>Master Craftsmanship</p>
          </div>
          <div class="trust-metric">
            <h4>100%</h4>
            <p>Satisfaction Guarantee</p>
          </div>
        </div>
      </div>

      <div class="hero-card-stack">
        <div class="hero-main-card">
          <div class="hero-image-wrap">
            <img src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1000&q=80" alt="{{BUSINESS_NAME}} Grooming Lounge">
          </div>
          <div class="hero-card-body">
            <div class="card-meta-row">
              <h3>{{BUSINESS_NAME}}</h3>
              <div class="rating">★★★★★ 4.9</div>
            </div>
            <div class="card-location">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span>{{ADDRESS}}, {{CITY}}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Services & Pricing Menu -->
  <section id="services" class="section-wrap alt-bg">
    <div class="container">
      <div class="section-header">
        <div class="section-subtitle">Precision Grooming Menu</div>
        <h2 class="section-title">Crafted Services & Transparent Rates</h2>
        <p class="section-desc">Every appointment includes an executive consultation, warm steam towel infusion, and artisanal neck taper finish.</p>
      </div>

      <div class="services-grid">
        <div class="service-card">
          <div class="service-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V2"></path><path d="M6 7h12"></path></svg>
          </div>
          <h3 class="service-title">The Sovereign Cut</h3>
          <div class="service-price-row">
            <span class="service-price">$45</span>
            <span class="service-duration">/ 45 mins</span>
          </div>
          <p class="service-text">Complete precision shear & clipper cut, tailored side taper, razor neck line up, and aromatic hot steam towel treatment.</p>
          <a href="tel:{{PHONE_RAW}}" class="service-book-btn">Book {{PHONE_DISPLAY}}</a>
        </div>

        <div class="service-card featured">
          <span class="service-badge">Signature Experience</span>
          <div class="service-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line></svg>
          </div>
          <h3 class="service-title">Hot Lather Razor Shave</h3>
          <div class="service-price-row">
            <span class="service-price">$55</span>
            <span class="service-duration">/ 50 mins</span>
          </div>
          <p class="service-text">Traditional Japanese straight-razor shave with three eucalyptus steam towels, botanical pre-shave balm, and cold marble finish.</p>
          <a href="tel:{{PHONE_RAW}}" class="service-book-btn">Book {{PHONE_DISPLAY}}</a>
        </div>

        <div class="service-card">
          <div class="service-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path></svg>
          </div>
          <h3 class="service-title">Beard Sculpt & Conditioning</h3>
          <div class="service-price-row">
            <span class="service-price">$35</span>
            <span class="service-duration">/ 30 mins</span>
          </div>
          <p class="service-text">Free-hand razor line work, volume taper, organic sandalwood beard oil massage, and high-frequency ozone conditioning.</p>
          <a href="tel:{{PHONE_RAW}}" class="service-book-btn">Book {{PHONE_DISPLAY}}</a>
        </div>
      </div>
    </div>
  </section>

  <!-- Master Barbers Showcase -->
  <section id="master-barbers" class="section-wrap">
    <div class="container">
      <div class="section-header">
        <div class="section-subtitle">The Artisans</div>
        <h2 class="section-title">Master Barbers at {{BUSINESS_NAME}}</h2>
        <p class="section-desc">Classically apprenticed professionals dedicated to the heritage of executive masculine grooming in {{CITY}}.</p>
      </div>

      <div class="barbers-grid">
        <div class="barber-profile">
          <div class="barber-photo">
            <img src="https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=700&q=80" alt="Master Barber Julian">
          </div>
          <div class="barber-info">
            <h4>Julian Vance</h4>
            <p class="role">Head Barber & Founder</p>
            <p class="bio">14 years craft mastery specializing in vintage scissoring and straight razor alignment.</p>
          </div>
        </div>

        <div class="barber-profile">
          <div class="barber-photo">
            <img src="https://images.unsplash.com/photo-1517832606589-7629c3395909?auto=format&fit=crop&w=700&q=80" alt="Master Barber Marcus">
          </div>
          <div class="barber-info">
            <h4>Marcus Sterling</h4>
            <p class="role">Fade & Beard Specialist</p>
            <p class="bio">Award-winning editorial barber known for surgical skin fades and bespoke beard design.</p>
          </div>
        </div>

        <div class="barber-profile">
          <div class="barber-photo">
            <img src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=700&q=80" alt="Master Barber Dominic">
          </div>
          <div class="barber-info">
            <h4>Dominic Cruz</h4>
            <p class="role">Traditional Shave Artisan</p>
            <p class="bio">Expert in classical hot-towel straight-edge routines and restorative scalp therapies.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Verified Client Reviews -->
  <section class="section-wrap alt-bg">
    <div class="container">
      <div class="section-header">
        <div class="section-subtitle">Client Endorsements</div>
        <h2 class="section-title">Trusted By Executives Across {{CITY}}</h2>
        <p class="section-desc">Consistent 4.9-star rating with over 340 verified Google reviews.</p>
      </div>

      <div class="reviews-grid">
        <div class="review-card">
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">"Hands down the highest caliber barber lounge in {{CITY}}. The atmosphere is mature, the straight-razor shave is unmatched, and they respect your schedule."</p>
          <div class="review-author">— Thomas R., Managing Partner</div>
        </div>

        <div class="review-card">
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">"Finding a shop that understands classic scissor work and modern tapers is rare. {{BUSINESS_NAME}} knocked it out of the park from day one."</p>
          <div class="review-author">— Gabriel M., Creative Director</div>
        </div>

        <div class="review-card">
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">"The hot towel service and bourbon lounge seating make this a ritual I look forward to every two weeks. Truly top shelf."</p>
          <div class="review-author">— Harrison L., Software Architect</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Reservation Banner -->
  <section id="contact" class="section-wrap">
    <div class="container">
      <div class="cta-banner">
        <h2>Reserve Your Chair at {{BUSINESS_NAME}}</h2>
        <p>Walk-ins accommodated based on availability. Priority appointment reservations recommended for peak weekend slots in {{CITY}}.</p>
        <a href="tel:{{PHONE_RAW}}" class="btn-gold" style="font-size: 15px; padding: 16px 36px;">
          Call {{PHONE_DISPLAY}} To Book
        </a>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <h3>{{BUSINESS_NAME}}</h3>
          <p>The standard in executive barbering and traditional grooming lounge experiences in {{CITY}}.</p>
        </div>
        <div class="footer-col">
          <h4>Location & Hours</h4>
          <p>{{ADDRESS}}<br>{{CITY}}</p>
          <p style="margin-top: 8px;">Tue – Sat: 9:00 AM – 7:00 PM<br>Sun – Mon: By Appointment Only</p>
        </div>
        <div class="footer-col">
          <h4>Direct Contact</h4>
          <p>Phone: <a href="tel:{{PHONE_RAW}}" style="color: var(--gold-bright);">{{PHONE_DISPLAY}}</a></p>
          <p>Online Scheduling: Active Daily</p>
        </div>
      </div>
      <div class="footer-bottom">
        &copy; 2026 {{BUSINESS_NAME}}. All Rights Reserved. Master Grooming Lounge.
      </div>
    </div>
  </footer>

</body>
</html>`;
