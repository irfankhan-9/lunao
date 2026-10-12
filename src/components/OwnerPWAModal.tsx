import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone, X, RefreshCw, ExternalLink, Copy, Check, Sparkles,
  CalendarCheck, Shield, ChevronRight, Info, AlertCircle, Loader2
} from 'lucide-react';
import { listInviteCodes, createInviteCode, createBooking, InviteCode } from '../lib/pipelineClient';
import {
  playDialogPop, playSoftTap, playElegantBell, playVictoryCelebration,
  playCancelTone, playConfirmSuccess, playGentleChime, playSoftBubble
} from '../utils/audio';

interface OwnerPWAModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  businessName: string;
  niche?: string;
  siteUrl?: string;
}

export const OwnerPWAModal: React.FC<OwnerPWAModalProps> = ({
  open,
  onClose,
  slug,
  businessName,
  niche = 'Local Business',
  siteUrl,
}) => {
  const [activeCode, setActiveCode] = useState<string>('');
  const [loadingCode, setLoadingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [sendingBooking, setSendingBooking] = useState(false);
  const [bookingToast, setBookingToast] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [deviceScale, setDeviceScale] = useState<'normal' | 'compact'>('normal');

  const [currentTime, setCurrentTime] = useState(() => {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Live clock for phone status bar
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch or mint an active code for this site
  useEffect(() => {
    if (!open || !slug) return;
    playDialogPop();
    setIframeLoaded(false);

    let mounted = true;
    const fetchCode = async () => {
      setLoadingCode(true);
      try {
        const codes = await listInviteCodes(slug);
        const valid = codes.find((c: InviteCode) => !c.revokedAt);
        if (valid && mounted) {
          setActiveCode(valid.code);
        } else if (mounted) {
          // Generate code on the fly for seamless preview
          const created = await createInviteCode(slug);
          if (mounted) setActiveCode(created.code);
        }
      } catch {
        // Fallback to website slug which our upgraded backend now accepts!
        if (mounted) setActiveCode(slug);
      } finally {
        if (mounted) setLoadingCode(false);
      }
    };

    fetchCode();

    return () => {
      mounted = false;
    };
  }, [open, slug]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        playCancelTone();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const targetCode = activeCode || slug;
  // Deep-link URL into the PWA with pre-filled code
  const pwaSrc = `/owner/?code=${encodeURIComponent(targetCode)}`;

  const handleCopyCode = () => {
    playElegantBell();
    navigator.clipboard.writeText(targetCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopySlug = () => {
    playElegantBell();
    navigator.clipboard.writeText(slug);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2000);
  };

  const handleReload = () => {
    playSoftTap();
    setIframeLoaded(false);
    setIframeKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    playSoftTap();
    window.open(pwaSrc, '_blank', 'noopener,noreferrer');
  };

  // Trigger a real booking into the pipeline so the user sees it in the PWA in real time!
  const handleSendTestBooking = async () => {
    playSoftBubble();
    setSendingBooking(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const testNames = ['Alex Morgan', 'Jordan Lee', 'Taylor Smith', 'Sam Wilson', 'Chris Evans'];
      const randomName = testNames[Math.floor(Math.random() * testNames.length)];
      
      const serviceOptions: Record<string, string[]> = {
        barber: ['Classic Haircut', 'Beard Trim & Hot Towel', 'Precision Fade'],
        salon: ['Cut & Signature Blowout', 'Balayage Color Refresh', 'Keratin Treatment'],
        dentist: ['Checkup & Deep Cleaning', 'Teeth Whitening Consultation', 'Emergency Dental Visit'],
        hvac: ['Emergency AC Diagnostic', 'Seasonal Furnace Tune-Up', 'Air Duct Inspection'],
        gym: ['1-on-1 Personal Training', 'Free Trial Pass Session', 'Fitness Assessment'],
        roofing: ['Free Storm Damage Inspection', 'Full Roof Assessment', 'Gutter Repair'],
        realestate: ['Private Property Tour', 'Buyer Consultation', 'Listing Evaluation'],
      };
      const nicheKey = (niche || '').toLowerCase().replace(/[^a-z]/g, '');
      const services = serviceOptions[nicheKey] || ['VIP Consultation', 'General Appointment', 'Service Booking'];
      const randomService = services[Math.floor(Math.random() * services.length)];

      await createBooking({
        slug,
        businessName,
        customerName: randomName,
        phone: '555-019-2834',
        email: `${randomName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        service: randomService,
        date: today,
        time: '14:30',
        notes: 'Submitted via Site Editor test trigger. Should appear immediately in PWA Bookings & Dashboard!',
        source: 'form',
      });

      playVictoryCelebration();
      setBookingToast(`Booking confirmed for ${randomName} (${randomService})! Check the PWA Bookings tab.`);
      setTimeout(() => setBookingToast(null), 5000);

      // Refresh iframe so it instantly polls or syncs
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage({ type: 'LUNAO_REFRESH_BOOKINGS' }, '*');
        }
      }, 800);
    } catch (err: any) {
      setBookingToast(`Failed to trigger booking: ${err?.message || 'Server error'}`);
      setTimeout(() => setBookingToast(null), 4000);
    } finally {
      setSendingBooking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-editor-fade"
      onClick={() => {
        playCancelTone();
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-5xl h-[95vh] max-h-[920px] bg-slate-900 text-slate-100 rounded-2xl sm:rounded-3xl border border-slate-700/80 shadow-[0_25px_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP BAR */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-800/90 border-b border-slate-700/80 shrink-0 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white truncate">
                  Owner PWA Companion
                </h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Pre-authenticated for <span className="text-white font-medium">{businessName}</span> ({slug})
              </p>
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Test Booking trigger */}
            <button
              onClick={handleSendTestBooking}
              disabled={sendingBooking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Send a sample booking to verify the PWA catches it live"
            >
              {sendingBooking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CalendarCheck className="w-3.5 h-3.5 text-emerald-200" />
              )}
              <span className="hidden md:inline">Send Test Booking</span>
            </button>

            {/* Reload iframe */}
            <button
              onClick={handleReload}
              className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Reload Simulator"
              aria-label="Reload PWA"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Open in standalone tab */}
            <button
              onClick={handleOpenExternal}
              className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Open standalone PWA"
              aria-label="Open standalone PWA"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              onClick={() => {
                playCancelTone();
                onClose();
              }}
              className="p-2 rounded-lg bg-slate-700/60 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NOTIFICATION TOAST */}
        {bookingToast && (
          <div className="bg-emerald-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{bookingToast}</span>
            </div>
            <button onClick={() => setBookingToast(null)} className="p-1 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* WORKSPACE BODY */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-slate-950">
          {/* DEVICE SIMULATOR VIEWPORT */}
          <div className="flex-1 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            {/* PHONE BEZEL */}
            <div className="relative w-full max-w-[390px] h-[720px] max-h-[85vh] bg-slate-900 rounded-[50px] p-3 shadow-[0_0_0_12px_#1e293b,0_0_0_14px_#334155,0_25px_60px_rgba(0,0,0,0.8)] border border-slate-700 flex flex-col shrink-0 overflow-hidden">
              {/* DYNAMIC ISLAND / SPEAKER */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-30 flex items-center justify-between px-3 pointer-events-none">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700/60" />
              </div>

              {/* PHONE STATUS BAR */}
              <div className="h-7 w-full px-7 flex items-center justify-between text-[11px] font-semibold text-slate-300 z-20 shrink-0 pointer-events-none">
                <span className="font-mono tracking-tight">{currentTime}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold">5G</span>
                  <div className="w-5 h-2.5 rounded-xs border border-slate-300 p-0.5 flex items-center">
                    <div className="h-full w-full bg-emerald-400 rounded-xs" />
                  </div>
                </div>
              </div>

              {/* PHONE SCREEN (IFRAME) */}
              <div className="relative flex-1 w-full bg-slate-50 rounded-[38px] overflow-hidden shadow-inner">
                {!iframeLoaded && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900 text-slate-300 gap-3">
                    <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                    <p className="text-xs font-medium">Booting Lunao Owner Suite...</p>
                    <span className="text-[10px] text-slate-500 font-mono">Loading /owner/?code={targetCode}</span>
                  </div>
                )}
                <iframe
                  key={iframeKey}
                  ref={iframeRef}
                  src={pwaSrc}
                  title="Lunao Owner PWA"
                  className="w-full h-full border-0 select-none"
                  onLoad={() => setIframeLoaded(true)}
                  allow="clipboard-read; clipboard-write; microphone; camera"
                />
              </div>

              {/* HOME INDICATOR */}
              <div className="h-4 w-full flex items-center justify-center shrink-0 pointer-events-none">
                <div className="w-28 h-1 rounded-full bg-slate-500/60" />
              </div>
            </div>
          </div>

          {/* SIDE INFORMATION & CONTROLS RAIL */}
          <div className="w-full lg:w-80 p-5 bg-slate-900/95 border-t lg:border-t-0 lg:border-l border-slate-800 overflow-y-auto shrink-0 space-y-5 text-xs text-slate-300">
            {/* ACCESS CREDENTIALS CARD */}
            <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" /> Access Credentials
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Ready
                </span>
              </div>

              {/* CODE DISPLAY */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Owner Access Code
                </label>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-emerald-300 font-mono font-bold text-xs truncate">
                    {loadingCode ? 'Generating...' : targetCode}
                  </code>
                  <button
                    onClick={handleCopyCode}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition-colors cursor-pointer"
                    title="Copy code"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* WEBSITE SLUG DISPLAY */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Website Code / Slug
                </label>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 font-mono text-xs truncate">
                    {slug}
                  </code>
                  <button
                    onClick={handleCopySlug}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition-colors cursor-pointer"
                    title="Copy slug"
                  >
                    {copiedSlug ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                  You can input <strong>either</strong> code in the PWA sign-in modal. Both automatically bind to this business!
                </p>
              </div>
            </div>

            {/* LIVE PIPELINE CAPABILITIES */}
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2.5">
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Live Synchronized Modules
              </h4>

              <ul className="space-y-2 text-[11px] text-slate-400">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-200">Bookings Catch:</strong> Website appointments flow into the Bookings tab & Dashboard metrics instantly.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-200">Automatic Rebranding:</strong> Palettes, typography, phone, location, and niche styling rebrand seamlessly.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-200">AI Receptionist:</strong> Edit front-desk behavior, greetings, hours, and escalation rules.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-200">Customer Management:</strong> Auto-aggregates client history, repeat booking counts, and notes.
                  </span>
                </li>
              </ul>
            </div>

            {/* TEST BOOKING HELPER */}
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                <CalendarCheck className="w-4 h-4 text-emerald-400" />
                <span>Verify Real-Time Bookings</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                Click <strong>"Send Test Booking"</strong> in the top bar. Then navigate to <strong>Bookings</strong> or <strong>Dashboard</strong> inside the phone simulator to confirm the new appointment is caught.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
