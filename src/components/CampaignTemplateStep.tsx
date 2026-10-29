/**
 * CampaignTemplateStep — Unified, Clean White / Blue / Green Template Selection Step (Step 3)
 * For Email, SMS, and Site Deploy Campaign Wizards.
 *
 * Rules & Behavior:
 *   - Palette: Clean white, green, and blue. Zero dark/black backgrounds.
 *   - Unselected card: Clean preview. No floating buttons hovering over the image!
 *   - Selected card: Clicking once selects it with audio chime. Then, the Eye Preview button appears in the center!
 *   - Clicking Preview: Opens the preview modal where user can switch between Mobile UI (phone), Desktop, and Fullscreen.
 *   - Simple & focused: No "zero placeholder", "pwa ready", or "most popular" clutter badges.
 */

import React, { useState, useMemo } from 'react';
import {
  Globe, Check, Eye, Maximize2, Smartphone, Monitor,
  Search, CheckCircle2
} from 'lucide-react';
import { Template } from '../types';
import { TemplateSimPreview } from './TemplateSimPreview';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import {
  playElegantBell, playSoftBubble, playSoftTap,
  playLaunchSwell, playConfirmSuccess
} from '../utils/audio';

export interface CampaignTemplateStepProps {
  allTemplates: Template[];
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  selectedNiche: string;
  campaignType?: 'email' | 'sms' | 'site-deploy';
}

export const CampaignTemplateStep: React.FC<CampaignTemplateStepProps> = ({
  allTemplates,
  selectedTemplateId,
  onSelectTemplate,
  selectedNiche,
  campaignType = 'email',
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewInitialFullscreen, setPreviewInitialFullscreen] = useState(false);
  const [previewInitialMode, setPreviewInitialMode] = useState<'desktop' | 'mobile'>('desktop');

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((tpl) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        tpl.name.toLowerCase().includes(q) ||
        (tpl.tag && tpl.tag.toLowerCase().includes(q)) ||
        (tpl.description && tpl.description.toLowerCase().includes(q))
      );
    });
  }, [allTemplates, searchQuery]);

  const handleCardClick = (tpl: Template) => {
    playElegantBell();
    onSelectTemplate(tpl.id);
  };

  const handleOpenPreview = (e: React.MouseEvent, tpl: Template, mode: 'desktop' | 'mobile' = 'desktop', fullscreen: boolean = false) => {
    e.stopPropagation();
    if (fullscreen) {
      playLaunchSwell();
    } else {
      playSoftBubble();
    }
    setPreviewTemplate(tpl);
    setPreviewInitialMode(mode);
    setPreviewInitialFullscreen(fullscreen);
    setPreviewModalOpen(true);
  };

  const campaignContextText = useMemo(() => {
    switch (campaignType) {
      case 'sms':
        return 'This template powers the personalized preview link included in every SMS hook.';
      case 'site-deploy':
        return 'This template will be cloned and distributed across global edge caches for each business.';
      default:
        return 'This template generates the personalized website linked in your outreach emails.';
    }
  }, [campaignType]);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Clean White / Blue / Green Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 md:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
              <Globe className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] sm:text-[11px] uppercase font-bold tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                  Step 03 · Template
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {allTemplates.length} layouts for {selectedNiche}
                </span>
              </div>
              <h3 className="font-serif text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
                Choose your website template
              </h3>
              <p className="text-xs md:text-sm text-slate-600 max-w-2xl leading-relaxed">
                {campaignContextText} Click any template to select it, then press Preview to inspect the mobile or desktop experience.
              </p>
            </div>
          </div>

          {/* Quick Search Input */}
          <div className="relative w-full sm:max-w-xs sm:self-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search templates…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 sm:py-16 px-4 sm:px-6 bg-white rounded-2xl border border-dashed border-slate-200">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Globe className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-slate-900 mb-1">No templates found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            No layout matched your search query. Clear search to see all templates.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-all cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {filteredTemplates.map((tpl) => {
            const isSelected = selectedTemplateId === tpl.id;

            return (
              <div
                key={tpl.id}
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick(tpl)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(tpl);
                  }
                }}
                className={`group relative bg-white rounded-2xl overflow-hidden border-2 transition-all duration-200 text-left cursor-pointer flex flex-col ${
                  isSelected
                    ? 'border-blue-600 ring-4 ring-blue-500/15 shadow-xl shadow-blue-500/10'
                    : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                }`}
              >
                {/* Thumbnail Preview Area */}
                <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden select-none">
                  {/* Clean Dual-Device Rendering */}
                  <TemplateSimPreview
                    id={tpl.id}
                    name={tpl.name}
                    niche={tpl.niche}
                    badge={tpl.tag || ''}
                    isMostUsed={false}
                    selected={isSelected}
                  />

                  {/* Top-Left: Clean Niche Badge */}
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/95 backdrop-blur-sm text-slate-700 border border-slate-200 shadow-xs z-10">
                    {tpl.niche}
                  </div>

                  {/* Top-Right: Selection Indicator Checkmark */}
                  <div className="absolute top-3 right-3 z-10 transition-transform">
                    {isSelected ? (
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md animate-scale-in">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-300 group-hover:border-blue-400 group-hover:text-blue-500 transition-colors shadow-xs">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* =============================================================== */}
                  {/* CENTER EYE PREVIEW BUTTON: SHOWN ONLY WHEN CARD IS SELECTED     */}
                  {/* =============================================================== */}
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-blue-900/10 backdrop-blur-[1px] animate-fade-in z-20">
                      <button
                        type="button"
                        onClick={(e) => handleOpenPreview(e, tpl, 'desktop', false)}
                        className="px-5 py-2.5 rounded-full bg-white text-blue-600 hover:bg-blue-600 hover:text-white font-bold text-xs shadow-xl border border-blue-200 hover:border-blue-600 transition-all transform hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Preview Template</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3 bg-white">
                  <div className="min-w-0">
                    <h4 className="font-serif text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug truncate">
                      {tpl.name}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                      {tpl.description ||
                        `Conversion-focused responsive website layout designed for local ${tpl.niche} businesses.`}
                    </p>
                  </div>

                  {/* Card Bottom Status Row */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Selected
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium group-hover:text-slate-600 transition-colors">
                        Click to select
                      </span>
                    )}

                    {/* Quick Preview trigger button on bottom if selected */}
                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => handleOpenPreview(e, tpl, 'desktop', false)}
                        className="font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                      >
                        <span>Preview</span>
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Preview Modal (Clean White, Blue, & Green) */}
      <TemplatePreviewModal
        template={previewTemplate}
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        initialFullscreen={previewInitialFullscreen}
        initialMode={previewInitialMode}
        onSelect={() => {
          if (previewTemplate) {
            onSelectTemplate(previewTemplate.id);
          }
        }}
      />
    </div>
  );
};

export default CampaignTemplateStep;
