/**
 * TemplatePreviewModal — Shows real website preview with clean mobile toggle
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Smartphone, Monitor, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Template } from '../types';

interface TemplatePreviewModalProps {
  template: Template | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  isOpen,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset to desktop when modal opens
  useEffect(() => {
    if (isOpen) {
      setViewMode('desktop');
      setIsLoading(true);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

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

  // Get template type for display
  const getTemplateLabel = (niche: string) => {
    const labels: Record<string, string> = {
      'Barber': 'Barbershop',
      'Salon': 'Hair Salon',
      'Dentist': 'Dental',
      'HVAC': 'Climate Control',
      'Gym': 'Fitness',
      'Roofing': 'Roofing',
      'Real Estate': 'Real Estate',
    };
    return labels[niche] || niche;
  };

  // Get REAL site URL for this template
  const getTemplateUrl = (id: string) => {
    const urls: Record<string, string> = {
      t1: '/barber-template.html',
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

  const templateUrl = getTemplateUrl(template.id);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-3 md:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-blue-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full h-full max-w-6xl rounded-2xl overflow-hidden bg-white shadow-2xl flex flex-col animate-modal-slide-up border border-blue-200"
        style={{ maxHeight: 'calc(100vh - 16px)' }}>
        
        {/* Header */}
        <div className="flex-none bg-white px-4 sm:px-6 py-4 border-b border-blue-100">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Template info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Monitor className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-base sm:text-lg font-bold text-blue-900 truncate">{template.name}</h2>
                <p className="text-xs text-blue-600">{getTemplateLabel(template.niche)} Website</p>
              </div>
            </div>

            {/* Center: View toggle */}
            <div className="flex items-center gap-1 p-1 bg-blue-50 rounded-xl flex-none">
              <button
                onClick={() => setViewMode('desktop')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'desktop'
                    ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                    : 'text-blue-600 hover:text-blue-800 hover:bg-white'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span className="hidden sm:inline">Desktop</span>
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'mobile'
                    ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                    : 'text-blue-600 hover:text-blue-800 hover:bg-white'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span className="hidden sm:inline">Mobile</span>
              </button>
            </div>

            {/* Right: Close button */}
            <button
              onClick={onClose}
              className="p-2 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-600 rounded-lg transition-all border border-red-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-600">Loading preview...</span>
              </div>
            </div>
          )}
          
          <div className="w-full h-full flex items-center justify-center p-3 sm:p-4 md:p-6">
            {viewMode === 'desktop' ? (
              /* Desktop Preview - REAL SITE */
              <div className="relative w-full h-full flex flex-col max-w-5xl mx-auto">
                {/* Browser Chrome */}
                <div className="h-9 bg-gradient-to-r from-blue-100 via-blue-50 to-blue-100 flex items-center px-4 gap-3 border-b border-blue-200 rounded-t-xl shrink-0">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1">
                    <div className="max-w-md mx-auto h-6 bg-white rounded-lg border border-blue-200 flex items-center justify-center">
                      <span className="text-[10px] text-blue-500 font-mono truncate px-3">{templateUrl}</span>
                    </div>
                  </div>
                </div>
                
                {/* REAL Site iframe */}
                <div className="flex-1 border-2 border-blue-200 border-t-0 rounded-b-xl overflow-hidden bg-white">
                  <iframe
                    ref={iframeRef}
                    src={templateUrl}
                    className="w-full h-full"
                    onLoad={() => setIsLoading(false)}
                    title="Template Preview"
                    sandbox="allow-same-origin allow-scripts allow-forms"
                  />
                </div>
              </div>
            ) : (
              /* Mobile Preview - Smaller, fits properly */
              <div className="relative">
                {/* Phone Frame - Smaller */}
                <div className="relative w-[260px] h-[520px] sm:w-[300px] sm:h-[600px] bg-gray-800 rounded-[2rem] sm:rounded-[2.5rem] p-1.5 shadow-2xl border border-gray-700">
                  {/* Notch */}
                  <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 w-20 h-4 sm:w-24 sm:h-5 bg-gray-800 rounded-b-lg z-20" />
                  <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-16 h-2 sm:w-20 sm:h-2.5 bg-gray-900 rounded-b-lg z-20" />

                  {/* Screen */}
                  <div className="relative w-full h-full bg-white rounded-[1.75rem] sm:rounded-[2rem] overflow-hidden border-[2px] border-gray-900">
                    {/* Status Bar */}
                    <div className="h-8 sm:h-9 bg-gray-100 flex items-center justify-between px-4 text-[9px] sm:text-[10px] font-medium text-gray-800">
                      <span>9:41</span>
                      <div className="flex items-center gap-0.5 text-[8px]">
                        <span>.....</span>
                        <span>📶</span>
                        <span>🔋</span>
                      </div>
                    </div>

                    {/* REAL Site iframe - PROPERLY SCALED */}
                    <div className="h-[calc(100%-32px)] sm:h-[calc(100%-36px)] overflow-hidden bg-white">
                      <iframe
                        ref={iframeRef}
                        src={templateUrl}
                        className="w-full h-full"
                        style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: '250%', height: '250%' }}
                        onLoad={() => setIsLoading(false)}
                        title="Template Preview Mobile"
                        sandbox="allow-same-origin allow-scripts allow-forms"
                      />
                    </div>

                    {/* Home indicator */}
                    <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-20 sm:w-24 h-0.5 bg-gray-400 rounded-full" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none bg-white px-4 sm:px-6 py-4 border-t border-blue-100">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Status + Full page link */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700">
                Live preview
              </span>
              <a
                href={templateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-all border border-blue-200"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View Full Site</span>
              </a>
            </div>

            {/* Right: Select button */}
            <button
              onClick={onClose}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/30 flex items-center gap-2 text-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Use This Template</span>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modal-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-modal-slide-up {
          animation: modal-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
};

export default TemplatePreviewModal;
