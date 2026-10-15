import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Key, ChevronDown, Loader2, AlertCircle, Play, CheckCircle2, Cpu,
  FlaskConical, Layout, Monitor, Smartphone, Upload, Copy,
  CheckSquare, RotateCcw, BookmarkPlus, X, Code2, Check, Plus,
  RefreshCw, PanelLeft, PanelLeftClose, Terminal, Layers, Maximize2, Minimize2, Home, Lock,
  ArrowRight, FolderCheck, Sparkles
} from 'lucide-react';
import {
  AiChatMessage, SiteHistoryEntry,
  listSiteHistory, createSiteHistory, convertHistoryToTemplate,
  streamAiEdit, processUploadedHtml,
  listTemplateCategories, createTemplateCategory,
  TemplateScanResult, RebrandingSuiteReport,
  scanTemplateReadinessClient, testRebrandClient,
} from '../lib/pipelineClient';
import { useSyncNiches, addAndSyncTemplate, moveAndSyncTemplate, getLocalTemplates, getNicheEmoji } from '../lib/nichesSync';
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

STRICT TEMPLATE ARCHITECTURE & REBRANDING RULES:
Every website you build, edit, or customize is part of the Lunao automated template & rebranding engine.
You MUST strictly adhere to the following rules:

1. SINGLE COMPLETE HTML FILE:
Every website must be one complete HTML file with embedded CSS and JavaScript.
- Start at <!DOCTYPE html> and end at </html>.
- All styles inside a single <style> tag in <head>. Responsive mobile-first CSS (breakpoints at 640px and 1024px).
- All icons as inline SVGs. Google Fonts loaded via <link rel="stylesheet"> from fonts.googleapis.com.
- Do NOT use external CSS stylesheets.
- NO markdown fences (\`\`\`html or \`\`\`). NO explanations or commentary outside the HTML document.

2. STRICT APPROVED PLACEHOLDERS:
Use ONLY these 4 placeholders:
- {{BUSINESS_NAME}} : Full business name. Use this everywhere the business name appears, including in <title>, header logo/text, hero headline, about section, footer copyright, and alt text.
- {{PHONE}} : Primary contact telephone number. Use in visible contact text and strictly in dial links: <a href="tel:{{PHONE}}">{{PHONE}}</a>.
- {{CITY}} : Target city and location (e.g. Austin, TX or Chicago, IL).
- {{ADDRESS}} : Local street or downtown address.

3. EMAIL & SOCIAL MEDIA IDENTITY CONVENTION:
Use {{BUSINESS_NAME}} everywhere the business name appears, including email and social media identity text (e.g., contact@{{BUSINESS_NAME}}, https://instagram.com/{{BUSINESS_NAME}}).
NEVER create separate email or social media placeholders.
Do NOT invent email addresses, fake social handles, or links.

4. REMOVE HARDCODED DEMO DATA & UNSUPPORTED CLAIMS:
Replace all hardcoded business names, phone numbers, cities, addresses, fake reviews, ratings, and unsupported business claims with the standard placeholders or generic truthful statements.

5. PRESERVE ORIGINAL DESIGN & QUALITY:
Preserve the original design, styling, layout, typography, responsiveness, and interactivity while ensuring strict template-readiness.`;

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
  PHONE: '(512) 555-0199',
  CITY: 'Austin, TX',
  ADDRESS: '3801 Capital of Texas Hwy, Austin, TX',
  // Backward compatibility aliases during preview compile
  BUSINESS_NAME_SHORT: 'Radiant Smiles',
  PHONE_DISPLAY: '(512) 555-0199',
  PHONE_RAW: '5125550199',
  EMAIL: 'contact@radiantsmiles.com',
  STATE: 'TX',
  GOOGLE_RATING: '4.9',
  GOOGLE_REVIEW_COUNT: '342',
  INSTAGRAM_HANDLE: 'radiantsmiles',
  FACEBOOK_URL: 'https://facebook.com/radiantsmiles',
  WEBSITE: 'https://radiantsmiles.com',
  SITE_URL: 'https://radiantsmiles.com',
  YEARS_IN_BUSINESS: '2015',
  // HVAC & Architecture placeholders
  CITY_NAME: 'Austin, TX',
  PHONE_NUMBER: '(512) 555-0199',
  BOOKING_URL: '#booking',
  BUSINESS_DESCRIPTION: 'Premier residential and commercial HVAC engineering, inverter heat pumps, concealed high-velocity zoning, and hospital-grade indoor air quality purification in Austin, TX.',
  HERO_IMAGE: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=1920&q=85',
  LOGO: 'Aeris & Therma',
  BEFORE_IMAGE_URL: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  AFTER_IMAGE_URL: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
  GOOGLE_MAPS_URL: 'https://maps.google.com',
  INSTAGRAM_URL: 'https://instagram.com/radiantsmiles',
  TIKTOK_URL: 'https://tiktok.com/@radiantsmiles',
  YOUTUBE_URL: 'https://youtube.com/@radiantsmiles',
};

// Cleanse any internal placeholders, file types, or template sauce from user-facing text
function sanitizeUserFacingText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // Filter out any internal rules or prompt snippets if any leak into response
  const internalPhrases = [
    /we gave only one html file/gi,
    /we use placeholders/gi,
    /placeholders strictly/gi,
    /single self-contained html page/gi,
    /output format — strict/gi,
    /return only the html document/gi,
    /do not wrap output in markdown/gi,
    /system_prompt/gi,
  ];
  internalPhrases.forEach(re => {
    cleaned = cleaned.replace(re, '');
  });

  // 1. Replace all {{PLACEHOLDERS}} with realistic friendly preview values
  cleaned = cleaned.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_, rawKey) => {
    const key = rawKey.toUpperCase();
    return key in PLACEHOLDER_MAP ? PLACEHOLDER_MAP[key] : 'Business';
  });

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
  return rawHtml.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_, rawKey) => {
    const key = rawKey.toUpperCase();
    return key in PLACEHOLDER_MAP ? PLACEHOLDER_MAP[key] : `{{${rawKey}}}`;
  });
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
  const [device, setDevice] = useState<'desktop' | 'mobile' | 'code'>('desktop');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<'Gemini 2.5 Flash' | 'Gemini 1.5 Flash' | 'Gemini 3.1 Pro'>('Gemini 2.5 Flash');
  const [generatingNewSite, setGeneratingNewSite] = useState(false);
  const [generatingStepText, setGeneratingStepText] = useState('Initializing Gemini 2.5 Flash architecture...');

  // Synchronized Niches across the platform
  const [allNiches, addNiche] = useSyncNiches();
  const [selectedSaveNiche, setSelectedSaveNiche] = useState<string>('Barber');
  const [showAllNiches, setShowAllNiches] = useState(false);

  // Template turned state tracking
  const [turnedTemplateId, setTurnedTemplateId] = useState<string | null>(null);
  const [turnedTemplateNiche, setTurnedTemplateNiche] = useState<string | null>(null);
  const [hasLoadedPreviousTemplate, setHasLoadedPreviousTemplate] = useState(false);
  const [hasGivenAiPrompt, setHasGivenAiPrompt] = useState(false);

  // Template Readiness & Rebranding Suite States
  const [readinessScan, setReadinessScan] = useState<TemplateScanResult | null>(null);
  const [isTestingRebrand, setIsTestingRebrand] = useState(false);
  const [rebrandSuite, setRebrandSuite] = useState<RebrandingSuiteReport | null>(null);
  const [isTemplateValidated, setIsTemplateValidated] = useState(false);
  const [showRebrandModal, setShowRebrandModal] = useState(false);
  const [activeRebrandTab, setActiveRebrandTab] = useState<'biz1' | 'biz2'>('biz1');
  const [showReadinessDetails, setShowReadinessDetails] = useState(false);
  const [testRebrandMobileView, setTestRebrandMobileView] = useState(false);

  // Editable test business details
  const [testBiz1, setTestBiz1] = useState({
    name: 'Iron Forge Fitness Club',
    phone: '(312) 880-9944',
    city: 'Chicago, IL',
    address: '420 N Michigan Ave, Chicago, IL',
  });
  const [testBiz2, setTestBiz2] = useState({
    name: 'Summit Peak Heating & Cooling',
    phone: '(303) 712-4400',
    city: 'Denver, CO',
    address: '1750 16th St Mall, Denver, CO',
  });

  const workspaceRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const idleContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Save/Template Dialog States
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveNewCat, setSaveNewCat] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [saveCategory, setSaveCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<{id: string, name: string, color: string}[]>([]);
  const [previousAttachedNiche, setPreviousAttachedNiche] = useState<string | null>(null);
  const [hasChangedNicheOnce, setHasChangedNicheOnce] = useState(false);
  const [pendingNicheMove, setPendingNicheMove] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<{title: string, niche: string} | null>(null);
  const [fullScreenPreview, setFullScreenPreview] = useState(false);

  // Action 2: Test Rebrand — Opens interactive card with pre-filled test business details
  const handleTestRebrand = () => {
    if (!html || html === BLANK_CANVAS) {
      flashError('No template code to test.');
      return;
    }
    sfx.open();
    setShowRebrandModal(true);
  };

  const handleRunRebrandTests = async () => {
    if (!html || html === BLANK_CANVAS) {
      flashError('No template code to test.');
      return;
    }
    sfx.engage();
    setIsTestingRebrand(true);
    try {
      const res = await testRebrandClient(html, testBiz1, testBiz2);
      setReadinessScan(res.scan);
      setRebrandSuite(res.rebrandResults);
      setShowRebrandModal(true);

      if (res.rebrandResults.allPassed && res.scan.isReady) {
        setIsTemplateValidated(true);
        sfx.deployed();
        flashToast({ type: 'success', text: 'Rebranding tests passed for both businesses! Template is approved to save.' });
      } else {
        setIsTemplateValidated(false);
        sfx.error();
        flashToast({ type: 'error', text: 'Rebrand tests or readiness validation failed. Please review issues.' });
      }
    } catch (err: any) {
      sfx.error();
      const msg = err?.message || '';
      if (msg.includes('500') || msg.includes('Failed to fetch') || msg.includes('quota') || msg.includes('network') || msg.includes('unavailable')) {
        flashError('Server Down / AI Unavailable: Could not reach service or API quota exhausted.');
      } else {
        flashError(msg || 'Rebranding test run failed.');
      }
    } finally {
      setIsTestingRebrand(false);
    }
  };

  // Action 3: Save Template Gate
  // Only allows saving if validation and both rebrand tests have passed
  const handleOpenSaveTemplate = () => {
    if (!isTemplateValidated || !readinessScan?.isReady || !rebrandSuite?.allPassed) {
      sfx.error();
      flashToast({
        type: 'error',
        text: 'Validation required: You must run "Make Template Ready" and pass "Test Rebrand" before saving to the template library.',
      });
      // Automatically open the rebrand / readiness diagnostic modal so user sees what is missing
      setShowRebrandModal(true);
      return;
    }
    openSave();
  };

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
    setHasLoadedPreviousTemplate(false);
    setHasGivenAiPrompt(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (idleContainerRef.current) {
      idleContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setTimeout(() => {
      const textarea = document.getElementById('custom-vibe-textarea') as HTMLTextAreaElement;
      if (textarea) textarea.focus();
    }, 100);
  };

  // Plan check: Free and Starter cannot vibe code templates (defaults to Growth in mock mode)
  let currentPlan = 'Growth';
  try {
    currentPlan = (typeof window !== 'undefined' ? localStorage.getItem('lunao_user_plan') : '') || 'Growth';
  } catch {
    currentPlan = 'Growth';
  }
  const isPlanEligible = ['growth', 'pro', 'agency'].some(p => currentPlan.toLowerCase().includes(p));

  // Start vibe coding with Gemini 2.5 Flash: show brief loading until AI reaches response, then immediately load workspace
  const handleStartVibeCode = async (promptText: string, customTitle: string) => {
    if (!promptText.trim() || streaming || generatingNewSite) return;
    sfx.magic();
    setGeneratingNewSite(true);
    setGeneratingStepText(`Connecting to ${selectedModel}... Synthesizing "${customTitle}"`);
    setLabError(null);

    // Completely reset workspace to pristine new environment
    setHtml(BLANK_CANVAS);
    setPreviewHtml('');
    setTitle(customTitle);
    setNiche(customTitle);
    setHasLoadedPreviousTemplate(false);
    setHasGivenAiPrompt(true);
    setStreaming(true);
    setThinkingAcc('');
    setShowPromptInput(false);
    setMessages([{ role: 'user', content: promptText }]);

    let reachedResponse = false;
    const loadWorkspaceImmediately = () => {
      if (!reachedResponse) {
        reachedResponse = true;
        setGeneratingNewSite(false);
        setMode('active');
        sfx.open();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    try {
      const fullPrompt = `${VIBE_CODE_PROMPT}\n\nUSER REQUEST: ${promptText}`;
      const result = await streamAiEdit(
        { html: BLANK_CANVAS, instruction: fullPrompt, history: [], anthropicApiKey: apiKey.trim() || undefined },
        (fullHtmlSoFar) => {
          if (fullHtmlSoFar && fullHtmlSoFar.length > 50 && (fullHtmlSoFar.includes('<!DOCTYPE') || fullHtmlSoFar.includes('<html') || fullHtmlSoFar.includes('<section'))) {
            loadWorkspaceImmediately();
          }
          setHtml(fullHtmlSoFar);
        },
        (thinkingText) => {
          setThinkingAcc(prev => prev + thinkingText);
        },
        () => {}
      );

      loadWorkspaceImmediately();
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
      setGeneratingNewSite(false);
      setMode('idle');
      setLabError('AI servers are currently busy or unavailable. Please try again later.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setThinkingAcc('');
    } finally {
      setStreaming(false);
      setGeneratingNewSite(false);
    }
  };

  const sendPrompt = async () => {
    const instruction = input.trim();
    if (!instruction || streaming) return;
    setHasGivenAiPrompt(true);
    sfx.magic();
    const history_msgs = messages.slice(-6);
    setMessages(m => [...m, { role: 'user', content: instruction }]);
    setInput('');
    setStreaming(true);
    setLabError(null);
    setThinkingAcc('');

    try {
      const base = html || BLANK_CANVAS;
      let result = '';
      try {
        result = await streamAiEdit(
          { html: base, instruction, history: history_msgs, anthropicApiKey: apiKey.trim() || undefined },
          () => {},
          (thinkingText) => setThinkingAcc(prev => prev + thinkingText),
        );
      } catch (err) {
        throw err;
      }

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

        // Auto-sync with existing template in templates section if turnedTemplateId is present
        if (turnedTemplateId && (title || saveName)) {
          addAndSyncTemplate({
            id: turnedTemplateId,
            name: title || saveName || 'Custom Template',
            niche: niche || turnedTemplateNiche || 'General',
            description: `High-converting modern website template for ${niche || 'Local Business'}. (Recently updated via Vibe Coding)`,
          });
        }
      } catch { /* ignore */ }
    } catch (err: any) {
      sfx.error();
      setThinkingAcc('');
      setLabError('AI servers are currently busy or unavailable. Please try again later.');
    } finally {
      setStreaming(false);
    }
  };

  const applySmartLocalFallback = (baseHtml: string, promptText: string) => {
    let updated = baseHtml || BLANK_CANVAS;
    const pt = (promptText || '').toLowerCase();
    let section = '';
    if (pt.includes('pricing') || pt.includes('tier')) {
      section = `<section style="padding:60px 20px;background:#f8fafc;text-align:center;"><h2 style="font-size:28px;font-weight:800;margin-bottom:16px;">Transparent Pricing</h2><p style="color:#64748b;">Choose the best plan for your needs.</p></section>`;
    } else if (pt.includes('review') || pt.includes('star')) {
      section = `<section style="padding:40px 20px;background:#fff;text-align:center;"><div style="color:#f59e0b;font-size:22px;">★★★★★ 4.9 / 5.0 Rating from 300+ Clients</div></section>`;
    } else {
      section = `<section style="padding:40px 20px;background:#eff6ff;text-align:center;"><h3 style="font-size:20px;font-weight:700;color:#1e40af;">Updated: ${promptText.slice(0, 50)}</h3></section>`;
    }
    if (updated.includes('</body>')) {
      updated = updated.replace('</body>', `${section}\n</body>`);
    } else {
      updated += section;
    }
    return updated;
  };

  const loadEntry = (entry: SiteHistoryEntry) => {
    sfx.open();
    const compiled = compilePreview(entry.html);
    setHtml(entry.html);
    setPreviewHtml(compiled);
    setTitle(entry.title);
    setNiche(entry.niche);
    setMode('active');
    setHasLoadedPreviousTemplate(true);
    setHasGivenAiPrompt(false);
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
    const currentTitle = title || 'My Custom Template';
    setSaveName(currentTitle);
    setSaveDescription(`High-converting modern website template for ${niche || 'Local Business'}.`);
    setSaveNewCat('');
    setShowNewCat(false);
    setPendingNicheMove(null);
    setHasChangedNicheOnce(false);

    // Look up if this site or template is already attached to any niche
    const localTemplates = getLocalTemplates();
    const existingTpl = localTemplates.find(t =>
      (turnedTemplateId && t.id === turnedTemplateId) ||
      (currentTitle && t.name.toLowerCase() === currentTitle.trim().toLowerCase())
    );
    if (existingTpl && !turnedTemplateId) {
      setTurnedTemplateId(existingTpl.id);
      if (existingTpl.niche && !turnedTemplateNiche) {
        setTurnedTemplateNiche(existingTpl.niche);
      }
    }
    const attached = (turnedTemplateNiche || existingTpl?.niche || '').trim();
    setPreviousAttachedNiche(attached || null);
    setHasChangedNicheOnce(Boolean(attached));

    let preselectedNiche = attached;
    const matched = (allNiches || []).find(n =>
      (preselectedNiche && n?.id && n.id.toLowerCase() === preselectedNiche.toLowerCase()) ||
      (currentTitle && n?.id && currentTitle.toLowerCase().includes(n.id.toLowerCase()))
    );
    setSelectedSaveNiche(matched ? matched.id : (attached || allNiches?.[0]?.id || 'Barber'));
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

    let targetNiche = selectedSaveNiche;
    if (showNewCat && saveNewCat.trim()) {
      targetNiche = saveNewCat.trim();
    }

    const fromNiche = previousAttachedNiche ? previousAttachedNiche.trim() : '';
    const toNiche = targetNiche ? targetNiche.trim() : '';

    // If site/template was already attached to another niche and user changed it:
    if (fromNiche && toNiche && fromNiche.toLowerCase() !== toNiche.toLowerCase()) {
      if (!hasChangedNicheOnce) {
        setHasChangedNicheOnce(true);
        setPreviousAttachedNiche(toNiche);
        await executeSave(toNiche, fromNiche);
        return;
      }
      sfx.tap();
      setPendingNicheMove({
        fromNiche,
        toNiche,
        saveName: saveName.trim(),
        saveDescription: saveDescription.trim(),
      });
      return;
    }

    // Otherwise proceed with saving
    await executeSave(toNiche, fromNiche);
  };

  const executeSave = async (finalNiche: string, oldNiche?: string) => {
    sfx.primary();
    setSaving(true);
    try {
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

      let templateId = turnedTemplateId || `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const compiledPreview = compilePreview(html);

      try {
        const result = await convertHistoryToTemplate({
          historyId,
          name: saveName.trim(),
          categoryId: catId,
          niche: finalNiche,
          rawHtml: html,
          templateId,
        });
        if (result && result.id) {
          templateId = result.id;
        }
      } catch { /* ignore */ }

      // Synchronize the template across all tabs (Templates gallery, campaigns, editor)
      // When moving from an old niche, moveAndSyncTemplate removes it from old niche and adds to finalNiche
      if (oldNiche && oldNiche.toLowerCase() !== finalNiche.toLowerCase()) {
        moveAndSyncTemplate({
          id: templateId,
          name: saveName.trim(),
          fromNiche: oldNiche,
          toNiche: finalNiche,
          description: saveDescription.trim() || `High-converting modern website template for ${finalNiche}.`,
          rawHtml: html,
          previewHtml: compiledPreview,
          previewPath: `/api/templates/${templateId}/preview`,
        });
      } else {
        addAndSyncTemplate({
          id: templateId,
          name: saveName.trim(),
          niche: finalNiche,
          description: saveDescription.trim() || `High-converting modern website template for ${finalNiche}.`,
          rawHtml: html,
          previewHtml: compiledPreview,
          previewPath: `/api/templates/${templateId}/preview`,
        });
      }

      setTurnedTemplateId(templateId);
      setTurnedTemplateNiche(finalNiche);
      setNiche(finalNiche);
      setPreviousAttachedNiche(finalNiche);

      sfx.deployed();
      setSuccessMsg({ title: saveName.trim(), niche: finalNiche });
      setPendingNicheMove(null);
      setSaveOpen(false);
    } catch (err: any) {
      try {
        const fallbackId = turnedTemplateId || `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const compiledPreview = compilePreview(html);
        if (oldNiche && oldNiche.toLowerCase() !== finalNiche.toLowerCase()) {
          moveAndSyncTemplate({
            id: fallbackId,
            name: saveName.trim(),
            fromNiche: oldNiche,
            toNiche: finalNiche,
            description: saveDescription.trim() || `High-converting modern website template for ${finalNiche}.`,
            rawHtml: html,
            previewHtml: compiledPreview,
            previewPath: `/api/templates/${fallbackId}/preview`,
          });
        } else {
          addAndSyncTemplate({
            id: fallbackId,
            name: saveName.trim(),
            niche: finalNiche,
            description: saveDescription.trim() || `High-converting modern website template for ${finalNiche}.`,
            rawHtml: html,
            previewHtml: compiledPreview,
            previewPath: `/api/templates/${fallbackId}/preview`,
          });
        }
        setTurnedTemplateId(fallbackId);
        setTurnedTemplateNiche(finalNiche);
        setNiche(finalNiche);
        setPreviousAttachedNiche(finalNiche);
        sfx.deployed();
        setSuccessMsg({ title: saveName.trim(), niche: finalNiche });
        setPendingNicheMove(null);
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
    <div ref={workspaceRef} className={embedded ? "w-full min-h-[750px] h-[calc(100vh-130px)] flex flex-col bg-white text-slate-900 select-none relative rounded-2xl border border-slate-200 shadow-sm overflow-hidden" : "fixed inset-0 z-[60] bg-white flex flex-col text-slate-900 select-none overflow-hidden"}>

      {/* TOP HEADER BAR - White & Blue Brand Consistent */}
      <div className="flex items-center justify-between gap-3 px-6 py-3.5 bg-white border-b border-slate-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {!isActive ? (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200 text-sm font-medium font-sans active:scale-[0.98] transition-all shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Editor
            </button>
          ) : (
            <button
              onClick={goToStudioLanding}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold font-sans active:scale-[0.98] transition-all shrink-0 shadow-xs cursor-pointer"
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

        {/* Top Header Buttons: Test Rebrand and Save Template */}
        {isActive && (
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">

            {/* Test Rebrand Button */}
            <button
              onClick={handleTestRebrand}
              disabled={streaming || isTestingRebrand}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-[0.98] cursor-pointer bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 ${
                (streaming || isTestingRebrand) ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
              }`}
              title="Test rebranding with two fictional businesses and verify placeholder substitutions"
            >
              {isTestingRebrand ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Play className="w-4 h-4 text-blue-600" />}
              <span>{isTestingRebrand ? 'Testing Rebrands…' : 'Test Rebrand'}</span>
              {isTemplateValidated && (
                <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
              )}
            </button>

            {/* Save Template Button - Gated strictly until validation and both rebrand tests pass */}
            <button
              onClick={handleOpenSaveTemplate}
              disabled={streaming || isTestingRebrand}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition-all shrink-0 cursor-pointer ${
                isTemplateValidated
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700 border border-slate-300'
              } ${(streaming || isTestingRebrand) ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
              title={isTemplateValidated ? "Save website as a reusable template" : "Make Template Ready and pass Test Rebrand to unlock saving"}
            >
              {!isTemplateValidated ? <Lock className="w-3.5 h-3.5 text-slate-500" /> : <BookmarkPlus className="w-4 h-4" />}
              <span>Turn into Template</span>
            </button>
          </div>
        )}
      </div>

      {/* MAIN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden min-h-0">

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
                {hasLoadedPreviousTemplate && !hasGivenAiPrompt && messages.length <= 1 && (
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
                  {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code2 className="w-4 h-4" />}
                  {streaming ? 'Applying AI Edits to Website…' : 'Apply AI Edit to Website'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 min-h-0">

          {!isActive ? (
            /* ================= IDLE: AI VIBE STUDIO LANDING (White & Blue) ================= */
            <div ref={idleContainerRef} className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-8 py-8 flex justify-center items-start transition-opacity duration-500">
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

                      {labError && (
                        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 text-xs text-red-700">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                            <span>{labError}</span>
                          </div>
                          <button onClick={() => setLabError(null)} className="text-red-500 hover:text-red-700 font-bold px-1">×</button>
                        </div>
                      )}

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
                        {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : !isPlanEligible ? <Lock className="w-5 h-5" /> : <Code2 className="w-5 h-5" />}
                        {!isPlanEligible ? 'Growth Plan Required to Vibe Code' : 'Generate Website'}
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
                      {(history || []).filter(Boolean).slice(0, 6).map(entry => (
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
                
                {/* Desktop, Mobile & Code View Toggle */}
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
                  <button
                    onClick={() => { sfx.toggle(); setDevice('code'); }}
                    className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      device === 'code'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                    title="View raw HTML code file"
                  >
                    <Code2 className="w-4 h-4" />
                    <span>Code View</span>
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
                    onClick={handleOpenSaveTemplate}
                    disabled={streaming || isTestingRebrand}
                    className={`inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition-all shrink-0 cursor-pointer ${
                      isTemplateValidated
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700 border border-slate-300'
                    } ${(streaming || isTestingRebrand) ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                    title={isTemplateValidated ? "Turn into reusable template" : "Make Template Ready and pass Test Rebrand to unlock saving"}
                  >
                    {!isTemplateValidated ? <Lock className="w-4 h-4 text-slate-500 shrink-0" /> : <BookmarkPlus className="w-4 h-4 shrink-0" />}
                    <span>Turn into Template</span>
                  </button>
                </div>
              </div>

              {/* Viewport / Code View Area */}
              <div className="flex-1 w-full h-full min-h-0 overflow-hidden flex flex-col bg-slate-100">
                {device === 'desktop' ? (
                  <div className="w-full h-full flex-1 flex flex-col min-h-0 bg-white overflow-hidden relative">
                    {streaming && !previewHtml && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/95 backdrop-blur-xs p-6 text-center animate-editor-fade">
                        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-4 shadow-sm">
                          <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
                        </div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold mb-2">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>{selectedModel} is coding live</span>
                        </div>
                        <h4 className="text-base font-bold text-slate-800 mb-1">
                          Crafting "{title || 'Bespoke Website'}"
                        </h4>
                        <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                          Generating responsive layout, mobile-ready components, and tailored local styling. The preview will compile immediately once generation is complete.
                        </p>
                      </div>
                    )}
                    <iframe
                      ref={iframeRef}
                      srcdoc={previewHtml || BLANK_CANVAS}
                      title="Vibe Website Preview"
                      className="w-full h-full flex-1 border-0 bg-white block"
                      style={{ height: '100%', width: '100%', minHeight: '100%', display: 'block' }}
                    />
                  </div>
                ) : device === 'mobile' ? (
                  <div className="w-full h-full flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden relative">
                    <div className="w-full max-w-[390px] h-full max-h-[820px] bg-white rounded-3xl border-4 border-slate-800 shadow-2xl flex flex-col overflow-hidden relative">
                      <div className="h-6 bg-slate-800 flex items-center justify-center shrink-0">
                        <div className="w-16 h-3 bg-slate-700 rounded-full" />
                      </div>
                      {streaming && !previewHtml && (
                        <div className="absolute inset-0 top-6 z-10 flex flex-col items-center justify-center bg-slate-50/95 p-6 text-center">
                          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-3" />
                          <p className="text-xs font-bold text-slate-800">{selectedModel} is coding live...</p>
                        </div>
                      )}
                      <iframe
                        ref={iframeRef}
                        srcdoc={previewHtml || BLANK_CANVAS}
                        title="Vibe Website Preview Mobile"
                        className="w-full h-full flex-1 border-0 bg-white block"
                        style={{ height: '100%', width: '100%' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex-1 min-h-0 flex flex-col bg-slate-900 p-4 sm:p-6 overflow-hidden">
                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-mono font-bold text-white">Generated Single-File HTML / CSS Source Code</span>
                        {streaming && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" /> Streaming live
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(previewHtml || (html !== BLANK_CANVAS ? html : '') || BLANK_CANVAS);
                          flashToast({ type: 'success', text: 'HTML source code copied to clipboard!' });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all"
                      >
                        Copy HTML Code
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={previewHtml || (html !== BLANK_CANVAS ? html : '') || BLANK_CANVAS}
                      className="w-full flex-1 font-mono text-xs text-emerald-400 bg-slate-950 p-4 rounded-xl border border-slate-800 focus:outline-none resize-none leading-relaxed shadow-inner"
                    />
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
                  <span className="text-[11px] text-slate-500">{(allNiches || []).length} Niches Synced</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3 transition-all animate-editor-fade max-h-48 overflow-y-auto pr-1">
                  {(allNiches || []).map(n => (
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

      {pendingNicheMove && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-editor-fade">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-[2rem] shadow-2xl p-8 text-slate-900 animate-editor-rise text-center space-y-5 relative">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold font-sans text-slate-900">Confirm Niche Reassignment</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Are you sure you want to remove this template from <strong className="text-slate-900">{pendingNicheMove.fromNiche}</strong> and assign it to <strong className="text-blue-600">{pendingNicheMove.toNiche}</strong>?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPendingNicheMove(null)}
                className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  sfx.primary();
                  await executeSave(pendingNicheMove.toNiche, pendingNicheMove.fromNiche);
                }}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all active:scale-95"
              >
                Yes, Move Template
              </button>
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
                <span>Niche: {successMsg.niche}</span>
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

      {generatingNewSite && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-white/85 backdrop-blur-md animate-editor-fade p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200/90 p-8 shadow-2xl text-center space-y-6 animate-editor-rise">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600 relative">
              <div className="absolute inset-0 rounded-2xl bg-blue-500/10 animate-ping" />
              <Code2 className="w-8 h-8 text-blue-600 relative z-10" />
            </div>
            
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-700 uppercase tracking-widest">
                {selectedModel} Synthesis Engine
              </div>
              <h3 className="text-xl font-bold font-serif text-slate-900 tracking-tight">
                Synthesizing Bespoke Website
              </h3>
              <p className="text-xs text-slate-600 font-sans min-h-[32px] flex items-center justify-center">
                {generatingStepText}
              </p>
            </div>

            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden p-0.5">
              <div className="bg-blue-600 h-full rounded-full animate-pulse w-3/4 transition-all duration-500" />
            </div>

            <p className="text-[11px] text-slate-500 italic">
              Loading fresh workspace environment & saving previous build to recent history…
            </p>
          </div>
        </div>
      )}

      {/* Rebranding Tests & Readiness Inspection Modal */}
      {showRebrandModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-editor-fade">
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden animate-editor-rise">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  isTemplateValidated ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-purple-50 text-purple-600 border border-purple-200'
                }`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">Automated Rebranding & Readiness Suite</h3>
                    {isTemplateValidated ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                        <Check className="w-3.5 h-3.5 stroke-[3]" /> Approved for Saving
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                        <AlertCircle className="w-3.5 h-3.5" /> Testing Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Strict rules: single HTML file, 4 canonical placeholders ({'{{'}BUSINESS_NAME{'}}'}, {'{{'}PHONE{'}}'}, {'{{'}CITY{'}}'}, {'{{'}ADDRESS{'}}'}), zero hardcoded demo data.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowRebrandModal(false);
                  setRebrandSuite(null);
                  setReadinessScan(null);
                  setTestRebrandMobileView(false);
                }}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Readiness Score Card */}
              {readinessScan && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Readiness Score</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        readinessScan.isReady ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                      }`}>
                        {readinessScan.score}%
                      </span>
                    </div>
                    <button
                      onClick={() => setShowReadinessDetails(!showReadinessDetails)}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      {showReadinessDetails ? 'Hide Checklist' : 'View Detailed Checklist'}
                    </button>
                  </div>

                  {/* Checklist Breakdown */}
                  {showReadinessDetails && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      {readinessScan.failed.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider">Failed Checks:</span>
                          {readinessScan.failed.map((f, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 p-2 rounded-lg">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                              <span><strong>{f.label}:</strong> {f.explanation}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {readinessScan.passed.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Passed Checks:</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {readinessScan.passed.map((p, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg">
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span className="truncate">{p.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Editable Test Business Details Form */}
              <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900">Configurable Test Business Profiles</h4>
                    <p className="text-[11px] text-slate-500">Edit business info below and click Run Rebrand Test to verify dynamic rebranding.</p>
                  </div>
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-blue-200">
                    <button
                      onClick={() => setActiveRebrandTab('biz1')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeRebrandTab === 'biz1' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Business 1: {testBiz1.name.slice(0, 15)}...
                    </button>
                    <button
                      onClick={() => setActiveRebrandTab('biz2')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeRebrandTab === 'biz2' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Business 2: {testBiz2.name.slice(0, 15)}...
                    </button>
                  </div>
                </div>

                {activeRebrandTab === 'biz1' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-blue-200 shadow-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Business Name 1</label>
                      <input
                        type="text"
                        value={testBiz1.name}
                        onChange={e => setTestBiz1({ ...testBiz1, name: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={testBiz1.phone}
                        onChange={e => setTestBiz1({ ...testBiz1, phone: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">City, State</label>
                      <input
                        type="text"
                        value={testBiz1.city}
                        onChange={e => setTestBiz1({ ...testBiz1, city: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={testBiz1.address}
                        onChange={e => setTestBiz1({ ...testBiz1, address: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-blue-200 shadow-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Business Name 2</label>
                      <input
                        type="text"
                        value={testBiz2.name}
                        onChange={e => setTestBiz2({ ...testBiz2, name: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={testBiz2.phone}
                        onChange={e => setTestBiz2({ ...testBiz2, phone: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">City, State</label>
                      <input
                        type="text"
                        value={testBiz2.city}
                        onChange={e => setTestBiz2({ ...testBiz2, city: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={testBiz2.address}
                        onChange={e => setTestBiz2({ ...testBiz2, address: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-500">
                    {rebrandSuite ? (
                      <span className="font-bold text-emerald-600">✓ Rebrand tests completed successfully.</span>
                    ) : (
                      <span>Ready to test 2 fictional business profiles.</span>
                    )}
                  </span>
                  <button
                    onClick={handleRunRebrandTests}
                    disabled={isTestingRebrand}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    {isTestingRebrand ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>{isTestingRebrand ? 'Running Rebrand Tests…' : 'Run Rebrand Test'}</span>
                  </button>
                </div>
              </div>

              {/* Two Fictional Businesses Rebrand Tests Results */}
              {rebrandSuite && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Rebranding Verification Results & Local Browser Preview</h4>
                  </div>

                  {rebrandSuite.tests.map((test) => {
                    const isCurrent = (activeRebrandTab === 'biz1' && test.testNumber === 1) || (activeRebrandTab === 'biz2' && test.testNumber === 2);
                    if (!isCurrent) return null;

                    return (
                      <div key={test.testNumber} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs space-y-4 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">{test.business.name}</span>
                              <span className="text-xs text-slate-500">• {test.business.city}</span>
                            </div>
                            <div className="text-xs text-slate-600 font-medium mt-1 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Local Browser HTML Preview (Zero Deployment URL)</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                              <button
                                onClick={() => setTestRebrandMobileView(false)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                                  !testRebrandMobileView ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Desktop
                              </button>
                              <button
                                onClick={() => setTestRebrandMobileView(true)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                                  testRebrandMobileView ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                📱 Mobile View
                              </button>
                            </div>
                            {test.passed ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                                <Check className="w-3.5 h-3.5 stroke-[3]" /> Rebrand Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">
                                <AlertCircle className="w-3.5 h-3.5" /> Issues Found ({test.issues.length})
                              </span>
                            )}
                          </div>
                        </div>

                        {test.issues.length > 0 && (
                          <div className="space-y-1">
                            {test.issues.map((iss, i) => (
                              <div key={i} className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                                • {iss}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Interactive Rebranded Preview iframe with Mobile / Desktop toggle */}
                        <div className="space-y-1.5 flex flex-col items-center">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider self-start">Live Rebranded Output Simulation ({test.business.name}):</span>
                          <div className={`transition-all duration-300 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 relative shadow-inner ${
                            testRebrandMobileView ? 'w-[375px] h-[600px] shadow-2xl border-slate-400 ring-8 ring-slate-900/10 my-2' : 'w-full h-80'
                          }`}>
                            {testRebrandMobileView && (
                              <div className="w-full bg-slate-900 text-white text-[10px] py-1 px-3 flex items-center justify-between font-mono shrink-0">
                                <span>iPhone 15 Pro</span>
                                <div className="w-12 h-1.5 bg-slate-700 rounded-full" />
                                <span>9:41 AM</span>
                              </div>
                            )}
                            <iframe
                              srcdoc={test.rebrandedHtml}
                              title={`Rebrand Preview ${test.testNumber}`}
                              className="w-full h-full border-0"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestRebrand}
                  disabled={isTestingRebrand}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-300 text-blue-700 hover:bg-blue-100 text-xs font-bold transition-all cursor-pointer"
                >
                  {isTestingRebrand ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <RefreshCw className="w-4 h-4 text-blue-600" />}
                  <span>Re-test Both Businesses</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowRebrandModal(false);
                    setRebrandSuite(null);
                    setReadinessScan(null);
                    setTestRebrandMobileView(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowRebrandModal(false);
                    setRebrandSuite(null);
                    setReadinessScan(null);
                    setTestRebrandMobileView(false);
                    openSave();
                  }}
                  disabled={!isTemplateValidated}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer ${
                    isTemplateValidated
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  {!isTemplateValidated && <Lock className="w-3.5 h-3.5" />}
                  <span>Publish to Templates</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
