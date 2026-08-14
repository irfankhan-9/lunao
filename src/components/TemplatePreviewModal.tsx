/**
 * TemplatePreviewModal — Premium brand-consistent preview modal for Email Campaign Wizard
 * Uses exact brand colors, fonts, and styling from the Lunao design system
 */

import React, { useState, useEffect } from 'react';
import { X, Smartphone, Monitor, ChevronLeft, ChevronRight, CheckCircle2, ExternalLink, Sparkles } from 'lucide-react';
import { Template } from '../types';

interface TemplatePreviewModalProps {
  template: Template | null;
  isOpen: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  isOpen,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}) => {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  // Handle escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev && isOpen) onPrev?.();
      if (e.key === 'ArrowRight' && hasNext && isOpen) onNext?.();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, onPrev, onNext, hasPrev, hasNext, isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !template) return null;

  // Get niche emoji
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

  // Sample preview data - brand consistent
  const preview = {
    name: 'Vintage Cuts',
    city: 'Austin, TX',
    phone: '(512) 555-0988',
    tagline: 'Premium Haircuts & Grooming',
    rating: 4.9,
    reviews: 342,
    address: '123 Main Street',
    hours: 'Mon-Sat 9am-7pm',
    services: [
      { name: 'Classic Cut', price: '$35' },
      { name: 'Skin Fade', price: '$45' },
      { name: 'Beard Trim', price: '$25' },
      { name: 'Hot Shave', price: '$30' },
    ],
  };

  const getTemplateUrl = (id: string) => {
    const urls: Record<string, string> = {
      t2: '/barber-template-02.html',
      t3: '/salon-template-01.html',
      t4: '/dentist-template-01.html',
      t5: '/roofing-template-01.html',
      t6: '/hvac-template-01.html',
      t7: '/gym-template-01.html',
      t8: '/realestate-template-01.html',
    };
    return urls[id] || '/barber-template.html';
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/85 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container - Brand Consistent */}
      <div className="relative w-full h-full max-w-5xl rounded-2xl overflow-hidden bg-white shadow-2xl flex flex-col animate-modal-slide-up"
        style={{ maxHeight: 'calc(100vh - 32px)' }}>
        
        {/* Header - Brand styled */}
        <div className="flex-none bg-gradient-to-r from-ink to-ink/95 px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Template info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-2xl sm:text-3xl flex-none">{getNicheEmoji(template.niche)}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-base sm:text-lg font-bold text-white truncate">{template.name}</h2>
                <p className="text-[10px] sm:text-xs text-white/60 capitalize">{template.niche} Template</p>
              </div>
              {template.isMostUsed && (
                <span className="hidden sm:inline-flex px-2.5 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider rounded-full border border-amber-500/30 flex-none">
                  ★ Popular
                </span>
              )}
            </div>

            {/* Center: View toggle - Brand styled */}
            <div className="flex items-center gap-1 p-1 bg-white/10 rounded-xl flex-none">
              <button
                onClick={() => setViewMode('desktop')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'desktop'
                    ? 'bg-white text-ink shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span className="hidden sm:inline">Desktop</span>
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'mobile'
                    ? 'bg-white text-ink shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span className="hidden sm:inline">Mobile</span>
              </button>
            </div>

            {/* Right: Navigation + Close - Brand styled */}
            <div className="flex items-center gap-2 flex-none">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className={`p-2 rounded-lg transition-all ${
                  hasPrev
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={onNext}
                disabled={!hasNext}
                className={`p-2 rounded-lg transition-all ${
                  hasNext
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 bg-danger/20 hover:bg-danger text-white rounded-lg transition-all ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Preview Content - Scrollable */}
        <div className="flex-1 overflow-auto bg-gradient-to-br from-surface via-white to-off-white">
          <div className="w-full h-full flex items-center justify-center p-4 sm:p-6 md:p-8">
            {viewMode === 'desktop' ? (
              /* Desktop Preview - Brand Styled */
              <div className="relative w-full max-w-4xl h-full">
                <div className="absolute inset-0 flex flex-col bg-white rounded-xl shadow-2xl border border-border-main overflow-hidden h-full">
                  {/* Browser header - Brand styled */}
                  <div className="h-9 sm:h-10 bg-gradient-to-r from-surface via-off-white to-surface flex items-center px-3 sm:px-4 gap-2 sm:gap-3 border-b border-border-light shrink-0">
                    <div className="flex gap-1.5 sm:gap-2">
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-danger/80" />
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-400/80" />
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-success/80" />
                    </div>
                    <div className="flex-1 mx-2 sm:mx-4">
                      <div className="max-w-xs sm:max-w-md mx-auto h-5 sm:h-6 bg-surface rounded flex items-center justify-center">
                        <span className="text-[9px] sm:text-[10px] text-ink-tertiary font-mono">preview.lunao.dev</span>
                      </div>
                    </div>
                  </div>

                  {/* Website Content - Brand styled */}
                  <div className="flex-1 overflow-auto bg-white">
                    {/* Hero Section */}
                    <div className="relative min-h-[200px] sm:min-h-[280px] bg-gradient-to-br from-ink via-ink to-ink/90 flex items-center">
                      <div className="absolute inset-0 opacity-20">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(99,102,241,0.3),transparent_50%)]" />
                      </div>
                      <div className="relative container mx-auto px-4 sm:px-8 py-8 sm:py-12">
                        <div className="max-w-2xl">
                          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                            <span className="text-3xl sm:text-4xl">{getNicheEmoji(template.niche)}</span>
                            <div>
                              <h1 className="text-2xl sm:text-4xl font-serif font-bold text-white tracking-tight">{preview.name}</h1>
                              <p className="text-white/60 text-xs sm:text-sm mt-1">{preview.tagline} · {preview.city}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-4 sm:mt-6">
                            <div className="flex items-center gap-1.5 sm:gap-2 bg-white/10 backdrop-blur-sm px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full">
                              <span className="text-yellow-400 text-sm">★</span>
                              <span className="text-white font-bold text-sm">{preview.rating}</span>
                              <span className="text-white/60 text-xs">({preview.reviews})</span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 bg-white/10 backdrop-blur-sm px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-white text-xs sm:text-sm">
                              <span>📍</span>
                              <span>{preview.address}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-4 sm:mt-8">
                            <button className="px-4 sm:px-6 py-2 sm:py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-lg sm:rounded-xl transition-all shadow-lg shadow-accent/30 text-sm">
                              Book Now
                            </button>
                            <button className="px-4 sm:px-6 py-2 sm:py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg sm:rounded-xl backdrop-blur-sm transition-all text-sm">
                              Call Us
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Services Section */}
                    <div className="container mx-auto px-4 sm:px-8 py-6 sm:py-12">
                      <h2 className="text-xl sm:text-2xl font-serif font-bold text-ink mb-4 sm:mb-8">Our Services</h2>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        {preview.services.map((svc, idx) => (
                          <div
                            key={idx}
                            className="group p-3 sm:p-4 bg-surface hover:bg-accent-soft/30 rounded-xl border border-border-light hover:border-accent/30 transition-all cursor-pointer"
                          >
                            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                              <span className="font-semibold text-ink group-hover:text-accent transition-colors text-sm">{svc.name}</span>
                            </div>
                            <span className="text-xl sm:text-2xl font-bold text-accent">{svc.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CTA Section */}
                    <div className="container mx-auto px-4 sm:px-8 py-6 sm:py-12">
                      <div className="bg-gradient-to-r from-accent via-accent-hover to-accent rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                        <h3 className="text-xl sm:text-2xl font-serif font-bold text-white mb-1 sm:mb-2">Ready to Transform Your Look?</h3>
                        <p className="text-white/80 mb-4 sm:mb-6 text-sm">Book your appointment today and experience the difference.</p>
                        <button className="px-6 sm:px-8 py-2.5 sm:py-3 bg-white text-accent font-bold rounded-lg sm:rounded-xl hover:bg-white/90 transition-all shadow-lg text-sm">
                          Book Appointment
                        </button>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-surface py-4 sm:py-6">
                      <div className="container mx-auto px-4 sm:px-8 text-center text-ink-secondary text-xs sm:text-sm">
                        <p>{preview.name} · {preview.address}, {preview.city}</p>
                        <p className="mt-1">{preview.phone} · {preview.hours}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -bottom-3 sm:-bottom-4 left-1/2 transform -translate-x-1/2 px-3 sm:px-4 py-1.5 sm:py-2 bg-accent text-white text-[10px] sm:text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5 sm:gap-2">
                  <Monitor className="w-3 h-3 sm:w-4 sm:h-4" />
                  Desktop Preview
                </div>
              </div>
            ) : (
              /* Mobile Preview - Brand Styled */
              <div className="relative">
                <div className="relative w-[280px] sm:w-[320px] h-[560px] sm:h-[650px] bg-ink rounded-[2.5rem] sm:rounded-[3rem] p-2 sm:p-3 shadow-2xl border border-zinc-700">
                  {/* Phone notch */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-28 sm:w-32 h-6 sm:h-7 bg-ink rounded-b-2xl z-20" />
                  <div className="absolute top-1 sm:top-1.5 left-1/2 transform -translate-x-1/2 w-14 sm:w-16 h-1 bg-zinc-800 rounded-full z-20" />

                  {/* Screen */}
                  <div className="relative w-full h-full bg-white rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden">
                    {/* Status Bar */}
                    <div className="h-10 sm:h-11 bg-surface/80 backdrop-blur-sm flex items-center justify-between px-4 sm:px-6 text-[9px] sm:text-[10px] font-semibold text-ink">
                      <span>9:41</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] sm:text-[8px]">📶</span>
                        <span className="text-[7px] sm:text-[8px]">🔋</span>
                      </div>
                    </div>

                    {/* Mobile Content */}
                    <div className="h-[calc(100%-40px)] sm:h-[calc(100%-44px)] overflow-y-auto">
                      {/* Hero */}
                      <div className="relative min-h-[180px] sm:min-h-[220px] bg-gradient-to-br from-ink to-ink/90 flex items-end">
                        <div className="absolute inset-0 opacity-30">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.4),transparent_60%)]" />
                        </div>
                        <div className="relative p-4 sm:p-5 pb-4 sm:pb-6 w-full">
                          <span className="text-2xl sm:text-3xl">{getNicheEmoji(template.niche)}</span>
                          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white mt-1.5 sm:mt-2 leading-tight">{preview.name}</h1>
                          <p className="text-white/60 text-[10px] sm:text-xs mt-1">{preview.tagline}</p>
                          <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                            <span className="text-yellow-400 text-xs sm:text-sm">★</span>
                            <span className="text-white font-bold text-xs sm:text-sm">{preview.rating}</span>
                            <span className="text-white/60 text-[10px] sm:text-xs">({preview.reviews})</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="px-3 sm:px-4 -mt-5 sm:-mt-6 relative z-10 flex gap-2 sm:gap-3">
                        <button className="flex-1 py-2.5 sm:py-3 bg-accent text-white font-bold rounded-lg sm:rounded-xl shadow-lg text-xs sm:text-sm">
                          Book Now
                        </button>
                        <button className="px-3 sm:px-4 py-2.5 sm:py-3 bg-white border border-border-main text-ink font-semibold rounded-lg sm:rounded-xl text-xs sm:text-sm">
                          Call
                        </button>
                      </div>

                      {/* Info */}
                      <div className="px-3 sm:px-4 mt-3 sm:mt-4 space-y-2 sm:space-y-3">
                        <div className="p-2.5 sm:p-3 bg-surface rounded-lg sm:rounded-xl">
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-ink-secondary">
                            <span>📍</span>
                            <span>{preview.address}, {preview.city}</span>
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-ink-secondary mt-1.5 sm:mt-2">
                            <span>📞</span>
                            <span>{preview.phone}</span>
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-ink-secondary mt-1.5 sm:mt-2">
                            <span>🕐</span>
                            <span>{preview.hours}</span>
                          </div>
                        </div>

                        {/* Services */}
                        <div className="p-3 sm:p-4 bg-surface rounded-lg sm:rounded-xl">
                          <h3 className="text-xs sm:text-sm font-bold text-ink mb-2 sm:mb-3">Services</h3>
                          <div className="space-y-1.5 sm:space-y-2">
                            {preview.services.map((svc, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 sm:p-3 bg-white rounded-lg border border-border-light"
                              >
                                <span className="font-medium text-ink text-[11px] sm:text-sm">{svc.name}</span>
                                <span className="font-bold text-accent text-xs sm:text-sm">{svc.price}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="p-3 sm:p-4 mt-3 sm:mt-4">
                        <button className="w-full py-3 sm:py-4 bg-gradient-to-r from-accent to-accent-hover text-white font-bold rounded-xl shadow-lg text-xs sm:text-sm">
                          Book Appointment Now
                        </button>
                      </div>

                      <div className="h-6 sm:h-8" />
                    </div>

                    {/* Home indicator */}
                    <div className="absolute bottom-0.5 sm:bottom-1 left-1/2 transform -translate-x-1/2 w-28 sm:w-32 h-0.5 sm:h-1 bg-ink/20 rounded-full" />
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -bottom-3 sm:-bottom-4 left-1/2 transform -translate-x-1/2 px-3 sm:px-4 py-1.5 sm:py-2 bg-accent text-white text-[10px] sm:text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5 sm:gap-2">
                  <Smartphone className="w-3 h-3 sm:w-4 sm:h-4" />
                  Mobile Preview
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Brand styled */}
        <div className="flex-none bg-gradient-to-r from-ink to-ink/95 px-4 sm:px-6 py-4 sm:py-5 border-t border-white/10">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Status + Full page link */}
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-success flex-none" />
              <span className="text-xs font-semibold text-white/80 hidden sm:inline">
                Template ready for campaign
              </span>
              <a
                href={getTemplateUrl(template.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[10px] sm:text-xs font-semibold rounded-lg transition-all border border-white/10 hover:border-white/20"
              >
                <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-none" />
                <span className="hidden sm:inline">Open Full Page</span>
                <span className="sm:hidden">Full Page</span>
              </a>
            </div>

            {/* Right: Select button - Brand styled */}
            <button
              onClick={onClose}
              className="px-4 sm:px-6 py-2 sm:py-2.5 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-all shadow-lg shadow-accent/30 flex items-center gap-2 text-sm"
            >
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Select Template</span>
              <span className="sm:hidden">Select</span>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modal-slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-modal-slide-up {
          animation: modal-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
};

export default TemplatePreviewModal;
