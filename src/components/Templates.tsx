import React, { useState } from 'react';
import { Template } from '../types';
import { Star, Eye, Edit, Copy, Search, ChevronDown, Check, X, ShieldAlert, Zap } from 'lucide-react';
import { nicheList } from '../data';

// Helper to retrieve gorgeous, realistic, personalized real-world content for each of the 14 niche templates
export const getTemplateContent = (templateId: string, name: string, niche: string) => {
  const isClassic = templateId === 'barber-dark-luxury' || templateId === 'salon-maison' || templateId === 'roofing-ironclad' || templateId === 'gym-iron-grit';

  if (niche === 'Barber') {
    return {
      heroTitle: "BARBER DARK LUXURY · THE PERFECT CUT",
      heroSubTitle: "Classic techniques. Modern precision.",
      heroDesc: "Step into our high-end grooming lounge featuring full-leather chairs, fresh steam hot-towels, and master barbers trained in timeless styles.",
      tagline: "DARK LUXURY EXPERIENCE",
      services: [
        { name: "Classic Haircut", price: "$25.00", duration: "30m" },
        { name: "Skin Fade / Taper", price: "$30.00", duration: "45m" },
        { name: "Luxury Beard Trim", price: "$20.00", duration: "20m" }
      ],
      testimonial: "The best haircut I've received in years. The steam hot-towel treatment and precision shave make it an unforgettable experience.",
      author: "Arthur Pendelton",
      city: "Austin, TX"
    };
  }
  
  if (niche === 'Salon') {
    return {
      heroTitle: isClassic ? "CREATIVE HAIR COLORING & RED-CARPET BALAYAGE" : "ORGANIC SKIN SPA & BRIDAL GLOW MAKEOVERS",
      heroSubTitle: isClassic ? "Vivid individual expression. Luxurious finish." : "Pure botanical radiance for elegant mindsets.",
      heroDesc: isClassic
        ? "Indulge in award-winning dimensional hair artistry, premium organic color melts, and deep hydration treatments under our elite stylists' advice."
        : "A serene botanical oasis dedicated to clean skincare, restorative peptide facials, precision lash lifts, and flawless bridal party cosmetic preparation.",
      tagline: isClassic ? "Master Color Experts" : "Holistic Skin Therapy",
      services: [
        { name: isClassic ? "Signature Dimensional Balayage" : "HydraGlow Peptide Deep Facial", price: isClassic ? "$195.00" : "$165.00", duration: isClassic ? "3h" : "75m" },
        { name: isClassic ? "Blowout & Custom Mask" : "Professional Lash Lift & Tint Duo", price: isClassic ? "$75.00" : "$95.00", duration: isClassic ? "60m" : "50m" },
        { name: isClassic ? "Luxury Silk Press Routine" : "Flawless High-Def Bridal Makeup", price: isClassic ? "$110.00" : "$250.00", duration: isClassic ? "90m" : "2h" }
      ],
      testimonial: isClassic
        ? "My hair has never felt healthier or caught as many compliments. Drastic precision pigment correction accomplished."
        : "They completely revitalized my dry skin before my wedding day! Warm lavender pads, botanical serums, and gentle massage.",
      author: isClassic ? "Serena Montgomery" : "Evelyn Sterling",
      city: "Miami, FL"
    };
  }

  if (niche === 'Dentist') {
    return {
      heroTitle: isClassic ? "COMPREHENSIVE COMFORT-FIRST DENTAL WELLNESS" : "COSMETIC VENEERS & CLEAR ALIGNER ORTHODONTICS",
      heroSubTitle: isClassic ? "Healthy vibrant smiles, premium absolute comfort." : "Confidence inside every single aesthetic smile.",
      heroDesc: isClassic
        ? "Experience anxiety-free dentistry. We combine weighted warm blankets, gentle water-lasers, and state-of-the-art diagnostics for a completely pain-free trip to your absolute wellness."
        : "Designing custom porcelain smile veneers and invisible clear teeth-straightening aligner routines. Unlock the true potential of your expression.",
      tagline: isClassic ? "Gentle Care Center" : "Smile Engineering",
      services: [
        { name: isClassic ? "New Patient Hygiene + 3D Scan" : "Teeth Shaping Diagnostics", price: isClassic ? "$120.05" : "Free", duration: isClassic ? "60m" : "30m" },
        { name: isClassic ? "Aesthetic Laser Enamel Protection" : "Advanced Cold-Light Whitening", price: isClassic ? "$90.00" : "$350.00", duration: isClassic ? "35m" : "60m" },
        { name: isClassic ? "Gentle Targeted Root Canal Therapy" : "Invisalign Aligner Intake Scan", price: isClassic ? "$750.00" : "$1,800.00" , duration: isClassic ? "90m" : "45m" }
      ],
      testimonial: isClassic
        ? "I used to absolutely dread dental visits, but they have Netflix ceiling screens, noise-cancelling headphones, and super gentle dental hygienists!"
        : "Stellar 3D layout tooth preview. My custom straightening aligners arrived in 5 days and configured my layout flawlessly in months.",
      author: isClassic ? "Richard Vance" : "Courtney Vance",
      city: "Dallas, TX"
    };
  }

  if (niche === 'HVAC') {
    return {
      heroTitle: isClassic ? "24/7 HEATING & COOLING EMERGENCY DISPATCH" : "ECO-SMART AIR FILTERING & DUCT SANITIZATION",
      heroSubTitle: isClassic ? "Guaranteed summer comfort, zero technical delays." : "Pure, hyper-cleansed breathable indoor air.",
      heroDesc: isClassic
        ? "Beat local record heatwaves and freezing advisories. Our licensed local field experts provide rapid same-day diagnostics, repairs, heat safety reviews, and priority replacements."
        : "Protect your family or office team from allergen outbreaks. We install high-efficiency HEPA filters, deep duct sanitation sweeps, and eco-friendly climate control pumps.",
      tagline: isClassic ? "Rapid Response Crew" : "Air Purity Specialists",
      services: [
        { name: isClassic ? "Complete Compressor Inspection" : "UV Air Purification Installer", price: isClassic ? "$89.50" : "$650.00", duration: isClassic ? "45m" : "2h" },
        { name: isClassic ? "Smart Thermostat Zone Calibrate" : "Air Duct Deep Cleansing Sweep", price: isClassic ? "$140.00" : "$320.00", duration: isClassic ? "60m" : "90m" },
        { name: isClassic ? "Emergency Capacitor Hotfix" : "Heat Pump Efficiency Optimization", price: isClassic ? "$220.00" : "$110.00", duration: isClassic ? "50m" : "60m" }
      ],
      testimonial: isClassic
        ? "Our central AC unit fully seized on a Sunday in August. An expert tech was parked in my driveway in only 40 minutes and solved everything!"
        : "Completely solved our children's severe seasonal sneezing! The dust build-up they suctioned from our home air ducts was unbelievable.",
      author: isClassic ? "Marcus G." : "Clara Jenkins",
      city: "Austin, TX"
    };
  }

  if (niche === 'Gym') {
    return {
      heroTitle: isClassic ? "HIIT FITNESS ACCELERATOR & BODY CONTOURING" : "1-ON-1 ATHLETIC METRICS & OLYMPIC LIFTS",
      heroSubTitle: isClassic ? "Accelerate your stamina. Unlock raw power." : "Shatter your old historic logs and strength records.",
      heroDesc: isClassic
        ? "Premium heavy kettlebell stations, functional strength racks, and sweating-focused local camaraderie. Improve your conditioning under certified active trainers."
        : "Bespoke sports programs built on power analytics. Track bar speeds, Olympic lifting techniques, joint mobility recovery, and exact nutritional layouts.",
      tagline: isClassic ? "High-Intensity Arena" : "Performance Lab",
      services: [
        { name: isClassic ? "1-Month Unlimited Class Pass" : "Athletic Strength Assessment", price: isClassic ? "$125.00" : "$90.00", duration: isClassic ? "30d" : "60m" },
        { name: isClassic ? "Metabolic Coaching Diagnostic" : "Olympic Lifting Mechanics Clinic", price: isClassic ? "$75.00" : "$45.00", duration: isClassic ? "45m" : "75m" },
        { name: isClassic ? "Single Drop-in Group HIIT Booking" : "Targeted Macros Food Architecture", price: isClassic ? "$20.00" : "$120.05", duration: isClassic ? "60m" : "45m" }
      ],
      testimonial: isClassic
        ? "Such a fantastic, supportive environment that scales with your limits. Exceptionally clean, modern racks and top-tier coaches!"
        : "The power diagnostics really changed my squat technique. Brad showed me how to stabilize my ankles, and I added 35 lbs in a month!",
      author: isClassic ? "Trevor Stone" : "Derek Shaw",
      city: "Miami, FL"
    };
  }

  if (niche === 'Roofing') {
    return {
      heroTitle: isClassic ? "STORM-SPECIFIC RESIDENTIAL ROOF PATCHING" : "PREMIUM STEEL SEAM ARCHITECTURAL SYSTEMS",
      heroSubTitle: isClassic ? "Guarding and sealing what matters absolute most." : "50-year longevity structured for visual grandeur.",
      heroDesc: isClassic
        ? "Leaking ceilings or local hail impacts? We coordinate approved insurance filing inspections, emergency thick-tarp deployments, and spot shingle waterproof seals."
        : "Sleek, standing seam metal roofs that decrease cooling loads by 30%. Add unparalleled visual modernity and architectural class to your estate profile.",
      tagline: isClassic ? "Storm Repair Heroes" : "Premium Metal Crafts",
      services: [
        { name: isClassic ? "Drone Roof Damage Diagnostic" : "Lux Metal Panel System Blueprint", price: isClassic ? "Free" : "Free", duration: isClassic ? "45m" : "60m" },
        { name: isClassic ? "Emergency Tarp & Weather Shield" : "Standing Seam Complete Estimator", price: isClassic ? "$380.00" : "Free", duration: isClassic ? "90m" : "90m" },
        { name: isClassic ? "Asphalt Gutter Debris Flash Sweep" : "Gutter Guard Mesh Structural Setup", price: isClassic ? "$240.00" : "$850.00", duration: isClassic ? "2h" : "3h" }
      ],
      testimonial: isClassic
        ? "A branch tore through our kitchen ceiling attic during high winds. Shingle Shield arrived under rain and covered the gap safely!"
        : "Completely replaced our rotting shingles with a matte slate architectural steel metal roof. Absolutely stunning and silent in heavy storms.",
      author: isClassic ? "Rebecca Vance" : "Sean Miller",
      city: "Orlando, FL"
    };
  }

  if (niche === 'Real Estate') {
    return {
      heroTitle: "EXECUTIVE REAL ESTATE BROKERAGE",
      heroSubTitle: isClassic ? "Find your place in the city." : "Exclusive properties. Unmatched service.",
      heroDesc: isClassic
        ? "We guide you seamlessly through buying, selling, or investing in the local market with our expert agents and dedicated service."
        : "Curating a portfolio of exquisite architectural homes for discerning clientele across elite neighborhoods.",
      tagline: isClassic ? "Trusted Guidance" : "Premium Portfolio",
      services: [
        { name: isClassic ? "First-Time Buyer Consultation" : "Private Portfolio Viewing", price: isClassic ? "Free" : "Exclusive", duration: isClassic ? "1h" : "2h" },
        { name: isClassic ? "Property Valuation Analysis" : "Architectural Estate Listing", price: isClassic ? "Free" : "Custom", duration: isClassic ? "24h" : "Consult" },
        { name: isClassic ? "Investment Property Planning" : "International Relocation", price: isClassic ? "$250.00" : "Custom", duration: isClassic ? "2h" : "Retainer" }
      ],
      testimonial: isClassic
        ? "They made selling our home completely stress-free. Multiple offers and we closed faster than expected!"
        : "Found the perfect minimalist glass home in the hills. The level of privacy and service was truly exceptional.",
      author: isClassic ? "Michael Robertson" : "Sarah Jenkins",
      city: "Los Angeles, CA"
    };
  }

  return {
    heroTitle: "PREMIUM SERVICES PLATFORM",
    heroSubTitle: "Conversion optimized layout designed for your local business.",
    heroDesc: "Experience premium services tailored exactly for local clients. Simple, automatic booking and verified expert outcomes.",
    tagline: "Local Excellence",
    services: [
      { name: "Super Service Starter", price: "$49.50", duration: "30m" },
      { name: "Premium Classic Package", price: "$99.00", duration: "60m" },
      { name: "Elite Full-Suite Service", price: "$149.00", duration: "90m" }
    ],
    testimonial: "Outstanding attention to detail and exceptionally friendly service. They built a custom live appointment system too!",
    author: "Jordan Smith",
    city: "Local Area"
  };
};

// Built-in preview URL mapping — same logic as the Campaigns.tsx picker.
// Custom templates go through the unified /api/templates/:key/preview
// endpoint so the same code path serves both built-in and custom demos.
const BUILTIN_PREVIEW_FILE = {
  'barber-dark-luxury': '/barber-template.html',
  'barber-editorial': '/barber-template-02.html',
  'salon-maison': '/salon-template-01.html',
  'dentist-clarity': '/dentist-template-01.html',
  'roofing-ironclad': '/roofing-template-01.html',
  'hvac-everest': '/hvac-template-01.html',
  'gym-iron-grit': '/gym-template-01.html',
  'realestate-glass': '/realestate-template-01.html',
};
export const previewUrlForKey = (id: string) => {
  if (BUILTIN_PREVIEW_FILE[id]) return BUILTIN_PREVIEW_FILE[id];
  return `/api/templates/${encodeURIComponent(id)}/preview`;
};

export const getNicheBgImage = (niche: string) => {
  switch (niche) {
    case 'Barber':
      return 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=80';
    case 'Salon':
      return 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80';
    case 'Dentist':
      return 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=600&q=80';
    case 'HVAC':
      return 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=600&q=80';
    case 'Gym':
      return 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80';
    case 'Roofing':
      return 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=600&q=80';
    case 'Real Estate':
      return 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80';
    default:
      return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80';
  }
};

interface TemplatesProps {
  templates: Template[];
  previewTemplateId: string | null;
  setPreviewTemplateId: (id: string | null) => void;
  selectedNicheFilter?: string;
  setSelectedNicheFilter?: (niche: string) => void;
  setActiveTab?: (tab: any) => void;
}

export const Templates: React.FC<TemplatesProps> = ({
  templates,
  previewTemplateId,
  setPreviewTemplateId,
  selectedNicheFilter: propSelectedNicheFilter,
  setSelectedNicheFilter: propSetSelectedNicheFilter,
  setActiveTab,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [localSelectedNicheFilter, setLocalSelectedNicheFilter] = useState<string>('All');
  const selectedNicheFilter = propSelectedNicheFilter !== undefined ? propSelectedNicheFilter : localSelectedNicheFilter;
  const setSelectedNicheFilter = propSetSelectedNicheFilter !== undefined ? propSetSelectedNicheFilter : setLocalSelectedNicheFilter;
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<Template | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // If a previewTemplateId is passed from parent (e.g. dashboard eye click), we auto open it
  React.useEffect(() => {
    if (previewTemplateId) {
      const matched = templates.find(t => t.id === previewTemplateId);
      if (matched) {
        setSelectedTemplateForPreview(matched);
      }
    }
  }, [previewTemplateId, templates]);

  // Filter templates
  const filteredTemplates = templates.filter((temp) => {
    const matchesSearch = temp.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesNiche = selectedNicheFilter === 'All' || temp.niche === selectedNicheFilter;
    return matchesSearch && matchesNiche;
  });

  // Get dynamic emoji matching the niche
  const getNicheEmoji = (niche: string) => {
    switch (niche) {
      case 'Barber': return '💈';
      case 'Salon': return '💅';
      case 'Dentist': return '🦷';
      case 'HVAC': return '❄️';
      case 'Gym': return '💪';
      case 'Roofing': return '🏠';
      case 'Real Estate': return '🏡';
      default: return '✨';
    }
  };

  // Get gradient based on index / niche for diversity
  const getGradientForNiche = (niche: string) => {
    switch (niche) {
      case 'Barber':
        return 'from-[#1a1916] to-[#0a0a09]';
      case 'Salon':
        return 'from-rose-500 to-pink-905';
      case 'Dentist':
        return 'from-sky-500 to-blue-800';
      case 'HVAC':
        return 'from-teal-600 to-blue-900';
      case 'Gym':
        return 'from-slate-850 to-red-950';
      case 'Roofing':
        return 'from-orange-800 to-stone-900';
      case 'Real Estate':
        return 'from-emerald-800 to-teal-950';
      default:
        return 'from-neutral-800 to-stone-950';
    }
  };

  const handleCloseModal = () => {
    setSelectedTemplateForPreview(null);
    setPreviewTemplateId(null);
  };

  return (
    <div id="templates-tab-content-root" className="space-y-8 animate-fade-in font-sans">
      
      {/* Top Header */}
      <header id="templates-view-header" className="flex items-center justify-between pb-6 border-b border-border-main">
        <div id="templates-titles-area" className="space-y-1">
          <h1 id="templates-top-heading" className="text-4xl font-serif text-ink tracking-tight font-normal">Section Templates</h1>
          <p id="templates-sub-heading" className="text-sm text-ink-secondary">Pre-built structural landing platforms tailored for mobile Conversion Rates.</p>
        </div>
      </header>

      {/* SEARCH AND FILTERS */}
      <section id="templates-filters-panel" className="bg-white border border-border-main rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xs">
        {/* Search input */}
        <div className="w-full md:w-96 relative">
          <Search className="w-4 h-4 text-ink-tertiary absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search matching styles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border-main rounded text-xs bg-off-white/40 focus:outline-none focus:ring-2 focus:ring-accent-soft placeholder:text-ink-tertiary text-ink"
          />
        </div>

        {/* Niche dropdown */}
        <div id="templates-niche-dropdown" className="w-full md:w-auto flex items-center gap-2.5">
          <span className="text-[11px] font-bold text-ink-secondary uppercase tracking-widest leading-none shrink-0">Filter Sectors:</span>
          <div className="relative">
            <select
              value={selectedNicheFilter}
              onChange={(e) => setSelectedNicheFilter(e.target.value)}
              className="appearance-none bg-off-white/40 border border-border-main rounded-md pl-3 pr-8 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent-soft inline-flex items-center font-semibold cursor-pointer"
            >
              <option value="All">All Niche Industries</option>
              {nicheList.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.emoji} {n.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-ink-secondary absolute right-2 top-2.5 pointer-events-none" />
          </div>
        </div>
      </section>

      {/* TEMPLATES GRID */}
      <section id="templates-cards-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {filteredTemplates.map((temp) => {
          const content = getTemplateContent(temp.id, temp.name, temp.niche);
          return (
            <div
              id={`temp-card-container-${temp.id}`}
              key={temp.id}
              className="bg-white border border-border-light rounded-lg overflow-hidden shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between group"
            >
              {/* Template simulation banner with premium realistic dual-device mockups */}
              <div 
                className="h-48 relative overflow-hidden flex flex-col justify-between shrink-0 select-none group-hover:scale-[1.01] transition-all duration-300 border-b border-border-light bg-cover bg-center"
                style={{ backgroundImage: `url(${temp.id === 'salon-maison' ? '/salon_template_cover.png' : temp.id === 'roofing-ironclad' ? '/roofing_cover.png' : temp.id === 'hvac-everest' ? '/hvac_cover.png' : temp.id === 'gym-iron-grit' ? '/gym_cover.png' : temp.id === 'realestate-glass' ? '/realestate_cover.png' : getNicheBgImage(temp.niche)})` }}
              >
                {/* Visual dark backdrop gradient */}
                <div className="absolute inset-0 bg-ink/50 backdrop-blur-[0.5px] group-hover:bg-ink/40 transition-all duration-300 z-[1]" />

                {/* Simulated Desktop Browser Frame */}
                <div 
                  className="absolute left-4 right-14 top-4 h-36 bg-ink/90 border border-white/10 rounded-md shadow-lg flex flex-col overflow-hidden z-[2] transform group-hover:-translate-y-1 transition-all duration-300"
                >
                  {/* Browser Window Bar */}
                  <div className="bg-black/40 px-2 py-1 flex items-center gap-1 border-b border-white/5 shrink-0 z-10 relative">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/80"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/80"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/80"></span>
                    <span className="text-[5px] text-white/30 font-mono ml-2 truncate">localplatform.io/live/{temp.id}</span>
                  </div>
                  {/* Mock content OR generated image */}
                  <div className="flex-1 overflow-hidden bg-[#161512] relative">
                    {temp.id === 'barber-editorial' ? (
                      <div className="h-full p-2.5 flex flex-col gap-1.5 bg-[#FAF6ED] text-[#121F1A]">
                        {/* Header */}
                        <div className="border-b border-[#D9CDBC] pb-1 flex justify-between items-center bg-[#F2EAD8]/50">
                          <span className="text-[5.5px] font-bold tracking-tight font-serif italic">
                            💈 FRANKLIN &amp; SONS
                          </span>
                          <span className="text-[4px] bg-[#121F1A] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider scale-[0.85] leading-none">BOOK CHAIR</span>
                        </div>
                        {/* Hero */}
                        <div className="py-0.5 border border-[#D9CDBC] bg-white/40 p-2 rounded shadow-sm">
                          <h4 className="text-[8px] font-bold font-serif text-[#121F1A] tracking-tight leading-none italic">Franklin &amp; Sons 💈✂️</h4>
                          <p className="text-[4px] text-[#556960] font-mono mt-0.5 uppercase tracking-wide">EST. — Premium Haircuts &amp; Fades</p>
                        </div>
                        {/* Stats Strip */}
                        <div className="flex justify-between items-center border-y border-[#D9CDBC] py-1 px-1">
                          <span className="text-[3.5px] font-bold">⭐ 200+ Reviews</span>
                          <span className="text-[3.5px] font-bold">📅 7 Days A Week</span>
                        </div>
                        {/* Services row */}
                        <div className="grid grid-cols-2 gap-1 mt-0.5">
                          <div className="border border-[#121F1A] bg-white/50 p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-sm">
                            <span className="text-[#26332E] font-bold truncate">CLASSIC CUT</span>
                            <span className="text-[#9E3C30] font-bold font-mono">$25</span>
                          </div>
                          <div className="border border-[#121F1A] bg-white/50 p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-sm">
                            <span className="text-[#26332E] font-bold truncate">SKIN FADE</span>
                            <span className="text-[#9E3C30] font-bold font-mono">$30</span>
                          </div>
                        </div>
                        {/* Footer block */}
                        <div className="mt-auto pt-1 border-t border-[#D9CDBC] flex justify-between items-center text-[3.5px] text-[#556960]">
                          <span>📍 Austin, TX</span>
                          <span>📞 (512) 555-0198</span>
                        </div>
                      </div>
                    ) : temp.id === 'salon-maison' ? (
                      <div className="h-full p-2.5 flex flex-col gap-1.5 bg-[#FAF8F4] text-[#1C1A17]">
                        {/* Header */}
                        <div className="border-b border-[#D6CFC5] pb-1 flex justify-between items-center bg-[#F3EFE7]/50 px-1">
                          <span className="text-[5.5px] font-bold tracking-tight font-serif italic text-[#C4856A]">
                            MAISON AURÉLIE
                          </span>
                          <span className="text-[4px] bg-[#C4856A] text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider scale-[0.85] leading-none">BOOK NOW</span>
                        </div>
                        {/* Hero */}
                        <div className="py-1 border border-[#D6CFC5] bg-[#FFFFFF] p-2 rounded shadow-sm text-center">
                          <h4 className="text-[8px] font-extrabold font-serif text-[#1C1A17] tracking-tight leading-none italic">Maison Aurélie Hair Studio</h4>
                          <p className="text-[4px] text-[#C4856A] font-mono mt-0.5 uppercase tracking-wide">Parisian Editorial Warmth · Cuts</p>
                        </div>
                        {/* Services row */}
                        <div className="grid grid-cols-2 gap-1 mt-0.5">
                          <div className="border border-[#E8E3DB] bg-white p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-[#4A4540] font-bold truncate">BALAYAGE</span>
                            <span className="text-[#C4856A] font-bold font-mono">$160</span>
                          </div>
                          <div className="border border-[#E8E3DB] bg-white p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-[#4A4540] font-bold truncate">SIGNATURE CUT</span>
                            <span className="text-[#C4856A] font-bold font-mono">$65</span>
                          </div>
                        </div>
                        {/* Footer block */}
                        <div className="mt-auto pt-1 border-t border-[#D6CFC5] flex justify-between items-center text-[3.5px] text-[#8C8680]">
                          <span>📍 Los Angeles, CA</span>
                          <span>📞 (310) 555-0193</span>
                        </div>
                      </div>
                    ) : temp.id === 'dentist-clarity' ? (
                      <div className="h-full p-2.5 flex flex-col gap-1 bg-[#FFFFFF] text-[#0A1628]">
                        {/* Header */}
                        <div className="border-b border-[#DDE2EC] pb-1 flex justify-between items-center bg-white">
                          <span className="text-[5px] font-bold tracking-tight text-[#0A1628] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded bg-[#0EA5A0] inline-block" /> CLARITY DENTAL
                          </span>
                          <span className="text-[3.5px] bg-[#0EA5A0] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider scale-[0.85] leading-none">BOOK APPT</span>
                        </div>
                        {/* Hero */}
                        <div className="py-1 border border-[#DDE2EC] bg-[#F7F8FA] p-1.5 rounded text-center">
                          <h4 className="text-[7.5px] font-bold text-[#0A1628] tracking-tight leading-none">Clarity Dental Studio</h4>
                          <p className="text-[4px] text-[#0EA5A0] font-mono mt-0.5 uppercase tracking-wide">CLINICAL LUXURY • NEW YORK, NY</p>
                        </div>
                        {/* Services row */}
                        <div className="grid grid-cols-2 gap-1 mt-0.5">
                          <div className="border border-[#E8ECF3] bg-white p-1 flex items-center justify-between text-[4.5px] rounded-sm shadow-xs">
                            <span className="text-[#344D6E] font-medium truncate">TEETH CLEANING</span>
                            <span className="text-[#0EA5A0] font-medium font-mono">$99</span>
                          </div>
                          <div className="border border-[#E8ECF3] bg-white p-1 flex items-center justify-between text-[4.5px] rounded-sm shadow-xs">
                            <span className="text-[#344D6E] font-medium truncate">COS. VENEERS</span>
                            <span className="text-[#0EA5A0] font-medium font-mono">CONSULT</span>
                          </div>
                        </div>
                        {/* Footer block */}
                        <div className="mt-auto pt-1 border-t border-[#DDE2EC] flex justify-between items-center text-[3.5px] text-[#6B82A0]">
                          <span>📍 New York, NY</span>
                          <span>📞 (646) 555-0182</span>
                        </div>
                      </div>
                    ) : temp.id === 'roofing-ironclad' ? (
                      <div className="h-full p-2.5 flex flex-col gap-1 bg-[#161614] text-[#F5F4F0] text-[4.5px]">
                        <div className="border-b border-[#2A2A26] pb-1 flex justify-between items-center bg-[#0C0C0B] px-1">
                          <span className="text-[5.5px] font-extrabold tracking-wider text-white">🏠 IRONCLAD</span>
                          <span className="text-[4px] bg-[#E8760A] text-black px-1.5 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">FREE EST</span>
                        </div>
                        <div className="py-1 border border-[#2A2A26] bg-[#1E1E1B] p-2 rounded shadow-sm text-center">
                          <h4 className="text-[8px] font-extrabold text-white tracking-tight leading-none">Ironclad Roofing</h4>
                          <p className="text-[4px] text-[#E8760A] font-mono mt-0.5 uppercase tracking-wide">GAF Master Elite • 50-Yr Warranty</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1 mt-0.5">
                          <div className="border border-[#222220] bg-[#1E1E1B] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-[#B8B5AC] font-bold truncate">REPLACEMENT</span>
                            <span className="text-[#E8760A] font-bold">1-2 DAYS</span>
                          </div>
                          <div className="border border-[#222220] bg-[#1E1E1B] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-[#B8B5AC] font-bold truncate">LEAK REPAIR</span>
                            <span className="text-[#E8760A] font-bold">SAME DAY</span>
                          </div>
                        </div>
                        <div className="mt-auto pt-1 border-t border-[#2A2A26] flex justify-between items-center text-[3.5px] text-[#706D65]">
                          <span>📍 Austin, TX</span>
                          <span>📞 (512) 555-0199</span>
                        </div>
                      </div>
                    ) : temp.id === 'hvac-everest' ? (
                      <div className="h-full p-2.5 flex flex-col gap-1 bg-[#0F172A] text-[#F1F5F9] text-[4.5px]">
                        <div className="bg-[#F97316] text-[#0F172A] px-1 py-0.5 text-center font-bold text-[3.5px] rounded-xs uppercase tracking-wide leading-none select-none">
                          🚨 24/7 HVAC EMERGENCY SERVICE AVAILABLE
                        </div>
                        <div className="border-b border-[#334155] pb-0.5 flex justify-between items-center bg-[#0F172A] px-1">
                          <span className="text-[5.5px] font-extrabold tracking-wider text-white">❄️🔥 VENTUS CO.</span>
                          <span className="text-[3.8px] bg-[#22C55E] text-white px-1.5 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">FREE EST</span>
                        </div>
                        <div className="py-1 border border-[#334155] bg-[#1E293B] p-2 rounded shadow-sm text-center">
                          <h4 className="text-[8px] font-extrabold text-white tracking-tight leading-none">Climate Control Experts</h4>
                          <p className="text-[4px] text-[#F97316] font-mono mt-0.5 uppercase tracking-wide">Same-Day Repair • Certified Pros</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1 mt-0.5">
                          <div className="border border-[#334155] bg-[#1E293B] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-[#94A3B8] font-bold truncate">HEATING</span>
                            <span className="text-[#22C55E] font-bold">24/7 REPAIR</span>
                          </div>
                          <div className="border border-[#334155] bg-[#1E293B] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-[#94A3B8] font-bold truncate">COOLING</span>
                            <span className="text-[#F97316] font-bold">UPFRONT</span>
                          </div>
                        </div>
                        <div className="mt-auto pt-1 border-t border-[#334155] flex justify-between items-center text-[3.5px] text-[#94A3B8]">
                          <span>📍 Atlanta, GA</span>
                          <span>📞 (404) 555-0118</span>
                        </div>
                      </div>
                    ) : temp.id === 'gym-iron-grit' ? (
                      <div className="h-full p-2.5 flex flex-col gap-1 bg-[#111827] text-[#F3F4F6] text-[4.5px]">
                        <div className="bg-[#EF4444] text-white px-1 py-0.5 text-center font-bold text-[3.5px] rounded-xs uppercase tracking-wide leading-none select-none">
                          ⚡ GET 1-DAY FREE PASS WITH PERSONAL TRAINER
                        </div>
                        <div className="border-b border-[#374151] pb-0.5 flex justify-between items-center bg-[#111827] px-1">
                          <span className="text-[5.5px] font-extrabold tracking-wider text-white">💪 IRON PULSE</span>
                          <span className="text-[3.8px] bg-[#F59E0B] text-black px-1.5 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">JOIN NOW</span>
                        </div>
                        <div className="py-1 border border-[#374151] bg-[#1F2937] p-2 rounded shadow-sm text-center">
                          <h4 className="text-[8px] font-extrabold text-white tracking-tight leading-none">Iron Pulse Fitness</h4>
                          <p className="text-[4px] text-[#EF4444] font-mono mt-0.5 uppercase tracking-wide">Elite Training • Open 24/7</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1 mt-0.5">
                          <div className="border border-[#374151] bg-[#1F2937] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-[#9CA3AF] font-bold truncate">WORKOUTS</span>
                            <span className="text-[#F59E0B] font-bold">HIIT & YOGA</span>
                          </div>
                          <div className="border border-[#374151] bg-[#1F2937] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-[#9CA3AF] font-bold truncate">COACHING</span>
                            <span className="text-[#EF4444] font-bold">INCLUDED</span>
                          </div>
                        </div>
                        <div className="mt-auto pt-1 border-t border-[#374151] flex justify-between items-center text-[3.5px] text-[#9CA3AF]">
                          <span>📍 Miami, FL</span>
                          <span>📞 (305) 555-0145</span>
                        </div>
                      </div>
                    ) : temp.id === 'realestate-glass' ? (
                      <div className="h-full p-2.5 flex flex-col gap-1 bg-[#111111] text-[#FAFAF8] text-[4.5px]">
                        <div className="bg-[#C9A86A] text-[#111111] px-1 py-0.5 text-center font-bold text-[3.5px] rounded-xs uppercase tracking-wide leading-none select-none">
                          🔑 PREMIUM REAL ESTATE EXPERTISE
                        </div>
                        <div className="border-b border-white/5 pb-0.5 flex justify-between items-center bg-[#111111] px-1">
                          <span className="text-[5.5px] font-extrabold tracking-wider text-white">🏡 AURA PROPERTIES</span>
                          <span className="text-[3.8px] bg-[#C9A86A] text-[#111111] px-1.5 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">ESTIMATE</span>
                        </div>
                        <div className="py-1 border border-white/5 bg-[#1E1E1E] p-2 rounded shadow-sm text-center">
                          <h4 className="text-[8px] font-extrabold text-[#C9A86A] tracking-tight leading-none font-serif">Aura Luxury Homes</h4>
                          <p className="text-[4px] text-white/70 font-mono mt-0.5 uppercase tracking-wide">Elite Brokerage • Exclusive Listings</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1 mt-0.5">
                          <div className="border border-white/5 bg-[#1E1E1E] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-white/60 font-bold truncate">ESTATE SALES</span>
                            <span className="text-[#C9A86A] font-bold">TOP RET</span>
                          </div>
                          <div className="border border-white/5 bg-[#1E1E1E] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                            <span className="text-white/60 font-bold truncate">CONSULTING</span>
                            <span className="text-white font-bold">1-ON-1</span>
                          </div>
                        </div>
                        <div className="mt-auto pt-1 border-t border-white/5 flex justify-between items-center text-[3.5px] text-white/50">
                          <span>📍 Beverly Hills, CA</span>
                          <span>📞 (310) 555-0189</span>
                        </div>
                      </div>
                    ) : temp.niche === 'Barber' ? (
                      <img src="/barber_desktop_preview.png" alt="Desktop UI Preview" className="w-full h-auto object-cover object-top opacity-90" />
                    ) : (
                      <div className="h-full p-2 flex flex-col gap-1 bg-gradient-to-b from-[#161512] to-black text-white">
                        {/* Header */}
                        <div className="border-b border-white/5 pb-1 flex justify-between items-center">
                          <span className="text-[6px] text-white font-bold tracking-wider uppercase font-sans flex items-center gap-1">
                            {getNicheEmoji(temp.niche)} {temp.name.replace("Barber ", "")}
                          </span>
                          <span className="text-[5px] bg-accent text-white px-1 py-0.5 rounded-3xs font-semibold uppercase scale-[0.85] leading-none">BOOK NOW</span>
                        </div>
                        {/* Hero */}
                        <div className="py-1">
                          <h4 className="text-[8px] font-serif text-white tracking-tight leading-none line-clamp-1">{content.heroTitle}</h4>
                          <p className="text-[5px] text-white/50 line-clamp-1 mt-0.5">{content.heroSubTitle}</p>
                        </div>
                        {/* Services row */}
                        <div className="grid grid-cols-2 gap-1.5 mt-auto">
                          {content.services.slice(0, 2).map((svc, idx) => (
                            <div key={idx} className="bg-white/5 rounded-xs p-1 border border-white/5 text-[5px] flex items-center justify-between">
                              <span className="text-white/85 font-semibold truncate max-w-[60%]">{svc.name}</span>
                              <span className="text-accent font-mono font-bold">{svc.price}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Simulated Overlapping Smartphone mockup */}
                <div 
                  className="absolute right-3 top-8 w-24 h-40 bg-zinc-950 border-2 border-zinc-805 rounded-xl shadow-2xl flex flex-col overflow-hidden z-[3] transform translate-y-1 group-hover:translate-y-0 transition-all duration-300"
                >
                  {/* Phone notch */}
                  <div className="w-8 h-1.5 bg-zinc-950 rounded-b-sm mx-auto absolute top-0 left-1/2 transform -translate-x-1/2 z-10 flex items-center justify-center">
                    <span className="w-0.5 h-0.5 rounded-full bg-zinc-850"></span>
                  </div>
                  {/* Phone screen content OR generated image */}
                  <div className="flex-1 w-full bg-[#111110] relative">
                    {temp.id === 'barber-editorial' ? (
                      <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1.5 bg-[#FAF6ED] text-[#121F1A] text-[5px] select-none font-mono">
                        {/* Tiny header */}
                        <div className="flex justify-between items-center border-b border-[#D9CDBC] pb-0.5 bg-[#F2EAD8]/50">
                          <span className="font-bold text-[4.5px] tracking-tight font-serif italic">FRANKLIN</span>
                          <span className="text-[3.5px] bg-[#121F1A] text-white px-1 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">BOOK</span>
                        </div>
                        {/* Tiny hero */}
                        <div className="text-center py-1 bg-white/40 border border-[#D9CDBC] rounded-sm shadow-sm my-0.5">
                          <h5 className="text-[5.5px] font-bold font-serif text-[#121F1A] tracking-tight leading-tight italic">Franklin &amp; Sons</h5>
                        </div>
                        {/* Tiny Stats */}
                        <div className="border-y border-[#D9CDBC] py-0.5 my-0.5 text-center">
                           <span className="text-[3px] font-bold">⭐ 200+ Reviews · 📅 7 Days</span>
                        </div>
                        {/* Services row */}
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="bg-white/50 rounded-sm border border-[#121F1A] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-[0_1px_2px_rgba(18,31,26,0.05)]">
                            <span className="truncate text-[#26332E] max-w-[50%] font-bold">CLASSIC CUT</span>
                            <span className="text-[#9E3C30] font-bold font-mono">$25</span>
                          </div>
                          <div className="bg-white/50 rounded-sm border border-[#121F1A] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-[0_1px_2px_rgba(18,31,26,0.05)]">
                            <span className="truncate text-[#26332E] max-w-[50%] font-bold">SKIN FADE</span>
                            <span className="text-[#9E3C30] font-bold font-mono">$30</span>
                          </div>
                        </div>
                        {/* Contact bar */}
                        <div className="mt-auto bg-[#121F1A] text-white text-center py-0.5 rounded-sm">
                           <span className="text-[3px] tracking-widest uppercase">CALL NOW</span>
                        </div>
                      </div>
                    ) : temp.id === 'salon-maison' ? (
                      <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#FAF8F4] text-[#1C1A17] text-[5px] select-none font-mono">
                        {/* Tiny header */}
                        <div className="flex justify-between items-center border-b border-[#D6CFC5] pb-0.5 bg-[#F3EFE7]/50">
                          <span className="font-bold text-[4.5px] tracking-tight font-serif italic text-[#C4856A]">MAISON</span>
                          <span className="text-[3.5px] bg-[#C4856A] text-white px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">BOOK</span>
                        </div>
                        {/* Tiny hero */}
                        <div className="text-center py-1 bg-white border border-[#E8E3DB] rounded-sm shadow-xs my-0.5">
                          <h5 className="text-[5.5px] font-bold font-serif text-[#1C1A17] tracking-tight leading-tight italic">Maison Aurélie</h5>
                          <span className="text-[3px] text-[#A06850]">Organic Hair Care</span>
                        </div>
                        {/* Services row */}
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="bg-white rounded-sm border border-[#F0EBE4] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-[0_1px_2px_rgba(28,26,23,0.03)] border-b pb-0.5">
                            <span className="truncate text-[#4A4540] max-w-[50%] font-bold text-[4px]">BALAYAGE</span>
                            <span className="text-[#C4856A] font-bold font-mono">$160</span>
                          </div>
                        </div>
                        {/* Contact bar */}
                        <div className="mt-auto bg-[#1C1A17] text-white text-center py-0.5 rounded-sm">
                           <span className="text-[3px] tracking-widest uppercase">CALL (310) 555-0193</span>
                        </div>
                      </div>
                    ) : temp.id === 'dentist-clarity' ? (
                      <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#FFFFFF] text-[#0A1628] text-[5px] select-none font-mono">
                        {/* Tiny header */}
                        <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-0.5 bg-white">
                          <span className="font-bold text-[4.5px] tracking-tight text-[#0A1628]">CLARITY</span>
                          <span className="text-[3.5px] bg-[#0EA5A0] text-white px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">BOOK</span>
                        </div>
                        {/* Tiny hero */}
                        <div className="text-center py-1 bg-[#F7F8FA] border border-[#DDE2EC] rounded-sm shadow-xs my-0.5">
                          <h5 className="text-[5.5px] font-bold text-[#0A1628] tracking-tight leading-tight">Clarity Dental</h5>
                          <span className="text-[3px] text-[#0EA5A0]">Clinical Luxury</span>
                        </div>
                        {/* Services row */}
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="bg-white rounded-sm border border-[#E8ECF3] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                            <span className="truncate text-[#344D6E] max-w-[50%] font-bold text-[4px]">TEETH CLEANING</span>
                            <span className="text-[#0EA5A0] font-bold font-mono">$99</span>
                          </div>
                        </div>
                        {/* Contact bar */}
                        <div className="mt-auto bg-[#0A1628] text-white text-center py-0.5 rounded-sm">
                           <span className="text-[3px] tracking-widest uppercase">CALL (646) 555-0182</span>
                        </div>
                      </div>
                    ) : temp.id === 'roofing-ironclad' ? (
                      <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#161614] text-[#F5F4F0] text-[5px] select-none font-sans">
                        <div className="flex justify-between items-center border-b border-[#2A2A26] pb-0.5 bg-[#0C0C0B]">
                          <span className="font-extrabold text-[4.5px] tracking-wider text-white">🏠 Ironclad</span>
                          <span className="text-[3.5px] bg-[#E8760A] text-black px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">CALL</span>
                        </div>
                        <div className="text-center py-1 bg-[#1E1E1B] border border-[#2A2A26] rounded-sm shadow-xs my-0.5">
                          <h5 className="text-[5.5px] font-bold text-white tracking-tight leading-tight">Ironclad</h5>
                          <span className="text-[3px] text-[#E8760A]">GAF Master Elite</span>
                        </div>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="bg-[#1E1E1B] rounded-sm border border-[#222220] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                            <span className="truncate text-[#B8B5AC] max-w-[50%] font-bold text-[4px]">LEAK REPAIR</span>
                            <span className="text-[#E8760A] font-bold font-mono">100% SECURE</span>
                          </div>
                        </div>
                        <div className="mt-auto bg-[#E8760A] text-black text-center py-0.5 rounded-sm">
                           <span className="text-[3px] font-bold tracking-widest uppercase">CALL (512) 555-0199</span>
                        </div>
                      </div>
                    ) : temp.id === 'hvac-everest' ? (
                      <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#0F172A] text-[#F1F5F9] text-[5px] select-none font-sans">
                        <div className="flex justify-between items-center border-b border-[#334155] pb-0.5 bg-[#0F172A]">
                          <span className="font-extrabold text-[4.5px] tracking-wider text-white">❄️🔥 VENTUS CO.</span>
                          <span className="text-[3.5px] bg-[#22C55E] text-white px-1 py-0.5 rounded-sm font-bold uppercase scale-90 leading-none">EST</span>
                        </div>
                        <div className="text-center py-1 bg-[#1E293B] border border-[#334155] rounded-sm shadow-xs my-0.5">
                          <h5 className="text-[5.5px] font-bold text-white tracking-tight leading-tight">VENTUS</h5>
                          <span className="text-[3px] text-[#F97316]">Certified Comfort 24/7</span>
                        </div>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="bg-[#1E293B] rounded-sm border border-[#334155] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                            <span className="truncate text-[#94A3B8] max-w-[50%] font-bold text-[4px]">HVAC SERVICE</span>
                            <span className="text-[#22C55E] font-bold font-mono">100% OK</span>
                          </div>
                        </div>
                        <div className="mt-auto bg-[#F97316] text-[#0F172A] text-center py-0.5 rounded-sm">
                           <span className="text-[3px] font-bold tracking-widest uppercase">CALL (404) 555-0118</span>
                        </div>
                      </div>
                    ) : temp.id === 'gym-iron-grit' ? (
                      <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#111827] text-[#F3F4F6] text-[5px] select-none font-sans">
                        <div className="flex justify-between items-center border-b border-[#374151] pb-0.5 bg-[#111827]">
                          <span className="font-extrabold text-[4.5px] tracking-wider text-white">💪 IRON PULSE</span>
                          <span className="text-[3.5px] bg-[#EF4444] text-white px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">JOIN</span>
                        </div>
                        <div className="text-center py-1 bg-[#1F2937] border border-[#374151] rounded-sm shadow-xs my-0.5">
                          <h5 className="text-[5.5px] font-bold text-white tracking-tight leading-tight">PULSE</h5>
                          <span className="text-[3px] text-[#F59E0B]">No Limits. Open 24/7.</span>
                        </div>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="bg-[#1F2937] rounded-sm border border-[#374151] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                            <span className="truncate text-[#9CA3AF] max-w-[50%] font-bold text-[4px]">ELITE WORKOUT</span>
                            <span className="text-[#EF4444] font-bold font-mono">100% RAW</span>
                          </div>
                        </div>
                        <div className="mt-auto bg-[#EF4444] text-white text-center py-0.5 rounded-sm">
                           <span className="text-[3px] font-bold tracking-widest uppercase">CALL (305) 555-0145</span>
                        </div>
                      </div>
                    ) : temp.id === 'realestate-glass' ? (
                      <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#111111] text-[#FAFAF8] text-[5px] select-none font-sans">
                        <div className="flex justify-between items-center border-b border-white/5 pb-0.5 bg-[#111111]">
                          <span className="font-extrabold text-[4.5px] tracking-wider text-white">🏡 AURA PROPS</span>
                          <span className="text-[3.5px] bg-[#C9A86A] text-[#111111] px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">VAL</span>
                        </div>
                        <div className="text-center py-1 bg-[#1E1E1E] border border-white/5 rounded-sm shadow-xs my-0.5">
                          <h5 className="text-[5.5px] font-bold text-[#C9A86A] tracking-tight leading-tight">AURA</h5>
                          <span className="text-[3px] text-white/60">Elite Luxury Brokerage</span>
                        </div>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="bg-[#1E1E1E] rounded-sm border border-white/5 px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                            <span className="truncate text-white/80 max-w-[50%] font-bold text-[4px]">VALUATION</span>
                            <span className="text-[#C9A86A] font-bold font-mono">100% FREE</span>
                          </div>
                        </div>
                        <div className="mt-auto bg-[#C9A86A] text-[#111111] text-center py-0.5 rounded-sm">
                           <span className="text-[3px] font-bold tracking-widest uppercase">CALL (310) 555-0189</span>
                        </div>
                      </div>
                    ) : temp.niche === 'Barber' ? (
                      <img src="/barber_mobile_preview.png" alt="Mobile UI Preview" className="w-full h-full object-cover object-top opacity-95" />
                    ) : (
                      <div className="h-full p-1.5 pt-3 flex flex-col gap-1 bg-gradient-to-b from-[#111110] to-[#050505] text-white text-[5px] select-none">
                        {/* Tiny header */}
                        <div className="flex justify-between items-center border-b border-white/5 pb-0.5">
                          <span className="font-bold text-[5px] scale-90">{getNicheEmoji(temp.niche)}</span>
                          <span className="text-[4px] bg-accent text-white px-1 rounded-3xs font-bold uppercase scale-90 leading-none">BOOK</span>
                        </div>
                        {/* Tiny hero */}
                        <div className="text-center py-0.5 bg-white/[0.02] rounded-xs my-0.5">
                          <h5 className="text-[5px] font-serif text-white font-medium tracking-tight leading-tight line-clamp-2">{content.heroTitle}</h5>
                        </div>
                        {/* Services row */}
                        <div className="flex flex-col gap-0.5 mt-auto">
                          {content.services.slice(0, 2).map((svc, idx) => (
                            <div key={idx} className="bg-white/5 rounded-3xs px-1 py-0.5 border border-white/5 flex items-center justify-between scale-[0.95]">
                              <span className="truncate text-white/80 max-w-[50%]">{svc.name}</span>
                              <span className="text-accent font-mono font-bold scale-90">{svc.price}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Elegant Badge for specific tags */}
                {temp.isMostUsed ? (
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-warning text-white text-[8px] uppercase font-bold tracking-widest rounded-full z-[4] shadow-md scale-90">
                    ★ MOST POPULAR
                  </div>
                ) : (
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-ink/65 backdrop-blur-xs text-white text-[8px] uppercase font-semibold tracking-wider rounded-full z-[4] shadow-md scale-90 border border-white/10">
                    MULTI-DEVICE
                  </div>
                )}
              </div>

              {/* Template Descriptions and Details */}
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold font-sans tracking-tight leading-tight">{temp.name}</span>
                      <span className="px-1.5 py-0.5 bg-surface text-ink text-[10px] font-sans font-medium rounded-xs uppercase">
                        {temp.niche}
                      </span>
                    </div>
                    <p className="text-xs text-ink-secondary font-mono leading-none">Used in {temp.usedCount} campaigns previously</p>
                  </div>
                  
                  {/* Rating */}
                  <span className="flex items-center gap-1 text-xs text-warning font-semibold font-mono bg-warning-soft px-1.5 py-0.5 rounded-md shrink-0 border border-warning/10">
                    <Star className="w-3 h-3 fill-warning text-warning" />
                    <span>{temp.rating}</span>
                  </span>
                </div>

                {/* Action buttons list */}
                <div id={`template-actions-row-${temp.id}`} className="border-t border-border-light pt-4">
                  <button
                    onClick={() => setSelectedTemplateForPreview(temp)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded transition-all active:scale-[0.98] shadow-sm cursor-pointer"
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span>Preview</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredTemplates.length === 0 && (
          <div className="col-span-full py-16 text-center text-ink-secondary">
            No design frameworks identified matching the filters selected.
          </div>
        )}
      </section>

      {/* TEMPLATE DETAIL PREVIEW MODAL */}
      {selectedTemplateForPreview && (() => {
        const modalContent = getTemplateContent(selectedTemplateForPreview.id, selectedTemplateForPreview.name, selectedTemplateForPreview.niche);
        return (
          <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4 backdrop-blur-xs animate-fade-in">
            <div className="bg-white border border-border-main rounded-xl max-w-4xl w-full flex flex-col overflow-hidden max-h-[90vh] shadow-xl animate-scale-up">
              
              {/* Modal header */}
              <div className="p-5 border-b border-border-light bg-off-white flex items-center justify-between shrink-0">
                <div className="space-y-0.5 max-w-[60%]">
                  <h3 className="text-xl font-serif text-ink tracking-tight font-normal truncate">{selectedTemplateForPreview.name} Live Framework</h3>
                  <p className="text-xs text-ink-secondary uppercase tracking-wider font-semibold font-sans truncate">Industry Target: {selectedTemplateForPreview.niche} • Real-Time Native</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* DEVICE SWITCHER BUTTONS - Hidden on Mobile Viewports to keep header clean */}
                  <div className="hidden sm:flex bg-surface rounded-md p-1 border border-border-light text-[11px] font-bold">
                    <button
                      onClick={() => setPreviewDevice('desktop')}
                      className={`px-3 py-1.5 rounded transition-all cursor-pointer ${previewDevice === 'desktop' ? 'bg-white shadow-2xs text-accent font-bold' : 'text-ink-secondary hover:text-ink'}`}
                    >
                      Desktop
                    </button>
                    <button
                      onClick={() => setPreviewDevice('mobile')}
                      className={`px-3 py-1.5 rounded transition-all cursor-pointer ${previewDevice === 'mobile' ? 'bg-white shadow-2xs text-accent font-bold' : 'text-ink-secondary hover:text-ink'}`}
                    >
                      Mobile
                    </button>
                  </div>
                  <button
                    onClick={handleCloseModal}
                    className="p-1 rounded-md hover:bg-border-light text-ink-secondary hover:text-ink transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal content - Live Interactive Frame View */}
              <div className="flex-1 bg-surface/30 p-3 md:p-6 flex justify-center items-center overflow-hidden min-h-[300px] h-[440px] md:h-[500px] max-h-[55vh]">
                <div
                  className="transition-all duration-350 border border-border-main rounded-lg overflow-hidden bg-white shadow-lg relative flex flex-col w-full h-full"
                  style={{
                    width: previewDevice === 'mobile' ? '375px' : '100%',
                    maxWidth: '100%',
                  }}
                >
                  <iframe
                    src={previewUrlForKey(selectedTemplateForPreview.id)}
                    className="w-full h-full border-0 flex-1"
                    title="Live Template Preview"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

            {/* Modal footer CTAs */}
            <div className="p-5 border-t border-border-light bg-off-white flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 border border-border-main font-semibold text-xs text-ink bg-white uppercase tracking-wider rounded hover:bg-off-white transition-all shadow-2xs cursor-pointer"
              >
                Cancel Preview
              </button>
              {setActiveTab && (
                <button
                  onClick={() => {
                    if (setSelectedNicheFilter) {
                      setSelectedNicheFilter(selectedTemplateForPreview.niche);
                    }
                    handleCloseModal();
                    setActiveTab('campaigns');
                  }}
                  className="px-5 py-2 bg-secondary hover:bg-secondary/90 hover:shadow-md text-white font-semibold text-xs uppercase tracking-wider rounded shadow-sm flex items-center gap-1.5 cursor-pointer animate-pulse"
                >
                  <span>Launch Campaign</span>
                  <Zap className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => {
                  window.open(previewUrlForKey(selectedTemplateForPreview.id), '_blank');
                }}
                className="px-5 py-2 bg-accent hover:bg-accent-hover text-white font-semibold text-xs uppercase tracking-wider rounded shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>Preview in Full Page</span>
                <Eye className="w-4 h-4" />
              </button>
            </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
