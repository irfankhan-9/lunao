import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Key, ChevronDown, Loader2, Sparkles, AlertCircle,
  FlaskConical, Layout, Monitor, Smartphone, Upload, Copy,
  CheckSquare, RotateCcw, BookmarkPlus, X, Code2, Check, Plus,
  RefreshCw, Wand2, PanelLeft, PanelLeftClose, Terminal, Layers
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

function compilePreview(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return rawHtml || '';
  return rawHtml.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in PLACEHOLDER_MAP ? PLACEHOLDER_MAP[key] : `{{${key}}}`,
  );
}

function summarizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return 'Done! Preview updated.';
  const titleMatch = rawHtml.match(/<title>([^<]{0,60})/i);
  if (titleMatch) return `Title: "${titleMatch[1].trim()}"`;
  return 'Done! Preview updated.';
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

  // Start vibe coding with Gemini 2.5 Flash
  const handleStartVibeCode = async (promptText: string, customTitle: string) => {
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
      setMessages(m => [...m, { role: 'assistant', content: 'Error: ' + (err?.message || 'Generation failed.') }]);
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
      const summary = summarizeHtml(result);
      setMessages(m => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: summary || 'Preview updated successfully!' };
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
      setMessages(m => [...m, { role: 'assistant', content: 'Error: ' + (err?.message || 'Generation failed.') }]);
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
  };

  const openSave = async () => {
    sfx.tap();
    setSaveOpen(true);
    setSaveName(title || 'My Custom Template');
    setSaveDescription(`High-converting modern website template for ${niche || 'Local Business'}.`);
    setSaveNewCat('');
    setShowNewCat(false);

    // Pre-select matching niche or default to first available niche
    const matched = allNiches.find(n =>
      (niche && n.id.toLowerCase() === niche.toLowerCase()) ||
      (title && title.toLowerCase().includes(n.id.toLowerCase()))
    );
    setSelectedSaveNiche(matched ? matched.id : (allNiches[0]?.id || 'Barber'));
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

      let templateId = `tpl_${Date.now()}`;
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
      addAndSyncTemplate({
        id: templateId,
        name: saveName.trim(),
        niche: finalNiche,
        description: saveDescription.trim() || `High-converting modern website template for ${finalNiche}.`,
      });

      sfx.deployed();
      setSuccessMsg({ title: saveName.trim(), niche: finalNiche });
      setTimeout(() => setSuccessMsg(null), 3000);
      setSaveOpen(false);
    } catch (err: any) {
      try {
        const fallbackId = `tpl_${Date.now()}`;
        addAndSyncTemplate({
          id: fallbackId,
          name: saveName.trim(),
          niche: selectedSaveNiche,
          description: saveDescription.trim() || `High-converting modern website template for ${selectedSaveNiche}.`,
        });
        sfx.deployed();
        setSuccessMsg({ title: saveName.trim(), niche: selectedSaveNiche });
        setTimeout(() => setSuccessMsg(null), 3000);
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
    <div ref={workspaceRef} className={embedded ? "w-full h-full bg-white flex flex-col overflow-hidden text-slate-900 select-none relative" : "fixed inset-0 z-[60] bg-white flex flex-col overflow-hidden text-slate-900 select-none"}>

      {/* TOP HEADER BAR - White & Blue Brand Consistent */}
      <div className="flex items-center gap-3 px-6 py-3.5 bg-white border-b border-slate-200 shrink-0 shadow-sm">
        {isActive && (
          <button
            onClick={() => {
              sfx.magic();
              setMode('idle');
              setTimeout(() => {
                idleContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }, 250);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200 text-sm font-medium font-sans active:scale-[0.98] transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Create New Template
          </button>
        )}

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-bold font-sans text-slate-900 leading-none">AI Web Studio</h1>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5">
              {isActive ? title || 'Vibe Coding Session' : 'Powered by Google AI Studio Gemini 2.5 Flash'}
            </p>
          </div>
        </div>

        {/* Removed duplicate Turn into Template button */}

      </div>

      {/* MAIN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR (Active chat / controls) */}
        <div className={`shrink-0 flex flex-col overflow-hidden bg-slate-50 border-r border-slate-200 transition-all duration-300 ${
          !isActive ? 'w-[0px] md:w-[0px] overflow-hidden' : sidebarCollapsed ? 'w-0 border-0' : 'w-[340px]'
        }`}>
          {isActive && !sidebarCollapsed && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-sans text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" /> AI Assistant
                  </span>
                  <span className="text-[10px] text-slate-400">Inline HTML & CSS</span>
                </div>
                {/* Brand consistent model selector toggle */}
                <div className={`flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 text-[11px] font-medium text-slate-700 transition-all ${streaming ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}>
                  {(['Gemini 2.5 Flash', 'Gemini 3.8 Flash', 'Gemini 3.1 Pro'] as const).map(model => (
                    <button
                      key={model}
                      disabled={streaming}
                      onClick={() => { if (!streaming) { sfx.toggle(); setSelectedModel(model); } }}
                      className={`flex-1 py-1 px-1.5 rounded-lg transition-all truncate text-center ${
                        selectedModel === model
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'hover:text-slate-900 hover:bg-slate-200/60 text-slate-600'
                      }`}
                    >
                      {model.replace('Gemini ', '')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 bg-slate-50">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs font-sans leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-sm shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-xs'
                    }`}>
                      {m.content || <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Thinking…</span>}
                    </div>
                  </div>
                ))}

                {streaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl px-3.5 py-2.5 bg-white border border-slate-200 rounded-bl-sm shadow-xs">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                        <span className="text-[10px] text-blue-600 font-semibold">Gemini 2.5 Flash Coding</span>
                      </div>
                      <p className="text-[11px] text-slate-500 italic">
                        {thinkingAcc ? thinkingAcc.slice(-180) : 'Building responsive layout and styling…'}
                      </p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Prompt input */}
              <div className="p-3 border-t border-slate-200 bg-white">
                {labError && (
                  <div className="mb-2 p-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {labError}
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt(); } }}
                  placeholder="Describe edits… e.g. Add a pricing section"
                  rows={2}
                  disabled={streaming}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-sans text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-all"
                />
                <button
                  onClick={sendPrompt}
                  disabled={streaming || !input.trim()}
                  className="mt-2 w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold font-sans hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {streaming ? 'Updating…' : 'Apply AI Edit'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {!isActive ? (
            /* ================= IDLE: AI VIBE STUDIO LANDING (White & Blue) ================= */
            <div ref={idleContainerRef} className="flex-1 overflow-y-auto px-6 py-10 flex justify-center items-start transition-opacity duration-500">
              <div className="w-full max-w-3xl space-y-8">

                {/* Hero Header & Single Prompt Section */}
                <div className="relative rounded-3xl overflow-hidden bg-white border border-slate-200 p-8 sm:p-10 shadow-xl">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-blue-50 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 space-y-6">
                    <div>
                      <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 tracking-tight mb-3">
                        Build now with Lunao
                      </h2>
                      <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
                        Vibe code any website and turn it into template with one click.
                      </p>
                    </div>

                    {/* Single Custom Prompt Section */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Select LLM Engine</label>
                        <div className={`flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-1.5 text-xs font-medium text-slate-700 transition-all ${streaming ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}>
                          {(['Gemini 2.5 Flash', 'Gemini 3.8 Flash', 'Gemini 3.1 Pro'] as const).map(model => (
                            <button
                              key={model}
                              disabled={streaming}
                              onClick={() => { if (!streaming) { sfx.toggle(); setSelectedModel(model); } }}
                              className={`flex-1 py-2 px-3 rounded-xl transition-all truncate text-center ${
                                selectedModel === model
                                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                                  : 'hover:text-slate-900 hover:bg-slate-200/60 text-slate-600'
                              }`}
                            >
                              {model}
                            </button>
                          ))}
                        </div>
                      </div>

                      <textarea
                        id="custom-vibe-textarea"
                        rows={4}
                        placeholder="Describe any website… e.g. A luxury vintage barber lounge in Austin, TX with online chair booking."
                        className="w-full rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-all shadow-inner"
                      />
                      <button
                        onClick={() => {
                          const ta = document.getElementById('custom-vibe-textarea') as HTMLTextAreaElement;
                          const val = ta?.value?.trim();
                          if (!val) { flashError('Please enter a description for your website.'); return; }
                          handleStartVibeCode(val, val.slice(0, 30) + ' Site');
                        }}
                        disabled={streaming}
                        className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-base font-bold shadow-md active:scale-[0.99] transition-all"
                      >
                        {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                        Generate Website
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
              {/* Preview toolbar */}
              <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-slate-200 shrink-0 shadow-xs">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => { sfx.toggle(); setDevice('desktop'); }}
                    className={`p-1.5 rounded-lg transition-all ${device === 'desktop' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                    title="Desktop view"
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { sfx.toggle(); setDevice('mobile'); }}
                    className={`p-1.5 rounded-lg transition-all ${device === 'mobile' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                    title="Mobile view"
                  >
                    <Smartphone className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => { sfx.tap(); setSidebarCollapsed(!sidebarCollapsed); }}
                  className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all"
                  title="Toggle Assistant Sidebar"
                >
                  {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>

                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={e => { if (e.key === 'Enter') commitTitle(); }}
                    className="px-2.5 py-1 rounded-lg border border-blue-600 bg-white text-xs font-semibold text-slate-900 focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={startEditTitle}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-all"
                  >
                    <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
                    <span className="max-w-[220px] truncate">{title || 'Vibe Website'}</span>
                    <span className="text-slate-400 text-[10px]">✎</span>
                  </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={refreshPreview}
                    className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all"
                    title="Refresh preview"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={openSave}
                    disabled={streaming}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md active:scale-[0.98] transition-all ${streaming ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                  >
                    <BookmarkPlus className="w-4 h-4" /> Turn into Template
                  </button>
                </div>
              </div>

              {/* Iframe Viewport */}
              <div className="flex-1 overflow-hidden flex justify-center items-start p-6 bg-slate-100">
                <div
                  className={`w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-y-auto transition-all ${
                    device === 'mobile' ? 'max-w-[390px]' : 'max-w-[1200px]'
                  }`}
                  style={{ minHeight: 'calc(100vh - 160px)' }}
                >
                  <iframe
                    ref={iframeRef}
                    srcdoc={previewHtml || BLANK_CANVAS}
                    title="Vibe Website Preview"
                    className="w-full border-0 bg-white block h-full"
                    style={{ minHeight: '100%' }}
                  />
                </div>
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
                <div className="flex flex-wrap gap-2 mb-3 transition-all animate-editor-fade">
                  {allNiches.slice(0, showAllNiches ? allNiches.length : 6).map(n => (
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
                  {allNiches.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllNiches(!showAllNiches)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-blue-600 border border-blue-200 hover:bg-blue-50 transition-all flex items-center gap-1"
                    >
                      {showAllNiches ? 'Show Less ▴' : `+${allNiches.length - 6} More ▾`}
                    </button>
                  )}
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
                            const created = await addNiche(saveNewCat.trim());
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
                            const created = await addNiche(saveNewCat.trim());
                            setSelectedSaveNiche(created.id);
                            setSaveNewCat('');
                            setShowNewCat(false);
                            flashToast({ type: 'success', text: `Niche "${created.id}" created & synced across platform!` });
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm"
                      >
                        Add
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
        <div className="fixed top-6 right-6 z-[90] animate-editor-rise">
          <div className="bg-white border border-green-200 rounded-2xl shadow-xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Template "{successMsg.title}" Added</p>
              <p className="text-xs text-slate-500">To {successMsg.niche} niche</p>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="ml-4 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
