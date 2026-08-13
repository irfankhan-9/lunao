/**
 * TemplateSimPreview — shared component for rendering a rich, premium
 * dual-device mockup preview of any built-in template.
 *
 * Used by:
 *   - Templates.tsx (site-wide template gallery)
 *   - Campaigns.tsx (Site Deploy wizard step 3)
 *
 * Props match the Template interface from types.ts plus optional
 * selection/hover callbacks for wizard use.
 */

import React from 'react';
import { Eye, ExternalLink } from 'lucide-react';
import { getTemplateContent } from './Templates';
import { getNicheBgImage } from './Templates';

// Built-in templates use semantic keys (e.g. "barber-dark-luxury") but the
// rich per-template mockups below were written against the old t1..t8
// identifiers. This map lets us reuse the exact same visuals without
// touching the hand-tuned mockup JSX.
const KEY_TO_LEGACY_ID = {
  'barber-dark-luxury': 't1',
  'barber-editorial': 't2',
  'salon-maison': 't3',
  'dentist-clarity': 't4',
  'roofing-ironclad': 't5',
  'hvac-everest': 't6',
  'gym-iron-grit': 't7',
  'realestate-glass': 't8',
};
const legacyIdFor = (key) => KEY_TO_LEGACY_ID[key] || key;

interface TemplateSimPreviewProps {
  id: string;
  name: string;
  niche: string;
  /** Optional — shown as bottom card label (uses name if omitted) */
  label?: string;
  /** Optional — used in Templates.tsx to show usage counts */
  usedCount?: number;
  rating?: number;
  /** Optional — overrides the standard "MUTLI-DEVICE" badge */
  badge?: string;
  isMostUsed?: boolean;
  /** Optional — fires when the card is clicked (wizard selection) */
  onClick?: () => void;
  /** Optional — fires when the eye button is clicked */
  onPreview?: () => void;
  /** Optional — fires when the external-link button is clicked */
  onFullPage?: (e: React.MouseEvent) => void;
  /** Classes applied to the outer card container */
  className?: string;
  /** Whether to show action buttons (wizard mode hides them when omitted) */
  showActions?: boolean;
  /** Whether this card is currently selected (wizard mode) */
  selected?: boolean;
  /** For wizard: custom text below the template name */
  subLabel?: string;
}

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

// Live preview URL for a built-in template. The dashboard iframe renders
// the unified preview endpoint, which returns demo-filled HTML for any
// built-in key. Falls back to the standing "/barber-template.html" if
// the key is unknown (very defensive — should never happen).
const LEGACY_PREVIEW_FILE = {
  'barber-dark-luxury': '/barber-template.html',
  'barber-editorial': '/barber-template-02.html',
  'salon-maison': '/salon-template-01.html',
  'dentist-clarity': '/dentist-template-01.html',
  'roofing-ironclad': '/roofing-template-01.html',
  'hvac-everest': '/hvac-template-01.html',
  'gym-iron-grit': '/gym-template-01.html',
  'realestate-glass': '/realestate-template-01.html',
};
const previewUrl = (id) => {
  // Prefer the unified live-preview endpoint when the template is a known
  // built-in. Fall back to the legacy static file (a copy of the same HTML
  // that lives at /public/barber-template.html etc.) for back-compat.
  if (LEGACY_PREVIEW_FILE[id]) return `/api/templates/${encodeURIComponent(id)}/preview`;
  return LEGACY_PREVIEW_FILE[id] || '/barber-template.html';
};

export const TemplateSimPreview: React.FC<TemplateSimPreviewProps> = ({
  id,
  name,
  niche,
  label,
  badge,
  isMostUsed,
  onClick,
  onPreview,
  onFullPage,
  className = '',
  showActions = false,
  selected = false,
  subLabel,
}) => {
  const content = getTemplateContent(id, name, niche);
  // Mockup visuals were authored against the legacy t1..t8 ids. Map the
  // new semantic keys back to those ids so all the rich visuals render
  // untouched.
  const legacy = legacyIdFor(id);

  const bgImage = (() => {
    switch (legacy) {
      case 't3': return '/salon_template_cover.png';
      case 't5': return '/roofing_cover.png';
      case 't6': return '/hvac_cover.png';
      case 't7': return '/gym_cover.png';
      case 't8': return '/realestate_cover.png';
      default: return getNicheBgImage(niche);
    }
  })();

  const cardLabel = label ?? name;
  const sub = subLabel ?? niche;

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between group ${selected ? 'border-accent shadow-md ring-2 ring-accent/20' : 'border-border-light hover:border-accent/50'} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {/* ── Preview visual area ─────────────────────────────────── */}
      <div className="relative select-none" style={{ height: 192 }}>

        {/* Background */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-300 group-hover:scale-[1.01]"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
        <div className="absolute inset-0 bg-ink/45 backdrop-blur-[0.5px] transition-all duration-300 group-hover:bg-ink/40" />

        {/* Desktop mockup */}
        <div
          className="absolute left-3 right-10 top-3 h-36 bg-ink/90 border border-white/10 rounded-md shadow-lg flex flex-col overflow-hidden z-[2]"
          style={{ transform: 'translateY(0)' }}
        >
          {/* Browser bar */}
          <div className="bg-black/40 px-2 py-1 flex items-center gap-1 border-b border-white/5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500/80" />
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/80" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
            <span className="text-[5px] text-white/30 font-mono ml-1 truncate">{id}</span>
          </div>
          {/* Desktop content */}
          <div className="flex-1 overflow-hidden bg-[#111110] relative">
            {legacy === 't2' ? (
              <div className="h-full p-2 flex flex-col gap-1 bg-[#FAF6ED] text-[#121F1A] text-[5px] font-mono">
                <div className="border-b border-[#D9CDBC] pb-0.5 flex justify-between items-center bg-[#F2EAD8]/50 px-0.5">
                  <span className="font-bold font-serif italic tracking-tight text-[5.5px]">FRANKLIN &amp; SONS</span>
                  <span className="text-[3px] bg-[#121F1A] text-white px-1 py-0.5 rounded font-bold uppercase scale-90">BOOK</span>
                </div>
                <div className="py-0.5 border border-[#D9CDBC] bg-white/40 px-0.5 rounded shadow-sm mt-0.5">
                  <p className="text-[6px] font-bold font-serif italic">Franklin &amp; Sons 💈</p>
                  <p className="text-[3.5px] text-[#556960] uppercase tracking-wide">EST. — Premium Haircuts</p>
                </div>
                <div className="flex justify-between items-center border-y border-[#D9CDBC] py-0.5 px-0.5 text-[3.5px] font-bold">
                  <span>⭐ 200+ Reviews</span><span>📅 7 Days</span>
                </div>
                <div className="flex gap-0.5 mt-0.5">
                  {[{ n: 'CLASSIC CUT', p: '$25' }, { n: 'SKIN FADE', p: '$30' }].map((s, i) => (
                    <div key={i} className="flex-1 border border-[#121F1A] bg-white/50 p-0.5 rounded-sm flex items-center justify-between">
                      <span className="text-[4px] font-bold text-[#26332E] truncate">{s.n}</span>
                      <span className="text-[#9E3C30] font-bold">{s.p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : legacy === 't3' ? (
              <div className="h-full p-2 flex flex-col gap-1 bg-[#FAF8F4] text-[#1C1A17] text-[5px] font-mono">
                <div className="border-b border-[#D6CFC5] pb-0.5 flex justify-between items-center bg-[#F3EFE7]/50 px-0.5">
                  <span className="font-bold font-serif italic text-[5.5px] text-[#C4856A]">MAISON AURÉLIE</span>
                  <span className="text-[3px] bg-[#C4856A] text-white px-1 rounded font-bold uppercase scale-90">BOOK</span>
                </div>
                <div className="py-0.5 border border-[#D6CFC5] bg-white px-0.5 rounded shadow-sm mt-0.5 text-center">
                  <p className="text-[6px] font-extrabold font-serif italic">Maison Aurélie Hair Studio</p>
                  <p className="text-[3.5px] text-[#C4856A]">Parisian Editorial Warmth · Cuts</p>
                </div>
                <div className="flex gap-0.5 mt-auto">
                  {[{ n: 'BALAYAGE', p: '$160' }, { n: 'SIGNATURE', p: '$65' }].map((s, i) => (
                    <div key={i} className="flex-1 border border-[#E8E3DB] bg-white p-0.5 rounded-sm flex items-center justify-between">
                      <span className="text-[4px] font-bold text-[#4A4540] truncate">{s.n}</span>
                      <span className="text-[#C4856A] font-bold">{s.p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : legacy === 't4' ? (
              <div className="h-full p-2 flex flex-col gap-1 bg-[#FFFFFF] text-[#0A1628] text-[5px] font-mono">
                <div className="border-b border-[#DDE2EC] pb-0.5 flex justify-between items-center bg-white px-0.5">
                  <span className="text-[5px] font-bold flex items-center gap-0.5">
                    <span className="w-1 h-1 rounded-sm bg-[#0EA5A0] inline-block" /> CLARITY DENTAL
                  </span>
                  <span className="text-[3px] bg-[#0EA5A0] text-white px-1 rounded font-bold uppercase scale-90">APPT</span>
                </div>
                <div className="py-0.5 border border-[#DDE2EC] bg-[#F7F8FA] px-0.5 rounded shadow-sm mt-0.5 text-center">
                  <p className="text-[6px] font-bold">Clarity Dental Studio</p>
                  <p className="text-[3.5px] text-[#0EA5A0] uppercase tracking-wide">Clinical Luxury · New York</p>
                </div>
                <div className="flex gap-0.5 mt-auto">
                  {[{ n: 'CLEANING', p: '$99' }, { n: 'VENEERS', p: 'CONSULT' }].map((s, i) => (
                    <div key={i} className="flex-1 border border-[#E8ECF3] bg-white p-0.5 rounded-sm flex items-center justify-between">
                      <span className="text-[4px] font-medium text-[#344D6E] truncate">{s.n}</span>
                      <span className="text-[#0EA5A0] font-medium">{s.p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : legacy === 't5' ? (
              <div className="h-full p-2 flex flex-col gap-1 bg-[#161614] text-[#F5F4F0] text-[5px] font-sans">
                <div className="border-b border-[#2A2A26] pb-0.5 flex justify-between items-center bg-[#0C0C0B] px-0.5">
                  <span className="text-[5.5px] font-extrabold text-white tracking-wider">🏠 IRONCLAD</span>
                  <span className="text-[3px] bg-[#E8760A] text-black px-1 rounded font-bold uppercase scale-90">FREE EST</span>
                </div>
                <div className="py-0.5 border border-[#2A2A26] bg-[#1E1E1B] px-0.5 rounded shadow-sm mt-0.5 text-center">
                  <p className="text-[6px] font-extrabold text-white">Ironclad Roofing</p>
                  <p className="text-[3.5px] text-[#E8760A]">GAF Master Elite · 50-Yr Warranty</p>
                </div>
                <div className="flex gap-0.5 mt-auto">
                  {[{ n: 'REPLACEMENT', p: '1-2 DAYS' }, { n: 'LEAK REPAIR', p: 'SAME DAY' }].map((s, i) => (
                    <div key={i} className="flex-1 border border-[#222220] bg-[#1E1E1B] p-0.5 rounded-sm flex items-center justify-between">
                      <span className="text-[4px] font-bold text-[#B8B5AC] truncate">{s.n}</span>
                      <span className="text-[#E8760A] font-bold">{s.p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : legacy === 't6' ? (
              <div className="h-full p-2 flex flex-col gap-1 bg-[#0F172A] text-[#F1F5F9] text-[5px] font-sans">
                <div className="bg-[#F97316] text-[#0F172A] px-1 py-0.5 text-center font-bold text-[3px] rounded-xs uppercase tracking-wide leading-none">🚨 24/7 EMERGENCY</div>
                <div className="border-b border-[#334155] pb-0.5 flex justify-between items-center bg-[#0F172A] px-0.5">
                  <span className="text-[5.5px] font-extrabold text-white">❄️🔥 VENTUS CO.</span>
                  <span className="text-[3px] bg-[#22C55E] text-white px-1 rounded font-bold uppercase scale-90">FREE EST</span>
                </div>
                <div className="py-0.5 border border-[#334155] bg-[#1E293B] px-0.5 rounded shadow-sm mt-0.5 text-center">
                  <p className="text-[6px] font-extrabold text-white">Climate Control Experts</p>
                  <p className="text-[3.5px] text-[#F97316]">Same-Day Repair · Certified Pros</p>
                </div>
                <div className="flex gap-0.5 mt-auto">
                  {[{ n: 'HEATING', p: '24/7 REPAIR' }, { n: 'COOLING', p: 'UPFRONT' }].map((s, i) => (
                    <div key={i} className="flex-1 border border-[#334155] bg-[#1E293B] p-0.5 rounded-sm flex items-center justify-between">
                      <span className="text-[4px] font-bold text-[#94A3B8] truncate">{s.n}</span>
                      <span className="text-[#F97316] font-bold">{s.p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : legacy === 't7' ? (
              <div className="h-full p-2 flex flex-col gap-1 bg-[#111827] text-[#F3F4F6] text-[5px] font-sans">
                <div className="bg-[#EF4444] text-white px-1 py-0.5 text-center font-bold text-[3px] rounded-xs uppercase tracking-wide leading-none">⚡ FREE 1-DAY PASS</div>
                <div className="border-b border-[#374151] pb-0.5 flex justify-between items-center bg-[#111827] px-0.5">
                  <span className="text-[5.5px] font-extrabold text-white">💪 IRON PULSE</span>
                  <span className="text-[3px] bg-[#F59E0B] text-black px-1 rounded font-bold uppercase scale-90">JOIN NOW</span>
                </div>
                <div className="py-0.5 border border-[#374151] bg-[#1F2937] px-0.5 rounded shadow-sm mt-0.5 text-center">
                  <p className="text-[6px] font-extrabold text-white">Iron Pulse Fitness</p>
                  <p className="text-[3.5px] text-[#EF4444]">Elite Training · Open 24/7</p>
                </div>
                <div className="flex gap-0.5 mt-auto">
                  {[{ n: 'ELITE WORKOUT', p: '100% RAW' }, { n: 'PERSONAL TRAIN', p: 'INCLUDED' }].map((s, i) => (
                    <div key={i} className="flex-1 border border-[#374151] bg-[#1F2937] p-0.5 rounded-sm flex items-center justify-between">
                      <span className="text-[4px] font-bold text-[#9CA3AF] truncate">{s.n}</span>
                      <span className="text-[#EF4444] font-bold">{s.p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : legacy === 't8' ? (
              <div className="h-full p-2 flex flex-col gap-1 bg-[#111111] text-[#C9A86A] text-[5px] font-sans">
                <div className="bg-[#C9A86A] text-[#111111] px-1 py-0.5 text-center font-bold text-[3px] uppercase leading-none rounded-xs">🔑 PREMIUM BROKERAGE</div>
                <div className="border-b border-white/5 pb-0.5 flex justify-between items-center bg-[#111111] px-0.5">
                  <span className="text-[5.5px] font-extrabold text-white tracking-wider">🏡 AURA PROPERTIES</span>
                  <span className="text-[3px] bg-[#C9A86A] text-[#111111] px-1 rounded font-bold uppercase scale-90">ESTIMATE</span>
                </div>
                <div className="py-0.5 border border-white/5 bg-[#1E1E1E] px-0.5 rounded shadow-sm mt-0.5 text-center">
                  <p className="text-[6px] font-extrabold text-[#C9A86A] font-serif">Aura Luxury Homes</p>
                  <p className="text-[3.5px] text-white/70">Elite Brokerage · Exclusive Listings</p>
                </div>
                <div className="flex gap-0.5 mt-auto">
                  {[{ n: 'ESTATE SALES', p: 'TOP RET' }, { n: 'CONSULTING', p: '1-ON-1' }].map((s, i) => (
                    <div key={i} className="flex-1 border border-white/5 bg-[#1E1E1E] p-0.5 rounded-sm flex items-center justify-between">
                      <span className="text-[4px] font-bold text-white/60 truncate">{s.n}</span>
                      <span className="text-[#C9A86A] font-bold">{s.p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : niche === 'Barber' ? (
              <img src="/barber_desktop_preview.png" alt="Desktop Preview" className="w-full h-full object-cover object-top opacity-90" />
            ) : (
              <div className="h-full p-2 flex flex-col gap-1 bg-gradient-to-b from-[#161512] to-black text-white">
                <div className="flex justify-between items-center border-b border-white/5 pb-0.5">
                  <span className="text-[6px] font-bold uppercase font-sans flex items-center gap-1">
                    {getNicheEmoji(niche)} {name}
                  </span>
                  <span className="text-[5px] bg-accent text-white px-1 py-0.5 rounded-xs font-semibold uppercase scale-90 leading-none">BOOK</span>
                </div>
                <div className="py-0.5">
                  <p className="text-[6px] font-serif text-white leading-tight line-clamp-1">{content.heroTitle}</p>
                  <p className="text-[4px] text-white/50 line-clamp-1 mt-0.5">{content.heroSubTitle}</p>
                </div>
                <div className="flex flex-col gap-0.5 mt-auto">
                  {content.services.slice(0, 2).map((svc, idx) => (
                    <div key={idx} className="bg-white/5 rounded-xs p-0.5 border border-white/5 flex items-center justify-between">
                      <span className="text-[4.5px] text-white/85 font-semibold truncate max-w-[55%]">{svc.name}</span>
                      <span className="text-accent font-mono font-bold text-[4.5px]">{svc.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile mockup */}
        <div className="absolute right-2 top-6 w-20 h-36 bg-zinc-950 border-2 border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden z-[3]">
          {/* Notch */}
          <div className="w-7 h-1.5 bg-zinc-950 rounded-b-sm mx-auto absolute top-0 left-1/2 transform -translate-x-1/2 z-10">
            <span className="w-0.5 h-0.5 bg-zinc-700 rounded-full block mx-auto mt-0.5" />
          </div>
          <div className="flex-1 w-full bg-[#111110] relative pt-2">
            {legacy === 't2' ? (
              <div className="h-full p-1 pt-3 flex flex-col gap-1 bg-[#FAF6ED] text-[#121F1A] text-[4.5px] font-mono">
                <div className="flex justify-between items-center border-b border-[#D9CDBC] pb-0.5 bg-[#F2EAD8]/50 px-0.5">
                  <span className="font-bold font-serif italic text-[4px]">FRANKLIN</span>
                  <span className="text-[3px] bg-[#121F1A] text-white px-0.5 rounded font-bold uppercase scale-90">BOOK</span>
                </div>
                <div className="text-center py-0.5 bg-white/40 border border-[#D9CDBC] rounded-sm my-0.5">
                  <p className="text-[5px] font-bold font-serif italic">Franklin &amp; Sons</p>
                </div>
                <div className="border-y border-[#D9CDBC] py-0.5 text-center text-[3px] font-bold">⭐ 200+ · 7 Days</div>
                <div className="flex flex-col gap-0.5 mt-auto">
                  <div className="bg-white/50 border border-[#121F1A] px-0.5 py-0.5 flex items-center justify-between rounded-sm"><span className="truncate font-bold text-[3.5px] text-[#26332E]">CLASSIC</span><span className="text-[#9E3C30] font-bold text-[3.5px]">$25</span></div>
                  <div className="bg-white/50 border border-[#121F1A] px-0.5 py-0.5 flex items-center justify-between rounded-sm"><span className="truncate font-bold text-[3.5px] text-[#26332E]">FADE</span><span className="text-[#9E3C30] font-bold text-[3.5px]">$30</span></div>
                </div>
                <div className="mt-auto bg-[#121F1A] text-white text-center py-0.5 rounded-sm"><span className="text-[3px] tracking-widest uppercase">CALL NOW</span></div>
              </div>
            ) : legacy === 't3' ? (
              <div className="h-full p-1 pt-3 flex flex-col gap-1 bg-[#FAF8F4] text-[#1C1A17] text-[4.5px] font-mono">
                <div className="flex justify-between items-center border-b border-[#D6CFC5] pb-0.5 bg-[#F3EFE7]/50 px-0.5">
                  <span className="font-bold text-[4px] text-[#C4856A] italic">MAISON</span>
                  <span className="text-[3px] bg-[#C4856A] text-white px-0.5 rounded font-bold uppercase scale-90">BOOK</span>
                </div>
                <div className="text-center py-0.5 bg-white border border-[#E8E3DB] rounded-sm my-0.5">
                  <p className="text-[5px] font-bold font-serif italic">Maison Aurélie</p>
                  <p className="text-[3px] text-[#A06850]">Organic Hair</p>
                </div>
                <div className="mt-auto bg-[#1C1A17] text-white text-center py-0.5 rounded-sm"><span className="text-[3px] tracking-widest uppercase">CALL</span></div>
              </div>
            ) : legacy === 't4' ? (
              <div className="h-full p-1 pt-3 flex flex-col gap-1 bg-[#FFFFFF] text-[#0A1628] text-[4.5px] font-mono">
                <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-0.5 bg-white px-0.5">
                  <span className="font-bold text-[4px]">CLARITY</span>
                  <span className="text-[3px] bg-[#0EA5A0] text-white px-0.5 rounded font-bold uppercase scale-90">APPT</span>
                </div>
                <div className="text-center py-0.5 bg-[#F7F8FA] border border-[#DDE2EC] rounded-sm my-0.5">
                  <p className="text-[5px] font-bold">Clarity Dental</p>
                  <p className="text-[3px] text-[#0EA5A0]">Clinical Luxury</p>
                </div>
                <div className="mt-auto bg-[#0A1628] text-white text-center py-0.5 rounded-sm"><span className="text-[3px] tracking-widest uppercase">CALL</span></div>
              </div>
            ) : legacy === 't5' ? (
              <div className="h-full p-1 pt-3 flex flex-col gap-1 bg-[#161614] text-[#F5F4F0] text-[4.5px] font-sans">
                <div className="flex justify-between items-center border-b border-[#2A2A26] pb-0.5 bg-[#0C0C0B] px-0.5">
                  <span className="font-extrabold text-[4px] text-white">🏠 Ironclad</span>
                  <span className="text-[3px] bg-[#E8760A] text-black px-0.5 rounded font-bold uppercase scale-90">CALL</span>
                </div>
                <div className="text-center py-0.5 bg-[#1E1E1B] border border-[#2A2A26] rounded-sm my-0.5">
                  <p className="text-[5px] font-extrabold text-white">Ironclad</p>
                  <p className="text-[3px] text-[#E8760A]">GAF Master</p>
                </div>
                <div className="mt-auto bg-[#E8760A] text-black text-center py-0.5 rounded-sm"><span className="text-[3px] font-bold uppercase">CALL</span></div>
              </div>
            ) : legacy === 't6' ? (
              <div className="h-full p-1 pt-3 flex flex-col gap-1 bg-[#0F172A] text-[#F1F5F9] text-[4.5px] font-sans">
                <div className="flex justify-between items-center border-b border-[#334155] pb-0.5 bg-[#0F172A] px-0.5">
                  <span className="font-extrabold text-[4px] text-white">❄️🔥 VENTUS</span>
                  <span className="text-[3px] bg-[#22C55E] text-white px-0.5 rounded font-bold uppercase scale-90">EST</span>
                </div>
                <div className="text-center py-0.5 bg-[#1E293B] border border-[#334155] rounded-sm my-0.5">
                  <p className="text-[5px] font-bold text-white">VENTUS</p>
                  <p className="text-[3px] text-[#F97316]">24/7 Repair</p>
                </div>
                <div className="mt-auto bg-[#F97316] text-[#0F172A] text-center py-0.5 rounded-sm"><span className="text-[3px] font-bold uppercase">CALL</span></div>
              </div>
            ) : legacy === 't7' ? (
              <div className="h-full p-1 pt-3 flex flex-col gap-1 bg-[#111827] text-[#F3F4F6] text-[4.5px] font-sans">
                <div className="flex justify-between items-center border-b border-[#374151] pb-0.5 bg-[#111827] px-0.5">
                  <span className="font-extrabold text-[4px] text-white">💪 PULSE</span>
                  <span className="text-[3px] bg-[#EF4444] text-white px-0.5 rounded font-bold uppercase scale-90">JOIN</span>
                </div>
                <div className="text-center py-0.5 bg-[#1F2937] border border-[#374151] rounded-sm my-0.5">
                  <p className="text-[5px] font-bold text-white">Iron Pulse</p>
                  <p className="text-[3px] text-[#F59E0B]">Open 24/7</p>
                </div>
                <div className="mt-auto bg-[#EF4444] text-white text-center py-0.5 rounded-sm"><span className="text-[3px] font-bold uppercase">JOIN</span></div>
              </div>
            ) : legacy === 't8' ? (
              <div className="h-full p-1 pt-3 flex flex-col gap-1 bg-[#111111] text-[#C9A86A] text-[4.5px] font-sans">
                <div className="flex justify-between items-center border-b border-white/5 pb-0.5 bg-[#111111] px-0.5">
                  <span className="font-extrabold text-[4px] text-white">🏡 AURA</span>
                  <span className="text-[3px] bg-[#C9A86A] text-[#111111] px-0.5 rounded font-bold uppercase scale-90">EST</span>
                </div>
                <div className="text-center py-0.5 bg-[#1E1E1E] border border-white/5 rounded-sm my-0.5">
                  <p className="text-[5px] font-extrabold text-[#C9A86A] font-serif">Aura</p>
                  <p className="text-[3px] text-white/60">Luxury</p>
                </div>
                <div className="mt-auto bg-[#C9A86A] text-[#111111] text-center py-0.5 rounded-sm"><span className="text-[3px] font-bold uppercase">CALL</span></div>
              </div>
            ) : niche === 'Barber' ? (
              <img src="/barber_mobile_preview.png" alt="Mobile Preview" className="w-full h-full object-cover object-top opacity-95" />
            ) : (
              <div className="h-full p-1 pt-3 flex flex-col gap-1 bg-gradient-to-b from-[#111110] to-[#050505] text-white text-[4.5px]">
                <div className="flex justify-between items-center border-b border-white/5 pb-0.5">
                  <span className="font-bold text-[4px]">{getNicheEmoji(niche)}</span>
                  <span className="text-[3.5px] bg-accent text-white px-0.5 rounded-xs font-bold uppercase scale-90 leading-none">BOOK</span>
                </div>
                <div className="text-center py-0.5 bg-white/[0.02] rounded-xs my-0.5">
                  <p className="text-[5px] font-serif font-medium leading-tight line-clamp-2">{content.heroTitle}</p>
                </div>
                <div className="flex flex-col gap-0.5 mt-auto">
                  {content.services.slice(0, 2).map((svc, idx) => (
                    <div key={idx} className="bg-white/5 rounded-xs px-0.5 py-0.5 border border-white/5 flex items-center justify-between">
                      <span className="truncate text-white/80 max-w-[55%]">{svc.name}</span>
                      <span className="text-accent font-mono font-bold text-[4px]">{svc.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hover action buttons */}
        {showActions && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-ink/30 transition-all duration-300 z-10">
            {onPreview && (
              <button
                onClick={(e) => { e.stopPropagation(); onPreview(); }}
                className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer"
                title="Preview template"
              >
                <Eye className="w-4 h-4 text-ink" />
              </button>
            )}
            {onFullPage && (
              <a
                href={previewUrl(id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                title="Open full page"
              >
                <ExternalLink className="w-4 h-4 text-ink" />
              </a>
            )}
          </div>
        )}

        {/* Badge */}
        {isMostUsed ? (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500 text-white text-[8px] uppercase font-bold tracking-widest rounded-full z-[4] shadow-md scale-90">
            ★ MOST POPULAR
          </div>
        ) : (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-ink/65 backdrop-blur-xs text-white text-[8px] uppercase font-semibold tracking-wider rounded-full z-[4] shadow-md scale-90 border border-white/10">
            {badge ?? 'MULTI-DEVICE'}
          </div>
        )}

        {/* Selected checkmark */}
        {selected && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center shadow-md z-[5]">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {/* ── Card footer ─────────────────────────────────────────── */}
      <div className="p-3 space-y-0.5 bg-white">
        <p className="text-xs font-semibold text-ink">{cardLabel}</p>
        <p className="text-[10px] text-ink-secondary capitalize">{sub}</p>
      </div>
    </div>
  );
};
