import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  AlertTriangle,
  RotateCcw,
  Loader2,
  KeyRound,
  Clock,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { soundEffects } from '../../utils/soundEffects';
import { scrollToTop } from '../../utils/scrollToTop';

const STORAGE_KEY_FAILED = 'lunao_auth_failed_attempts';
const STORAGE_KEY_LOCKOUT = 'lunao_auth_lockout_until';
const MAX_RETRIES = 5;
const LOCKOUT_HOURS = 5;
const LOCKOUT_MS = LOCKOUT_HOURS * 60 * 60 * 1000;

export const OwnerAuthModal: React.FC = () => {
  const { loginWithCode, authError, setAuthError } = useBusiness();

  // Input & validation state
  const [inputCode, setInputCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Retry & Lockout state
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_FAILED);
      return stored ? Math.min(parseInt(stored, 10) || 0, MAX_RETRIES) : 0;
    } catch {
      return 0;
    }
  });

  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LOCKOUT);
      if (!stored) return null;
      const ts = parseInt(stored, 10);
      if (Number.isNaN(ts) || Date.now() >= ts) {
        localStorage.removeItem(STORAGE_KEY_LOCKOUT);
        localStorage.removeItem(STORAGE_KEY_FAILED);
        return null;
      }
      return ts;
    } catch {
      return null;
    }
  });

  const [timeLeftMs, setTimeLeftMs] = useState<number>(() => {
    if (!lockoutUntil) return 0;
    return Math.max(0, lockoutUntil - Date.now());
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-fill from ?code= URL param on mount.
  useEffect(() => {
    scrollToTop();
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get('code');
    if (prefill) {
      const normalized = prefill.trim().toUpperCase();
      setInputCode(normalized);
      // Clear the URL param so a refresh doesn't resubmit.
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (!lockoutUntil && inputRef.current) {
      inputRef.current.focus();
    }
  }, [lockoutUntil]);

  // Lockout countdown timer ticker
  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = lockoutUntil - now;
      if (diff <= 0) {
        clearInterval(interval);
        setLockoutUntil(null);
        setFailedAttempts(0);
        setTimeLeftMs(0);
        try {
          localStorage.removeItem(STORAGE_KEY_LOCKOUT);
          localStorage.removeItem(STORAGE_KEY_FAILED);
        } catch { /* ignore */ }
      } else {
        setTimeLeftMs(diff);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const isBanned = !!lockoutUntil && timeLeftMs > 0;
  const retriesRemaining = Math.max(0, MAX_RETRIES - failedAttempts);

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return {
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
    };
  };
  const timeParts = formatCountdown(timeLeftMs);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    soundEffects.playKeypress?.();
    setInputCode(e.target.value.toUpperCase());
    setServerError(null);
    setAuthError(null);
  };

  const handleResetBan = () => {
    soundEffects.playButtonClick?.();
    setLockoutUntil(null);
    setFailedAttempts(0);
    setTimeLeftMs(0);
    try {
      localStorage.removeItem(STORAGE_KEY_LOCKOUT);
      localStorage.removeItem(STORAGE_KEY_FAILED);
    } catch { /* ignore */ }
    if (inputRef.current) inputRef.current.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBanned || isVerifying) return;
    const trimmed = inputCode.trim().toUpperCase();
    if (!trimmed) {
      soundEffects.playError?.();
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }
    setIsVerifying(true);
    setServerError(null);

    const success = await loginWithCode(trimmed);

    if (success) {
      soundEffects.playSuccess?.();
      scrollToTop();
      setFailedAttempts(0);
      setLockoutUntil(null);
      try {
        localStorage.removeItem(STORAGE_KEY_FAILED);
        localStorage.removeItem(STORAGE_KEY_LOCKOUT);
      } catch { /* ignore */ }
      setTimeout(() => setIsVerifying(false), 400);
    } else {
      setIsVerifying(false);
      soundEffects.playError?.();
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      const errMsg = authError || 'Invalid Lunao code. Please check your code and try again.';
      setServerError(errMsg);
      if (nextAttempts >= MAX_RETRIES) {
        const banEndTime = Date.now() + LOCKOUT_MS;
        setLockoutUntil(banEndTime);
        setTimeLeftMs(LOCKOUT_MS);
        try {
          localStorage.setItem(STORAGE_KEY_FAILED, String(MAX_RETRIES));
          localStorage.setItem(STORAGE_KEY_LOCKOUT, String(banEndTime));
        } catch { /* ignore */ }
      } else {
        try {
          localStorage.setItem(STORAGE_KEY_FAILED, String(nextAttempts));
        } catch { /* ignore */ }
      }
    }
  };

  return (
    <div className="min-h-screen bg-white text-emerald-950 flex flex-col justify-between relative overflow-hidden select-none font-sans">
      <div className="absolute inset-0 bg-radial-at-t from-emerald-50/70 via-white to-white pointer-events-none" />
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-emerald-100/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-4xl mx-auto px-6 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-950">Lunao</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          <span>Owner Verification</span>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 w-full max-w-md mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-950">
            Sign In to Workspace
          </h1>
          <p className="text-xs sm:text-sm text-emerald-700/80 mt-1.5 max-w-xs mx-auto">
            Enter the access code provided by your Lunao agency to manage your business.
          </p>
        </div>

        <div
          className={`bg-white border-2 border-emerald-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-emerald-900/5 space-y-5 transition-all ${
            isShaking ? 'animate-shake' : ''
          }`}
        >
          {/* Banned state */}
          {isBanned ? (
            <div className="p-5 rounded-2xl bg-emerald-50/60 border-2 border-emerald-400 text-emerald-950 space-y-3.5 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-200 flex items-center justify-center text-emerald-800 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-950">Account Access Locked</h3>
                  <p className="text-xs text-emerald-700">5 of 5 attempts exceeded</p>
                </div>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                You have exceeded the maximum of <strong>5 failed retries</strong>. Access is banned for <strong>5 hours</strong>.
              </p>
              <div className="py-3 px-4 rounded-xl bg-white border border-emerald-300 flex items-center justify-center gap-3 shadow-xs">
                <div className="text-center">
                  <div className="text-2xl font-mono font-extrabold text-emerald-900">{timeParts.hours}</div>
                  <div className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Hours</div>
                </div>
                <span className="text-xl font-mono font-bold text-emerald-400">:</span>
                <div className="text-center">
                  <div className="text-2xl font-mono font-extrabold text-emerald-900">{timeParts.minutes}</div>
                  <div className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Mins</div>
                </div>
                <span className="text-xl font-mono font-bold text-emerald-400">:</span>
                <div className="text-center">
                  <div className="text-2xl font-mono font-extrabold text-emerald-900">{timeParts.seconds}</div>
                  <div className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Secs</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 text-[11px] text-emerald-700">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 5 more tries upon expiry
                </span>
                <button
                  type="button"
                  onClick={handleResetBan}
                  className="font-bold underline text-emerald-800 hover:text-emerald-950 cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Ban
                </button>
              </div>
            </div>
          ) : (
            /* Standard code form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="owner-code" className="block text-xs font-bold text-emerald-900 mb-2 uppercase tracking-wider">
                  Business Access Code
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="owner-code"
                    type="text"
                    placeholder="LUNAO-XXXX-XXXX"
                    value={inputCode}
                    onChange={handleInputChange}
                    disabled={isVerifying}
                    className="w-full h-14 px-4 rounded-2xl bg-emerald-50/50 border-2 border-emerald-300 text-emerald-950 font-mono text-center text-lg sm:text-xl font-bold tracking-widest uppercase transition placeholder:text-emerald-300 placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 focus:bg-white disabled:opacity-50"
                    autoComplete="off"
                    autoFocus
                  />
                  <KeyRound className="w-5 h-5 text-emerald-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Server error */}
              {(serverError || authError) && (
                <div className="p-4 rounded-2xl bg-white border-2 border-emerald-500 shadow-lg shadow-emerald-600/10 text-emerald-950 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs sm:text-sm font-bold text-emerald-950">Invalid Access Code</h4>
                        <span className="text-[10px] sm:text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {retriesRemaining} {retriesRemaining === 1 ? 'try' : 'tries'} left
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 mt-1 leading-snug">
                        {serverError || authError}
                      </p>
                      <div className="mt-3">
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((step) => (
                            <div
                              key={step}
                              className={`h-2 flex-1 rounded-full transition-all ${
                                step <= failedAttempts
                                  ? 'bg-emerald-600 shadow-xs'
                                  : 'bg-emerald-100 border border-emerald-200'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-emerald-700 mt-1 font-medium">
                          <span>{failedAttempts} used</span>
                          <span>5 tries max before 5-hour ban</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifying || !inputCode.trim()}
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-semibold text-sm shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-4xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-emerald-700/80 border-t border-emerald-100">
        <p>© {new Date().getFullYear()} Lunao Business OS. All rights reserved.</p>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-emerald-800 font-medium">5 Retries Policy</span>
          <span>•</span>
          <span className="text-emerald-800 font-medium">5-Hour Lockout</span>
          <span>•</span>
          <span className="text-emerald-800 font-medium">Encrypted Data</span>
        </div>
      </footer>
    </div>
  );
};
