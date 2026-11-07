// scripts/rebrand-3-niches-perfect.mjs
// Clean, literal string replacement duplicating public/templates-raw/hvac-template-02.html
// for Barber, Salon, and Gym ONLY.
// Zero greedy regexes. Preserves full file integrity (~660KB per template).

import fs from 'fs';
import path from 'path';

const MASTER_PATH = path.resolve('public/templates-raw/hvac-template-02.html');
const rawMaster = fs.readFileSync(MASTER_PATH, 'utf8');

// 1. First, make sure the canonical HVAC master template itself is 100% bug-free:
let hvacFixed = rawMaster;

// HARD FIX FOR LOADING SCREEN:
hvacFixed = hvacFixed.replace('class="page-transition-veil active"', 'class="page-transition-veil"');
hvacFixed = hvacFixed.replace(
  /\.page-transition-veil\s*\{[^}]*\}/s,
  `.page-transition-veil {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 10000;
      pointer-events: none !important;
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }`
);
hvacFixed = hvacFixed.replace(
  /\.page-transition-veil\.active\s*\{[^}]*\}/s,
  `.page-transition-veil.active {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }`
);

// Disable Service Worker registration so it NEVER throws SecurityError
const oldSwBlock = `  <!-- Service Worker Registration for Instant Caching & Offline Capabilities -->
  <script>
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(registration => {
            console.log('⚡ Atelier Caching System active with scope:', registration.scope);
          })
          .catch(error => {
            console.error('Atelier Caching System registration failed:', error);
          });
      });
    }
  </script>`;

const newSwBlock = `  <!-- Service Worker Registration bypassed for universal zero-config hosting -->
  <script>
    // Offline worker disabled
  </script>`;

hvacFixed = hvacFixed.replace(oldSwBlock, newSwBlock);

// Ensure mobile concierge button is single magic emoji
const mobileConciergeCss = `
<style id="lunao-concierge-mobile-rule">
@media (max-width: 900px) {
  .atelier-concierge-fab-container {
    bottom: calc(18px + env(safe-area-inset-bottom, 0px)) !important;
    right: 16px !important;
    z-index: 9999 !important;
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
</style>
`;

if (!hvacFixed.includes('id="lunao-concierge-mobile-rule"')) {
  hvacFixed = hvacFixed.replace('</head>', `${mobileConciergeCss}\n</head>`);
}

// Write sanitized HVAC master back
fs.writeFileSync(MASTER_PATH, hvacFixed, 'utf8');
fs.writeFileSync(path.resolve('public/templates-raw/hvac-bespoke.html'), hvacFixed, 'utf8');

function compileSample(rawHtml, sample) {
  let html = rawHtml;
  html = html.replace(/\{\{BUSINESS_NAME\}\}/g, sample.businessName);
  html = html.replace(/\{\{BUSINESS_NAME_SHORT\}\}/g, sample.businessNameShort);
  html = html.replace(/\{\{CITY\}\}/g, sample.city);
  html = html.replace(/\{\{CITY_NAME\}\}/g, sample.city);
  html = html.replace(/\{\{STATE\}\}/g, sample.state);
  html = html.replace(/\{\{YEARS_IN_BUSINESS\}\}/g, sample.yearsInBusiness);
  html = html.replace(/\{\{PHONE\}\}/g, sample.phoneDisplay);
  html = html.replace(/\{\{PHONE_NUMBER\}\}/g, sample.phoneDisplay);
  html = html.replace(/\{\{PHONE_DISPLAY\}\}/g, sample.phoneDisplay);
  html = html.replace(/\{\{PHONE_RAW\}\}/g, sample.phoneRaw);
  html = html.replace(/\{\{EMAIL\}\}/g, sample.email);
  html = html.replace(/\{\{ADDRESS\}\}/g, sample.address);
  html = html.replace(/\{\{GOOGLE_RATING\}\}/g, sample.googleRating);
  html = html.replace(/\{\{GOOGLE_REVIEW_COUNT\}\}/g, sample.googleReviewCount);
  html = html.replace(/\{\{INSTAGRAM_HANDLE\}\}/g, sample.instagramHandle);
  html = html.replace(/\{\{INSTAGRAM_URL\}\}/g, `https://instagram.com/${sample.instagramHandle}`);
  html = html.replace(/\{\{FACEBOOK_URL\}\}/g, sample.facebookUrl);
  html = html.replace(/\{\{BOOKING_URL\}\}/g, '#booking');
  html = html.replace(/\{\{SLUG\}\}/g, sample.businessNameShort.toLowerCase());
  html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  return html;
}

const hvacSample = {
  businessName: 'Everest Climate Systems',
  businessNameShort: 'Everest',
  city: 'Austin, TX',
  state: 'TX',
  yearsInBusiness: '2012',
  phoneDisplay: '(512) 555-0988',
  phoneRaw: '5125550988',
  email: 'service@everestclimate.com',
  address: '3801 Capital of Texas Hwy, Austin, TX 78704',
  googleRating: '4.9',
  googleReviewCount: '342',
  instagramHandle: 'everest_cooling',
  facebookUrl: 'https://facebook.com/everestcooling'
};

const hvacPreview = compileSample(hvacFixed, hvacSample);
fs.writeFileSync(path.resolve('public/hvac-template-02.html'), hvacPreview, 'utf8');
fs.writeFileSync(path.resolve('hvac-template-02.html'), hvacPreview, 'utf8');
fs.writeFileSync(path.resolve('public/hvac-bespoke.html'), hvacPreview, 'utf8');
fs.writeFileSync(path.resolve('hvac-bespoke.html'), hvacPreview, 'utf8');
console.log('✓ Master HVAC-02 sanitized, loading freeze eliminated & saved.');

// ==========================================
// 3 NICHES: Barber, Salon, Gym
// ==========================================
const NICHES = {
  barber: {
    rawFile: 'barber-template-03.html',
    title: 'Bespoke Master Blade & Executive Grooming',
    metaDesc: 'Bespoke master haircuts, Japanese Damascus scissor architecture, hot towel straight-razor shaves, and executive scalp therapy in {{CITY_NAME}}.',
    metaKeywords: 'barbershop, luxury barber, straight razor shave, skin fade, haircut, beard trim, executive grooming, {{CITY_NAME}} barber',
    schemaType: 'BarberShop',
    tagline1: '✦ BESPOKE MASTER BLADE & HAIR ARCHITECTURE ✦',
    tagline2: 'JAPANESE DAMASCUS BLADES · ROYAL STRAIGHT-RAZOR SHAVES',
    badge: 'ATELIER MASTER CUTS',
    atelierName: 'Executive Blade Lounge',
    heroEyebrow: 'MASTER BLADE &amp; EXECUTIVE GROOMING',
    heroSubtitle: 'PRECISION DAMASCUS SCISSOR ARCHITECTURE &amp; HOT LATHER SHAVES IN ${business.city}',
    heroDesc: 'Artisanal hand-folded Damascus shear cuts, traditional eucalyptus hot towel lather shaves, precision beard sculpting, and private grooming suites with guaranteed upfront pricing.',
    statCard2Badge: 'MASTER CUTS PERFORMED',
    statCard2Label: 'ROYAL SHAVES &amp; CUTS COMPLETED',
    statCard3Label: 'YEARS MASTER BLADE HERITAGE',
    statCard4Label: 'CLIENT SATISFACTION GUARANTEE',
    philosophyEyebrow: 'MASTER GROOMING PHILOSOPHY',
    philosophyTitle: 'OUR PHILOSOPHY &amp; CRAFT',
    philosophyHeaderDesc: 'The deliberate antidote to rushed franchise clippers and assembly-line cuts. Founded on the conviction that master barbering is a high-precision craft requiring individual cranial tailoring, handcrafted blades, and undivided artisan attention.',
    manifestoEyebrow: 'THE MASTER BLADE MANIFESTO',
    manifestoH3: 'WE DO NOT JUST CUT HAIR.<br/><span style="color: var(--accent-gold);">WE ARCHITECT SIGNATURE SILHOUETTES.</span>',
    manifestoP1: '${business.name} was established in ${business.city} to restore the timeless ritual of the classic gentleman’s lounge. We unify custom Japanese shear ergonomics, hot-lather facial compression, and organic botanical scalp care under one unhurried sanctuary.',
    manifestoP2: 'From the moment you take our leather chair, your look is guided by an experienced master barber. Every consultation includes cranial shape analysis, hair growth pattern mapping, straight-razor nape taper, and ice-cold revitalizing tonic.',
    pillar1Title: '01. CRANIAL SILHOUETTE MAPPING',
    pillar1Desc: 'Individual consultation examining head contour, hairline cowlicks, and bone structure before blade touches hair.',
    pillar2Title: '02. HAND-FOLDED DAMASCUS STEEL',
    pillar2Desc: 'Exclusive use of handcrafted Japanese shears and feather-edge straight razors sanitized to surgical hygiene standards.',
    pillar3Title: '03. BOTANICAL HOT-TOWEL STEAM',
    pillar3Desc: 'Double eucalyptus steamed towel compression opening pores, softening follicles, and relieving facial muscle fatigue.',
    commitmentTitle: 'THE BLADE COMMITMENT',
    commitmentQuote: '"Zero rushed haircuts. Uncompromising razor precision. An unhurried sanctuary for the modern gentleman."',
    commitmentPill1: 'UNHURRIED CHAIR',
    commitmentPill2: 'DAMASCUS BLADES',
    commitmentPill3: 'STEAMED TOWELS',
    disciplinesEyebrow: 'TIMELESS GROOMING DISCIPLINES',
    disciplinesTitle: 'OUR DISCIPLINES',
    disciplinesDesc: 'From hand-hammered scissor cuts to royal hot lather shaves, beard architecture, and 24K gold under-eye relaxation.',
    beforeAfterEyebrow: 'GROOMING TRANSFORMATIONS',
    beforeAfterDesc: 'Drag the interactive slider to observe how unkempt hair and uneven beard lines are transformed into a crisp, impeccably proportioned executive silhouette.',
    beforeLabel: 'BEFORE (OVERGROWN / UNKEMPT)',
    afterLabel: 'AFTER (${business.name})',
    conciergeEyebrow: 'STYLE FEASIBILITY &amp; ADVISORY',
    conciergeBadge: '✨ MASTER BLADE DESK LIVE',
    conciergeIcon: '💈',
    conciergeTitle: 'Bespoke Blade &amp; Grooming Concierge',
    conciergeDesc: 'Unsure which silhouette complements your facial structure, how to maintain a zero skin fade, or which beard conditioning oil suits your skin? Inquire with our master grooming advisory desk for personalized recommendations.',
    chatModalTitle: 'AI Master Blade Concierge',
    chatModalBadge: '✨ LIVE MASTER GROOMING DESK',
    chatModalSub: 'Bespoke Scissor Architecture &amp; Straight-Razor Advisory · {{BUSINESS_NAME}}',
    chatModalBookBtn: '💈 BOOK CHAIR',
    chatModalChips: [
      { q: 'How often should an executive fade be maintained?', label: '💈 Fade Maintenance' },
      { q: 'What is included in the Royal Straight-Razor Shave?', label: '🪒 Royal Shave Ritual' },
      { q: 'What is the benefit of hand-folded Japanese Damascus shears?', label: '✂️ Damascus Shears' },
      { q: 'How does natural grey blending work without regrowth lines?', label: '🌿 Grey Camouflage' },
      { q: 'Which pomade works best for textured hair in humid weather?', label: '🧴 Styling Apothecary' },
      { q: 'Where are you located and is private parking available?', label: '📍 Studio & Parking' },
      { q: 'What packages are offered for wedding groomsmen suites?', label: '🍾 Groomsmen Suites' }
    ],
    homeChips: [
      { q: 'Which haircut best fits my face shape?', label: '💈 Face Shape Advisory' },
      { q: 'What is included in the Royal Straight-Razor Shave?', label: '🪒 Royal Shave Ritual' },
      { q: 'How often should an executive skin fade be refreshed?', label: '✂️ Fade Maintenance' },
      { q: 'How does the charcoal scalp detox treat dry scalp?', label: '🌿 Scalp Detox Therapy' }
    ],
    shopEyebrow: 'ARTISANAL CUTLERY &amp; APOTHECARY',
    shopTitle: 'THE MASTER BLADE SPECIMEN ATELIER',
    shopDesc: 'Hand-folded Damascus steel razors, organic cedar beard oils, pure silvertip badger brushes, and mineral pomades crafted for daily grooming mastery.',
    shopCta: 'ORDER GROOMING SPECIMENS',
    journalEyebrow: 'THE GROOMING JOURNAL',
    journalTitle: 'BARBERING ARCHITECTURE &amp; ESSAYS',
    journalDesc: 'Authoritative treatises on straight-razor tension glide, cranial bone proportion, beard nourishment chemistry, and timeless masculine styling.',
    consultationEyebrow: 'DIRECT GROOMING DESK',
    consultationTitle: 'REQUEST A PRIVATE CONSULTATION',
    consultationNotesPlaceholder: 'Describe your desired haircut style, beard shape preferences, or preferred appointment time...',
    sample: {
      businessName: 'The Sovereign Blade Lounge',
      businessNameShort: 'Sovereign',
      city: 'Austin, TX',
      state: 'TX',
      yearsInBusiness: '2016',
      phoneDisplay: '(512) 555-0842',
      phoneRaw: '5125550842',
      email: 'concierge@sovereignblade.com',
      address: '2401 S Congress Ave, Austin, TX 78704',
      googleRating: '4.9',
      googleReviewCount: '388',
      instagramHandle: 'sovereign_blade',
      facebookUrl: 'https://facebook.com/sovereignblade'
    },
    services: [
      { id: 'damascus-cut', name: 'Damascus Precision Haircut', category: 'Haircuts', duration: '45 MIN', price: '$75', desc: 'Consultation, botanical scalp cleanse, handcrafted Japanese scissor work, and hot towel neck shave.', img: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80' },
      { id: 'royal-shave', name: 'Royal Straight-Razor Shave', category: 'Shaves', duration: '50 MIN', price: '$85', desc: 'Pre-shave eucalyptus oils, double hot-towel steam, feather-edge razor glide, and ice-cold tonic compression.', img: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?auto=format&fit=crop&w=800&q=80' },
      { id: 'fade-beard', name: 'Executive Fade & Beard Architecture', category: 'Combos', duration: '60 MIN', price: '$110', desc: 'Seamless skin fade coupled with hot-towel beard shaping, cheek line sculpt, and conditioning oil treatment.', img: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80' },
      { id: 'scalp-therapy', name: 'Charcoal Purifying Scalp Therapy', category: 'Treatments', duration: '35 MIN', price: '$65', desc: 'Deep follicle detox scrub, invigorating tea tree massage, and infrared hair rejuvenating light therapy.', img: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80' },
      { id: 'gold-eye', name: '24K Gold Collagen Eye Recovery', category: 'Treatments', duration: '20 MIN', price: '$40', desc: 'Under-eye lymphatic drainage massage with cooling gold pads during your shave or haircut relaxation.', img: 'https://images.unsplash.com/photo-1517832606589-7629c3395909?auto=format&fit=crop&w=800&q=80' },
      { id: 'razor-lineup', name: 'Hand-Hammered Razor Lineup & Taper', category: 'Haircuts', duration: '25 MIN', price: '$45', desc: 'Crisp hairline perimeter detailing, taper blend around temples, and clean straight-razor nape finish.', img: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80' }
    ],
    team: [
      { id: 'barber-1', name: 'Dominic Sterling', role: 'Founding Master Barber', specialty: 'Damascus Scissor Architecture & Fades', exp: '16 Yrs Exp', bio: 'Trained under traditional British guild barbers, Dominic crafts silhouettes tailored precisely to cranial contours.', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80' },
      { id: 'barber-2', name: 'Erick Hanson', role: 'Executive Blade Specialist', specialty: 'Precision Skin Fades & Lineups', exp: '11 Yrs Exp', bio: 'Specialist in modern zero-gap tapers and seamless skin blends using custom-calibrated Japanese tools.', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80' },
      { id: 'barber-3', name: 'Maxime Laurent', role: 'Texture & Scissor Sculptor', specialty: 'Parisian Scissor Styling & Texture', exp: '9 Yrs Exp', bio: 'Bringing European shear ergonomics to lived-in textured crops, pompadours, and flowing side parts.', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80' },
      { id: 'barber-4', name: 'Marcus Vance', role: 'Master Shave Steward', specialty: 'Traditional Straight-Razor & Beard Art', exp: '14 Yrs Exp', bio: 'Devoted to the classic art of the multi-towel shave, straight-razor tension glide, and beard symmetry.', img: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80' }
    ],
    products: [
      { id: 'p1', name: 'Damascus Steel Straight Razor', price: 145, cat: 'Cutlery', desc: 'Hand-folded 67-layer Damascus steel blade with polished walnut handle.', img: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?auto=format&fit=crop&w=600&q=80' },
      { id: 'p2', name: 'Sandalwood & Bergamot Pre-Shave Elixir', price: 38, cat: 'Apothecary', desc: 'Cold-pressed botanical oils that protect sensitive skin from razor irritation.', img: 'https://images.unsplash.com/photo-1608248597359-25e29780000a?auto=format&fit=crop&w=600&q=80' },
      { id: 'p3', name: 'Sea Kelp & Moroccan Clay Pomade', price: 32, cat: 'Styling', desc: 'Matte medium hold with zero petroleum residue and effortless water-rinse.', img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80' }
    ]
  },

  salon: {
    rawFile: 'salon-template-02.html',
    title: 'Bespoke Haute Coiffure & Color Atelier',
    metaDesc: 'Haute coiffure, French freehand balayage, Japanese silk thermal smoothing, and custom lived-in blonde architecture in {{CITY_NAME}}.',
    metaKeywords: 'hair salon, luxury hair salon, french balayage, lived in blonde, silk smoothing, haircut, blowout, {{CITY_NAME}} salon',
    schemaType: 'BeautySalon',
    tagline1: '✦ HAUTE COIFFURE & FRENCH BALAYAGE ✦',
    tagline2: 'FRENCH BALAYAGE · JAPANESE SILK THERMAL SMOOTHING',
    badge: 'HAUTE COIFFURE ATELIER',
    atelierName: 'Parisian Hair Atelier',
    heroEyebrow: 'HAUTE COIFFURE &amp; COLOR ATELIER',
    heroSubtitle: 'FRENCH BALAYAGE ARCHITECTURE &amp; BOTANICAL SILK REBONDING IN ${business.city}',
    heroDesc: 'Artisanal hand-painted sun-kissed dimension, French shear geometry, Japanese silk thermal rebonding, and private coloring suites with guaranteed upfront pricing.',
    statCard2Badge: 'COLOR TRANSFORMATIONS',
    statCard2Label: 'HAUTE COLOR &amp; COIFFURE SESSIONS',
    statCard3Label: 'YEARS HAUTE COIFFURE PRACTICE',
    statCard4Label: 'STRAND INTEGRITY GUARANTEE',
    philosophyEyebrow: 'HAUTE COIFFURE PHILOSOPHY',
    philosophyTitle: 'OUR PHILOSOPHY &amp; CRAFT',
    philosophyHeaderDesc: 'The deliberate antidote to over-processed chemical highlights and assembly-line blowouts. Founded on the conviction that hair color and coiffure is a fine art requiring molecular bond protection, pigment calibration, and bespoke cranial architecture.',
    manifestoEyebrow: 'THE COUTURE HAIR MANIFESTO',
    manifestoH3: 'WE DO NOT JUST HIGHLIGHT HAIR.<br/><span style="color: var(--accent-gold);">WE PAINT DIMENSION THAT GROWS OUT SEAMLESSLY.</span>',
    manifestoP1: '${business.name} was established in ${business.city} to elevate hair styling into a couture sensory ritual. We blend French freehand sweeping techniques with Japanese silk moisture chemistry to deliver radiant, light-reflective hair that maintains absolute cuticle integrity.',
    manifestoP2: 'From day one, your hair journey begins with a private 360-degree strand diagnostic. We analyze melanin composition, texture elasticity, face shape lighting, and lifestyle routines to design an effortless, multi-dimensional look with low-maintenance longevity.',
    pillar1Title: '01. FRENCH FREEHAND BALAYAGE',
    pillar1Desc: 'Artisanal hand-painted sun-kissed highlights creating soft natural light reflection without harsh regrowth lines.',
    pillar2Title: '02. MOLECULAR BOND REBUILDING',
    pillar2Desc: 'Patented K18 and peptide sequences repairing polypeptide chains deep within the cortex during every color service.',
    pillar3Title: '03. JAPANESE SILK REBONDING',
    pillar3Desc: 'Formaldehyde-free organic silk protein thermal infusion eliminating humidity frizz while locking in mirror shine.',
    commitmentTitle: 'THE LUMIÈRE COMMITMENT',
    commitmentQuote: '"Zero brassy tones. Guaranteed strand integrity. An indulgent private sanctuary for breathtaking hair."',
    commitmentPill1: 'ZERO BRASS',
    commitmentPill2: 'K18 PROTECTED',
    commitmentPill3: 'SILK SHINE',
    disciplinesEyebrow: 'COUTURE HAIR DISCIPLINES',
    disciplinesTitle: 'OUR DISCIPLINES',
    disciplinesDesc: 'From French balayage to couture wet-to-dry haircuts, lived-in Nordic blonde, and Japanese waterfall head spas.',
    beforeAfterEyebrow: 'COLOR TRANSFORMATIONS',
    beforeAfterDesc: 'Drag the interactive slider to observe how dull, brassy, or faded hair is transformed into luminous French balayage with high-definition shine.',
    beforeLabel: 'BEFORE (BRASSY / DAMAGED)',
    afterLabel: 'AFTER (${business.name})',
    conciergeEyebrow: 'COLOR FEASIBILITY &amp; ADVISORY',
    conciergeBadge: '✨ HAUTE COLOR DESK LIVE',
    conciergeIcon: '✂️',
    conciergeTitle: 'Bespoke Haute Hair &amp; Color Concierge',
    conciergeDesc: 'Unsure which balayage tone complements your skin undertone, how to transition from dark to lived-in blonde safely, or whether Japanese silk smoothing suits your texture? Inquire with our master color advisory desk.',
    chatModalTitle: 'AI Haute Coiffure Concierge',
    chatModalBadge: '✨ LIVE HAUTE COLOR DESK',
    chatModalSub: 'French Balayage &amp; Silk Rebonding Advisory · {{BUSINESS_NAME}}',
    chatModalBookBtn: '✂️ BOOK APPT',
    chatModalChips: [
      { q: 'What is the difference between French balayage and foil highlights?', label: '✨ French Balayage Guide' },
      { q: 'How does Japanese silk thermal smoothing eliminate humidity frizz?', label: '💎 Japanese Silk Rebonding' },
      { q: 'How do you maintain icy Nordic blonde without yellow brassiness?', label: '🌿 Blonde Maintenance' },
      { q: 'What occurs during the Japanese waterfall head spa ritual?', label: '💆 Head Spa Details' },
      { q: 'How long does a root shadow color melt last between salon visits?', label: '🎨 Root Shadow Longevity' },
      { q: 'Where are you located and are private styling suites available?', label: '📍 Studio & Suites' },
      { q: 'What bridal packages are available for wedding parties?', label: '👰 Bridal Couture' }
    ],
    homeChips: [
      { q: 'What is the difference between traditional foil and French balayage?', label: '✨ French Balayage Guide' },
      { q: 'How does Japanese silk thermal smoothing eliminate humidity frizz?', label: '💎 Japanese Silk Rebonding' },
      { q: 'How do you maintain icy Nordic blonde without yellow brassiness?', label: '🌿 Blonde Maintenance' },
      { q: 'What occurs during the Japanese waterfall head spa ritual?', label: '💆 Head Spa Details' }
    ],
    shopEyebrow: 'COUTURE APOTHECARY &amp; STRAND ELIXIRS',
    shopTitle: 'THE STRAND SPECIMEN ATELIER',
    shopDesc: 'Cold-pressed Moroccan argan oils, violet anti-brass masques, French thermal shield mists, and molecular peptide repair serums.',
    shopCta: 'ORDER HAIRCARE SPECIMENS',
    journalEyebrow: 'THE COIFFURE JOURNAL',
    journalTitle: 'HAIR ARCHITECTURE &amp; COLOR ESSAYS',
    journalDesc: 'Authoritative treatises on French freehand brush elevation, chromatic color balance, thermal silk chemistry, and bond reconstruction.',
    consultationEyebrow: 'DIRECT COLOR DESK',
    consultationTitle: 'REQUEST A PRIVATE HAIR CONSULTATION',
    consultationNotesPlaceholder: 'Describe your hair length, current color history, texture, and desired transformation...',
    sample: {
      businessName: 'Maison Lumière Hair Atelier',
      businessNameShort: 'Lumière',
      city: 'Austin, TX',
      state: 'TX',
      yearsInBusiness: '2015',
      phoneDisplay: '(512) 555-0371',
      phoneRaw: '5125550371',
      email: 'bonjour@maisonlumiere.com',
      address: '1603 S 1st St, Austin, TX 78704',
      googleRating: '4.9',
      googleReviewCount: '412',
      instagramHandle: 'maison_lumiere_hair',
      facebookUrl: 'https://facebook.com/maisonlumierehair'
    },
    services: [
      { id: 'french-balayage', name: 'French Freehand Balayage & Glaze', category: 'Color', duration: '150 MIN', price: '$265', desc: 'Artisanal hand-painted sun-kissed dimension with gloss glaze and botanical moisture seal.', img: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?auto=format&fit=crop&w=800&q=80' },
      { id: 'couture-cut', name: 'Couture Precision Wet-to-Dry Cut', category: 'Haircuts', duration: '60 MIN', price: '$95', desc: 'Face-framing architecture, French shear technique, botanical cleanse, and luxury blowout.', img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80' },
      { id: 'nordic-blonde', name: 'Lived-In Nordic Blonde Architecture', category: 'Color', duration: '180 MIN', price: '$310', desc: 'Seamless micro-foil baby lights with custom shadow root and icy champagne toner formulation.', img: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=80' },
      { id: 'japanese-silk', name: 'Japanese Silk Thermal Smoothing', category: 'Treatments', duration: '180 MIN', price: '$380', desc: 'Permanent organic silk protein rebonding yielding mirror-shine smoothness without flat iron damage.', img: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=800&q=80' },
      { id: 'scalp-headspa', name: 'Botanical Scalp Peeling & Head Spa', category: 'Wellness', duration: '45 MIN', price: '$85', desc: 'Japanese waterfall scalp cleanse, volcanic clay scrub, and cranial relaxation pressure therapy.', img: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80' },
      { id: 'editorial-blowout', name: 'Editorial Blowout & Red-Carpet Style', category: 'Styling', duration: '45 MIN', price: '$70', desc: 'Round-brush high-volume blowout with bouncy curtain bangs and diamond sheen finish.', img: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=800&q=80' }
    ],
    team: [
      { id: 'stylist-1', name: 'Clarabelle Moreau', role: 'Artistic Director & Master Colorist', specialty: 'French Balayage & Parisian Blonde', exp: '15 Yrs Exp', bio: 'Trained at École de Coiffure Paris, Clarabelle paints dimension that grows out effortlessly for months.', img: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80' },
      { id: 'stylist-2', name: 'Sophia Rossi', role: 'Blonde Architecture Specialist', specialty: 'Nordic Icy Platinum & Baby Lights', exp: '12 Yrs Exp', bio: 'Renowned for maintaining absolute hair integrity while lifting clients to breathtaking light shades.', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80' },
      { id: 'stylist-3', name: 'Aurélie Gagnon', role: 'Japanese Silk & Rebonding Director', specialty: 'Thermal Reconditioning & Keratin', exp: '10 Yrs Exp', bio: 'Certified master technician in permanent thermal silk smoothing and anti-frizz molecular chemistry.', img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80' },
      { id: 'stylist-4', name: 'Jessica Chen', role: 'Couture Precision Cutting Artisan', specialty: 'Face-Framing Curtain Layers & Bobs', exp: '8 Yrs Exp', bio: 'Creates geometric and soft lived-in silhouettes that respond naturally to effortless air-drying.', img: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=600&q=80' }
    ],
    products: [
      { id: 'p1', name: 'Pure Argan & Camellia Botanical Elixir', price: 48, cat: 'Oils', desc: 'Cold-pressed organic Moroccan argan oil delivering brilliant mirror shine.', img: 'https://images.unsplash.com/photo-1608248597359-25e29780000a?auto=format&fit=crop&w=600&q=80' },
      { id: 'p2', name: 'Violet Silk Anti-Brass Blonde Masque', price: 44, cat: 'Masques', desc: 'Deep purple botanical pigments neutralizing yellow and brassy tones.', img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80' },
      { id: 'p3', name: 'French Thermal Shield Heat Protection Mist', price: 36, cat: 'Styling', desc: '450°F defense shield preserving moisture during curling and straightening.', img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80' }
    ]
  },

  gym: {
    rawFile: 'gym-template-02.html',
    title: 'Bespoke Private Performance & Longevity Club',
    metaDesc: 'Private performance athletic club, 3D biomechanical screens, executive strength coaching, and sub-zero cryotherapy in {{CITY_NAME}}.',
    metaKeywords: 'private gym, athletic club, strength training, cryotherapy, biomechanics, personal trainer, contrast therapy, {{CITY_NAME}} gym',
    schemaType: 'ExerciseGym',
    tagline1: '✦ PRIVATE PERFORMANCE & ATHLETIC LONGEVITY ✦',
    tagline2: '3D BIOMECHANICAL SCREENING · SUB-ZERO CRYOTHERAPY',
    badge: 'PRIVATE PERFORMANCE CLUB',
    atelierName: 'Private Athletic Club',
    heroEyebrow: 'PRIVATE PERFORMANCE &amp; LONGEVITY CLUB',
    heroSubtitle: '3D BIOMECHANICAL SCREENING &amp; CELLULAR RECOVERY IN ${business.city}',
    heroDesc: 'Markerless 3D motion-capture diagnostics, periodized executive strength coaching, sub-zero cryotherapy, and private infrared recovery suites with guaranteed upfront pricing.',
    statCard2Badge: 'PERFORMANCE ATHLETES',
    statCard2Label: 'ATHLETIC LONGEVITY CLIENTS COACHED',
    statCard3Label: 'YEARS SPORTS SCIENCE HERITAGE',
    statCard4Label: 'PERFORMANCE GAIN GUARANTEE',
    philosophyEyebrow: 'ATHLETIC LONGEVITY PHILOSOPHY',
    philosophyTitle: 'OUR PHILOSOPHY &amp; CRAFT',
    philosophyHeaderDesc: 'The deliberate antidote to overcrowded commercial gyms and random workout routines. Founded on the conviction that human physical performance is an exacting science requiring biomechanical screening, progressive overload, and cellular recovery protocols.',
    manifestoEyebrow: 'THE ATHLETIC PERFORMANCE MANIFESTO',
    manifestoH3: 'WE DO NOT JUST COUNT REPETITIONS.<br/><span style="color: var(--accent-gold);">WE BULLETPROOF CONNECTIVE TISSUE &amp; BUILD POWER.</span>',
    manifestoP1: '${business.name} was established in ${business.city} to bring elite collegiate sports science to private executives and dedicated athletes. We combine markerless 3D movement analysis, autoregulated bar velocity tracking, and contrast thermal therapies under one private roof.',
    manifestoP2: 'From your first session, your athletic trajectory is managed by a certified Strength & Conditioning Specialist (CSCS). Every protocol begins with a comprehensive joint mobility screen, pelvic tilt evaluation, and customized neuromuscular activation sequences.',
    pillar1Title: '01. 3D BIOMECHANICAL SCREENING',
    pillar1Desc: 'High-speed markerless motion capture mapping joint asymmetry, spinal loading, and movement compensations.',
    pillar2Title: '02. PERIODIZED STRENGTH RIGOR',
    pillar2Desc: 'Scientific overload periodization using Eleiko competition systems, bar velocity sensors, and metabolic feedback.',
    pillar3Title: '03. CELLULAR CONTRAST RECOVERY',
    pillar3Desc: 'Sub-zero full-body cryotherapy, 190°F Finnish cedar saunas, and 42°F filtered cold plunge suites for rapid recovery.',
    commitmentTitle: 'THE VANGUARD COMMITMENT',
    commitmentQuote: '"Zero wasted repetitions. Data-driven athletic progress. A private sanctum designed for peak human performance."',
    commitmentPill1: '3D CAPTURE',
    commitmentPill2: 'ELEIKO SUITE',
    commitmentPill3: 'SUITE CRYO',
    disciplinesEyebrow: 'PERFORMANCE &amp; LONGEVITY DISCIPLINES',
    disciplinesTitle: 'OUR DISCIPLINES',
    disciplinesDesc: 'From 3D biomechanical diagnostics to private executive strength, sub-zero cryotherapy, and metabolic VO2 max testing.',
    beforeAfterEyebrow: 'PERFORMANCE TRANSFORMATIONS',
    beforeAfterDesc: 'Drag the interactive slider to observe how poor sedentary posture and joint stiffness are transformed into powerful athletic posture and lean muscle tone.',
    beforeLabel: 'BEFORE (FATIGUED / SEDENTARY)',
    afterLabel: 'AFTER (${business.name})',
    conciergeEyebrow: 'ATHLETIC FEASIBILITY &amp; ADVISORY',
    conciergeBadge: '✨ ATHLETIC DESK LIVE',
    conciergeIcon: '⚡',
    conciergeTitle: 'Bespoke Athletic Performance Concierge',
    conciergeDesc: 'Unsure whether executive strength coaching or metabolic conditioning suits your schedule, how 3D movement analysis pinpoints lower back pain, or how cold plunges reduce inflammation? Inquire with our athletic coaching advisory desk.',
    chatModalTitle: 'AI Athletic Performance Concierge',
    chatModalBadge: '✨ LIVE SPORTS SCIENCE DESK',
    chatModalSub: '3D Biomechanical &amp; Longevity Advisory · {{BUSINESS_NAME}}',
    chatModalBookBtn: '⚡ BOOK PASS',
    chatModalChips: [
      { q: 'How does markerless 3D motion capture identify movement faults?', label: '⚡ 3D Movement Screen' },
      { q: 'What is the physiological protocol for sub-zero cryotherapy?', label: '❄️ Cryotherapy Protocols' },
      { q: 'How is executive strength coaching tailored for busy professionals?', label: '🏋️ Executive Strength' },
      { q: 'What is the optimal contrast sauna and cold plunge cycle?', label: '🔥 Contrast Recovery' },
      { q: 'How does VO2 max testing establish anaerobic conditioning zones?', label: '🧪 VO2 Max Diagnostics' },
      { q: 'Where are you located and how does 24/7 keyless access work?', label: '📍 Club Location & Access' },
      { q: 'What nutrition macro protocols are included with membership?', label: '🥗 Nutrition Coaching' }
    ],
    homeChips: [
      { q: 'How does the 3D Biomechanical Screen detect joint imbalances?', label: '⚡ 3D Movement Screen' },
      { q: 'What are the systemic benefits of sub-zero cryotherapy?', label: '❄️ Cryotherapy Protocols' },
      { q: 'How is executive strength coaching tailored for busy founders?', label: '🏋️ Executive Strength' },
      { q: 'What is the contrast cycle between 190°F sauna and cold plunge?', label: '🔥 Contrast Therapy' }
    ],
    shopEyebrow: 'NUTRITION &amp; PERFORMANCE SPECIMENS',
    shopTitle: 'THE PERFORMANCE SPECIMEN ATELIER',
    shopDesc: 'Cold-filtered grass-fed whey isolate, micronized Creapure creatine, electrolyte hydration sachets, and vacuum insulated steel shakers.',
    shopCta: 'ORDER NUTRITION SPECIMENS',
    journalEyebrow: 'THE PERFORMANCE JOURNAL',
    journalTitle: 'SPORTS SCIENCE &amp; LONGEVITY ESSAYS',
    journalDesc: 'Authoritative treatises on bar velocity kinematics, mitochondrial biogenesis, vagus nerve down-regulation, and hypertrophy periodization.',
    consultationEyebrow: 'DIRECT ATHLETIC DESK',
    consultationTitle: 'REQUEST A PRIVATE PERFORMANCE SCREEN',
    consultationNotesPlaceholder: 'Describe your athletic background, current training frequency, past injuries, and targets...',
    sample: {
      businessName: 'Vanguard Private Athletic Club',
      businessNameShort: 'Vanguard',
      city: 'Austin, TX',
      state: 'TX',
      yearsInBusiness: '2017',
      phoneDisplay: '(512) 555-0622',
      phoneRaw: '5125550622',
      email: 'concierge@vanguardathletic.com',
      address: '1100 S Lamar Blvd, Austin, TX 78704',
      googleRating: '4.9',
      googleReviewCount: '344',
      instagramHandle: 'vanguard_athletic_club',
      facebookUrl: 'https://facebook.com/vanguardathleticclub'
    },
    services: [
      { id: 'biomechanical-screen', name: '3D Biomechanical Movement Screen', category: 'Diagnostics', duration: '60 MIN', price: '$175', desc: 'Markerless motion capture analysis evaluating joint asymmetry, rotational torque, and pelvic tilt.', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80' },
      { id: 'executive-strength', name: 'Private Executive Strength Coaching', category: 'Training', duration: '60 MIN', price: '$135', desc: 'One-on-one coaching utilizing Eleiko barbell systems and autoregulated velocity trackers.', img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80' },
      { id: 'subzero-cryo', name: 'Sub-Zero Full-Body Cryotherapy', category: 'Recovery', duration: '15 MIN', price: '$55', desc: '3-minute immersion at -160°F stimulating vagus nerve toning and systemic anti-inflammatory response.', img: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=800&q=80' },
      { id: 'contrast-therapy', name: 'Infrared Sauna & Cold Plunge Suite', category: 'Recovery', duration: '45 MIN', price: '$75', desc: 'Private suite contrast cycle: 190°F Finnish cedar sauna alternating with 42°F filtered cold plunge.', img: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=800&q=80' },
      { id: 'vo2-testing', name: 'VO2 Max & Metabolic Threshold Test', category: 'Diagnostics', duration: '60 MIN', price: '$225', desc: 'Medical-grade breath-by-breath gas analysis defining anaerobic threshold and fat oxidation rates.', img: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80' },
      { id: 'vip-biometric-pass', name: 'VIP 24/7 Keyless Biometric Access Pass', category: 'VIP', duration: 'MONTHLY', price: '$295', desc: 'Unrestricted around-the-clock fingerprint entry to private gym floor, recovery suite, and towel service.', img: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=800&q=80' }
    ],
    team: [
      { id: 'coach-1', name: 'Alex Mercer, CSCS', role: 'Head of Athletic Performance', specialty: 'Biomechanics & Periodized Strength', exp: '14 Yrs Exp', bio: 'Former collegiate strength director applying sports science to executive longevity and athletic mastery.', img: 'https://images.unsplash.com/photo-1567013127542-490d757e51fc?auto=format&fit=crop&w=600&q=80' },
      { id: 'coach-2', name: 'Tina Sterling', role: 'Olympic Lifting & Mobility Lead', specialty: 'Barbell Kinematics & Hip Mobility', exp: '10 Yrs Exp', bio: 'National-level weightlifter dedicated to bulletproofing connective tissues under heavy mechanical load.', img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80' },
      { id: 'coach-3', name: 'Chris Power, MS', role: 'Longevity & Metabolic Director', specialty: 'VO2 Max & Mitochondrial Health', exp: '12 Yrs Exp', bio: 'Master of Science in Exercise Physiology structuring training around cardiovascular and cellular longevity.', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80' },
      { id: 'coach-4', name: 'Sarah Connor', role: 'Corrective Exercise Specialist', specialty: 'Spine Mechanics & Posture Reset', exp: '9 Yrs Exp', bio: 'Specialist in McGill spine protocols eliminating chronic lower back tightness through core bracing.', img: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80' }
    ],
    products: [
      { id: 'p1', name: 'Cold-Filtered Grass-Fed Whey Isolate', price: 64, cat: 'Nutrition', desc: '100% micro-filtered native whey yielding 28g clean protein with zero artificial fillers.', img: 'https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?auto=format&fit=crop&w=600&q=80' },
      { id: 'p2', name: 'Micronized German Creapure Creatine', price: 36, cat: 'Nutrition', desc: 'Pharmaceutical-grade Creapure monohydrate fueling ATP resynthesis and cognitive power.', img: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=600&q=80' },
      { id: 'p3', name: 'Electrolyte Hydration Sachet Pack', price: 28, cat: 'Hydration', desc: 'Optimal 1000mg sodium, 200mg potassium, 60mg magnesium ratio without sugar spike.', img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80' }
    ]
  }
};

function transformMasterToNiche(nicheKey, cfg) {
  let html = hvacFixed;

  // 1. Meta & Title (LITERAL)
  html = html.replace(
    '<title>{{BUSINESS_NAME}} — Bespoke HVAC & Precision Climate Engineering in {{CITY_NAME}}</title>',
    `<title>{{BUSINESS_NAME}} — ${cfg.title} in {{CITY_NAME}}</title>`
  );
  html = html.replace(
    'Premier residential and commercial HVAC engineering, inverter heat pumps, concealed high-velocity zoning, and hospital-grade indoor air quality purification in {{CITY_NAME}}.',
    cfg.metaDesc
  );
  html = html.replace(
    'hvac contractor, heat pump installation, {{CITY_NAME}} hvac, ac repair, mini split, vrf zoning, indoor air quality, geothermal hvac, heating cooling',
    cfg.metaKeywords
  );
  html = html.replace('"@type": "HVACBusiness"', `"@type": "${cfg.schemaType}"`);

  // 2. Top utility & navigation brand badges
  html = html.replace('✦ BESPOKE CLIMATE ENGINEERING & INDOOR PURITY ✦', cfg.tagline1);
  html = html.replace('CONCEALED SLOT DIFFUSERS · HOSPITAL-GRADE PURITY', cfg.tagline2);
  html = html.replace('✦ ATELIER THERMODYNAMICS', `✦ ${cfg.badge}`);
  html = html.replace('Architectural HVAC Atelier', cfg.atelierName);

  // 3. Hero Section (LITERAL)
  html = html.replace('<span class="hero-eyebrow-text">CLIMATE ENGINEERING &amp; BESPOKE HVAC</span>', `<span class="hero-eyebrow-text">${cfg.heroEyebrow}</span>`);
  html = html.replace('PRECISION INVERTER CLIMATE ARCHITECTURE &amp; INDOOR AIR PURITY IN ${business.city}', cfg.heroSubtitle);
  html = html.replace(
    'Ultra-quiet variable-speed heat pumps, concealed architectural slot diffusers, hospital-grade air purification, and landmark historic ducting delivered with guaranteed upfront pricing.',
    cfg.heroDesc
  );

  // 4. Stats Bar (LITERAL)
  html = html.replace('<div class="stat-subbadge">VERIFIED INSTALLS</div>', `<div class="stat-subbadge">${cfg.statCard2Badge}</div>`);
  html = html.replace('<div class="stat-label">CLIMATE SYSTEMS COMMISSIONED</div>', `<div class="stat-label">${cfg.statCard2Label}</div>`);
  html = html.replace('<div class="stat-label">YEARS MECHANICAL PRACTICE</div>', `<div class="stat-label">${cfg.statCard3Label}</div>`);
  html = html.replace('<div class="stat-label">INDOOR COMFORT GUARANTEE</div>', `<div class="stat-label">${cfg.statCard4Label}</div>`);

  // 5. Philosophy & Craft Manifesto (LITERAL)
  html = html.replace('CLIMATE ARCHITECTURE PHILOSOPHY', cfg.philosophyEyebrow);
  html = html.replace('The deliberate antidote to oversized builder equipment and noisy sheet metal. Founded on the conviction that indoor climate engineering is a high-precision architectural science requiring seamless thermal balance and acoustic silence.', cfg.philosophyHeaderDesc);
  html = html.replace('THE MECHANICAL MANIFESTO', cfg.manifestoEyebrow);
  html = html.replace(
    'WE DO NOT JUST INSTALL MACHINERY.<br/><span style="color: var(--accent-gold);">WE ENGINEER SILENT INDOOR CLIMATES.</span>',
    cfg.manifestoH3
  );
  html = html.replace(
    '${business.name} was established in ${business.city} to eliminate the traditional friction of loud compressors, uneven hot and cold spots, and poor indoor air quality. We unify mechanical engineering, custom duct acoustics, refrigeration physics, and smart architectural integration under one accountable roof.',
    cfg.manifestoP1
  );
  html = html.replace(
    'From day one, your property is guided by a licensed mechanical engineer and NATE-certified master technician. We perform room-by-room Manual J load calculations, fixed-price contracts with zero surprise change orders, clean-site negative air containment, and sub-micron vacuum decay line tests.',
    cfg.manifestoP2
  );

  // 6. Pillars (LITERAL)
  html = html.replace('01. MANUAL J &amp; D RIGOR', cfg.pillar1Title);
  html = html.replace('Room-by-room solar heat gain simulations, computerized airflow balancing, and static pressure duct design before commissioning.', cfg.pillar1Desc);
  html = html.replace('02. SURGICAL MECHANICAL DISCIPLINE', cfg.pillar2Title);
  html = html.replace('Dedicated project engineer, insulated brazed copper manifolds, hospital-grade HEPA scrubbers, and strict dust protection.', cfg.pillar2Desc);
  html = html.replace('03. ARCHITECTURAL AIR DISTRIBUTION', cfg.pillar3Title);
  html = html.replace('Seamless concealed ceiling reveals, trimless plaster-in linear slot diffusers, and acoustic silencers that eliminate air velocity noise.', cfg.pillar3Desc);

  // 7. Commitment Card (LITERAL)
  html = html.replace('THE THERMA COMMITMENT', cfg.commitmentTitle);
  html = html.replace('"Zero surprise change orders. Whisper-silent operation. Uncompromising indoor air purity."', cfg.commitmentQuote);
  html = html.replace('<span class="commitment-micro-pill">100% FIXED PRICE</span>', `<span class="commitment-micro-pill">${cfg.commitmentPill1}</span>`);
  html = html.replace('<span class="commitment-micro-pill">SUB-20 dB QUIET</span>', `<span class="commitment-micro-pill">${cfg.commitmentPill2}</span>`);
  html = html.replace('<span class="commitment-micro-pill">HOSPITAL HEPA</span>', `<span class="commitment-micro-pill">${cfg.commitmentPill3}</span>`);

  // 8. Services Section (LITERAL)
  html = html.replace('ARCHITECTURAL CLIMATE DISCIPLINES', cfg.disciplinesEyebrow);
  html = html.replace('From whole-home inverter heat pump conversions to concealed VRF zoning, hospital-grade IAQ, and historic brownstone mini-ducts.', cfg.disciplinesDesc);

  // 9. Before & After (LITERAL)
  html = html.replace('CLIMATE TRANSFORMATIONS', cfg.beforeAfterEyebrow);
  html = html.replace('Drag the interactive slider or tap the toggle controls below to observe how loud, corroded mechanical units are replaced by whisper-quiet, surgical inverter installations.', cfg.beforeAfterDesc);
  html = html.replace('<span class="comparison-label label-before"><span class="label-indicator"></span>BEFORE (INEFFICIENT / CORRODED)</span>', `<span class="comparison-label label-before"><span class="label-indicator"></span>${cfg.beforeLabel}</span>`);
  html = html.replace('<span class="comparison-label label-after"><span class="label-indicator gold"></span>AFTER (${business.name})</span>', `<span class="comparison-label label-after"><span class="label-indicator gold"></span>${cfg.afterLabel}</span>`);

  // 10. Floating Concierge & AI Concierge Home Card (LITERAL)
  html = html.replace('CLIMATE FEASIBILITY &amp; ADVISORY', cfg.conciergeEyebrow);
  html = html.replace('✨ AURUM CLIMATE DESK LIVE', cfg.conciergeBadge);
  html = html.replace('Bespoke Climate &amp; Heat Pump Concierge', cfg.conciergeTitle);
  html = html.replace('Bespoke Climate & Heat Pump Concierge', cfg.conciergeTitle);
  html = html.replace('<span class="fab-magic-sparkle">❄️</span>', `<span class="fab-magic-sparkle">${cfg.conciergeIcon}</span>`);
  html = html.replace('Unsure which heat pump capacity or VRF layout best suits your residence, what clean energy rebates apply, or how to eliminate cold spots? Inquire with our digital engineering advisory desk for instant sizing insights, sound levels, and rebate guidance.', cfg.conciergeDesc);

  // 11. Modal Chat & Header (LITERAL)
  html = html.replace('<h3 class="ai-chat-title">AI Climate Concierge</h3>', `<h3 class="ai-chat-title">${cfg.chatModalTitle}</h3>`);
  html = html.replace('<span class="ai-chat-badge">✨ LIVE LOAD &amp; REBATE ADVISOR</span>', `<span class="ai-chat-badge">${cfg.chatModalBadge}</span>`);
  html = html.replace('<p class="ai-chat-sub">Precision HVAC Engineering &amp; Sizing Advisory · {{BUSINESS_NAME}}</p>', `<p class="ai-chat-sub">${cfg.chatModalSub}</p>`);
  html = html.replace('📐 ESTIMATE', cfg.chatModalBookBtn);

  // Replace Modal Chips
  const modalChipsHtml = cfg.chatModalChips.map(c => `          <button type="button" class="ai-chip" onclick="app.sendAiChip('${c.q}')">${c.label}</button>`).join('\n');
  const oldModalChips = `          <button type="button" class="ai-chip" onclick="app.sendAiChip('What is the cost of a whole-home cold climate heat pump?')">❄️ Heat Pump Costs</button>
          <button type="button" class="ai-chip" onclick="app.sendAiChip('Can high-velocity HVAC be installed in historic brownstones?')">🏛️ Historic Brownstones</button>
          <button type="button" class="ai-chip" onclick="app.sendAiChip('What federal 25C tax credits and clean heat rebates apply?')">💵 Rebates &amp; Credits</button>
          <button type="button" class="ai-chip" onclick="app.sendAiChip('How does your 10-year comprehensive warranty protect us?')">🛡️ 10-Year Warranty</button>
          <button type="button" class="ai-chip" onclick="app.sendAiChip('What is the difference between MERV 16, True HEPA, and UV-C?')">🏥 Hospital-Grade IAQ</button>
          <button type="button" class="ai-chip" onclick="app.sendAiChip('How quiet are concealed ceiling VRF fan coils?')">🤫 Acoustic Decibels</button>
          <button type="button" class="ai-chip" onclick="app.sendAiChip('What areas and counties do you service?')">📍 Service Regions</button>`;
  html = html.replace(oldModalChips, modalChipsHtml);

  // Replace Home Chips
  const homeChipsHtml = cfg.homeChips.map(c => `                <button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('${c.q}');">${c.label}</button>`).join('\n');
  const oldHomeChips = `                <button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('How do cold-climate heat pumps perform in sub-zero winter temperatures?');">❄️ Cold-Climate Heat Pumps</button>
                <button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('Can high-velocity HVAC be installed in historic brownstones without lowering ceilings?');">💨 High-Velocity Historic Ducting</button>
                <button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('What is included in whole-home hospital-grade air purification?');">🏥 Whole-Home Hospital IAQ</button>
                <button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('What federal IRA tax credits and clean heat rebates are available?');">💰 Federal IRA &amp; Utility Rebates</button>`;
  html = html.replace(oldHomeChips, homeChipsHtml);

  // 12. Specimen Archive / Shop (LITERAL)
  html = html.replace('ARCHITECTURAL HARDWARE &amp; FILTRATION ARCHIVE', cfg.shopEyebrow);
  html = html.replace('THE CLIMATE &amp; IAQ SPECIMEN ATELIER', cfg.shopTitle);
  html = html.replace('Trimless plaster-in linear slot diffusers, hospital-grade MERV 16 micro-media filter packs, and antique forged brass floor registers available for direct residential delivery.', cfg.shopDesc);
  html = html.replace('ORDER CLIMATE SPECIMENS', cfg.shopCta);

  // 13. Journal Section (LITERAL)
  html = html.replace('THE CLIMATE JOURNAL', cfg.journalEyebrow);
  html = html.replace('CLIMATE ARCHITECTURE &amp; ENGINEERING DISPATCHES', cfg.journalTitle);
  html = html.replace('Authoritative treatises on acoustic airflow design, cold-climate heat pump thermodynamics, indoor air quality science, and historic brownstone preservation.', cfg.journalDesc);

  // 14. Consultation Card (LITERAL)
  html = html.replace('DIRECT ENGINEERING DESK', cfg.consultationEyebrow);
  html = html.replace('REQUEST A FEASIBILITY REVIEW', cfg.consultationTitle);
  html = html.replace('Describe your heating/cooling requirements, zoning preferences, or desired commissioning window...', cfg.consultationNotesPlaceholder);

  // 15. Inject custom JSON datasets (Safe literal function replacement)
  const servicesStr = JSON.stringify(cfg.services, null, 2);
  const teamStr = JSON.stringify(cfg.team, null, 2);
  const productsStr = JSON.stringify(cfg.products, null, 2);

  html = html.replace(/const SERVICES_DATA = \[[\s\S]*?\];/s, () => `const SERVICES_DATA = ${servicesStr};`);
  html = html.replace(/const BARBERS_DATA = \[[\s\S]*?\];/s, () => `const BARBERS_DATA = ${teamStr};`);
  html = html.replace(/const TEAM_DATA = \[[\s\S]*?\];/s, () => `const TEAM_DATA = ${teamStr};`);
  html = html.replace(/const PRODUCTS_DATA = \[[\s\S]*?\];/s, () => `const PRODUCTS_DATA = ${productsStr};`);

  return html;
}

// Generate templates for Barber, Salon, and Gym
for (const [key, cfg] of Object.entries(NICHES)) {
  const rawPath = path.resolve(`public/templates-raw/${cfg.rawFile}`);
  const previewPath = path.resolve(`public/${cfg.rawFile}`);
  const rootPath = path.resolve(cfg.rawFile);

  const rawHtml = transformMasterToNiche(key, cfg);
  fs.writeFileSync(rawPath, rawHtml, 'utf8');
  console.log(`✓ Wrote raw template: ${cfg.rawFile} (${(rawHtml.length / 1024).toFixed(1)} KB)`);

  const previewHtml = compileSample(rawHtml, cfg.sample);
  fs.writeFileSync(previewPath, previewHtml, 'utf8');
  fs.writeFileSync(rootPath, previewHtml, 'utf8');
  console.log(`✓ Wrote preview & root: ${cfg.rawFile} (${(previewHtml.length / 1024).toFixed(1)} KB)`);
}

console.log('\nAll 3 Bespoke Luxury Templates Generated Successfully with ZERO loading freeze!');
