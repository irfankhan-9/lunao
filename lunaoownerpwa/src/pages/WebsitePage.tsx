import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe,
  ExternalLink,
  Edit3,
  Rocket,
  RefreshCw,
  Smartphone,
  Tablet,
  Laptop,
  Maximize2,
  X,
  Save,
  Pencil,
  Image as ImageIcon,
  UploadCloud,
  Link2,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { websiteService } from '../services/websiteService';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { soundEffects } from '../utils/soundEffects';

// Curated library of royalty-free, high-definition stock photos for instant one-click replacement
const CURATED_SITE_PHOTOS: Record<string, { label: string; url: string }[]> = {
  hvac: [
    { label: 'Air Conditioning System', url: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&w=800&q=80' },
    { label: 'Modern Heating Furnace', url: 'https://images.unsplash.com/photo-1605647540924-852290f6b0d5?auto=format&fit=crop&w=800&q=80' },
    { label: 'Clean Air Filtration', url: 'https://images.unsplash.com/photo-1473081556163-2a17de81fc97?auto=format&fit=crop&w=800&q=80' },
    { label: 'HVAC Certified Technician', url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80' },
    { label: 'Smart Thermostat Controls', url: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80' },
    { label: 'Equipment Heat Exchanger', url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80' },
  ],
  barber: [
    { label: 'Classic Barber Station', url: 'https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?auto=format&fit=crop&w=800&q=80' },
    { label: 'Precision Hair Cut', url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80' },
    { label: 'Vintage Shaving Tools', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80' },
    { label: 'Barber Styling Lounge', url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80' },
    { label: 'Beard Trim & Grooming', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80' },
    { label: 'Modern Studio Chair', url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=800&q=80' },
  ],
  general: [
    { label: 'Professional Office', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80' },
    { label: 'Friendly Staff Member', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80' },
    { label: 'Modern Work Environment', url: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80' },
    { label: 'Team Collaboration', url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80' },
    { label: 'Customer Satisfaction', url: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?auto=format&fit=crop&w=800&q=80' },
    { label: 'Quality Guarantee', url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80' },
  ],
};

export const WebsitePage: React.FC = () => {
  const { business, updateWebsiteConfig, showToast } = useBusiness();
  const [isDeploying, setIsDeploying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Real website HTML state
  const [siteHtml, setSiteHtml] = useState<string>('');
  const [liveSiteUrl, setLiveSiteUrl] = useState<string>(business.websiteUrl || '');
  const [isLoadingHtml, setIsLoadingHtml] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<boolean>(false);

  // Image replacement panel
  const [imgPanelOpen, setImgPanelOpen] = useState(false);
  const [imgUrlInput, setImgUrlInput] = useState('');
  const [existingSiteImages, setExistingSiteImages] = useState<string[]>([]);
  const selectedImgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // iframe refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const htmlBufferRef = useRef<string>('');

  // 1. Fetch business owner's real website HTML on mount
  const loadWebsiteHtml = useCallback(async () => {
    setIsLoadingHtml(true);
    setLoadError(null);
    try {
      const res = await websiteService.getWebsiteHtml(business.id);
      if (res && res.html) {
        setSiteHtml(res.html);
        htmlBufferRef.current = res.html;
        if (res.url) {
          setLiveSiteUrl(res.url);
        }
        setIsDirty(false);
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

  // Extract all existing images from the active document so owner can re-use with 1 click
  const extractExistingImages = useCallback((doc: Document | null) => {
    if (!doc) return;
    try {
      const imgs = Array.from(doc.images || []);
      const urls: string[] = [];
      imgs.forEach((img) => {
        const src = (img as HTMLImageElement).getAttribute('src') || '';
        if (src && !src.startsWith('data:image/svg') && !urls.includes(src)) {
          urls.push(src);
        }
      });
      setExistingSiteImages(urls);
    } catch {
      /* ignore */
    }
  }, []);

  // 2. Apply editMode (designMode + outline on clickable images)
  const applyEditMode = useCallback((doc: Document | null, on: boolean) => {
    if (!doc) return;
    try {
      doc.designMode = on ? 'on' : 'off';
    } catch {
      /* ignore cross-origin or restricted frames */
    }

    const imgs = Array.from(doc.images || []);
    imgs.forEach((img) => {
      (img as HTMLImageElement).style.outline = on ? '2.5px dashed rgba(16, 185, 129, 0.85)' : '';
      (img as HTMLImageElement).style.cursor = on ? 'pointer' : '';
      (img as HTMLImageElement).title = on ? 'Click to replace this image' : '';
    });
  }, []);

  // 3. Synchronize current HTML from active iframe (cleans temporary editor outlines)
  const syncHtmlFromDoc = useCallback((): string => {
    const activeIframe = isFullscreenPreview ? fullscreenIframeRef.current : iframeRef.current;
    const doc = activeIframe?.contentDocument;
    if (!doc || !doc.documentElement) {
      return htmlBufferRef.current || siteHtml;
    }

    // Temporarily disable outlines so saved HTML is clean
    if (editMode) {
      applyEditMode(doc, false);
    }

    const current = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

    // Restore outlines if still in edit mode
    if (editMode) {
      applyEditMode(doc, true);
    }

    htmlBufferRef.current = current;
    return current;
  }, [isFullscreenPreview, siteHtml, editMode, applyEditMode]);

  const handleImgClick = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'IMG') {
      e.preventDefault();
      e.stopPropagation();
      selectedImgRef.current = target as HTMLImageElement;
      setImgUrlInput((target as HTMLImageElement).getAttribute('src') || '');

      const activeIframe = isFullscreenPreview ? fullscreenIframeRef.current : iframeRef.current;
      extractExistingImages(activeIframe?.contentDocument || null);

      setImgPanelOpen(true);
      soundEffects.playDialogPop();
    }
  }, [isFullscreenPreview, extractExistingImages]);

  const attachIframeListeners = useCallback(
    (iframeEl: HTMLIFrameElement | null) => {
      if (!iframeEl) return;
      const doc = iframeEl.contentDocument;
      if (!doc) return;

      doc.addEventListener('input', () => {
        setIsDirty(true);
      });
      doc.addEventListener('click', handleImgClick, true);
      applyEditMode(doc, editMode);
      extractExistingImages(doc);
    },
    [handleImgClick, applyEditMode, editMode, extractExistingImages]
  );

  useEffect(() => {
    const doc1 = iframeRef.current?.contentDocument;
    if (doc1) applyEditMode(doc1, editMode);

    const doc2 = fullscreenIframeRef.current?.contentDocument;
    if (doc2) applyEditMode(doc2, editMode);

    if (!editMode) setImgPanelOpen(false);
  }, [editMode, applyEditMode]);

  // 4. Save edits without deploying
  const handleSaveHtml = async () => {
    soundEffects.playButtonClick();
    const currentHtml = syncHtmlFromDoc();
    setIsSaving(true);
    try {
      await websiteService.saveWebsiteHtml(business.id, currentHtml);
      setSiteHtml(currentHtml);
      htmlBufferRef.current = currentHtml;
      setIsDirty(false);
      soundEffects.playSuccess();
      showToast('Website changes saved successfully');
    } catch (err: any) {
      soundEffects.playError();
      showToast(err?.message || 'Failed to save website changes');
    } finally {
      setIsSaving(false);
    }
  };

  // 5. Deploy live to Cloudflare Pages
  const handleDeploy = async () => {
    soundEffects.playButtonClick();
    const currentHtml = syncHtmlFromDoc();
    setIsDeploying(true);
    try {
      const result = await websiteService.deployWebsiteHtml(business.id, currentHtml);
      setSiteHtml(currentHtml);
      htmlBufferRef.current = currentHtml;
      setIsDirty(false);
      updateWebsiteConfig({
        lastDeployed: result.lastDeployed || new Date().toISOString().slice(0, 10),
        status: 'deployed',
      });
      soundEffects.playSuccess();
      showToast('Website published live to customers');
    } catch (err: any) {
      soundEffects.playError();
      showToast(err?.message || 'Deployment error occurred');
    } finally {
      setIsDeploying(false);
    }
  };

  // 6. Direct Image Swapping (One-Click)
  const replaceWithImage = (url: string) => {
    if (!selectedImgRef.current || !url.trim()) return;
    selectedImgRef.current.src = url.trim();
    selectedImgRef.current.removeAttribute('srcset');

    // Sync state across both frames if both are mounted
    syncHtmlFromDoc();
    setIsDirty(true);
    soundEffects.playSoftBubble();
    showToast('Photo replaced successfully');
    setImgPanelOpen(false);
  };

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedImgRef.current) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        replaceWithImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const domainDisplay = (liveSiteUrl || business.websiteUrl || '').replace('https://', '').replace(/\/$/, '');

  // Resolve curated photos based on niche
  const nicheKey = (business.niche || '').toLowerCase();
  const relevantCuratedPhotos = nicheKey.includes('barber')
    ? CURATED_SITE_PHOTOS.barber
    : nicheKey.includes('hvac') || nicheKey.includes('cooling') || nicheKey.includes('heating')
    ? CURATED_SITE_PHOTOS.hvac
    : CURATED_SITE_PHOTOS.general;

  return (
    <div className="space-y-6">
      {/* Hidden file input for uploading images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePickFile}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Business Website
            </h2>
            <Badge variant="success" dot size="sm">
              Live & Synced
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Click &ldquo;Edit Website&rdquo; to modify any text or swap any image directly on your live site, then publish live in one click.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Edit Mode Toggle */}
          <Button
            variant={editMode ? 'primary' : 'outline'}
            size="sm"
            leftIcon={<Pencil className="w-3.5 h-3.5" />}
            onClick={() => {
              soundEffects.playButtonClick();
              setEditMode((prev) => !prev);
            }}
          >
            {editMode ? 'Finish Editing' : 'Edit Website'}
          </Button>

          {/* Save Button (shows when dirty) */}
          {isDirty && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={
                isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-emerald-600" />
                )
              }
              onClick={handleSaveHtml}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
          )}

          {/* Full-screen preview */}
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Maximize2 className="w-3.5 h-3.5" />}
            onClick={() => {
              soundEffects.playButtonClick();
              setIsFullscreenPreview(true);
            }}
          >
            Full Screen
          </Button>

          {/* Publish Live */}
          <Button
            variant="primary"
            size="sm"
            leftIcon={
              isDeploying ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Rocket className="w-3.5 h-3.5" />
              )
            }
            onClick={handleDeploy}
            disabled={isDeploying}
          >
            {isDeploying ? 'Publishing...' : 'Publish Live'}
          </Button>
        </div>
      </div>

      {/* Edit Mode Notice Banner */}
      {editMode && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Pencil className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold">Edit Mode Active:</span> Click any text directly on the page to type, or click any image with a green outline to replace it with 1 click.
            </div>
          </div>
          {isDirty && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[11px] shrink-0 border border-amber-200">
              Unsaved Changes
            </span>
          )}
        </div>
      )}

      {/* Website Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Live Domain
          </span>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 truncate max-w-[200px]">
              {domainDisplay}
            </span>
            <a
              href={liveSiteUrl || business.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:text-emerald-800 p-1 rounded-md hover:bg-slate-50 transition cursor-pointer"
              title="Open public website in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Content Status
          </span>
          <p className="mt-1 text-xs font-semibold text-slate-900">
            {isDirty ? 'Draft changes pending' : 'Synchronized with live site'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Production Build
          </span>
          <p className="mt-1 text-xs font-semibold text-slate-900">
            {business.websiteConfig.lastDeployed || 'Current'}
          </p>
        </div>
      </div>

      {/* Visual Live Preview Canvas */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        {/* Canvas Toolbar */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-medium text-slate-700">
              Interactive Website Canvas
            </span>
            {editMode && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                Interactive Editor
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 rounded-lg bg-white border border-slate-200 text-xs shadow-2xs">
              <button
                onClick={() => {
                  soundEffects.playTabSwitch();
                  setPreviewDevice('desktop');
                }}
                className={`p-1.5 rounded-md ${
                  previewDevice === 'desktop' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Desktop viewport"
              >
                <Laptop className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  soundEffects.playTabSwitch();
                  setPreviewDevice('tablet');
                }}
                className={`p-1.5 rounded-md ${
                  previewDevice === 'tablet' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Tablet viewport"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  soundEffects.playTabSwitch();
                  setPreviewDevice('mobile');
                }}
                className={`p-1.5 rounded-md ${
                  previewDevice === 'mobile' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Mobile viewport"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => {
                soundEffects.playButtonClick();
                setIsFullscreenPreview(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold hover:underline ml-2 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Screen</span>
            </button>
          </div>
        </div>

        {/* Scaled Preview Frame Container */}
        <div className="p-3 sm:p-6 md:p-8 bg-slate-100 flex justify-center items-center min-h-[560px] overflow-hidden">
          <div
            className={`transition-all duration-300 rounded-2xl overflow-hidden border border-slate-300 shadow-xl bg-white flex flex-col ${
              previewDevice === 'mobile'
                ? 'w-[375px] h-[640px]'
                : previewDevice === 'tablet'
                ? 'w-[680px] h-[600px]'
                : 'w-full max-w-5xl h-[650px]'
            }`}
          >
            {/* Mock Browser Header */}
            <div className="h-8 bg-slate-50 px-3 flex items-center justify-between border-b border-slate-200 text-[11px] text-slate-500 shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              </div>
              <div className="px-3 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-mono text-[10px] truncate max-w-[280px]">
                {liveSiteUrl || business.websiteUrl}
              </div>
              <button
                onClick={() => setIsFullscreenPreview(true)}
                title="Expand full screen"
                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>

            {/* Rendered Business HTML iframe */}
            <div className="flex-1 relative overflow-hidden bg-white">
              {isLoadingHtml ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
                  <p className="text-xs font-medium">Loading your business website...</p>
                </div>
              ) : loadError ? (
                <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-white">
                  <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Website is unable to load</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">{loadError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={loadWebsiteHtml}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Try Again
                  </Button>
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  title="Business Website"
                  srcDoc={siteHtml}
                  onLoad={() => attachIframeListeners(iframeRef.current)}
                  className="w-full h-full border-0 bg-white block"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-Screen Live Landing Page Preview & Editor Overlay */}
      {isFullscreenPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col animate-in fade-in duration-200">
          {/* Top Bar for Owner with Device Switcher, Save & Close */}
          <div className="h-14 bg-slate-950 text-white px-4 flex items-center justify-between border-b border-slate-800 z-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-xs sm:text-sm tracking-tight text-white">
                {business.name} • Live Website Editor
              </span>
              {editMode && (
                <span className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-md bg-emerald-900 text-emerald-300 border border-emerald-700">
                  Editing Active
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center p-0.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded-md ${
                    previewDevice === 'desktop' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Desktop"
                >
                  <Laptop className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPreviewDevice('tablet')}
                  className={`p-1.5 rounded-md ${
                    previewDevice === 'tablet' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Tablet"
                >
                  <Tablet className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded-md ${
                    previewDevice === 'mobile' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Mobile"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Edit Toggle inside Full Screen */}
              <button
                onClick={() => {
                  soundEffects.playButtonClick();
                  setEditMode((prev) => !prev);
                }}
                className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  editMode ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>{editMode ? 'Finish Editing' : 'Edit Website'}</span>
              </button>

              {/* Save inside Full Screen */}
              {isDirty && (
                <button
                  onClick={handleSaveHtml}
                  disabled={isSaving}
                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save</span>
                </button>
              )}

              {/* Deploy inside Full Screen */}
              <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {isDeploying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                <span>Publish</span>
              </button>

              <button
                onClick={() => {
                  soundEffects.playButtonClick();
                  setIsFullscreenPreview(false);
                }}
                className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Exit Preview</span>
              </button>
            </div>
          </div>

          {/* Full Screen Canvas Wrapper */}
          <div className="flex-1 overflow-y-auto bg-slate-900 flex justify-center p-0 sm:p-4">
            <div
              className={`bg-white transition-all duration-300 min-h-full ${
                previewDevice === 'mobile'
                  ? 'w-full max-w-[414px] shadow-2xl sm:rounded-2xl sm:my-4 sm:overflow-hidden'
                  : previewDevice === 'tablet'
                  ? 'w-full max-w-[768px] shadow-2xl sm:rounded-2xl sm:my-4 sm:overflow-hidden'
                  : 'w-full max-w-6xl shadow-2xl sm:rounded-2xl sm:my-4 sm:overflow-hidden'
              }`}
            >
              <iframe
                ref={fullscreenIframeRef}
                title="Business Website Fullscreen"
                srcDoc={siteHtml}
                onLoad={() => attachIframeListeners(fullscreenIframeRef.current)}
                className="w-full h-full min-h-[85vh] border-0 bg-white block"
              />
            </div>
          </div>
        </div>
      )}

      {/* Image Replacement BottomSheet/Modal */}
      {imgPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => setImgPanelOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 my-8 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Replace Photo</h3>
                  <p className="text-[11px] text-slate-500">Pick any image below or upload your own in 1 click</p>
                </div>
              </div>
              <button
                onClick={() => setImgPanelOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Current Selected Image Preview */}
              <div>
                <span className="text-[11px] font-semibold text-slate-600 block mb-1.5 uppercase tracking-wide">
                  Current Photo On Page
                </span>
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center h-32 relative">
                  {imgUrlInput ? (
                    <img
                      src={imgUrlInput}
                      alt="Current"
                      className="max-h-32 max-w-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-300" />
                  )}
                </div>
              </div>

              {/* 1-Click Fast Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition active:scale-[0.98] cursor-pointer shadow-xs"
              >
                <UploadCloud className="w-4 h-4" /> Upload from Your Phone or PC
              </button>

              {/* 1-Click Existing Site Images */}
              {existingSiteImages.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                      Existing Photos On This Website
                    </span>
                    <span className="text-[10px] text-slate-400">1-click swap</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {existingSiteImages.slice(0, 8).map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => replaceWithImage(url)}
                        className="group relative rounded-lg border border-slate-200 overflow-hidden h-16 bg-slate-50 hover:border-emerald-500 hover:shadow-md transition active:scale-95 cursor-pointer"
                        title="Click to apply this photo"
                      >
                        <img
                          src={url}
                          alt={`Existing site image ${i + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        />
                        <div className="absolute inset-0 bg-emerald-950/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <span className="text-[9px] font-bold text-white bg-emerald-600/90 px-1.5 py-0.5 rounded">
                            Apply
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 1-Click Curated Professional Industry Photos */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                    Curated Industry Photos
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {relevantCuratedPhotos.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => replaceWithImage(item.url)}
                      className="group relative rounded-xl border border-slate-200 overflow-hidden h-20 bg-slate-50 hover:border-emerald-500 hover:shadow-md transition active:scale-95 cursor-pointer text-left flex flex-col justify-end p-1.5"
                    >
                      <img
                        src={item.url}
                        alt={item.label}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-200"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                      <span className="relative z-10 text-[10px] font-semibold text-white truncate drop-shadow-sm">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Paste URL Option */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                  Or Paste Custom Image URL
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-emerald-600 focus-within:bg-white transition">
                    <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com/..."
                      value={imgUrlInput}
                      onChange={(e) => setImgUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') replaceWithImage(imgUrlInput);
                      }}
                      className="w-full text-xs text-slate-900 bg-transparent focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => replaceWithImage(imgUrlInput)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer shrink-0"
                  >
                    Apply URL
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
