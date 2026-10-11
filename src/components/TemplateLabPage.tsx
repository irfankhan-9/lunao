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

  useEffect(() => {
    if (iframeRef.current && previewHtml) {
      iframeRef.current.srcdoc = previewHtml;
    }
  }, [previewHtml]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingAcc]);

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
      setMessages(m => [
        ...m,
        { role: 'assistant', content: 'Vibe code compiled successfully using Gemini 2.5 Flash! Explore your preview on the right or make further edits.' }
      ]);
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
    setSaveCategory(null);
    setSaveNewCat('');
    setShowNewCat(false);
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
      let catId = saveCategory;
      if (showNewCat && saveNewCat.trim()) {
        const cat = await createTemplateCategory({ name: saveNewCat.trim(), color: '#2563EB' });
        catId = cat.id;
        setCategories(prev => [...prev, { id: cat.id, name: cat.name, color: cat.color }]);
      }
      const entry = await createSiteHistory({ title: saveName.trim(), niche: niche || 'Custom Niche', html });
      const result = await convertHistoryToTemplate({
        historyId: entry.id,
        name: saveName.trim(),
        categoryId: catId,
        niche: niche || 'Custom Niche'
      });
      sfx.deployed();
      flashToast({ type: 'success', text: `"${result.name}" added to Templates and Campaigns instantly!` });
      setSaveOpen(false);
      onClose();
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Failed to save template.' });
    } finally {
      setSaving(false);
    }
  };

  const isActive = mode === 'active';

  return (
    <div className={embedded ? "w-full h-full bg-white flex flex-col overflow-hidden text-slate-900 select-none relative" : "fixed inset-0 z-[60] bg-white flex flex-col overflow-hidden text-slate-900 select-none"}>

      {/* TOP HEADER BAR - White & Blue Brand Consistent */}
      <div className="flex items-center gap-3 px-6 py-3.5 bg-white border-b border-slate-200 shrink-0 shadow-sm">
        <button
          onClick={() => { sfx.close(); onClose(); }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200 text-sm font-medium font-sans active:scale-[0.98] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-bold font-sans text-slate-900 leading-none">AI Web Studio</h1>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5">
              {isActive ? title || 'Vibe Coding Session' : 'Powered by Google AI Studio Gemini 2.5 Flash'}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isActive && (
            <button
              onClick={openSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold font-sans shadow-md active:scale-[0.98] transition-all"
            >
              <BookmarkPlus className="w-4 h-4" />
              Turn into Template
            </button>
          )}
          <button
            onClick={() => { sfx.open(); onBrowseTemplates(); }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 text-sm font-medium font-sans active:scale-[0.98] transition-all"
          >
            <Layout className="w-4 h-4 text-blue-600" />
            Template Gallery
          </button>
        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR (Active chat / controls) */}
        <div className={`shrink-0 flex flex-col overflow-hidden bg-slate-50 border-r border-slate-200 transition-all duration-300 ${
          !isActive ? 'w-[0px] md:w-[0px] overflow-hidden' : sidebarCollapsed ? 'w-0 border-0' : 'w-[340px]'
        }`}>
          {isActive && !sidebarCollapsed && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-white">
                <span className="text-xs font-bold font-sans text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" /> Gemini 2.5 Assistant
                </span>
                <span className="text-[10px] text-slate-400">Inline HTML & CSS</span>
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
            <div className="flex-1 overflow-y-auto px-6 py-10 flex justify-center items-start">
              <div className="w-full max-w-3xl space-y-8">

                {/* Hero Header & Single Prompt Section */}
                <div className="relative rounded-3xl overflow-hidden bg-white border border-slate-200 p-8 sm:p-10 shadow-xl">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-blue-50 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 space-y-6">
                    <div>
                      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-4">
                        <Sparkles className="w-3.5 h-3.5" />
                        Google AI Studio Gemini 2.5 Flash
                      </div>
                      <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 tracking-tight mb-3">
                        Build Now lunao
                      </h2>
                      <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
                        Wipe code any website and turn it into template with one click.
                      </p>
                    </div>

                    {/* Single Custom Prompt Section */}
                    <div className="space-y-3">
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
                    onClick={() => {
                      sfx.tap();
                      setMode('idle');
                      setHtml('');
                      setPreviewHtml('');
                      setMessages([]);
                      setTitle('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 text-xs font-semibold transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> New Vibe
                  </button>

                  <button
                    onClick={openSave}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md active:scale-[0.98] transition-all"
                  >
                    <BookmarkPlus className="w-4 h-4" /> Turn into Template
                  </button>
                </div>
              </div>

              {/* Iframe Viewport */}
              <div className="flex-1 overflow-auto flex justify-center items-start p-6 bg-slate-100">
                <div
                  className={`w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden transition-all ${
                    device === 'mobile' ? 'max-w-[390px]' : 'max-w-[1200px]'
                  }`}
                  style={{ minHeight: 'calc(100vh - 160px)' }}
                >
                  <iframe
                    ref={iframeRef}
                    srcdoc={previewHtml || BLANK_CANVAS}
                    title="Vibe Website Preview"
                    className="w-full border-0 bg-white block"
                    style={{ minHeight: 'calc(100vh - 160px)' }}
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Select Niche / Category</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    onClick={() => { setSaveCategory(null); setShowNewCat(false); }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
                      saveCategory === null && !showNewCat ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    General Niche
                  </button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSaveCategory(c.id); setShowNewCat(false); }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${
                        saveCategory === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </button>
                  ))}
                  <button
                    onClick={() => { setShowNewCat(!showNewCat); setSaveCategory(null); }}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-100 border border-dashed border-slate-300 text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Create New Niche
                  </button>
                </div>

                {showNewCat && (
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <input
                      value={saveNewCat}
                      onChange={e => setSaveNewCat(e.target.value)}
                      placeholder="New niche name (e.g. Pet Grooming, Accounting)…"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                    />
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

    </div>
  );
};
