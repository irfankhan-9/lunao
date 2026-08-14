/**
 * TemplatePreviewModal — Shows real website preview with clean mobile toggle
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Smartphone, Monitor, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Template } from '../types';
import { playSoftTap, playElegantBell } from '../utils/audio';

interface TemplatePreviewModalProps {
  template: Template | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect?: () => void;
}

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  isOpen,
  onClose,
  onSelect,
}) => {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (isOpen) {
      setViewMode('desktop');
      setIsLoading(true);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleDesktopClick = () => {
    playSoftTap();
    setViewMode('desktop');
  };

  const handleMobileClick = () => {
    playSoftTap();
    setViewMode('mobile');
  };

  const handleSelectTemplate = () => {
    playElegantBell();
    onSelect?.();
    onClose();
  };

  if (!isOpen || !template) return null;

  const getTemplateLabel = (niche: string) => {
    const labels: Record<string, string> = {
      'Barber': 'Barbershop', 'Salon': 'Hair Salon', 'Dentist': 'Dental',
      'HVAC': 'Climate Control', 'Gym': 'Fitness', 'Roofing': 'Roofing', 'Real Estate': 'Real Estate',
    };
    return labels[niche] || niche;
  };

  const getTemplateUrl = (id: string) => {
    const urls: Record<string, string> = {
      t1: '/barber-template.html', t2: '/barber-template-02.html', t3: '/salon-template-01.html',
      t4: '/dentist-template-01.html', t5: '/roofing-template-01.html', t6: '/hvac-template-01.html',
      t7: '/gym-template-01.html', t8: '/realestate-template-01.html',
    };
    return urls[id] || '/barber-template.html';
  };

  const templateUrl = getTemplateUrl(template.id);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-3">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full h-full max-w-5xl rounded-xl overflow-hidden bg-white shadow-2xl flex flex-col animate-modal-slide-up"
        style={{ maxHeight: 'calc(100vh - 16px)' }}>
        
        {/* Header */}
        <div className="flex-none bg-white px-3 sm:px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Monitor className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{template.name}</h2>
                <p className="text-[10px] sm:text-xs text-gray-500">{getTemplateLabel(template.niche)}</p>
              </div>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg flex-none">
              <button
                onClick={handleDesktopClick}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all ${
                  viewMode === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Monitor className="w-3 h-3" />
                <span className="hidden sm:inline">Desktop</span>
              </button>
              <button
                onClick={handleMobileClick}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all ${
                  viewMode === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span className="hidden sm:inline">Mobile</span>
              </button>
            </div>

            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden bg-gray-50 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          )}
          
          <div className="w-full h-full flex items-center justify-center p-2 sm:p-3">
            {viewMode === 'desktop' ? (
              <div className="relative w-full h-full flex flex-col max-w-4xl mx-auto">
                <div className="h-8 bg-gray-100 flex items-center px-3 gap-2 border-b border-gray-200 rounded-t-lg shrink-0">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-2">
                    <div className="max-w-xs mx-auto h-5 bg-white rounded border border-gray-200 flex items-center justify-center">
                      <span className="text-[8px] text-gray-400 font-mono truncate px-2">{templateUrl}</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 border-2 border-gray-200 border-t-0 rounded-b-lg overflow-hidden bg-white">
                  <iframe ref={iframeRef} src={templateUrl} className="w-full h-full" onLoad={() => setIsLoading(false)} title="Preview" sandbox="allow-same-origin allow-scripts allow-forms" />
                </div>
              </div>
            ) : (
              /* Mobile Preview - Compact phone */
              <div className="relative">
                <div className="relative w-[180px] h-[360px] sm:w-[220px] sm:h-[440px] bg-gray-900 rounded-[1.5rem] sm:rounded-[2rem] p-1 shadow-xl border border-gray-800">
                  {/* Notch */}
                  <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 w-14 h-3 sm:w-16 sm:h-4 bg-gray-900 rounded-b-lg z-20" />

                  {/* Screen */}
                  <div className="relative w-full h-full bg-white rounded-[1.25rem] sm:rounded-[1.5rem] overflow-hidden border-[2px] border-gray-900">
                    {/* Status Bar */}
                    <div className="h-6 sm:h-7 bg-black/5 flex items-center justify-between px-3 text-[8px] sm:text-[9px] font-medium text-gray-800">
                      <span className="font-medium">9:41</span>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">LTE</span>
                        <span className="font-medium">100%</span>
                      </div>
                    </div>

                    {/* Site iframe - properly scaled */}
                    <div className="h-[calc(100%-24px)] sm:h-[calc(100%-28px)] overflow-hidden bg-white">
                      <iframe
                        ref={iframeRef}
                        src={templateUrl}
                        className="w-full h-full"
                        style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '286%', height: '286%' }}
                        onLoad={() => setIsLoading(false)}
                        title="Preview Mobile"
                        sandbox="allow-same-origin allow-scripts allow-forms"
                      />
                    </div>

                    {/* Home indicator */}
                    <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-16 sm:w-20 h-0.5 bg-gray-400 rounded-full" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none bg-white px-3 sm:px-4 py-3 border-t border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-600">Live preview</span>
              <a href={templateUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-medium rounded-lg transition-all">
                <ExternalLink className="w-3 h-3" />
                <span>Full Site</span>
              </a>
            </div>
            <button onClick={handleSelectTemplate}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all">
              Use Template
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modal-slide-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-modal-slide-up { animation: modal-slide-up 0.2s ease-out; }
      `}</style>
    </div>
  );
};

export default TemplatePreviewModal;
