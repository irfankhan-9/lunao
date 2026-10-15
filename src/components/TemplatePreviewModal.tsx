/**
 * TemplatePreviewModal — Clean White / Blue / Green Website Preview Modal
 * Features:
 *   - Instant Fullscreen Toggle (fills entire screen)
 *   - Authentic Smartphone Mockup (Dynamic Island, status bar, responsive mobile viewport)
 *   - Desktop Browser Chrome (URL bar, SSL lock, traffic lights, refresh)
 *   - Direct External Tab Link to live demo
 *   - White, Green, and Blue brand-consistent theme
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X, Smartphone, Monitor, CheckCircle2, ExternalLink, Loader2,
  Maximize2, Minimize2, RefreshCw, Lock, Check, Globe
} from 'lucide-react';
import { Template } from '../types';
import { playSoftTap, playConfirmSuccess, playSlideTick, playCancelTone } from '../utils/audio';

export interface TemplatePreviewModalProps {
  template: Template | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect?: () => void;
  initialFullscreen?: boolean;
  initialMode?: 'desktop' | 'mobile';
}

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  isOpen,
  onClose,
  onSelect,
  initialFullscreen = false,
  initialMode = 'desktop',
}) => {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (isOpen) {
      setViewMode(initialMode);
      setIsFullscreen(initialFullscreen);
      setIsLoading(true);
      setIframeKey((prev) => prev + 1);
    }
  }, [isOpen, initialFullscreen, initialMode]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          playSlideTick();
          setIsFullscreen(false);
        } else {
          playCancelTone();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, isFullscreen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleDesktopClick = () => {
    playSoftTap();
    setViewMode('desktop');
  };

  const handleMobileClick = () => {
    playSoftTap();
    setViewMode('mobile');
  };

  const handleToggleFullscreen = () => {
    playSlideTick();
    setIsFullscreen((prev) => !prev);
  };

  const handleReload = () => {
    playSoftTap();
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handleSelectTemplate = () => {
    playConfirmSuccess();
    onSelect?.();
    onClose();
  };

  const handleClose = () => {
    playCancelTone();
    onClose();
  };

  if (!isOpen || !template) return null;

  const getTemplateUrl = (id: string, niche?: string, templateFile?: string) => {
    if (templateFile && templateFile.endsWith('.html')) {
      return `/${templateFile}`;
    }
    const urls: Record<string, string> = {
      t1: '/barber-template.html',
      t2: '/barber-template-02.html',
      t3: '/salon-template-01.html',
      t4: '/dentist-template-01.html',
      t5: '/roofing-template-01.html',
      t6: '/hvac-template-01.html',
      t7: '/gym-template-01.html',
      t8: '/realestate-template-01.html',
      'barber-dark-luxury': '/barber-template.html',
      'barber-editorial-02': '/barber-template-02.html',
      'barber-editorial': '/barber-template-02.html',
      'salon-atelier-01': '/salon-template-01.html',
      'salon-maison': '/salon-template-01.html',
      'dentist-clinical-01': '/dentist-template-01.html',
      'dentist-clarity': '/dentist-template-01.html',
      'roofing-shield-01': '/roofing-template-01.html',
      'roofing-ironclad': '/roofing-template-01.html',
      'hvac-everest-01': '/hvac-template-01.html',
      'hvac-everest': '/hvac-template-01.html',
      'hvac-bespoke-01': '/hvac-template-02.html',
      'hvac-bespoke': '/hvac-template-02.html',
      'hvac-template-02': '/hvac-template-02.html',
      'hvac-template': '/hvac-template-02.html',
      t9: '/hvac-template-02.html',
      'gym-steel-01': '/gym-template-01.html',
      'gym-iron-grit': '/gym-template-01.html',
      'realestate-apex-01': '/realestate-template-01.html',
      'realestate-glass': '/realestate-template-01.html',
    };
    if (urls[id]) return urls[id];

    // Check custom template by ID or route to unified backend preview
    return `/api/templates/${encodeURIComponent(id)}/preview`;
  };

  const templateUrl = getTemplateUrl(template.id, template.niche, template.templateFile);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-200 ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4 md:p-6'
      }`}
    >
      {/* Light Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/* Main Modal Container */}
      <div
        className={`relative w-full h-full bg-white text-slate-900 flex flex-col shadow-2xl border border-slate-200 transition-all duration-200 overflow-hidden ${
          isFullscreen
            ? 'rounded-none max-w-none max-h-none'
            : 'max-w-6xl max-h-[94vh] rounded-2xl'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex-none bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          {/* Left: Template info & Live badge */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-600 shadow-xs">
              <Globe className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-serif font-bold text-slate-900 truncate">
                  {template.name}
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Preview
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {template.niche} · Responsive layout
              </p>
            </div>
          </div>

          {/* Center: Device Switcher (Desktop vs Mobile) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl shrink-0">
            <button
              type="button"
              onClick={handleDesktopClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'desktop'
                  ? 'bg-white text-blue-600 shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Desktop</span>
            </button>
            <button
              type="button"
              onClick={handleMobileClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'mobile'
                  ? 'bg-white text-blue-600 shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Mobile (Phone)</span>
            </button>
          </div>

          {/* Right: Fullscreen Toggle, External Link & Close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              title={isFullscreen ? 'Exit Full Screen' : 'View Full Screen'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isFullscreen
                  ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold'
                  : 'bg-white border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-200'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline text-[11px]">Exit Full</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline text-[11px]">Full Screen</span>
                </>
              )}
            </button>

            {/* External Tab Link */}
            <a
              href={templateUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSoftTap()}
              title="Open full site in new browser tab"
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-200 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="text-[11px]">New Tab</span>
            </a>

            {/* Close */}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
              title="Close preview (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Browser Chrome Subheader for Desktop Mode */}
        {viewMode === 'desktop' && (
          <div className="flex-none bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
            {/* Traffic lights */}
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>

            {/* Simulated Clean Address Bar */}
            <div className="flex-1 max-w-md mx-3">
              <div className="h-6 bg-white border border-slate-200 rounded-lg px-2.5 flex items-center gap-1.5 text-[11px] font-mono text-slate-700 shadow-xs">
                <Lock className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="text-slate-400">https://</span>
                <span className="text-slate-800 truncate">{template.niche.toLowerCase()}-preview.lunao.app</span>
                <span className="ml-auto text-[9px] text-emerald-600 font-sans font-bold uppercase">Live</span>
              </div>
            </div>

            {/* Reload button */}
            <button
              type="button"
              onClick={handleReload}
              className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
              title="Reload preview"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        )}

        {/* Mobile View Subheader */}
        {viewMode === 'mobile' && (
          <div className="flex-none bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
            <div className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-semibold text-slate-800">Mobile Smartphone View</span>
            </div>
            <div className="flex items-center gap-3 text-slate-500">
              <span className="hidden sm:inline">Scroll inside the device to test touch elements and booking flow</span>
              <button
                type="button"
                onClick={handleReload}
                className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                title="Reload preview"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {/* Preview Viewport Body */}
        <div className="flex-1 overflow-hidden bg-slate-100/60 relative flex items-center justify-center p-0">
          {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs gap-2">
              <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-600">
                Loading {template.name}…
              </p>
            </div>
          )}

          {viewMode === 'desktop' ? (
            /* Desktop Mode: Fluid 100% responsive iframe */
            <div className="w-full h-full bg-white relative">
              <iframe
                key={`desktop-${iframeKey}-${templateUrl}`}
                ref={iframeRef}
                src={!template.previewHtml ? templateUrl : undefined}
                srcDoc={template.previewHtml || undefined}
                className="w-full h-full border-0"
                onLoad={() => setIsLoading(false)}
                title={`Desktop Preview — ${template.name}`}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
            </div>
          ) : (
            /* Mobile Mode: Clean modern smartphone frame */
            <div className="w-full h-full overflow-y-auto flex items-center justify-center p-4 sm:p-6 bg-slate-100">
              <div className="relative my-auto">
                {/* Phone Chassis */}
                <div className="relative w-[340px] sm:w-[380px] h-[670px] sm:h-[760px] max-h-[calc(100vh-190px)] bg-slate-900 rounded-[2.8rem] p-2.5 shadow-2xl border-4 border-slate-800 flex flex-col overflow-hidden">
                  {/* Dynamic Island Notch */}
                  <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-30 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800 mr-2" />
                    <div className="w-2 h-2 rounded-full bg-blue-950" />
                  </div>

                  {/* Inner Phone Screen */}
                  <div className="relative w-full h-full bg-white rounded-[2.2rem] overflow-hidden flex flex-col">
                    {/* Status Bar */}
                    <div className="h-8 bg-black text-white flex items-center justify-between px-6 text-[10px] font-semibold shrink-0 z-20 select-none">
                      <span>9:41</span>
                      <div className="flex items-center gap-1 text-slate-300">
                        <span className="text-[9px]">5G</span>
                        <div className="w-4 h-2 border border-white/60 rounded-xs p-0.5 flex items-center">
                          <div className="h-full w-full bg-emerald-400 rounded-xs" />
                        </div>
                      </div>
                    </div>

                    {/* Iframe */}
                    <div className="flex-1 w-full h-full overflow-hidden bg-white relative">
                      <iframe
                        key={`mobile-${iframeKey}-${templateUrl}`}
                        src={!template.previewHtml ? templateUrl : undefined}
                        srcDoc={template.previewHtml || undefined}
                        className="w-full h-full border-0"
                        onLoad={() => setIsLoading(false)}
                        title={`Mobile Preview — ${template.name}`}
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                      />
                    </div>

                    {/* iOS Home Indicator Bar */}
                    <div className="h-3.5 bg-white flex items-center justify-center shrink-0 z-20">
                      <div className="w-24 h-1 bg-slate-300 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="flex-none bg-white px-4 py-3 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">
              Ready to deploy with your campaign
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{isFullscreen ? 'Windowed' : 'Full Screen'}</span>
            </button>

            {onSelect && (
              <button
                type="button"
                onClick={handleSelectTemplate}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Use This Template</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplatePreviewModal;
