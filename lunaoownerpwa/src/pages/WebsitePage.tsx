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
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { websiteService } from '../services/websiteService';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { soundEffects } from '../utils/soundEffects';

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
  const [previewVersion, setPreviewVersion] = useState<number>(0);

  // Image replacement ref
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

  // 4. Intercept clicks: direct photo upload in edit mode & isolated navigation in preview
  const handleIframeClick = useCallback(
    (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. If an image is clicked in edit mode, immediately open device file picker
      if (target.tagName === 'IMG') {
        if (editMode) {
          e.preventDefault();
          e.stopPropagation();
          selectedImgRef.current = target as HTMLImageElement;
          soundEffects.playButtonClick();
          fileInputRef.current?.click();
          return;
        }
      }

      // 2. Intercept any anchor click so the preview sandbox strictly stays on the site HTML
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (anchor) {
        e.preventDefault();
        e.stopPropagation();
        const rawHref = (anchor.getAttribute('href') || '').trim();
        const activeIframe = isFullscreenPreview ? fullscreenIframeRef.current : iframeRef.current;
        const doc = activeIframe?.contentDocument;
        if (!doc) return;

        const hashIndex = rawHref.indexOf('#');
        if (hashIndex !== -1) {
          const hash = rawHref.slice(hashIndex + 1).trim();
          if (!hash || hash === 'top') {
            doc.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            try {
              const targetEl =
                doc.getElementById(hash) ||
                doc.querySelector(`[name="${hash}"]`) ||
                doc.querySelector(`#${hash}`);
              if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            } catch {
              /* ignore invalid selector */
            }
          }
          return;
        }

        // If it's a home link ('/', '', index.html)
        if (rawHref === '/' || rawHref === '' || rawHref.includes('index.html')) {
          doc.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        // External or other links: keep sandboxed within the preview
        return;
      }
    },
    [editMode, isFullscreenPreview]
  );

  const attachIframeListeners = useCallback(
    (iframeEl: HTMLIFrameElement | null) => {
      if (!iframeEl) return;
      const doc = iframeEl.contentDocument;
      if (!doc) return;

      doc.addEventListener('input', () => {
        setIsDirty(true);
      });
      doc.removeEventListener('click', handleIframeClick, true);
      doc.addEventListener('click', handleIframeClick, true);
      doc.addEventListener('submit', (e) => e.preventDefault(), true);
      applyEditMode(doc, editMode);
    },
    [handleIframeClick, applyEditMode, editMode]
  );

  useEffect(() => {
    const doc1 = iframeRef.current?.contentDocument;
    if (doc1) {
      doc1.removeEventListener('click', handleIframeClick, true);
      doc1.addEventListener('click', handleIframeClick, true);
      applyEditMode(doc1, editMode);
    }

    const doc2 = fullscreenIframeRef.current?.contentDocument;
    if (doc2) {
      doc2.removeEventListener('click', handleIframeClick, true);
      doc2.addEventListener('click', handleIframeClick, true);
      applyEditMode(doc2, editMode);
    }
  }, [editMode, applyEditMode, handleIframeClick]);

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
      setPreviewVersion((v) => v + 1);
      soundEffects.playSuccess();
      showToast('Website changes saved successfully');
    } catch (err: any) {
      soundEffects.playError();
      showToast(err?.message || 'Failed to save website changes');
    } finally {
      setIsSaving(false);
    }
  };

  // 5. Deploy live to Cloudflare Pages & Supabase
  const handleDeploy = async () => {
    soundEffects.playButtonClick();
    const currentHtml = syncHtmlFromDoc();
    setIsDeploying(true);
    try {
      const result = await websiteService.deployWebsiteHtml(business.id, currentHtml);
      setSiteHtml(currentHtml);
      htmlBufferRef.current = currentHtml;
      setIsDirty(false);
      setEditMode(false);
      setPreviewVersion((v) => v + 1);
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

  // 6. Direct Image Swapping (One-Click) with high-efficiency client-side compression
  const replaceWithImage = (url: string) => {
    if (!selectedImgRef.current || !url.trim()) return;
    selectedImgRef.current.src = url.trim();
    selectedImgRef.current.removeAttribute('srcset');

    // Sync state across both frames if both are mounted
    syncHtmlFromDoc();
    setIsDirty(true);
    soundEffects.playSoftBubble();
    showToast('Photo replaced successfully');
  };

  const compressImageFile = (file: File, maxDim = 1600, quality = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : '';
        if (!raw) return resolve('');
        const img = new Image();
        img.onerror = () => resolve(raw);
        img.onload = () => {
          try {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(raw);
            ctx.drawImage(img, 0, 0, width, height);
            const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            resolve(canvas.toDataURL(mime, quality));
          } catch {
            resolve(raw);
          }
        };
        img.src = raw;
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedImgRef.current) return;
    try {
      const optimizedUrl = await compressImageFile(file);
      if (optimizedUrl) {
        replaceWithImage(optimizedUrl);
      }
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          replaceWithImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const domainDisplay = (liveSiteUrl || business.websiteUrl || '').replace('https://', '').replace(/\/$/, '');

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
                  key={`preview-${previewVersion}`}
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
                key={`fullscreen-${previewVersion}`}
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
    </div>
  );
};
