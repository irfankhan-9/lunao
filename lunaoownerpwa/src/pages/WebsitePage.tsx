import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe,
  ExternalLink,
  Smartphone,
  Tablet,
  Laptop,
  Maximize2,
  X,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { websiteService } from '../services/websiteService';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export const WebsitePage: React.FC = () => {
  const { business } = useBusiness();
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('mobile');

  // Real website HTML state
  const [siteHtml, setSiteHtml] = useState<string>('');
  const [liveSiteUrl, setLiveSiteUrl] = useState<string>(business.websiteUrl || '');
  const [isLoadingHtml, setIsLoadingHtml] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);

  const loadWebsiteHtml = useCallback(async () => {
    setIsLoadingHtml(true);
    setLoadError(null);
    try {
      const res = await websiteService.getWebsiteHtml(business.id);
      if (res && res.html) {
        setSiteHtml(res.html);
        if (res.url) {
          setLiveSiteUrl(res.url);
        }
      } else {
        setLoadError('The website is unable to load. Please try again later.');
      }
    } catch (err: any) {
      console.warn('[WebsitePage] Failed to load real site HTML:', err);
      setLoadError('The website is unable to load. Please try again later.');
    } finally {
      setIsLoadingHtml(false);
    }
  }, [business.id]);

  useEffect(() => {
    loadWebsiteHtml();
  }, [loadWebsiteHtml]);

  const domainDisplay = (liveSiteUrl || business.websiteUrl || '').replace('https://', '').replace(/\/$/, '');

  if (isLoadingHtml) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-semibold text-slate-700">Loading website preview...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[350px] flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-4 border border-red-200">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Website Unavailable</h3>
        <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">{loadError}</p>
        <Button variant="primary" size="sm" onClick={loadWebsiteHtml}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {business.name || 'Business Website'}
              </h2>
              <Badge variant="success" dot size="sm">
                Live
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-mono truncate">{domainDisplay || 'lunao.org'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {liveSiteUrl && (
            <a
              href={liveSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <span>Visit Website</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreenPreview(true)}
            leftIcon={<Maximize2 className="w-3.5 h-3.5" />}
          >
            Full Screen
          </Button>
        </div>
      </div>

      {/* Website Live Status Overview */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="text-xs">
          <span className="font-bold text-slate-800">Website is live and actively connected:</span>{' '}
          <span className="text-slate-600">
            All customer bookings submitted on your site are routed directly to this app in real time.
          </span>
        </div>
      </div>

      {/* Live Preview Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
            <button
              onClick={() => setPreviewDevice('mobile')}
              className={`p-1.5 rounded-md text-xs font-semibold transition-all ${
                previewDevice === 'mobile' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
              }`}
              title="Mobile preview"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewDevice('tablet')}
              className={`p-1.5 rounded-md text-xs font-semibold transition-all ${
                previewDevice === 'tablet' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
              }`}
              title="Tablet preview"
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewDevice('desktop')}
              className={`p-1.5 rounded-md text-xs font-semibold transition-all ${
                previewDevice === 'desktop' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
              }`}
              title="Desktop preview"
            >
              <Laptop className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-xs text-slate-400 font-sans">
            Device Preview
          </span>
        </div>

        <div className="h-[600px] bg-slate-100 rounded-xl border border-slate-200 overflow-hidden flex justify-center items-stretch p-2">
          <div
            className={`h-full bg-white transition-[width] duration-300 rounded-lg overflow-hidden border border-slate-300 shadow-md ${
              previewDevice === 'mobile'
                ? 'w-[375px]'
                : previewDevice === 'tablet'
                  ? 'w-[768px]'
                  : 'w-full'
            }`}
          >
            <iframe
              ref={iframeRef}
              title="Site Preview"
              srcDoc={siteHtml}
              className="w-full h-full border-0 bg-white block"
            />
          </div>
        </div>
      </div>

      {/* Fullscreen Preview Modal */}
      {isFullscreenPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col">
          <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">Website Preview</span>
              <span className="text-xs text-slate-400 font-mono">({domainDisplay})</span>
            </div>
            <button
              onClick={() => setIsFullscreenPreview(false)}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-2 sm:p-4 flex items-center justify-center">
            <iframe
              ref={fullscreenIframeRef}
              title="Fullscreen Preview"
              srcDoc={siteHtml}
              className="w-full h-full max-w-5xl rounded-xl border border-slate-300 bg-white shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
