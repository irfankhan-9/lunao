// scripts/generate-atelier-niches.mjs
// Generates the 5 Luxury Bespoke Atelier Templates for:
// Barber (barber-template-03.html), Salon (salon-template-02.html),
// Dentist (dentist-template-02.html), Gym (gym-template-02.html),
// Roofing (roofing-template-02.html).

import fs from 'fs';
import path from 'path';

const MASTER_RAW_PATH = path.resolve('public/templates-raw/hvac-template-02.html');
const masterHtml = fs.readFileSync(MASTER_RAW_PATH, 'utf8');

const NICHE_CONFIGS = {
  barber: {
    rawFileName: 'barber-template-03.html',
    niche: 'Barber',
    name: 'Bespoke — Master Blade & Executive Grooming',
    tagline: 'MASTER BLADE & HAIR ARCHITECTURE',
    heroBadge: 'ATELIER MASTER CUTS',
    heroTitle: 'Bespoke Master Blade & Hair Architecture',
    heroSubtitle: 'Japanese Damascus blades, hot lather straight-razor detailing, precision fade architecture, and beard sculpting delivered with guaranteed upfront booking.',
    serviceEyebrow: 'TIMELESS GROOMING DISCIPLINES',
    serviceTitle: 'Couture Barbershop & Straight-Razor Services',
    serviceDesc: 'Every haircut and beard session begins with a facial bone-structure consultation, botanical scalp tonic, and razor detailing.',
    conciergeTitle: 'Bespoke Blade & Grooming Concierge',
    conciergeDesc: 'Unsure which haircut best flatters your head shape, how to treat skin irritation from close shaves, or what matte styling clay fits your routine? Inquire with our digital grooming desk.',
    conciergeBadge: '✨ MASTER BLADE DESK LIVE',
    conciergeIcon: '💈',
    chip1: ['💈 What haircut best fits my facial structure?', 'Which haircut best suits my facial bone structure and head shape?'],
    chip2: ['🪒 Straight-Razor Shave Skin Care', 'How do I maintain sensitive skin during a straight-razor shave?'],
    chip3: ['✨ Matte Clay vs Pomade Hold', 'What styling clay provides an all-day matte hold without buildup?'],
    sampleData: {
      businessName: 'The Sovereign Blade Grooming Lounge',
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
      { id: 'vip-groomsmen', name: 'Groomsmen VIP Private Suite Suite', category: 'VIP', duration: '120 MIN', price: '$450', desc: 'Exclusive booking of private lounge, champagne service, full cuts, shaves, and shoe shine for up to 4.', img: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=800&q=80' },
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
    rawFileName: 'salon-template-02.html',
    niche: 'Salon',
    name: 'Bespoke — Haute Coiffure & Color Atelier',
    tagline: 'HAUTE COIFFURE & FRENCH BALAYAGE',
    heroBadge: 'HAUTE COIFFURE ATELIER',
    heroTitle: 'Bespoke Haute Coiffure & French Balayage Atelier',
    heroSubtitle: 'French freehand balayage, botanical gloss architecture, lived-in blonde, and Japanese silk thermal smoothing delivered with upfront transparent couture pricing.',
    serviceEyebrow: 'COUTURE HAIR ARTISTRY',
    serviceTitle: 'Haute Coiffure & Master Color Transformations',
    serviceDesc: 'Every hair transformation begins with an architectural face-framing diagnostic, botanical gloss consultation, and custom color chemistry.',
    conciergeTitle: 'Bespoke Haute Hair & Color Concierge',
    conciergeDesc: 'Unsure which balayage tone complements your undertone, how long Japanese thermal smoothing lasts, or what peptide bond repair your hair requires? Consult our digital salon atelier.',
    conciergeBadge: '✨ HAUTE COLOR DESK LIVE',
    conciergeIcon: '✂️',
    chip1: ['🎨 Balayage Undertone Diagnostic', 'What balayage tone complements warm versus cool skin undertones?'],
    chip2: ['💇‍♀️ Japanese Silk Thermal Smoothing', 'How long does Japanese silk thermal smoothing last on thick hair?'],
    chip3: ['🌿 Molecular Peptide Bond Repair', 'Which hair masque repairs chlorine, sun, and lightening damage?'],
    sampleData: {
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

  dentist: {
    rawFileName: 'dentist-template-02.html',
    niche: 'Dentist',
    name: 'Bespoke — Aesthetic Smile Architecture',
    tagline: 'AESTHETIC SMILE STUDIO & PORCELAIN VENEERS',
    heroBadge: 'AESTHETIC SMILE STUDIO',
    heroTitle: 'Bespoke Aesthetic Dentistry & Smile Architecture',
    heroSubtitle: 'Handcrafted porcelain veneers, minimally invasive laser whitening, digital clear aligners, and biomimetic restoration engineered with gentle sedation.',
    serviceEyebrow: 'AESTHETIC DENTAL DISCIPLINES',
    serviceTitle: 'Cosmetic Dentistry & Smile Reconstruction',
    serviceDesc: 'Every patient smile begins with digital 3D facial symmetry analysis, gentle sedation options, and custom ceramic shade calibration.',
    conciergeTitle: 'Bespoke Smile Design & Dental Concierge',
    conciergeDesc: 'Unsure if porcelain veneers or clear aligners fit your smile goals, how laser whitening prevents sensitivity, or what biomimetic crowns entail? Consult our aesthetic dental desk.',
    conciergeBadge: '✨ SMILE DESIGN DESK LIVE',
    conciergeIcon: '🦷',
    chip1: ['🦷 Veneers vs Clear Aligners', 'Am I a candidate for handcrafted porcelain veneers or clear aligners?'],
    chip2: ['✨ Laser Whitening Sensitivity', 'How does laser whitening prevent nerve sensitivity compared to trays?'],
    chip3: ['🛡️ Biomimetic Ceramic Inlays', 'What are the longevity benefits of biomimetic ceramic inlays over fillings?'],
    sampleData: {
      businessName: 'Apex Aesthetic Smile Architecture',
      businessNameShort: 'Apex Smile',
      city: 'Austin, TX',
      state: 'TX',
      yearsInBusiness: '2014',
      phoneDisplay: '(512) 555-0199',
      phoneRaw: '5125550199',
      email: 'care@apexsmiledental.com',
      address: '3700 N Capital of Texas Hwy, Austin, TX 78746',
      googleRating: '4.9',
      googleReviewCount: '480',
      instagramHandle: 'apex_smile_studio',
      facebookUrl: 'https://facebook.com/apexsmilestudio'
    },
    services: [
      { id: 'porcelain-veneers', name: 'Handcrafted Porcelain Veneers', category: 'Cosmetic', duration: '90 MIN', price: '$1,400', desc: 'Ultra-thin handcrafted ceramic veneers custom shaded to complement natural facial bone structure.', img: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80' },
      { id: 'clear-aligners', name: 'Digital Clear Aligner Smile Therapy', category: 'Orthodontics', duration: '30 MIN', price: '$3,800', desc: 'Virtually invisible aligner trays mapped via 3D intraoral scanner for precise tooth repositioning.', img: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80' },
      { id: 'laser-whitening', name: 'Laser In-Office Biolase Whitening', category: 'Cosmetic', duration: '60 MIN', price: '$450', desc: 'Up to 8 shades brighter in a single 60-minute visit with patented zero-sensitivity laser activation.', img: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=800&q=80' },
      { id: 'biomimetic-inlay', name: 'Biomimetic Ceramic Inlays & Onlays', category: 'Restorative', duration: '60 MIN', price: '$850', desc: 'Conservative tooth-preserving ceramic restorations that mirror the natural elasticity of enamel.', img: 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=800&q=80' },
      { id: 'guided-implants', name: '3D Guided Dental Implant Reconstruction', category: 'Implants', duration: '90 MIN', price: '$2,200', desc: 'Computer-guided titanium & zirconia implant placement with natural-looking custom porcelain crowns.', img: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80' },
      { id: 'sedation-exam', name: 'Gentle Sedation VIP Comprehensive Exam', category: 'Preventive', duration: '60 MIN', price: '$195', desc: 'Full mouth 3D digital imaging, cancer screening, periodontal charting, and zero-anxiety nitrous comfort.', img: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80' },
      { id: 'air-flow-polish', name: 'Air-Flow Stain & Plaque Micro-Polishing', category: 'Preventive', duration: '45 MIN', price: '$140', desc: 'Comfortable erythritol powder jet cleaning gently lifting deep espresso, red wine, and tobacco stains.', img: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80' },
      { id: 'gumline-sculpt', name: 'Gumline Laser Symmetry Sculpting', category: 'Cosmetic', duration: '45 MIN', price: '$600', desc: 'Minimally invasive laser contouring correcting gummy smiles and creating harmonious smile proportions.', img: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80' },
      { id: 'full-makeover', name: 'Full Mouth Functional Smile Makeover', category: 'Cosmetic', duration: '180 MIN', price: '$7,500', desc: 'Comprehensive aesthetic and bite rehabilitation restoring youthful facial dimensions and chew force.', img: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=800&q=80' },
      { id: 'tmj-therapy', name: 'Nightguard & TMJ Decompression Therapy', category: 'Wellness', duration: '40 MIN', price: '$550', desc: 'Custom digital occlusal splint relieving morning jaw tension, headaches, and nocturnal clenching.', img: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80' },
      { id: 'pediatric-seal', name: 'Pediatric Diamond Seal & Gentle Care', category: 'Preventive', duration: '40 MIN', price: '$120', desc: 'Compassionate preventative fluoride varnish and molar fissure sealant protection for young smiles.', img: 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=800&q=80' },
      { id: 'emergency-care', name: '24/7 Concierge Dental Emergency Care', category: 'VIP', duration: '60 MIN', price: '$250', desc: 'Priority on-call emergency room access for chipped teeth, severe toothache, or displaced crowns.', img: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80' }
    ],
    team: [
      { id: 'doctor-1', name: 'Dr. Julian Vance, DDS', role: 'Aesthetic Director & Smile Architect', specialty: 'Handcrafted Porcelain Veneers & Makeovers', exp: '17 Yrs Exp', bio: 'Fellow of the American Academy of Cosmetic Dentistry with over 5,000 custom veneer restorations placed.', img: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80' },
      { id: 'doctor-2', name: 'Dr. Mona Patel, DMD', role: 'Orthodontics & Aligner Director', specialty: 'Digital Clear Aligners & Occlusal Bite', exp: '13 Yrs Exp', bio: 'Pioneered digital torque biomechanics for rapid aesthetic alignment without traditional metallic brackets.', img: 'https://images.unsplash.com/photo-1594824813633-40e1e6945a0b?auto=format&fit=crop&w=600&q=80' },
      { id: 'doctor-3', name: 'Dr. Arthur Wu, DDS', role: 'Biomimetic Ceramic Surgeon', specialty: 'Guided 3D Implants & Ceramic Inlays', exp: '15 Yrs Exp', bio: 'Advocate of conservative tooth preservation, substituting aggressive drilling with bonded biomimetic ceramic.', img: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=600&q=80' },
      { id: 'doctor-4', name: 'Dr. Clara Rose, DMD', role: 'Sedation & Cosmetic Whitening Director', specialty: 'Laser Biolase & Anxiety-Free Care', exp: '9 Yrs Exp', bio: 'Specialist in calming dental phobias through gentle sedation protocols and non-invasive laser treatments.', img: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80' },
      { id: 'doctor-5', name: 'Dr. Ben Rivers, DDS', role: 'Periodontal & Laser Specialist', specialty: 'Gumline Laser Symmetry & Implants', exp: '11 Yrs Exp', bio: 'Focuses on soft tissue aesthetics, ensuring gum lines frame porcelain crowns with surgical symmetry.', img: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=600&q=80' }
    ],
    products: [
      { id: 'p1', name: 'Sonic Wave Ceramic Toothbrush System', price: '$125', cat: 'Appliances', desc: '40,000 vibrations per minute with micro-fine bristles that protect delicate gumlines.', img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80', benefits: ['40K VPM Sonic Pulse', 'Wireless Inductive Base', '30-Day Battery'] },
      { id: 'p2', name: 'Remineralizing Hydroxyapatite Serum', price: '$38', cat: 'Dentifrice', desc: 'Biomimetic nano-hydroxyapatite clinically proven to rebuild enamel micro-lesions.', img: 'https://images.unsplash.com/photo-1608248597359-25e29780000a?auto=format&fit=crop&w=600&q=80', benefits: ['Nano-Hydroxyapatite', 'Fluoride-Alternative', 'Zero Sensitivity'] },
      { id: 'p3', name: 'Gentle Vegan Whitening Pen', price: '$32', cat: 'Whitening', desc: 'Targeted botanical peroxide-free gel pen for effortless touchups on the go.', img: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=600&q=80', benefits: ['No Gum Burning', 'Enamel Safe', 'Instant Lift'] },
      { id: 'p4', name: 'Bio-Floss Infused with Organic Peppermint', price: '$12', cat: 'Hygiene', desc: 'Expanding plant-based floss woven with activated charcoal and essential mint oils.', img: 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=600&q=80', benefits: ['Charcoal Infused', 'Expands in Interdentals', 'Eco Biodegradable'] },
      { id: 'p5', name: 'Clinically Balanced Probiotic Oral Rinse', price: '$24', cat: 'Rinses', desc: 'Alcohol-free oral microbiome mouthwash supporting healthy flora and fresh breath.', img: 'https://images.unsplash.com/photo-1512290900672-1f062ef72f23?auto=format&fit=crop&w=600&q=80', benefits: ['Oral Probiotics', 'Alcohol-Free', 'Restores Salivary pH'] },
      { id: 'p6', name: 'Custom Thermo-Mold TMJ Night Guard', price: '$180', cat: 'Appliances', desc: 'Laboratory-grade dual laminate night guard cushioning teeth against bruxism.', img: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=600&q=80', benefits: ['Dual-Laminate Fit', 'BPA Free', 'Prevents Wear'] }
    ]
  },

  gym: {
    rawFileName: 'gym-template-02.html',
    niche: 'Gym',
    name: 'Bespoke — Private Performance & Longevity Club',
    tagline: 'PRIVATE PERFORMANCE & LONGEVITY CLUB',
    heroBadge: 'PRIVATE PERFORMANCE CLUB',
    heroTitle: 'Bespoke High-Performance & Athletic Longevity Club',
    heroSubtitle: 'Biomechanical 3D assessment, executive strength coaching, sub-zero cryotherapy, and metabolic conditioning engineered for peak physical longevity.',
    serviceEyebrow: 'PERFORMANCE & LONGEVITY DISCIPLINES',
    serviceTitle: 'Elite Athletic Coaching & Cellular Recovery',
    serviceDesc: 'Every athletic membership begins with a 3D biomechanical movement assessment, metabolic VO2 testing, and bespoke programming.',
    conciergeTitle: 'Bespoke Athletic Performance & Longevity Concierge',
    conciergeDesc: 'Unsure how contrast cryotherapy accelerates recovery, which strength split protects spinal longevity, or how VO2 metabolic testing informs conditioning? Consult our athletic desk.',
    conciergeBadge: '✨ ATHLETIC DESK LIVE',
    conciergeIcon: '⚡',
    chip1: ['⚡ Contrast Cryo & Cold Plunge', 'How do contrast sauna and sub-zero cryo accelerate cellular recovery?'],
    chip2: ['🏋️‍♂️ Hypertrophy & Joint Longevity', 'What strength protocol maximizes hypertrophy while protecting joint cartilage?'],
    chip3: ['📊 VO2 Max & Metabolic Testing', 'How does clinical VO2 max testing guide cardiovascular endurance?'],
    sampleData: {
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
  },

  roofing: {
    rawFileName: 'roofing-template-02.html',
    niche: 'Roofing',
    name: 'Bespoke — Master Architectural Roofing & Slate',
    tagline: 'ARCHITECTURAL ROOFING & SLATE ATELIER',
    heroBadge: 'ARCHITECTURAL ROOFING ATELIER',
    heroTitle: 'Bespoke Architectural Roofing & Standing Seam Atelier',
    heroSubtitle: 'Standing seam copper & zinc, natural quarry slate, Class 4 impact architectural shingles, and storm restoration engineered with 50-year ironclad warranties.',
    serviceEyebrow: 'ARCHITECTURAL ROOFING DISCIPLINES',
    serviceTitle: 'Master Roof Architecture & Storm Defense',
    serviceDesc: 'Every residential roof project begins with a 4K drone thermal scan, structural load engineering, and custom metal folding.',
    conciergeTitle: 'Bespoke Architectural Roofing Concierge',
    conciergeDesc: 'Unsure how standing seam metal compares to natural slate, what Class 4 impact shingles save on insurance, or how to detect hidden wind leaks? Inquire with our master roofing desk.',
    conciergeBadge: '✨ MASTER ROOFING DESK LIVE',
    conciergeIcon: '🏠',
    chip1: ['🏠 Standing Seam Metal vs Slate', 'How does standing seam metal compare to natural slate in hail resistance and longevity?'],
    chip2: ['⛈️ Insurance Hail Damage Discounts', 'What roofing materials qualify for significant homeowner insurance discounts?'],
    chip3: ['🔍 Drone Thermal Leak Diagnostics', 'How does 4K drone thermal imaging uncover hidden roof deck leaks?'],
    sampleData: {
      businessName: 'Vanguard Architectural Roofing & Slate',
      businessNameShort: 'Vanguard',
      city: 'Austin, TX',
      state: 'TX',
      yearsInBusiness: '2011',
      phoneDisplay: '(512) 555-0788',
      phoneRaw: '5125550788',
      email: 'service@vanguardroofing.com',
      address: '4201 S Congress Ave, Austin, TX 78745',
      googleRating: '4.9',
      googleReviewCount: '372',
      instagramHandle: 'vanguard_roofing_slate',
      facebookUrl: 'https://facebook.com/vanguardroofing'
    },
    services: [
      { id: 'standing-seam', name: 'Standing Seam Metal & Zinc Roofing', category: 'Metal', duration: '3-4 DAYS', price: '$14,500', desc: 'Concealed fastener 24-gauge architectural metal panels engineered to withstand 150 MPH hurricane winds.', img: 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=800&q=80' },
      { id: 'natural-slate', name: 'Natural Vermont Quarry Slate Roof', category: 'Slate', duration: '5-7 DAYS', price: '$22,000', desc: '100+ year heirloom quarry slate tiles hand-cut and affixed with solid copper roofing nails.', img: 'https://images.unsplash.com/photo-1508873696983-2df5293cb325?auto=format&fit=crop&w=800&q=80' },
      { id: 'class4-shingles', name: 'Class 4 Hail-Resistant Shingles', category: 'Shingles', duration: '2 DAYS', price: '$9,200', desc: 'UL 2218 Class 4 impact-rated architectural shingles lowering homeowner insurance premiums.', img: 'https://images.unsplash.com/photo-1541888946425-d0fbb18f156d?auto=format&fit=crop&w=800&q=80' },
      { id: 'copper-gutters', name: 'Custom Hand-Folded Copper Gutters', category: 'Gutters', duration: '1 DAY', price: '$3,800', desc: 'Seamless 6-inch half-round copper gutter systems that age into a magnificent historic green patina.', img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80' },
      { id: 'drone-inspection', name: 'Drone 4K Thermal Storm Inspection', category: 'Diagnostics', duration: '90 MIN', price: '$250', desc: 'Thermal infrared aerial diagnostics locating moisture beneath shingles and hail impact bruising.', img: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80' },
      { id: 'flat-roof-tpo', name: 'Historic Flat Roof TPO Membrane', category: 'Commercial', duration: '2-3 DAYS', price: '$7,800', desc: 'Heat-welded commercial-grade reflective thermoplastic polyolefin eliminating standing water ponding.', img: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80' },
      { id: 'cedar-shake', name: 'Heavy Hand-Split Cedar Shake Roof', category: 'Wood', duration: '4-5 DAYS', price: '$16,500', desc: 'Fire-treated premium Alaskan yellow cedar shakes with natural rustic architectural warmth.', img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80' },
      { id: 'architectural-cladding', name: 'Commercial Zinc & Metal Cladding', category: 'Metal', duration: '4-6 DAYS', price: '$18,000', desc: 'Vertical architectural standing seam exterior wall and dormer cladding with custom corner breaks.', img: 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=800&q=80' },
      { id: 'ridge-ventilation', name: 'Thermodynamic Ridge Ventilation', category: 'Ventilation', duration: '1 DAY', price: '$1,650', desc: 'Balanced intake and exhaust attic airflow prolonging shingle lifespan and reducing summer cooling loads.', img: 'https://images.unsplash.com/photo-1541888946425-d0fbb18f156d?auto=format&fit=crop&w=800&q=80' },
      { id: 'emergency-tarp', name: '24/7 Emergency Storm Tarp & Dispatch', category: 'Emergency', duration: '2 HOURS', price: '$450', desc: 'Immediate priority structural tarping preventing water intrusion during severe wind and hailstorms.', img: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80' },
      { id: 'chimney-flashing', name: 'Complete Chimney Masonry & Lead Flashing', category: 'Flashing', duration: '1 DAY', price: '$1,850', desc: 'Step and counter-flashing woven into brick mortar joints with premium lead and solder joints.', img: 'https://images.unsplash.com/photo-1508873696983-2df5293cb325?auto=format&fit=crop&w=800&q=80' },
      { id: 'ironclad-warranty', name: '50-Year Ironclad Non-Prorated Warranty', category: 'Warranty', duration: 'INCLUDED', price: 'GUARANTEED', desc: 'Manufacturer backed transferable system warranty covering materials, labor, and storm workmanship.', img: 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=800&q=80' }
    ],
    team: [
      { id: 'roofer-1', name: 'Garrison Vance', role: 'Master Roofer & Metal Artisan', specialty: 'Standing Seam & Zinc Architectural Systems', exp: '22 Yrs Exp', bio: 'Guild-certified sheet metal craftsman with over two decades leading landmark architectural roof installations.', img: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=80' },
      { id: 'roofer-2', name: 'Mark Ross', role: 'Slate & Historic Restoration Steward', specialty: 'Vermont Quarry Slate & Heavy Shake', exp: '18 Yrs Exp', bio: 'Specialist in authentic historic home preservation, copper flashing fabrication, and masonry tie-ins.', img: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80' },
      { id: 'roofer-3', name: 'Luke Dunlap', role: 'Storm Damage & Insurance Claim Executive', specialty: 'Class 4 Impact & Claim Approvals', exp: '14 Yrs Exp', bio: 'Expert in navigating insurance forensic storm assessments to secure complete client roof replacements.', img: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=600&q=80' },
      { id: 'roofer-4', name: 'Sean Peak', role: 'Copper & Structural Flashing Craftsman', specialty: 'Custom Hand-Soldered Copper Detail', exp: '12 Yrs Exp', bio: 'Devoted to zero-leak waterproof flashings on complex parapets, valleys, chimneys, and dormers.', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80' },
      { id: 'roofer-5', name: 'Rick Sterling', role: 'Thermal Diagnostics & Safety Director', specialty: '4K Drone Aerials & Thermography', exp: '9 Yrs Exp', bio: 'Certified FAA commercial sUAS thermographer spotting hidden structural rot prior to tear-off.', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80' }
    ],
    products: [
      { id: 'p1', name: 'Kynar 500 Coated 24-Gauge Metal Panel', price: '$85 / Sq', cat: 'Metal', desc: 'Architectural grade standing seam panel with 30-year non-fade fluoropolymer resin.', img: 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=600&q=80', benefits: ['Kynar 500 Finish', '150 MPH Wind Rated', '30-Yr Anti-Chalk'] },
      { id: 'p2', name: 'Natural Unfading Vermont Black Slate', price: '$180 / Sq', cat: 'Slate', desc: 'Quarried Vermont natural stone offering impervious freeze-thaw durability.', img: 'https://images.unsplash.com/photo-1508873696983-2df5293cb325?auto=format&fit=crop&w=600&q=80', benefits: ['100+ Year Lifespan', 'Class A Fireproof', 'Zero Maintenance'] },
      { id: 'p3', name: 'GAF Timberline HDZ Class 4 Shingle', price: '$45 / Bundle', cat: 'Shingles', desc: 'LayerLock technology with Dura Grip adhesive resisting severe Texas hail.', img: 'https://images.unsplash.com/photo-1541888946425-d0fbb18f156d?auto=format&fit=crop&w=600&q=80', benefits: ['UL 2218 Class 4', 'LayerLock Tech', 'Insurance Discount'] },
      { id: 'p4', name: 'Half-Round 6-Inch Solid Copper Gutter', price: '$32 / Ft', cat: 'Gutters', desc: 'Heavy 16oz cold-rolled copper with cast brass brackets and decorative leader heads.', img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80', benefits: ['16oz Cold-Rolled Copper', 'Historic Patina', 'Zero Rust Forever'] },
      { id: 'p5', name: 'High-Temp Synthetic Roof Underlayment', price: '$110 / Roll', cat: 'Accessories', desc: 'Self-adhering modified bitumen underlayment resisting up to 250°F under metal.', img: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80', benefits: ['250°F High-Temp', 'Self-Seals Around Nails', 'Split-Backing Grip'] },
      { id: 'p6', name: 'Ridge-Flow Continuous Attic Exhaust Vent', price: '$22 / Pc', cat: 'Ventilation', desc: 'Low-profile exterior baffled ridge vent optimizing cross-flow attic thermodynamic balance.', img: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80', benefits: ['Internal Weather Filter', 'Concealed Under Shingle', 'Maximizes Airflow'] }
    ]
  }
};

// Global lock snippet ensuring Concierge FAB is ALWAYS and ONLY a single magic emoji ✨ on mobile
const MOBILE_LOCK_STYLE = `
<style id="lunao-fab-mobile-lock">
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
    overflow: hidden !important;
    box-shadow: 0 8px 24px rgba(61, 43, 31, 0.2), 0 0 16px rgba(184, 134, 11, 0.28) !important;
  }
  .atelier-concierge-fab .fab-label-text,
  .atelier-concierge-fab .fab-chevron,
  .atelier-concierge-fab span:not(.brand-spinner-icon) {
    display: none !important;
    visibility: hidden !important;
    width: 0 !important;
    height: 0 !important;
    font-size: 0 !important;
    line-height: 0 !important;
    opacity: 0 !important;
    overflow: hidden !important;
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

function buildNicheRawTemplate(key, cfg) {
  let content = masterHtml;

  // 1. Ensure the mobile lock style is right before </head>
  if (!content.includes('id="lunao-fab-mobile-lock"')) {
    content = content.replace('</head>', `${MOBILE_LOCK_STYLE}\n</head>`);
  }

  // 2. Replace title & meta tags
  content = content.replace(
    /<title>.*?<\/title>/i,
    `<title>{{BUSINESS_NAME}} — ${cfg.heroTitle}</title>`
  );
  content = content.replace(
    /<meta name="description" content=".*?"\s*\/?>/i,
    `<meta name="description" content="${cfg.heroSubtitle}">`
  );

  // 3. Replace Hero Header & Badges
  content = content.replace(
    /✦ BESPOKE CLIMATE ENGINEERING & INDOOR PURITY ✦/g,
    `✦ ${cfg.tagline} ✦`
  );
  content = content.replace(
    /CONCEALED SLOT DIFFUSERS · HOSPITAL-GRADE PURITY/g,
    cfg.tagline
  );
  content = content.replace(
    /<span class="hero-badge">✦ ATELIER THERMODYNAMICS<\/span>/g,
    `<span class="hero-badge">✦ ${cfg.heroBadge}</span>`
  );
  content = content.replace(
    /<h1 class="hero-title">[\s\S]*?<\/h1>/,
    `<h1 class="hero-title">${cfg.heroTitle}</h1>`
  );
  content = content.replace(
    /Ultra-quiet variable-speed heat pumps, concealed architectural slot diffusers, hospital-grade air purification, and landmark historic ducting delivered with guaranteed upfront pricing\./g,
    cfg.heroSubtitle
  );

  // 4. Replace AI Concierge section headers & quick prompts
  content = content.replace(
    /Bespoke Climate &amp; Heat Pump Concierge/g,
    () => cfg.conciergeTitle
  );
  content = content.replace(
    /Bespoke Climate & Heat Pump Concierge/g,
    () => cfg.conciergeTitle
  );
  content = content.replace(
    /✨ AURUM CLIMATE DESK LIVE/g,
    () => cfg.conciergeBadge
  );
  content = content.replace(
    /<span class="fab-magic-sparkle">❄️<\/span>/g,
    () => `<span class="fab-magic-sparkle">${cfg.conciergeIcon}</span>`
  );
  content = content.replace(
    /Unsure which heat pump capacity or VRF layout best suits your residence.*?Inquire with our digital engineering advisory desk.*?\./s,
    () => cfg.conciergeDesc
  );

  // Replace quick prompt chips safely (exact string match without greedy regex!)
  const oldChip1 = `<button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('How do cold-climate heat pumps perform in sub-zero winter temperatures?');">❄️ Cold-Climate Heat Pumps</button>`;
  const newChip1 = `<button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('${cfg.chip1[1]}');">${cfg.chip1[0]}</button>`;
  content = content.replace(oldChip1, () => newChip1);

  const oldChip2 = `<button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('Can high-velocity HVAC be installed in historic brownstones without lowering ceilings?');">💨 High-Velocity Historic Ducting</button>`;
  const newChip2 = `<button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('${cfg.chip2[1]}');">${cfg.chip2[0]}</button>`;
  content = content.replace(oldChip2, () => newChip2);

  const oldChip3 = `<button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('What is included in whole-home hospital-grade air purification?');">🏥 Whole-Home Hospital IAQ</button>`;
  const newChip3 = `<button type="button" class="ai-chip" style="background: rgba(197, 168, 128, 0.09); border: 1px solid var(--border-gold);" onclick="app.openAiChat(); app.sendAiChip('${cfg.chip3[1]}');">${cfg.chip3[0]}</button>`;
  content = content.replace(oldChip3, () => newChip3);

  // Chat modal chips
  content = content.replace(
    `<button type="button" class="ai-chip" onclick="app.sendAiChip('What is the cost of a whole-home cold climate heat pump?')">❄️ Heat Pump Costs</button>`,
    () => `<button type="button" class="ai-chip" onclick="app.sendAiChip('${cfg.chip1[1]}')">${cfg.chip1[0]}</button>`
  );
  content = content.replace(
    `<button type="button" class="ai-chip" onclick="app.sendAiChip('Can high-velocity HVAC be installed in historic brownstones?')">🏛️ Historic Brownstones</button>`,
    () => `<button type="button" class="ai-chip" onclick="app.sendAiChip('${cfg.chip2[1]}')">${cfg.chip2[0]}</button>`
  );
  content = content.replace(
    `<button type="button" class="ai-chip" onclick="app.sendAiChip('What federal 25C tax credits and clean heat rebates apply?')">💵 Rebates &amp; Credits</button>`,
    () => `<button type="button" class="ai-chip" onclick="app.sendAiChip('${cfg.chip3[1]}')">${cfg.chip3[0]}</button>`
  );

  // 4.5 Make Service Worker registration completely safe
  content = content.replace(
    /<!-- Service Worker Registration for Instant Caching & Offline Capabilities -->[\s\S]*?<\/script>/,
    () => `<!-- Service Worker Registration (Safe) -->
  <script>
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        try { navigator.serviceWorker.register('/sw.js').catch(() => {}); } catch (_) {}
      });
    }
  </script>`
  );

  // 5. Replace Service Section Eyebrows & Titles
  content = content.replace(
    /ARCHITECTURAL HVAC DISCIPLINES/g,
    () => cfg.serviceEyebrow
  );
  content = content.replace(
    /Thermodynamic Systems &amp; Engineering Services/g,
    () => cfg.serviceTitle
  );
  content = content.replace(
    /Thermodynamic Systems & Engineering Services/g,
    () => cfg.serviceTitle
  );

  // 6. Replace Datasets: SERVICES_DATA, BARBERS_DATA / TEAM_DATA, PRODUCTS_DATA
  const servicesJson = JSON.stringify(cfg.services, null, 2);
  const teamJson = JSON.stringify(cfg.team, null, 2);
  const productsJson = JSON.stringify(cfg.products, null, 2);

  content = content.replace(
    /const SERVICES_DATA = \[[\s\S]*?\];/s,
    () => `const SERVICES_DATA = ${servicesJson};`
  );
  content = content.replace(
    /const BARBERS_DATA = \[[\s\S]*?\];/s,
    () => `const BARBERS_DATA = ${teamJson};`
  );
  content = content.replace(
    /const TEAM_DATA = \[[\s\S]*?\];/s,
    () => `const TEAM_DATA = ${teamJson};`
  );
  content = content.replace(
    /const PRODUCTS_DATA = \[[\s\S]*?\];/s,
    () => `const PRODUCTS_DATA = ${productsJson};`
  );

  return content;
}

function compileSamplePreview(rawHtml, sample) {
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

  // Clean any residual placeholders
  html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  return html;
}

console.log('Generating 5 Bespoke Luxury Multi-Niche Templates...');

for (const [key, cfg] of Object.entries(NICHE_CONFIGS)) {
  const rawPath = path.resolve(`public/templates-raw/${cfg.rawFileName}`);
  const previewPath = path.resolve(`public/${cfg.rawFileName}`);
  const rootPath = path.resolve(cfg.rawFileName);

  const rawHtml = buildNicheRawTemplate(key, cfg);
  fs.writeFileSync(rawPath, rawHtml, 'utf8');
  console.log(`✓ Wrote raw template: ${rawPath} (${(rawHtml.length / 1024).toFixed(1)} KB)`);

  const previewHtml = compileSamplePreview(rawHtml, cfg.sampleData);
  fs.writeFileSync(previewPath, previewHtml, 'utf8');
  fs.writeFileSync(rootPath, previewHtml, 'utf8');
  console.log(`✓ Wrote preview & root: ${previewPath} (${(previewHtml.length / 1024).toFixed(1)} KB)`);

  // Verify 0 leftover {{ placeholders
  const residualMatches = previewHtml.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (residualMatches && residualMatches.length > 0) {
    console.error(`⚠️ Found ${residualMatches.length} leftover placeholders in ${cfg.rawFileName}:`, residualMatches);
  } else {
    console.log(`✓ Verified 0 residual placeholders in ${cfg.rawFileName}`);
  }
}

console.log('\nAll 5 Bespoke Multi-Niche templates successfully generated!');
