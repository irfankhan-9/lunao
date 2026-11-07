// scripts/rebrand-3-niches.mjs
// Directly duplicates public/templates-raw/hvac-template-02.html
// for Barber, Salon, and Gym only.
// Completely disables page-transition-veil so sites NEVER get stuck on loading!

import fs from 'fs';
import path from 'path';

const MASTER_PATH = path.resolve('public/templates-raw/hvac-template-02.html');
const master = fs.readFileSync(MASTER_PATH, 'utf8');

const NICHES = {
  barber: {
    rawFile: 'barber-template-03.html',
    title: 'Bespoke Master Blade & Executive Grooming',
    tagline1: '✦ BESPOKE MASTER BLADE & HAIR ARCHITECTURE ✦',
    tagline2: 'JAPANESE DAMASCUS BLADES · ROYAL STRAIGHT-RAZOR SHAVES',
    badge: 'ATELIER MASTER CUTS',
    atelierName: 'Executive Blade Lounge',
    conciergeTitle: 'Bespoke Blade &amp; Grooming Concierge',
    conciergeBadge: '✨ MASTER BLADE DESK LIVE',
    conciergeIcon: '💈',
    serviceEyebrow: 'TIMELESS GROOMING DISCIPLINES',
    serviceTitle: 'Couture Barbershop &amp; Straight-Razor Services',
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
      { id: 'ear-candling', name: 'Traditional Ear Candling & Massage', category: 'Wellness', duration: '30 MIN', price: '$55', desc: 'Relaxing holistic thermal pressure relief followed by cervical neck and shoulder acupressure.', img: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80' },
      { id: 'razor-lineup', name: 'Hand-Hammered Razor Lineup & Taper', category: 'Haircuts', duration: '25 MIN', price: '$45', desc: 'Crisp hairline perimeter detailing, taper blend around temples, and clean straight-razor nape finish.', img: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80' },
      { id: 'grey-blending', name: 'Natural Grey Blending Camouflage', category: 'Color', duration: '30 MIN', price: '$60', desc: 'Subtle demi-permanent tonal blending that softens greys naturally without harsh regrowth lines.', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80' },
      { id: 'keratin-treatment', name: 'Botanical Keratin Smoothing Therapy', category: 'Treatments', duration: '60 MIN', price: '$125', desc: 'Formaldehyde-free organic smoothing treatment eliminating frizz while maintaining natural hair texture.', img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80' },
      { id: 'steam-cleanse', name: 'Menthol Eucalyptus Steam Cleanse', category: 'Wellness', duration: '20 MIN', price: '$35', desc: 'Continuous hot herbal vapor steam opening pores, softening beard follicles, and easing facial tension.', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80' },
      { id: 'vip-groomsmen', name: 'Groomsmen VIP Private Suite', category: 'VIP', duration: '120 MIN', price: '$450', desc: 'Exclusive booking of private lounge, champagne service, full cuts, shaves, and shoe shine for up to 4.', img: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=800&q=80' },
      { id: 'father-son', name: 'Father & Son Master Barber Duet', category: 'Combos', duration: '60 MIN', price: '$120', desc: 'Two side-by-side bespoke haircuts with hot lather detailing and artisanal soda beverage service.', img: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=800&q=80' }
    ],
    team: [
      { id: 'barber-1', name: 'Dominic Sterling', role: 'Founding Master Barber', specialty: 'Damascus Scissor Architecture & Fades', exp: '16 Yrs Exp', bio: 'Trained under traditional British guild barbers, Dominic crafts silhouettes tailored precisely to cranial contours.', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80' },
      { id: 'barber-2', name: 'Erick Hanson', role: 'Executive Blade Specialist', specialty: 'Precision Skin Fades & Lineups', exp: '11 Yrs Exp', bio: 'Specialist in modern zero-gap tapers and seamless skin blends using custom-calibrated Japanese tools.', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80' },
      { id: 'barber-3', name: 'Maxime Laurent', role: 'Texture & Scissor Sculptor', specialty: 'Parisian Scissor Styling & Texture', exp: '9 Yrs Exp', bio: 'Bringing European shear ergonomics to lived-in textured crops, pompadours, and flowing side parts.', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80' },
      { id: 'barber-4', name: 'Marcus Vance', role: 'Master Shave Steward', specialty: 'Traditional Straight-Razor & Beard Art', exp: '14 Yrs Exp', bio: 'Devoted to the classic art of the multi-towel shave, straight-razor tension glide, and beard symmetry.', img: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80' },
      { id: 'barber-5', name: 'Simon King', role: 'Senior Stylist & Colorist', specialty: 'Natural Tonal Blending & Scalp Detox', exp: '8 Yrs Exp', bio: 'Master in subtle masculine grey transitions and therapeutic scalp rehabilitation protocols.', img: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=600&q=80' }
    ],
    products: [
      { id: 'p1', name: 'Damascus Steel Straight Razor', price: '$145', cat: 'Cutlery', desc: 'Hand-folded 67-layer Damascus steel blade with polished walnut handle.', img: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?auto=format&fit=crop&w=600&q=80', benefits: ['67-Layer Damascus', 'Japanese Hardened Steel', 'Walnut Handle'] },
      { id: 'p2', name: 'Sandalwood & Bergamot Pre-Shave Elixir', price: '$38', cat: 'Apothecary', desc: 'Cold-pressed botanical oils that protect sensitive skin from razor irritation.', img: 'https://images.unsplash.com/photo-1608248597359-25e29780000a?auto=format&fit=crop&w=600&q=80', benefits: ['Cold-Pressed Oils', 'Zero Alcohol', 'Bergamot Essence'] },
      { id: 'p3', name: 'Sea Kelp & Moroccan Clay Pomade', price: '$32', cat: 'Styling', desc: 'Matte medium hold with zero petroleum residue and effortless water-rinse.', img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80', benefits: ['Matte Finish', 'Organic Clay', 'Water-Soluble'] },
      { id: 'p4', name: 'Pure Silvertip Badger Shaving Brush', price: '$85', cat: 'Cutlery', desc: 'Artisanal turned brass and resin handle with premium silvertip bristles.', img: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=600&q=80', benefits: ['Silvertip Bristles', 'Solid Brass Core', 'Rich Lather Aeration'] },
      { id: 'p5', name: 'Cedar & Amber Conditioning Beard Oil', price: '$34', cat: 'Apothecary', desc: 'Lightweight argan and jojoba carrier oils nourishing coarse beard hair.', img: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=600&q=80', benefits: ['Organic Jojoba', 'Deep Hydration', 'Subtle Wood Smoke Note'] },
      { id: 'p6', name: 'Botanical Aftershave Cooling Tonic', price: '$36', cat: 'Apothecary', desc: 'Witch hazel and menthol crystal splash that calms pores instantly.', img: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=600&q=80', benefits: ['Pore Tightening', 'Cooling Menthol', 'Anti-Redness Complex'] }
    ]
  },

  salon: {
    rawFile: 'salon-template-02.html',
    title: 'Bespoke Haute Coiffure & Color Atelier',
    tagline1: '✦ HAUTE COIFFURE & FRENCH BALAYAGE ✦',
    tagline2: 'FRENCH BALAYAGE · JAPANESE SILK THERMAL SMOOTHING',
    badge: 'HAUTE COIFFURE ATELIER',
    atelierName: 'Parisian Hair Atelier',
    conciergeTitle: 'Bespoke Haute Hair &amp; Color Concierge',
    conciergeBadge: '✨ HAUTE COLOR DESK LIVE',
    conciergeIcon: '✂️',
    serviceEyebrow: 'COUTURE HAIR ARTISTRY',
    serviceTitle: 'Haute Coiffure &amp; Master Color Transformations',
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
      { id: 'keratin-infusion', name: '24K Liquid Gold Keratin Infusion', category: 'Treatments', duration: '90 MIN', price: '$195', desc: 'Hydrolyzed vegetable keratin and 24K gold particulate sealing the cuticle against humidity.', img: 'https://images.unsplash.com/photo-1516914943479-89db7d9ae7f2?auto=format&fit=crop&w=800&q=80' },
      { id: 'scalp-headspa', name: 'Botanical Scalp Peeling & Head Spa', category: 'Wellness', duration: '45 MIN', price: '$85', desc: 'Japanese waterfall scalp cleanse, volcanic clay scrub, and cranial relaxation pressure therapy.', img: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80' },
      { id: 'editorial-blowout', name: 'Editorial Blowout & Red-Carpet Style', category: 'Styling', duration: '45 MIN', price: '$70', desc: 'Round-brush high-volume blowout with bouncy curtain bangs and diamond sheen finish.', img: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=800&q=80' },
      { id: 'extensions-micro', name: 'Custom Micro-Bead Hair Extensions', category: 'Extensions', duration: '180 MIN', price: '$650', desc: 'Ethically sourced 100% Remy human hair flawlessly matched to texture, density, and hue.', img: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=800&q=80' },
      { id: 'root-shadow', name: 'Root Shadow & Color Melt Camouflage', category: 'Color', duration: '75 MIN', price: '$140', desc: 'Blends harsh line of demarcation for effortless 4-month low-maintenance lived-in regrowth.', img: 'https://images.unsplash.com/photo-1492106087820-71f1a00d2b11?auto=format&fit=crop&w=800&q=80' },
      { id: 'molecular-repair', name: 'Olaplex & K18 Molecular Bond Rebuilder', category: 'Treatments', duration: '30 MIN', price: '$55', desc: 'Patented peptide sequence reconnecting broken polypeptide chains at the deepest cortex level.', img: 'https://images.unsplash.com/photo-1522337094345-a044afc6d0d6?auto=format&fit=crop&w=800&q=80' },
      { id: 'crystal-gloss', name: 'Silk Gloss & Crystal Sheen Finishing', category: 'Color', duration: '40 MIN', price: '$65', desc: 'Clear acidic shine treatment locking in vibrant pigments while eliminating environmental porosity.', img: 'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?auto=format&fit=crop&w=800&q=80' },
      { id: 'bridal-couture', name: 'Bridal Couture Private Studio Suite', category: 'VIP', duration: '240 MIN', price: '$850', desc: 'Private atelier buyout for bride & bridal party with champagne, trial run, and master coiffure.', img: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80' }
    ],
    team: [
      { id: 'stylist-1', name: 'Clarabelle Moreau', role: 'Artistic Director & Master Colorist', specialty: 'French Balayage & Parisian Blonde', exp: '15 Yrs Exp', bio: 'Trained at École de Coiffure Paris, Clarabelle paints dimension that grows out effortlessly for months.', img: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80' },
      { id: 'stylist-2', name: 'Sophia Rossi', role: 'Blonde Architecture Specialist', specialty: 'Nordic Icy Platinum & Baby Lights', exp: '12 Yrs Exp', bio: 'Renowned for maintaining absolute hair integrity while lifting clients to breathtaking light shades.', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80' },
      { id: 'stylist-3', name: 'Aurélie Gagnon', role: 'Japanese Silk & Rebonding Director', specialty: 'Thermal Reconditioning & Keratin', exp: '10 Yrs Exp', bio: 'Certified master technician in permanent thermal silk smoothing and anti-frizz molecular chemistry.', img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80' },
      { id: 'stylist-4', name: 'Jessica Chen', role: 'Couture Precision Cutting Artisan', specialty: 'Face-Framing Curtain Layers & Bobs', exp: '8 Yrs Exp', bio: 'Creates geometric and soft lived-in silhouettes that respond naturally to effortless air-drying.', img: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=600&q=80' },
      { id: 'stylist-5', name: 'Nadia Petrov', role: 'Bridal & Red Carpet Stylist', specialty: 'Haute Updos & Micro-Bead Extensions', exp: '11 Yrs Exp', bio: 'Lead artist for luxury editorial shoots and high-profile bridal celebrations across the region.', img: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80' }
    ],
    products: [
      { id: 'p1', name: 'Pure Argan & Camellia Botanical Elixir', price: '$48', cat: 'Oils', desc: 'Cold-pressed organic Moroccan argan oil delivering brilliant mirror shine.', img: 'https://images.unsplash.com/photo-1608248597359-25e29780000a?auto=format&fit=crop&w=600&q=80', benefits: ['Cold-Pressed Argan', 'Instant Gloss Seal', 'Zero Weight'] },
      { id: 'p2', name: 'Violet Silk Anti-Brass Blonde Masque', price: '$44', cat: 'Masques', desc: 'Deep purple botanical pigments neutralizing yellow and brassy tones.', img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80', benefits: ['Optical Violet Pigment', 'Hydrolyzed Silk', 'Paraben-Free'] },
      { id: 'p3', name: 'French Thermal Shield Heat Protection Mist', price: '$36', cat: 'Styling', desc: '450°F defense shield preserving moisture during curling and straightening.', img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80', benefits: ['450°F Defense', 'Anti-Humidity Barrier', 'Rosewater Infused'] },
      { id: 'p4', name: 'Sea Mineral Texture & Volume Spray', price: '$34', cat: 'Styling', desc: 'French Atlantic sea salt spray creating effortless lived-in texture.', img: 'https://images.unsplash.com/photo-1512290900672-1f062ef72f23?auto=format&fit=crop&w=600&q=80', benefits: ['Atlantic Sea Salt', 'Matte Volume', 'UV Filter'] },
      { id: 'p5', name: 'Molecular Peptide Hair Repair Serum', price: '$65', cat: 'Treatments', desc: 'Biomimetic peptide serum reversing chemical, heat, and mechanical damage.', img: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=600&q=80', benefits: ['Biomimetic Peptides', 'Cortex Repair', 'Clinically Proven'] },
      { id: 'p6', name: 'Organic Bamboo Smoothing Shampoo & Conditioner', price: '$58', cat: 'Care', desc: 'Sulfate-free duo enriching coarse strands with silica and bamboo extract.', img: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=600&q=80', benefits: ['Sulfate-Free', 'Organic Bamboo', 'Color-Safe'] }
    ]
  },

  gym: {
    rawFile: 'gym-template-02.html',
    title: 'Bespoke Private Performance & Longevity Club',
    tagline1: '✦ PRIVATE PERFORMANCE & ATHLETIC LONGEVITY ✦',
    tagline2: '3D BIOMECHANICAL SCREENING · SUB-ZERO CRYOTHERAPY',
    badge: 'PRIVATE PERFORMANCE CLUB',
    atelierName: 'Private Athletic Club',
    conciergeTitle: 'Bespoke Athletic Performance Concierge',
    conciergeBadge: '✨ ATHLETIC DESK LIVE',
    conciergeIcon: '⚡',
    serviceEyebrow: 'PERFORMANCE & LONGEVITY DISCIPLINES',
    serviceTitle: 'Elite Athletic Coaching &amp; Cellular Recovery',
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
      { id: 'olympic-lifting', name: 'Olympic Weightlifting Technique Lab', category: 'Training', duration: '75 MIN', price: '$150', desc: 'High-speed bar kinematics analysis refining snatch and clean-and-jerk barbell transitions.', img: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?auto=format&fit=crop&w=800&q=80' },
      { id: 'normatec-recovery', name: 'Normatec 3 & Hypervolt Compression', category: 'Recovery', duration: '30 MIN', price: '$45', desc: 'Dynamic pneumatic compression boots flushing lactic metabolites and accelerating lymphatic return.', img: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80' },
      { id: 'postural-rehab', name: 'Targeted Core & Postural Rehabilitation', category: 'Training', duration: '50 MIN', price: '$120', desc: 'Specialized stability drills correcting desk-bound thoracic kyphosis and anterior pelvic tilt.', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80' },
      { id: 'hypertrophy-block', name: 'Hypertrophy & Density Block Protocol', category: 'Training', duration: '60 MIN', price: '$130', desc: 'Progressive overload periodization designed for dense myofibrillar growth with zero joint strain.', img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80' },
      { id: 'nutrition-coaching', name: 'Nutritional Macro & Biomarker Coaching', category: 'Diagnostics', duration: '45 MIN', price: '$110', desc: 'Evidence-based nutrient timing, blood glucose optimization, and cellular micronutrient protocol.', img: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80' },
      { id: 'metcon-class', name: 'High-Performance Hybrid MetCon Session', category: 'Training', duration: '50 MIN', price: '$40', desc: 'Small-group functional capacity interval training capping at 8 members for exacting coaching.', img: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=800&q=80' },
      { id: 'vip-biometric-pass', name: 'VIP 24/7 Keyless Biometric Access Pass', category: 'VIP', duration: 'MONTHLY', price: '$295', desc: 'Unrestricted around-the-clock fingerprint entry to private gym floor, recovery suite, and towel service.', img: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=800&q=80' }
    ],
    team: [
      { id: 'coach-1', name: 'Alex Mercer, CSCS', role: 'Head of Athletic Performance', specialty: 'Biomechanics & Periodized Strength', exp: '14 Yrs Exp', bio: 'Former collegiate strength director applying sports science to executive longevity and athletic mastery.', img: 'https://images.unsplash.com/photo-1567013127542-490d757e51fc?auto=format&fit=crop&w=600&q=80' },
      { id: 'coach-2', name: 'Tina Sterling', role: 'Olympic Lifting & Mobility Lead', specialty: 'Barbell Kinematics & Hip Mobility', exp: '10 Yrs Exp', bio: 'National-level weightlifter dedicated to bulletproofing connective tissues under heavy mechanical load.', img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80' },
      { id: 'coach-3', name: 'Chris Power, MS', role: 'Longevity & Metabolic Director', specialty: 'VO2 Max & Mitochondrial Health', exp: '12 Yrs Exp', bio: 'Master of Science in Exercise Physiology structuring training around cardiovascular and cellular longevity.', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80' },
      { id: 'coach-4', name: 'Sarah Connor', role: 'Corrective Exercise Specialist', specialty: 'Spine Mechanics & Posture Reset', exp: '9 Yrs Exp', bio: 'Specialist in McGill spine protocols eliminating chronic lower back tightness through core bracing.', img: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80' },
      { id: 'coach-5', name: 'Marcus Thorne', role: 'Contrast Therapy Steward', specialty: 'Vagus Nerve Regulation & Cryo', exp: '7 Yrs Exp', bio: 'Guides contrast thermal protocols designed to down-regulate sympathetic nervous system fatigue.', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80' }
    ],
    products: [
      { id: 'p1', name: 'Cold-Filtered Grass-Fed Whey Isolate', price: '$64', cat: 'Nutrition', desc: '100% micro-filtered native whey yielding 28g clean protein with zero artificial fillers.', img: 'https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?auto=format&fit=crop&w=600&q=80', benefits: ['Grass-Fed Source', '28g Native Isolate', 'Zero Sucralose'] },
      { id: 'p2', name: 'Micronized German Creapure Creatine', price: '$36', cat: 'Nutrition', desc: 'Pharmaceutical-grade Creapure monohydrate fueling ATP resynthesis and cognitive power.', img: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=600&q=80', benefits: ['99.9% Purity Creapure', 'Instant Dissolution', 'Cognitive + Strength'] },
      { id: 'p3', name: 'Electrolyte Hydration Sachet Pack', price: '$28', cat: 'Hydration', desc: 'Optimal 1000mg sodium, 200mg potassium, 60mg magnesium ratio without sugar spike.', img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80', benefits: ['Zero Added Sugar', 'Optimal Mineral Ratio', 'Real Citrus Extract'] },
      { id: 'p4', name: 'Heavy-Duty Steel Insulated Shaker', price: '$34', cat: 'Gear', desc: 'Double-walled vacuum insulated stainless steel shaker keeping liquids ice cold for 24h.', img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80', benefits: ['Pro-Grade Steel', 'No Odor Retention', '24H Cold Lock'] },
      { id: 'p5', name: 'Resistance Mobility & Floss Band Set', price: '$26', cat: 'Gear', desc: 'Natural latex mobility bands essential for hip flossing and shoulder activation.', img: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80', benefits: ['Natural Latex', '3 Tension Tiers', 'Joint Mobility Ready'] },
      { id: 'p6', name: 'Magnesium Glycinate Sleep & Recovery', price: '$32', cat: 'Nutrition', desc: 'High-absorption chelated magnesium promoting deep slow-wave REM sleep and muscle relaxation.', img: 'https://images.unsplash.com/photo-1608248597359-25e29780000a?auto=format&fit=crop&w=600&q=80', benefits: ['Chelated Glycinate', 'Zero Digestive Distress', 'Deep REM Support'] }
    ]
  }
};

function duplicateAndCustomize(key, cfg) {
  let html = master;

  // 1. HARD FIX FOR LOADING SCREEN: Disable the page transition veil completely so it NEVER blocks the view
  html = html.replace('class="page-transition-veil active"', 'class="page-transition-veil"');
  html = html.replace('.page-transition-veil {', '.page-transition-veil { display: none !important;');

  // 2. Disable Service Worker registration so it NEVER throws SecurityError
  html = html.replace(/navigator\.serviceWorker\.register\('\/sw\.js'\)[\s\S]*?\.catch\(error => \{[\s\S]*?\}\);/g, '/* sw disabled */');

  // 3. Customize Header & Titles
  html = html.replace('<title>{{BUSINESS_NAME}} — Bespoke Architectural Climate &amp; HVAC</title>', `<title>{{BUSINESS_NAME}} — ${cfg.title}</title>`);
  html = html.replace('<title>{{BUSINESS_NAME}} — Bespoke Architectural Climate & HVAC</title>', `<title>{{BUSINESS_NAME}} — ${cfg.title}</title>`);
  html = html.replace('✦ BESPOKE CLIMATE ENGINEERING & INDOOR PURITY ✦', cfg.tagline1);
  html = html.replace('CONCEALED SLOT DIFFUSERS · HOSPITAL-GRADE PURITY', cfg.tagline2);
  html = html.replace('✦ ATELIER THERMODYNAMICS', `✦ ${cfg.badge}`);
  html = html.replace('Architectural HVAC Atelier', cfg.atelierName);
  html = html.replace('Bespoke Climate &amp; Heat Pump Concierge', cfg.conciergeTitle);
  html = html.replace('Bespoke Climate & Heat Pump Concierge', cfg.conciergeTitle);
  html = html.replace('✨ AURUM CLIMATE DESK LIVE', cfg.conciergeBadge);
  html = html.replace('❄️', cfg.conciergeIcon);
  html = html.replace('ARCHITECTURAL HVAC DISCIPLINES', cfg.serviceEyebrow);
  html = html.replace('Thermodynamic Systems &amp; Engineering Services', cfg.serviceTitle);
  html = html.replace('Thermodynamic Systems & Engineering Services', cfg.serviceTitle);

  // 4. Safely replace JSON datasets
  const servicesStr = JSON.stringify(cfg.services, null, 2);
  const teamStr = JSON.stringify(cfg.team, null, 2);
  const productsStr = JSON.stringify(cfg.products, null, 2);

  html = html.replace(/const SERVICES_DATA = \[[\s\S]*?\];/s, () => `const SERVICES_DATA = ${servicesStr};`);
  html = html.replace(/const BARBERS_DATA = \[[\s\S]*?\];/s, () => `const BARBERS_DATA = ${teamStr};`);
  html = html.replace(/const TEAM_DATA = \[[\s\S]*?\];/s, () => `const TEAM_DATA = ${teamStr};`);
  html = html.replace(/const PRODUCTS_DATA = \[[\s\S]*?\];/s, () => `const PRODUCTS_DATA = ${productsStr};`);

  return html;
}

function compileSample(rawHtml, sample) {
  let html = rawHtml;
  html = html.replace(/\{\{BUSINESS_NAME\}\}/g, sample.businessName);
  html = html.replace(/\{\{BUSINESS_NAME_SHORT\}\}/g, sample.businessNameShort);
  html = html.replace(/\{\{CITY\}\}/g, sample.city);
  html = html.replace(/\{\{STATE\}\}/g, sample.state);
  html = html.replace(/\{\{YEARS_IN_BUSINESS\}\}/g, sample.yearsInBusiness);
  html = html.replace(/\{\{PHONE_DISPLAY\}\}/g, sample.phoneDisplay);
  html = html.replace(/\{\{PHONE_RAW\}\}/g, sample.phoneRaw);
  html = html.replace(/\{\{EMAIL\}\}/g, sample.email);
  html = html.replace(/\{\{ADDRESS\}\}/g, sample.address);
  html = html.replace(/\{\{GOOGLE_RATING\}\}/g, sample.googleRating);
  html = html.replace(/\{\{GOOGLE_REVIEW_COUNT\}\}/g, sample.googleReviewCount);
  html = html.replace(/\{\{INSTAGRAM_HANDLE\}\}/g, sample.instagramHandle);
  html = html.replace(/\{\{FACEBOOK_URL\}\}/g, sample.facebookUrl);
  html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  return html;
}

console.log('Duplicating and customizing 3 Niches (Barber, Salon, Gym)...');

for (const [key, cfg] of Object.entries(NICHES)) {
  const rawPath = path.resolve(`public/templates-raw/${cfg.rawFile}`);
  const previewPath = path.resolve(`public/${cfg.rawFile}`);
  const rootPath = path.resolve(cfg.rawFile);

  const rawHtml = duplicateAndCustomize(key, cfg);
  fs.writeFileSync(rawPath, rawHtml, 'utf8');
  console.log(`✓ Wrote raw template: ${cfg.rawFile} (${(rawHtml.length / 1024).toFixed(1)} KB)`);

  const previewHtml = compileSample(rawHtml, cfg.sample);
  fs.writeFileSync(previewPath, previewHtml, 'utf8');
  fs.writeFileSync(rootPath, previewHtml, 'utf8');
  console.log(`✓ Wrote preview & root: ${cfg.rawFile} (${(previewHtml.length / 1024).toFixed(1)} KB)`);
}

// Also update hvac-template-02.html to disable veil loader so it never hangs either!
let hvacRaw = fs.readFileSync(MASTER_PATH, 'utf8');
hvacRaw = hvacRaw.replace('class="page-transition-veil active"', 'class="page-transition-veil"');
hvacRaw = hvacRaw.replace('.page-transition-veil {', '.page-transition-veil { display: none !important;');
hvacRaw = hvacRaw.replace(/navigator\.serviceWorker\.register\('\/sw\.js'\)[\s\S]*?\.catch\(error => \{[\s\S]*?\}\);/g, '/* sw disabled */');
fs.writeFileSync(MASTER_PATH, hvacRaw, 'utf8');
fs.writeFileSync(path.resolve('public/templates-raw/hvac-bespoke.html'), hvacRaw, 'utf8');
fs.writeFileSync(path.resolve('public/templates-raw/hvac-template.html'), hvacRaw, 'utf8');

// Update preview & root HVAC files
for (const f of ['public/hvac-template-02.html', 'hvac-template-02.html', 'public/hvac-bespoke.html', 'hvac-bespoke.html']) {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace('class="page-transition-veil active"', 'class="page-transition-veil"');
    c = c.replace('.page-transition-veil {', '.page-transition-veil { display: none !important;');
    c = c.replace(/navigator\.serviceWorker\.register\('\/sw\.js'\)[\s\S]*?\.catch\(error => \{[\s\S]*?\}\);/g, '/* sw disabled */');
    fs.writeFileSync(f, c, 'utf8');
  }
}
console.log('✓ Disabled transition veil in HVAC master and preview templates');
