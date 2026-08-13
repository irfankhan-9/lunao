/**
 * TemplatePreviewModal — Stunning full-screen preview modal for Email Campaign Wizard
 * Features desktop/mobile preview toggle with smooth animations
 */

import React, { useState, useEffect } from 'react';
import { X, Maximize2, Smartphone, Monitor, ChevronLeft, ChevronRight, Sparkles, CheckCircle2 } from 'lucide-react';
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
  const [isAnimating, setIsAnimating] = useState(false);

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

  const handleViewToggle = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setViewMode(viewMode === 'desktop' ? 'mobile' : 'desktop');
      setIsAnimating(false);
    }, 150);
  };

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

  // Sample content for preview
  const previewContent = {
    businessName: 'Vintage Cuts',
    city: 'Austin, TX',
    phone: '(512) 555-0988',
    tagline: 'Premium Haircuts & Grooming',
    rating: 4.9,
    reviews: 342,
    services: [
      { name: 'Classic Cut', price: '$35' },
      { name: 'Skin Fade', price: '$45' },
      { name: 'Beard Trim', price: '$25' },
      { name: 'Hot Shave', price: '$30' },
    ],
    address: '123 Main Street',
    hours: 'Mon-Sat 9am-7pm',
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/80 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full h-full max-w-7xl mx-4 my-4 rounded-3xl overflow-hidden bg-white shadow-2xl animate-modal-slide-up">
        {/* Header Bar */}
        <div className="absolute top-0 left-0 right-0 z-20 h-16 bg-gradient-to-r from-ink/95 via-ink/90 to-ink/95 backdrop-blur-md border-b border-white/10">
          <div className="h-full px-6 flex items-center justify-between">
            {/* Left: Template info */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getNicheEmoji(template.niche)}</span>
                <div>
                  <h2 className="text-sm font-bold text-white">{template.name}</h2>
                  <p className="text-[11px] text-white/60">{template.niche} Template</p>
                </div>
              </div>
              {template.isMostUsed && (
                <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider rounded-full border border-amber-500/30">
                  ★ Most Popular
                </span>
              )}
            </div>

            {/* Center: View toggle */}
            <div className="flex items-center gap-2 p-1.5 bg-white/10 rounded-xl backdrop-blur-sm">
              <button
                onClick={() => setViewMode('desktop')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
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
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'mobile'
                    ? 'bg-white text-ink shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span className="hidden sm:inline">Mobile</span>
              </button>
            </div>

            {/* Right: Navigation + Close */}
            <div className="flex items-center gap-3">
              {/* Navigation arrows */}
              <div className="flex items-center gap-1">
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
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="p-2.5 bg-danger/20 hover:bg-danger text-white rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Preview Content Area */}
        <div className="absolute inset-0 top-16 bottom-16 bg-gradient-to-br from-surface via-white to-off-white overflow-hidden">
          {/* Animated transition wrapper */}
          <div
            className={`w-full h-full flex items-center justify-center p-8 transition-all duration-300 ${
              isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            {viewMode === 'desktop' ? (
              /* Desktop Preview */
              <div className="relative w-full max-w-5xl h-full">
                {/* Browser Chrome */}
                <div className="absolute inset-0 flex flex-col bg-white rounded-2xl shadow-2xl border border-border-main overflow-hidden">
                  {/* Browser header */}
                  <div className="h-10 bg-gradient-to-r from-surface via-off-white to-surface flex items-center px-4 gap-3 border-b border-border-light">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-danger/80" />
                      <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                      <div className="w-3 h-3 rounded-full bg-success/80" />
                    </div>
                    <div className="flex-1 mx-8">
                      <div className="max-w-md mx-auto h-6 bg-surface rounded-lg flex items-center justify-center">
                        <span className="text-[10px] text-ink-tertiary font-mono">preview.lunao.dev</span>
                      </div>
                    </div>
                  </div>

                  {/* Website Content */}
                  <div className="flex-1 overflow-auto bg-white">
                    {/* Hero Section */}
                    <div className="relative min-h-[280px] bg-gradient-to-br from-ink via-ink to-ink/90 flex items-center">
                      <div className="absolute inset-0 opacity-20">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(99,102,241,0.3),transparent_50%)]" />
                      </div>
                      <div className="relative container mx-auto px-8 py-12">
                        <div className="max-w-2xl">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-4xl">{getNicheEmoji(template.niche)}</span>
                            <div>
                              <h1 className="text-4xl font-serif font-bold text-white tracking-tight">{previewContent.businessName}</h1>
                              <p className="text-white/60 text-sm mt-1">{previewContent.tagline} · {previewContent.city}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-6">
                            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                              <span className="text-yellow-400">★</span>
                              <span className="text-white font-bold">{previewContent.rating}</span>
                              <span className="text-white/60 text-sm">({previewContent.reviews})</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm">
                              <span>📍</span>
                              <span>{previewContent.address}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-8">
                            <button className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-all shadow-lg shadow-accent/30">
                              Book Now
                            </button>
                            <button className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl backdrop-blur-sm transition-all">
                              Call Us
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Services Section */}
                    <div className="container mx-auto px-8 py-12">
                      <h2 className="text-2xl font-serif font-bold text-ink mb-8">Our Services</h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {previewContent.services.map((svc, idx) => (
                          <div
                            key={idx}
                            className="group p-4 bg-surface hover:bg-accent-soft/30 rounded-xl border border-border-light hover:border-accent/30 transition-all cursor-pointer"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-ink group-hover:text-accent transition-colors">{svc.name}</span>
                            </div>
                            <span className="text-2xl font-bold text-accent">{svc.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CTA Section */}
                    <div className="container mx-auto px-8 py-12">
                      <div className="bg-gradient-to-r from-accent via-accent-hover to-accent rounded-2xl p-8 text-center">
                        <h3 className="text-2xl font-serif font-bold text-white mb-2">Ready to Transform Your Look?</h3>
                        <p className="text-white/80 mb-6">Book your appointment today and experience the difference.</p>
                        <button className="px-8 py-3 bg-white text-accent font-bold rounded-xl hover:bg-white/90 transition-all shadow-lg">
                          Book Appointment
                        </button>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-surface py-6">
                      <div className="container mx-auto px-8 text-center text-ink-secondary text-sm">
                        <p>{previewContent.businessName} · {previewContent.address}, {previewContent.city}</p>
                        <p className="mt-1">{previewContent.phone} · {previewContent.hours}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating preview label */}
                <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-accent text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-2 animate-bounce-subtle">
                  <Monitor className="w-4 h-4" />
                  Desktop Preview
                </div>
              </div>
            ) : (
              /* Mobile Preview */
              <div className="relative">
                {/* Phone Frame */}
                <div className="relative w-[320px] h-[650px] bg-ink rounded-[3rem] p-3 shadow-2xl border border-zinc-700">
                  {/* Phone notch */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-7 bg-ink rounded-b-2xl z-20" />
                  <div className="absolute top-1.5 left-1/2 transform -translate-x-1/2 w-16 h-1 bg-zinc-800 rounded-full z-20" />

                  {/* Screen */}
                  <div className="relative w-full h-full bg-white rounded-[2.5rem] overflow-hidden">
                    {/* Mobile Status Bar */}
                    <div className="h-11 bg-surface/80 backdrop-blur-sm flex items-center justify-between px-6 text-[10px] font-semibold text-ink">
                      <span>9:41</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px]">📶</span>
                        <span className="text-[8px]">🔋</span>
                      </div>
                    </div>

                    {/* Mobile Content */}
                    <div className="h-[calc(100%-44px)] overflow-y-auto">
                      {/* Hero */}
                      <div className="relative min-h-[220px] bg-gradient-to-br from-ink to-ink/90 flex items-end">
                        <div className="absolute inset-0 opacity-30">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.4),transparent_60%)]" />
                        </div>
                        <div className="relative p-5 pb-6 w-full">
                          <span className="text-3xl">{getNicheEmoji(template.niche)}</span>
                          <h1 className="text-2xl font-serif font-bold text-white mt-2 leading-tight">{previewContent.businessName}</h1>
                          <p className="text-white/60 text-xs mt-1">{previewContent.tagline}</p>
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-yellow-400 text-sm">★</span>
                            <span className="text-white font-bold text-sm">{previewContent.rating}</span>
                            <span className="text-white/60 text-xs">({previewContent.reviews})</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="px-4 -mt-6 relative z-10 flex gap-3">
                        <button className="flex-1 py-3 bg-accent text-white font-bold rounded-xl shadow-lg text-sm">
                          Book Now
                        </button>
                        <button className="px-4 py-3 bg-white border border-border-main text-ink font-semibold rounded-xl text-sm">
                          Call
                        </button>
                      </div>

                      {/* Info */}
                      <div className="px-4 mt-4 space-y-3">
                        <div className="p-3 bg-surface rounded-xl">
                          <div className="flex items-center gap-2 text-xs text-ink-secondary">
                            <span>📍</span>
                            <span>{previewContent.address}, {previewContent.city}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-ink-secondary mt-2">
                            <span>📞</span>
                            <span>{previewContent.phone}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-ink-secondary mt-2">
                            <span>🕐</span>
                            <span>{previewContent.hours}</span>
                          </div>
                        </div>

                        {/* Services */}
                        <div className="p-4 bg-surface rounded-xl">
                          <h3 className="text-sm font-bold text-ink mb-3">Services</h3>
                          <div className="space-y-2">
                            {previewContent.services.map((svc, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 bg-white rounded-lg border border-border-light"
                              >
                                <span className="font-medium text-ink text-sm">{svc.name}</span>
                                <span className="font-bold text-accent">{svc.price}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Bottom CTA */}
                      <div className="p-4 mt-4">
                        <button className="w-full py-4 bg-gradient-to-r from-accent to-accent-hover text-white font-bold rounded-xl shadow-lg text-sm">
                          Book Appointment Now
                        </button>
                      </div>

                      {/* Bottom padding for home indicator */}
                      <div className="h-8" />
                    </div>

                    {/* Home indicator */}
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-ink/20 rounded-full" />
                  </div>
                </div>

                {/* Floating preview label */}
                <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-accent text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-2 animate-bounce-subtle">
                  <Smartphone className="w-4 h-4" />
                  Mobile Preview
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-r from-ink/95 via-ink/90 to-ink/95 backdrop-blur-md border-t border-white/10">
          <div className="h-full px-6 flex items-center justify-between">
            {/* Left: Template badge */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-xs font-semibold text-white/80">
                Template ready for campaign
              </span>
            </div>

            {/* Center: Tip */}
            <div className="hidden md:flex items-center gap-2 text-xs text-white/50">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Use arrow keys to navigate between templates
            </div>

            {/* Right: CTA */}
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-all shadow-lg shadow-accent/30 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Select Template
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modal-slide-up {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-4px); }
        }
        .animate-modal-slide-up {
          animation: modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default TemplatePreviewModal;
