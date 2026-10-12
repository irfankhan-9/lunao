import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Key, ChevronDown, Loader2, Sparkles, AlertCircle,
  FlaskConical, Layout, Monitor, Smartphone, Upload, Copy,
  CheckSquare, RotateCcw, BookmarkPlus, X, Code2, Check, Plus,
  RefreshCw, Wand2, PanelLeft, PanelLeftClose, Terminal, Layers, Maximize2, Minimize2, Home
} from 'lucide-react';
import {
  AiChatMessage, SiteHistoryEntry,
  listSiteHistory, createSiteHistory, convertHistoryToTemplate,
  streamAiEdit, processUploadedHtml,
  listTemplateCategories, createTemplateCategory,
} from '../lib/pipelineClient';
import { useSyncNiches, addAndSyncTemplate, getNicheEmoji } from '../lib/nichesSync';
import {
  playSoftTap, playTiktokLike, playSlideTick, playDialogPop, playSoftBubble,
  playElegantBell, playConfirmSuccess, playVictoryCelebration, playGentleChime,
  playElegantError, playCancelTone, playMagicWhoosh,
} from '../utils/audio';

export interface FlashToastFn {
  (t: { type: 'success' | 'error' | 'info'; text: string }): void;
}

const BLANK_CANVAS = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;padding:0;background:#ffffff;color:#0f172a}</style></head><body></body></html>`;

const VIBE_CODE_PROMPT = `You are an expert front-end web developer powered by Google AI Studio Gemini 2.5 Flash. Build a complete, production-ready single-file HTML website for a local service business based on the user's prompt.

OUTPUT FORMAT — STRICT:
- Return ONLY the HTML document.
- Start with <!DOCTYPE html> and end with </html>.
- Do NOT wrap output in markdown code fences (\`\`\`html or \`\`\`).
- Do NOT include any commentary, explanations, or notes.

PLACEHOLDER SYNTAX (CRITICAL):
You MUST use standardized handlebar placeholders so the platform can dynamically brand the site for any local client. Use exactly these tags:
- {{BUSINESS_NAME}} (e.g. Radiant Smiles Dental)
- {{BUSINESS_NAME_SHORT}} (e.g. Radiant)
- {{CITY}} (e.g. Austin, TX)
- {{STATE}} (e.g. TX)
- {{PHONE_DISPLAY}} (e.g. (512) 555-0199)
- {{PHONE_RAW}} (e.g. 5125550199)
- {{EMAIL}} (e.g. contact@example.com)
- {{ADDRESS}} (e.g. 3801 Capital of Texas Hwy, Austin, TX)
- {{GOOGLE_RATING}} (e.g. 4.9)
- {{GOOGLE_REVIEW_COUNT}} (e.g. 342)
- {{INSTAGRAM_HANDLE}} (e.g. local_business)
- {{FACEBOOK_URL}} (e.g. https://facebook.com/localbusiness)

FILE STRUCTURE & DESIGN:
- Single .html file with everything inline.
- All CSS inside one <style> tag in <head>. No external stylesheets.
- Google Fonts loaded from fonts.googleapis.com.
- Icons via inline SVG only.
- Responsive mobile-first design with breakpoints at 640px and 1024px.
- Clean white and blue brand consistent color palette (crisp white backgrounds, professional blue accents like #2563EB, slate text).
- Sections: Sticky top nav with CTA, Hero with headline & dual buttons, Services grid, Why Choose Us stats, Testimonials, Contact banner, Footer.
- Real Unsplash image URLs for hero backgrounds and service photos.`;

const sfx = {
  tap: playSoftTap,
  toggle: playSlideTick,
  open: playDialogPop,
  engage: playSoftBubble,
  primary: playTiktokLike,
  copy: playElegantBell,
  swap: playSoftBubble,
  saved: playConfirmSuccess,
  deployed: playVictoryCelebration,
  aiDone: () => playGentleChime(3),
  magic: playMagicWhoosh,
  error: playElegantError,
  close: playCancelTone,
};

const PLACEHOLDER_MAP: Record<string, string> = {
  BUSINESS_NAME: 'Radiant Smiles Dental',
  BUSINESS_NAME_SHORT: 'Radiant',
  CITY: 'Austin, TX',
  STATE: 'TX',
  PHONE_DISPLAY: '(512) 555-0199',
  PHONE_RAW: '5125550199',
  EMAIL: 'hello@example.com',
  ADDRESS: '3801 Capital of Texas Hwy, Austin, TX',
  GOOGLE_RATING: '4.9',
  GOOGLE_REVIEW_COUNT: '342',
  INSTAGRAM_HANDLE: 'radiant_smiles',
  FACEBOOK_URL: 'https://facebook.com/radiantsmiles',
  YEARS_IN_BUSINESS: '2012',
  SITE_URL: 'https://example.com',
};

// Cleanse any internal placeholders, file types, or template sauce from user-facing text
function sanitizeUserFacingText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // 1. Replace all {{PLACEHOLDERS}} with realistic friendly preview values
  cleaned = cleaned.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in PLACEHOLDER_MAP ? PLACEHOLDER_MAP[key] : 'Business'
  );

  // 2. Remove any references to HTML/CSS/CSV files or backend sauce
  cleaned = cleaned
    .replace(/\b(HTML|html|CSS|css|CSV|csv)\s*(code|file|files|syntax|markup|tags?|source|document)?\b/gi, 'website design')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\/?(html|head|body|style|script|div|section)[^>]*>/gi, '')
    .replace(/handlebars?|placeholders?|bracket tags?|template tags?/gi, 'business details')
    .replace(/templates-raw/gi, 'designs')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

function compilePreview(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return rawHtml || '';
  return rawHtml.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in PLACEHOLDER_MAP ? PLACEHOLDER_MAP[key] : `{{${key}}}`,
  );
}

function summarizeHtml(rawHtml: string, promptInstruction?: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return 'Updated your website preview with tailored design improvements.';
  const titleMatch = rawHtml.match(/<title>([^<]{0,60})/i);
  const cleanTitle = titleMatch ? sanitizeUserFacingText(titleMatch[1].trim()) : '';

  if (promptInstruction) {
    const briefClean = promptInstruction.slice(0, 50).trim();
    return `Applied updates for "${briefClean}". Your live preview is updated and ready to review.`;
  }

  if (cleanTitle && cleanTitle.length > 2) {
    return `Synthesized bespoke website experience for "${cleanTitle}". Ready to inspect.`;
  }
  return 'Updated your website preview with bespoke design improvements.';
}

export const TemplateLabPage: React.FC<{
  aiEnabled: boolean;
  embedded?: boolean;
  onClose: () => void;
  onBrowseTemplates: () => void;
  flashToast: FlashToastFn;
}> = ({ aiEnabled, embedded = false, onClose, onBrowseTemplates, flashToast }) => {

  const [mode, setMode] = useState<'idle' | 'active'>('idle');
  const [html, setHtml] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [thinkingAcc, setThinkingAcc] = useState('');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [history, setHistory] = useState<SiteHistoryEntry[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [title, setTitle] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [niche, setNiche] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<'Gemini 2.5 Flash' | 'Gemini 3.8 Flash' | 'Gemini 3.1 Pro'>('Gemini 2.5 Flash');

  // Synchronized Niches across the platform
  const [allNiches, addNiche] = useSyncNiches();
  const [selectedSaveNiche, setSelectedSaveNiche] = useState<string>('Barber');
  const [showAllNiches, setShowAllNiches] = useState(false);

  // Template turned state tracking
  const [turnedTemplateId, setTurnedTemplateId] = useState<string | null>(null);
  const [turnedTemplateNiche, setTurnedTemplateNiche] = useState<string | null>(null);

  // Save Modal States
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveCategory, setSaveCategory] = useState<string | null>(null);
  const [saveNewCat, setSaveNewCat] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const idleContainerRef = useRef<HTMLDivElement>(null);
  const [successMsg, setSuccessMsg] = useState<{ title: string; niche: string } | null>(null);
  const [fullScreenPreview, setFullScreenPreview] = useState(false);

  useEffect(() => {
    if (iframeRef.current && previewHtml) {
      iframeRef.current.srcdoc = previewHtml;
    }
  }, [previewHtml]);

  useEffect(() => {
    // Auto-scroll disabled per user request
  }, [messages, thinkingAcc, streaming]);

  useEffect(() => {
    listSiteHistory()
      .then(h => setHistory(h))
      .catch(() => setHistory([]));
  }, []);

  const flashError = (msg: string) => {
    sfx.error();
    setLabError(msg);
    setTimeout(() => setLabError(null), 5000);
  };

  const refreshPreview = () => {
    sfx.tap();
    if (previewHtml && iframeRef.current) {
      iframeRef.current.srcdoc = previewHtml;
    }
  };

  const startEditTitle = () => {
    setTitleDraft(title);
    setEditingTitle(true);
  };

  const commitTitle = () => {
    setTitle(titleDraft.trim() || title);
    setEditingTitle(false);
  };

  const goToStudioLanding = () => {
    sfx.open();
    setMode('idle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (idleContainerRef.current) {
      idleContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setTimeout(() => {
      const textarea = document.getElementById('custom-vibe-textarea') as HTMLTextAreaElement;
      if (textarea) textarea.focus();
    }, 100);
  };

  // Plan check: Free and Starter cannot vibe code templates
  const currentPlan = (typeof window !== 'undefined' ? localStorage.getItem('lunao_user_plan') : '') || 'Free';
  const isPlanEligible = ['growth', 'pro', 'agency'].some(p => currentPlan.toLowerCase().includes(p));

  // Start vibe coding with Gemini 2.5 Flash
  const handleStartVibeCode = async (promptText: string, customTitle: string) => {
    if (!isPlanEligible) {
      flashError('Vibe Coding is exclusive to Growth, Pro, and Agency plans. Please upgrade in Subscription Plans.');
      return;
    }
    if (!promptText.trim() || streaming) return;
    sfx.magic();
    setTitle(customTitle);
    setNiche(customTitle);
    setMode('active');
    setStreaming(true);
    setLabError(null);
    setThinkingAcc('');
    setShowPromptInput(false);

    // Force scroll strictly to the top on all elements so user never has to scroll up
    const forceScrollTop = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    forceScrollTop();

    // Start with ONLY user message (no hardcoded pre-built text)
    setMessages([{ role: 'user', content: promptText }]);

    try {
      const fullPrompt = `${VIBE_CODE_PROMPT}\n\nUSER REQUEST: ${promptText}`;
      const result = await streamAiEdit(
        { html: BLANK_CANVAS, instruction: fullPrompt, history: [], anthropicApiKey: apiKey.trim() || undefined },
        () => {},
        (thinkingText) => setThinkingAcc(prev => prev + thinkingText),
      );

      const finalCompiled = compilePreview(result);
      setHtml(result);
      setPreviewHtml(finalCompiled);
      setThinkingAcc('');

      // Dynamic AI response with typewriter word-by-word animation and sound effects
      const dynamicResponse = `Successfully generated bespoke responsive website for "${customTitle}" with clean typography, interactive sections, and production-ready styling.`;
      setMessages(m => [...m, { role: 'assistant', content: '' }]);
      const words = dynamicResponse.split(' ');
      words.forEach((word, idx) => {
        setTimeout(() => {
          if (idx % 2 === 0) sfx.tap();
          setMessages(m => {
            const next = [...m];
            const currText = (next[next.length - 1]?.content || '') + (idx === 0 ? '' : ' ') + word;
            next[next.length - 1] = { role: 'assistant', content: currText };
            return next;
          });
        }, idx * 30);
      });

      sfx.aiDone();
      try {
        const entry = await createSiteHistory({ title: customTitle, niche: customTitle, html: result, snapshotLabel: 'Initial Vibe Build' });
        setHistory(prev => [entry as any, ...prev]);
      } catch { /* ignore */ }
    } catch (err: any) {
      sfx.error();
      setThinkingAcc('');
      setMessages(m => [...m, { role: 'assistant', content: 'Server not responding, try later.' }]);
    } finally {
      setStreaming(false);
    }
  };

  const sendPrompt = async () => {
    const instruction = input.trim();
    if (!instruction || streaming) return;
    sfx.magic();
    const history_msgs = messages.slice(-6);
    setMessages(m => [...m, { role: 'user', content: instruction }]);
    setInput('');
    setStreaming(true);
    setLabError(null);
    setThinkingAcc('');

    try {
      const base = html || BLANK_CANVAS;
      const result = await streamAiEdit(
        { html: base, instruction, history: history_msgs, anthropicApiKey: apiKey.trim() || undefined },
        () => {},
        (thinkingText) => setThinkingAcc(prev => prev + thinkingText),
      );

      const finalCompiled = compilePreview(result);
      setHtml(result);
      setPreviewHtml(finalCompiled);
      setThinkingAcc('');
      const summary = summarizeHtml(result, instruction);
      setMessages(m => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: summary || 'Website preview updated successfully!' };
        return next;
      });
      sfx.aiDone();
      try {
        const entry = await createSiteHistory({ title: title || instruction.slice(0, 40), niche, html: result, snapshotLabel: instruction.slice(0, 60) });
        setHistory(prev => [entry as any, ...prev]);
      } catch { /* ignore */ }
    } catch (err: any) {
      sfx.error();
      setThinkingAcc('');
      setMessages(m => [...m, { role: 'assistant', content: 'Server not responding, try later.' }]);
    } finally {
      setStreaming(false);
    }
  };

  const loadEntry = (entry: SiteHistoryEntry) => {
    sfx.open();
    const compiled = compilePreview(entry.html);
    setHtml(entry.html);
    setPreviewHtml(compiled);
    setTitle(entry.title);
    setNiche(entry.niche);
    setMode('active');
    setMessages([{ role: 'assistant', content: 'Loaded "' + (entry.snapshotLabel || entry.title) + '". Preview on the right.' }]);
    setShowPromptInput(false);
    // Persist turnedTemplateNiche if this is a template
    if (entry.isTemplate) {
      setTurnedTemplateId(entry.templateId);
      setTurnedTemplateNiche(entry.niche);
    } else {
      setTurnedTemplateId(null);
      setTurnedTemplateNiche(null);
    }
  };

  const openSave = async () => {
    sfx.tap();
    setSaveOpen(true);
    setSaveName(title || 'My Custom Template');
    setSaveDescription(`High-converting modern website template for ${niche || 'Local Business'}.`);
    setSaveNewCat('');
    setShowNewCat(false);

    // If already turned into a template, show the existing niche user had selected for the template
    let preselectedNiche = turnedTemplateNiche || niche;
    const matched = allNiches.find(n =>
      (preselectedNiche && n.id.toLowerCase() === preselectedNiche.toLowerCase()) ||
      (title && title.toLowerCase().includes(n.id.toLowerCase()))
    );
    setSelectedSaveNiche(matched ? matched.id : (turnedTemplateNiche || allNiches[0]?.id || 'Barber'));
    setShowAllNiches(false);
    setShowNewCat(false);
    setSaveNewCat('');
    setSaveCategory(null);

    try {
      const cats = await listTemplateCategories();
      setCategories(cats.map((c: any) => ({ id: c.id, name: c.name, color: c.color })));
    } catch { setCategories([]); }
  };

  const handleSave = async () => {
    if (!saveName.trim()) { sfx.error(); return; }
    sfx.primary();
    setSaving(true);
    try {
      let finalNiche = selectedSaveNiche;
      let catId = saveCategory;

      if (showNewCat && saveNewCat.trim()) {
        try {
          const added = await addNiche(saveNewCat.trim());
          finalNiche = added.id;
        } catch {
          finalNiche = saveNewCat.trim();
        }
        try {
          const cat = await createTemplateCategory({ name: saveNewCat.trim(), color: '#2563EB' });
          catId = cat.id;
        } catch { /* ignore */ }
      }

      let historyId = `hist_${Date.now()}`;
      try {
        const entry = await createSiteHistory({ title: saveName.trim(), niche: finalNiche, html });
        if (entry && entry.id) historyId = entry.id;
      } catch { /* ignore */ }

      let templateId = turnedTemplateId || `tpl_${Date.now()}`;
      try {
        const result = await convertHistoryToTemplate({
          historyId,
          name: saveName.trim(),
          categoryId: catId,
          niche: finalNiche,
        });
        if (result && result.id) {
          templateId = result.id;
        }
      } catch { /* ignore */ }

      // Synchronize the new template across all tabs (Templates gallery, campaigns, editor)
      // addAndSyncTemplate updates/replaces by ID, effectively removing it from previous niche if niche changed
      addAndSyncTemplate({
        id: templateId,
        name: saveName.trim(),
        niche: finalNiche,
        description: saveDescription.trim() || `High-converting modern website template for ${finalNiche}.`,
      });

      setTurnedTemplateId(templateId);
      setTurnedTemplateNiche(finalNiche);

      sfx.deployed();
      setSuccessMsg({ title: saveName.trim(), niche: finalNiche });
      setSaveOpen(false);
    } catch (err: any) {
      try {
        const fallbackId = turnedTemplateId || `tpl_${Date.now()}`;
        addAndSyncTemplate({
          id: fallbackId,
          name: saveName.trim(),
          niche: selectedSaveNiche,
          description: saveDescription.trim() || `High-converting modern website template for ${selectedSaveNiche}.`,
        });
        setTurnedTemplateId(fallbackId);
        setTurnedTemplateNiche(selectedSaveNiche);
        sfx.deployed();
        setSuccessMsg({ title: saveName.trim(), niche: selectedSaveNiche });
        setSaveOpen(false);
        return;
      } catch (fallbackErr) {
        sfx.error();
        flashToast({ type: 'error', text: err?.message || 'Failed to save template.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const isActive = mode === 'active';

  return (
    <div ref={workspaceRef} className={embedded ? "w-full h-full bg-white flex flex-col text-slate-900 select-none relative" : "fixed inset-0 z-[60] bg-white flex flex-col text-slate-900 select-none"}>

      {/* TOP HEADER BAR - White & Blue Brand Consistent */}
      <div className="flex items-center justify-between gap-3 px-6 py-3.5 bg-white border-b border-slate-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {!isActive ? (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200 text-sm font-medium font-sans active:scale-[0.98] transition-all shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Editor
            </button>
          ) : (
            <button
              onClick={goToStudioLanding}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold font-sans active:scale-[0.98] transition-all shrink-0 shadow-xs"
              title="Return to Studio landing page to give new prompts"
            >
              <ArrowLeft className="w-4 h-4 text-blue-600" />
              <span>Studio Home</span>
            </button>
          )}

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <Code2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold font-sans text-slate-900 leading-none truncate">AI Web Studio</h1>
              <p className="text-[11px] text-slate-500 font-sans mt-0.5 truncate">
                {isActive ? title || 'Vibe Coding Session' : 'Powered by Google AI Studio Gemini 2.5 Flash'}
              </p>
            </div>
          </div>
        </div>

        {/* Turn into Template button prominently in Top Header - Always 100% visible and NEVER hidden */}
        {isActive && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openSave}
              disabled={streaming}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition-all shrink-0 ${streaming ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
              title="Save website as a reusable template"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span>Turn into Template</span>
            </button>
          </div>
        )}
      </div>

      {/* MAIN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR (Active chat / controls) - Roomy, Large, Luxury UI */}
        <div className={`shrink-0 flex flex-col overflow-hidden bg-slate-50 border-r border-slate-200 transition-all duration-300 ${
          !isActive ? 'w-[0px] md:w-[0px] overflow-hidden' : sidebarCollapsed ? 'w-0 border-0' : 'w-[420px] lg:w-[460px] xl:w-[480px]'
        }`}>
          {isActive && !sidebarCollapsed && (
            <div className="flex flex-col h-full overflow-hidden bg-slate-50">
              
              {/* Chat Header & LLM Engine Selector */}
              <div className="px-5 py-4 border-b border-slate-200 bg-white space-y-3 shrink-0 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                      <Terminal className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-bold font-sans text-slate-900 block leading-tight">
                        Vibe Design Assistant
                      </span>
                      <span className="text-[11px] text-slate-500 font-sans">
                        Real-time AI Synthesis & Interactive Design
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-semibold text-blue-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                    Active
                  </div>
                </div>

                {/* Brand consistent model selector toggle - Large & Spacious */}
                <div className={`flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 gap-1 text-xs font-medium text-slate-700 transition-all ${streaming ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}>
                  {(['Gemini 2.5 Flash', 'Gemini 3.8 Flash', 'Gemini 3.1 Pro'] as const).map(model => (
                    <button
                      key={model}
                      disabled={streaming}
                      onClick={() => { if (!streaming) { sfx.toggle(); setSelectedModel(model); } }}
                      className={`flex-1 py-1.5 px-2 rounded-lg transition-all truncate text-center text-xs font-semibold ${
                        selectedModel === model
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'hover:text-slate-900 hover:bg-slate-200/60 text-slate-600'
                      }`}
                    >
                      {model.replace('Gemini ', '')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat messages list - Spacious & Highly readable */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0 bg-slate-50">
                {messages.length <= 1 && (
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2.5">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Quick Vibe Edits
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Click any prompt to instantly instruct the AI model to update the code in real-time:
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[
                        'Add a 3-tier pricing table',
                        'Make the hero section bolder with dark mahogany theme',
                        'Add a booking calendar form',
                        'Add customer review stars badge',
                        'Change main button color to royal emerald',
                        'Add FAQ accordion section'
                      ].map((promptSnippet, idx) => (
                        <button
                          key={idx}
                          disabled={streaming}
                          onClick={() => {
                            setInput(promptSnippet);
                            sfx.tap();
                          }}
                          className="text-left text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 text-slate-700 transition-all font-sans"
                        >
                          + {promptSnippet}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => {
                  const displayContent = m.role === 'assistant' ? sanitizeUserFacingText(m.content) : m.content;
                  return (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm font-sans leading-relaxed shadow-xs ${
                        m.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm shadow-md'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                      }`}>
                        {displayContent || <span className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> Synthesizing website updates…</span>}
                      </div>
                    </div>
                  );
                })}

                {streaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-2xl px-4 py-3 bg-white border border-blue-200 rounded-bl-sm shadow-md space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                        <span className="text-xs text-blue-600 font-bold">{selectedModel} Designing in Real-Time</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed italic">
                        {thinkingAcc ? sanitizeUserFacingText(thinkingAcc.slice(-220)) : 'Crafting clean, responsive layout and tailored presentation…'}
                      </p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Prompt input - Generous height & clear buttons */}
              <div className="p-4 sm:p-5 border-t border-slate-200 bg-white shrink-0 shadow-lg space-y-3">
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt(); } }}
                    placeholder="Describe edits… e.g. 'Add a clean pricing section with 3 tiers and monthly billing toggle'"
                    rows={3}
                    disabled={streaming}
                    className="w-full resize-none rounded-2xl border border-slate-300 bg-white p-3.5 text-sm font-sans text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all leading-relaxed shadow-inner"
                  />
                </div>
                <button
                  onClick={sendPrompt}
                  disabled={streaming || !input.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold font-sans hover:bg-blue-700 active:scale-[0.98] transition-all shadow-md hover:shadow-lg disabled:opacity-40 disabled:hover:bg-blue-600"
                >
                  {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {streaming ? 'Applying AI Edits to Website…' : 'Apply AI Edit to Website'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {!isActive ? (
            /* ================= IDLE: AI VIBE STUDIO LANDING (White & Blue) ================= */
            <div ref={idleContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 flex justify-center items-start transition-opacity duration-500">
              <div className="w-full max-w-4xl space-y-8">

                {/* Hero Header & Single Prompt Section */}
                <div className="relative rounded-3xl overflow-hidden bg-white border border-slate-200 p-8 sm:p-12 shadow-xl">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-blue-50/80 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 space-y-8">
                    
                    {/* Top Row: Title + Compact Model Selector */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-6">
                      <div>
                        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 tracking-tight">
                          AI Web Studio
                        </h2>
                        <p className="text-sm text-slate-600 max-w-lg mt-1.5 leading-relaxed">
                          Describe any local service business in natural language. Instantly synthesize high-converting responsive websites optimized for client acquisition.
                        </p>
                      </div>

                      {/* Sleek Compact Model Picker */}
                      <div className="shrink-0">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">LLM Engine</label>
                        <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 text-xs">
                          {(['Gemini 2.5 Flash', 'Gemini 3.8 Flash', 'Gemini 3.1 Pro'] as const).map(model => (
                            <button
                              key={model}
                              disabled={streaming}
                              onClick={() => { if (!streaming) { sfx.toggle(); setSelectedModel(model); } }}
                              className={`py-1.5 px-3 rounded-lg transition-all text-xs font-medium ${
                                selectedModel === model
                                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                              }`}
                            >
                              {model.replace('Gemini ', '')}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Prompt Input & Quick Sample Chips */}
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Business Brief & Prompt</label>
                          <span className="text-[11px] text-slate-400">Ready to synthesize</span>
                        </div>
                        <textarea
                          id="custom-vibe-textarea"
                          rows={4}
                          placeholder="e.g. A luxury vintage barber lounge in Austin, TX with dark mahogany aesthetics, chair booking form, pricing menu, and Google reviews badge."
                          className="w-full rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-all shadow-inner"
                        />
                      </div>

                      {/* Quick sample prompt chips */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11px] text-slate-500 font-medium">Quick samples:</span>
                        {[
                          'Luxury Barber Lounge, Austin TX',
                          'Clinical Dental Studio, Boston MA',
                          '24/7 HVAC Emergency Repair, Dallas TX',
                        ].map((sample) => (
                          <button
                            key={sample}
                            type="button"
                            onClick={() => {
                              const ta = document.getElementById('custom-vibe-textarea') as HTMLTextAreaElement;
                              if (ta) ta.value = sample;
                              sfx.tap();
                            }}
                            className="text-xs px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-blue-300 transition-all"
                          >
                            {sample}
                          </button>
                        ))}
                      </div>

                      {!isPlanEligible && (
                        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-800">
                          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Vibe Coding requires <strong>Growth, Pro, or Agency</strong> plan. Free and Starter users have access to pre-built templates.</span>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          if (!isPlanEligible) {
                            flashError('Vibe Coding is exclusive to Growth, Pro, and Agency plans. Please upgrade in Subscription Plans.');
                            return;
                          }
                          const ta = document.getElementById('custom-vibe-textarea') as HTMLTextAreaElement;
                          const val = ta?.value?.trim();
                          if (!val) { flashError('Please enter a description for your website.'); return; }
                          handleStartVibeCode(val, val.slice(0, 30) + ' Site');
                        }}
                        disabled={streaming}
                        className={`w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold shadow-md active:scale-[0.99] transition-all mt-2 cursor-pointer ${
                          !isPlanEligible
                            ? 'bg-slate-800 hover:bg-slate-900 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                        }`}
                      >
                        {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : !isPlanEligible ? <Lock className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                        {!isPlanEligible ? 'Growth Plan Required to Vibe Code' : 'Generate Bespoke Website'}
                      </button>
                    </div>

                  </div>
                </div>

                {/* Recent Previous Vibe Coded Templates Section */}
                <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      Recent Vibe Coded Templates
                    </h3>
                    <span className="text-xs text-slate-500">{history.length} saved builds</span>
                  </div>

                  {history.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs italic">
                      No previous vibe coded sites yet. Generate your first one above!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {history.slice(0, 6).map(entry => (
                        <button
                          key={entry.id}
                          onClick={() => loadEntry(entry)}
                          className="text-left p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all group"
                        >
                          <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600 truncate mb-1">
                            {entry.title || entry.snapshotLabel || 'Untitled Vibe'}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mb-2">{entry.niche || 'Local Business'}</p>
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
                            Open in Studio →
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : (
            /* ================= ACTIVE PREVIEW MODE ================= */
            <>
              {/* Preview toolbar - Large, Spacious & High-Status */}
              <div className="flex items-center gap-2 sm:gap-4 px-4 sm:px-6 py-3 bg-white border-b border-slate-200 shrink-0 shadow-xs overflow-x-auto no-scrollbar">
                
                {/* Desktop vs Mobile Toggle */}
                <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner shrink-0">
                  <button
                    onClick={() => { sfx.toggle(); setDevice('desktop'); }}
                    className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      device === 'desktop'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                    title="Desktop view (100% Full Width)"
                  >
                    <Monitor className="w-4 h-4" />
                    <span>Desktop</span>
                  </button>
                  <button
                    onClick={() => { sfx.toggle(); setDevice('mobile'); }}
                    className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      device === 'mobile'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                    title="Mobile viewport simulation"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Mobile</span>
                  </button>
                </div>

                {/* Sidebar toggle button */}
                <button
                  onClick={() => { sfx.tap(); setSidebarCollapsed(!sidebarCollapsed); }}
                  className="p-2 sm:p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all shrink-0"
                  title={sidebarCollapsed ? "Open Vibe Assistant Sidebar" : "Collapse Sidebar for Wider Canvas"}
                >
                  {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>

                {/* Website Title Editor */}
                <div className="flex items-center min-w-0 shrink">
                  {editingTitle ? (
                    <input
                      autoFocus
                      value={titleDraft}
                      onChange={e => setTitleDraft(e.target.value)}
                      onBlur={commitTitle}
                      onKeyDown={e => { if (e.key === 'Enter') commitTitle(); }}
                      className="px-2.5 sm:px-3 py-1.5 rounded-xl border-2 border-blue-600 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none shadow-sm max-w-[140px] sm:max-w-[200px]"
                    />
                  ) : (
                    <button
                      onClick={startEditTitle}
                      className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold text-slate-800 hover:text-blue-600 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all min-w-0"
                      title="Click to rename website"
                    >
                      <FlaskConical className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="max-w-[120px] sm:max-w-[220px] truncate">{title || 'Vibe Website'}</span>
                      <span className="text-slate-400 text-xs font-normal shrink-0">✎</span>
                    </button>
                  )}
                </div>

                {/* Right Action Controls - Guaranteed shrink-0 to prevent clipping */}
                <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
                  <button
                    onClick={refreshPreview}
                    className="p-2 sm:p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all shrink-0"
                    title="Reload live preview"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => { sfx.open(); setFullScreenPreview(true); }}
                    className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 hover:text-slate-900 text-xs font-bold transition-all shadow-xs active:scale-[0.98] shrink-0"
                    title="View preview in full screen mode"
                  >
                    <Maximize2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Full Screen</span>
                  </button>

                  <button
                    onClick={openSave}
                    disabled={streaming}
                    className={`inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition-all shrink-0 ${streaming ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                    title="Turn into reusable template"
                  >
                    <BookmarkPlus className="w-4 h-4 shrink-0" />
                    <span>Turn into Template</span>
                  </button>
                </div>
              </div>

              {/* Iframe Viewport - Takes 100% of preview space in desktop, realistic frame in mobile */}
              <div className="flex-1 w-full h-full min-h-0 overflow-hidden flex flex-col bg-slate-100">
                {device === 'desktop' ? (
                  <div className="w-full h-full flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
                    <iframe
                      ref={iframeRef}
                      srcdoc={previewHtml || BLANK_CANVAS}
                      title="Vibe Website Preview"
                      className="w-full h-full flex-1 border-0 bg-white block"
                      style={{ height: '100%', width: '100%', minHeight: '100%', display: 'block' }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden">
                    <div className="w-full max-w-[390px] h-full max-h-[820px] bg-white rounded-3xl border-4 border-slate-800 shadow-2xl flex flex-col overflow-hidden relative">
                      <div className="h-6 bg-slate-800 flex items-center justify-center shrink-0">
                        <div className="w-16 h-3 bg-slate-700 rounded-full" />
                      </div>
                      <iframe
                        ref={iframeRef}
                        srcdoc={previewHtml || BLANK_CANVAS}
                        title="Vibe Website Preview Mobile"
                        className="w-full h-full flex-1 border-0 bg-white block"
                        style={{ height: '100%', width: '100%' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>

      {/* ================= TURN INTO TEMPLATE MODAL (White & Blue) ================= */}
      {saveOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-editor-fade"
          onClick={e => { if (e.target === e.currentTarget) setSaveOpen(false); }}
        >
          <div
            className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 text-slate-900 animate-editor-rise"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <BookmarkPlus className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Turn into Template</h3>
                  <p className="text-xs text-slate-500">Instantly publish to Templates Gallery & Campaigns</p>
                </div>
              </div>
              <button
                onClick={() => setSaveOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Template Name *</label>
                <input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="e.g. Austin Luxury Barbershop"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Description (Optional)</label>
                <textarea
                  value={saveDescription}
                  onChange={e => setSaveDescription(e.target.value)}
                  placeholder="Brief description of the target niche and features…"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-all resize-none"
                />
              </div>

                            <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-700">Select Niche Industry *</label>
                  <span className="text-[11px] text-slate-500">{allNiches.length} Niches Synced</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3 transition-all animate-editor-fade max-h-48 overflow-y-auto pr-1">
                  {allNiches.map(n => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => { setSelectedSaveNiche(n.id); setShowNewCat(false); }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${
                        selectedSaveNiche === n.id ? 'bg-blue-600 text-white border-blue-600 shadow-sm scale-105' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      <span className="text-sm">{n.emoji || getNicheEmoji(n.id)}</span>
                      {n.label || n.id}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setShowNewCat(!showNewCat); }}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-100 border border-dashed border-slate-300 text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:bg-blue-50 transition-all"
                  >
                    <Plus className="w-3 h-3" /> Create New Niche
                  </button>
                </div>

                {showNewCat && (
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 animate-editor-fade">
                    <div className="flex gap-2">
                      <input
                        value={saveNewCat}
                        onChange={e => setSaveNewCat(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === 'Enter' && saveNewCat.trim()) {
                            e.preventDefault();
                            const clean = saveNewCat.trim();
                            const created = await addNiche(clean);
                            setSelectedSaveNiche(created.id);
                            setSaveNewCat('');
                            setShowNewCat(false);
                            flashToast({ type: 'success', text: `Niche "${created.id}" created & synced across platform!` });
                          }
                        }}
                        placeholder="New niche name (e.g. Pet Grooming, Accounting)…"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (saveNewCat.trim()) {
                            const clean = saveNewCat.trim();
                            const created = await addNiche(clean);
                            setSelectedSaveNiche(created.id);
                            setSaveNewCat('');
                            setShowNewCat(false);
                            flashToast({ type: 'success', text: `Niche "${created.id}" created & synced across platform!` });
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm"
                      >
                        Add Niche
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  onClick={() => setSaveOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !saveName.trim()}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? 'Publishing…' : 'Publish Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-green-100 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-10 text-center space-y-6 animate-celebrate-in relative">
            <button
              onClick={() => setSuccessMsg(null)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-20 h-20 rounded-full bg-green-50 border-4 border-green-100 flex items-center justify-center text-green-500 mx-auto animate-bounce">
              <Check className="w-10 h-10 stroke-[3]" />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-extrabold font-sans text-slate-900">Template Published!</h3>
              <p className="text-sm font-semibold text-slate-600">"{successMsg.title}"</p>
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-green-50 border border-green-100 text-sm font-bold text-green-700">
                <span>✨ Niche: {successMsg.niche}</span>
              </div>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
              Now live and synced across your Templates Gallery, Outreach Campaigns, and Site Deploy manager.
            </p>
            <button
              onClick={() => setSuccessMsg(null)}
              className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-base font-bold shadow-lg shadow-green-500/20 transition-all active:scale-95 cursor-pointer"
            >
              Continue Vibe Coding
            </button>
          </div>
        </div>
      )}

      {fullScreenPreview && (
        <div className="fixed inset-0 z-[200] w-screen h-screen bg-white overflow-hidden animate-editor-fade">
          {/* Zoom Out / Exit Full Screen button at TOP LEFT CORNER */}
          <div className="absolute top-4 left-4 z-[210]">
            <button
              onClick={() => { sfx.close(); setFullScreenPreview(false); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/95 hover:bg-white text-slate-800 hover:text-blue-600 border border-slate-200/90 shadow-2xl backdrop-blur-md text-xs font-bold transition-all hover:scale-105 active:scale-95 group cursor-pointer"
              title="Zoom out and exit full screen"
            >
              <Minimize2 className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
              <span>Zoom Out</span>
            </button>
          </div>

          <iframe
            srcdoc={previewHtml || BLANK_CANVAS}
            title="Full Screen Preview"
            className="w-full h-full border-0 bg-white block"
            style={{ width: '100vw', height: '100vh', border: 0 }}
          />
        </div>
      )}

    </div>
  );
};
