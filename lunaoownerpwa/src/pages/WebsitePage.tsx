import React, { useState } from 'react';
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
  Eye,
  X,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { websiteService } from '../services/websiteService';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { BottomSheet } from '../components/ui/BottomSheet';
import { BusinessLandingView } from '../components/website/BusinessLandingView';
import { soundEffects } from '../utils/soundEffects';

export const WebsitePage: React.FC = () => {
  const { business, updateWebsiteConfig, showToast } = useBusiness();
  const [isDeploying, setIsDeploying] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Local Form state for quick editor
  const [headline, setHeadline] = useState(business.websiteConfig.headline);
  const [subheadline, setSubheadline] = useState(business.websiteConfig.subheadline);
  const [ctaText, setCtaText] = useState(business.websiteConfig.ctaText || 'Book Online');
  const [heroImage] = useState(business.websiteConfig.heroImage);
  const [announcement, setAnnouncement] = useState(business.websiteConfig.announcement || '');

  const handleDeploy = async () => {
    soundEffects.playButtonClick();
    setIsDeploying(true);
    try {
      const result = await websiteService.deployWebsite(business.id);
      updateWebsiteConfig({
        lastDeployed: result.lastDeployed,
        status: 'deployed',
      });
      soundEffects.playSuccess();
      showToast('Website changes published live');
    } catch {
      showToast('Deployment error occurred');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSaveEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    soundEffects.playSuccess();
    const updated = await websiteService.updateWebsite(business.id, {
      headline,
      subheadline,
      ctaText,
      heroImage,
      announcement: announcement.trim() || undefined,
    });
    updateWebsiteConfig(updated);
    setIsEditorOpen(false);
    showToast('Website copy updated');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Public Website
            </h2>
            <Badge variant="success" dot size="sm">
              Live & Published
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Manage your client-facing website copy, visual announcements, and instant publishing
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Eye className="w-3.5 h-3.5" />}
            onClick={() => {
              soundEffects.playButtonClick();
              setIsFullscreenPreview(true);
            }}
          >
            Live Preview
          </Button>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<Edit3 className="w-3.5 h-3.5" />}
            onClick={() => setIsEditorOpen(true)}
          >
            Edit Copy
          </Button>

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

      {/* Website Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Live Domain
          </span>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 truncate max-w-[200px]">
              {business.websiteUrl.replace('https://', '')}
            </span>
            <button
              onClick={() => {
                soundEffects.playButtonClick();
                setIsFullscreenPreview(true);
              }}
              className="text-emerald-700 hover:text-emerald-800 p-1 rounded-md hover:bg-slate-50 transition cursor-pointer"
              title="Open full-screen preview"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Last Content Update
          </span>
          <p className="mt-1 text-xs font-semibold text-slate-900">
            {business.websiteConfig.lastUpdated}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Production Build
          </span>
          <p className="mt-1 text-xs font-semibold text-slate-900">
            {business.websiteConfig.lastDeployed}
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
              Interactive Landing Page Preview
            </span>
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
        <div className="p-3 sm:p-6 md:p-8 bg-slate-100 flex justify-center items-center min-h-[500px] overflow-hidden">
          <div
            className={`transition-all duration-300 rounded-2xl overflow-hidden border border-slate-300 shadow-xl bg-white flex flex-col ${
              previewDevice === 'mobile'
                ? 'w-[375px] h-[640px]'
                : previewDevice === 'tablet'
                ? 'w-[680px] h-[600px]'
                : 'w-full max-w-5xl h-[620px]'
            }`}
          >
            {/* Mock Browser Header */}
            <div className="h-8 bg-slate-50 px-3 flex items-center justify-between border-b border-slate-200 text-[11px] text-slate-500 shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              </div>
              <div className="px-3 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-mono text-[10px] truncate max-w-[240px]">
                {business.websiteUrl}
              </div>
              <button
                onClick={() => setIsFullscreenPreview(true)}
                title="Expand full screen"
                className="text-slate-400 hover:text-slate-700 p-0.5"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>

            {/* Rendered Website Mockup */}
            <div className="flex-1 overflow-y-auto bg-white text-slate-900">
              <BusinessLandingView
                business={business}
                isInsidePreview={true}
                onBookingSuccess={() => showToast('New appointment reservation received!')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Full-Screen Live Landing Page Preview Overlay */}
      {isFullscreenPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col animate-in fade-in duration-200">
          {/* Top Bar for Owner with Device Switcher and Close */}
          <div className="h-14 bg-slate-950 text-white px-4 flex items-center justify-between border-b border-slate-800 z-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-xs sm:text-sm tracking-tight text-white">
                {business.name} • Public Landing Page
              </span>
              <span className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                Live Customer View
              </span>
            </div>

            <div className="flex items-center gap-3">
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

          {/* Canvas Wrapper */}
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
              <BusinessLandingView
                business={business}
                isInsidePreview={false}
                onBookingSuccess={() => showToast('New appointment reservation received!')}
              />
            </div>
          </div>
        </div>
      )}

      {/* Visual Quick Editor BottomSheet */}
      {isEditorOpen && (
        <BottomSheet
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          title="Website Copy Editor"
          subtitle="Update public customer-facing headlines and call-to-action text"
        >
          <form onSubmit={handleSaveEditor} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Hero Headline *
              </label>
              <input
                type="text"
                required
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Subheadline
              </label>
              <textarea
                rows={2}
                value={subheadline}
                onChange={(e) => setSubheadline(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 resize-none shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Call-To-Action Button Label
              </label>
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Top Announcement Banner (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Now scheduling appointments for next week!"
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" className="w-full">
                Apply & Save Changes
              </Button>
            </div>
          </form>
        </BottomSheet>
      )}
    </div>
  );
};

