import React, { useState, useEffect } from 'react';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useGate } from '../contexts/GateContext';
import { playSoftTap } from '../utils/audio';
import { Logo } from '../landing/components/Logo';

interface AuthPageProps {
  onBackToLanding: () => void;
  onAuthSuccess: () => void;
}

export default function AuthPage({ onBackToLanding, onAuthSuccess }: AuthPageProps) {
  const { signInWithGoogle } = useGate();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Automatically scroll to the top of the auth page when mounted
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const handleGoogleSignIn = async () => {
    playSoftTap();
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
      onAuthSuccess();
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('popup-closed-by-user')) {
        setError('Google sign-in popup was closed before completing. Click below to try again.');
      } else if (msg.includes('popup-blocked')) {
        setError('Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.');
      } else {
        setError(err?.message || 'Unable to sign in with Google. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-[#F8F7F5] text-[#1A1916] flex flex-col selection:bg-[#2563EB] selection:text-white antialiased"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* Top Header / Brand Logo */}
      <header className="absolute top-0 left-0 right-0 z-20 px-6 sm:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              playSoftTap();
              onBackToLanding();
            }}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#6B6960] hover:text-[#1A1916] transition-colors cursor-pointer mr-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Lunao</span>
          </button>

          <div className="flex items-center">
            <Logo size={28} showWordmark />
          </div>
        </div>
      </header>

      {/* Main Grid: Split Layout on Desktop, Centered on Mobile */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Left Column: Clean Centered Auth Stack (Heading and Google Button directly under each other) */}
        <div className="flex flex-col justify-center items-center px-6 sm:px-12 lg:px-16 pt-24 pb-12 w-full max-w-lg mx-auto lg:max-w-none">
          <div className="w-full max-w-[380px] flex flex-col items-center text-center space-y-6">
            {/* Heading & Subtitle centered directly above button */}
            <div className="space-y-2 text-center w-full">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1A1916]">
                Log in or sign up
              </h1>
              <p className="text-sm text-[#6B6960]">
                7 days free trial on every plan.
              </p>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="w-full p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 text-left">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Single 1-Tap Google Sign-In Button placed directly under heading */}
            <div className="w-full relative pt-1">
              <span className="absolute -top-2.5 right-4 z-10 px-2.5 py-0.5 rounded-full bg-[#2563EB] text-white text-[10px] font-semibold tracking-wide shadow-xs pointer-events-none">
                Last used
              </span>
              <button
                type="button"
                disabled={signingIn}
                onClick={handleGoogleSignIn}
                className="w-full h-12 px-5 rounded-xl bg-white hover:bg-[#F2F1EE] active:scale-[0.99] border border-[#E4E2DC] hover:border-[#2563EB]/40 text-[#1A1916] font-semibold text-sm flex items-center justify-center gap-3.5 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.86c2.26-2.09 3.56-5.17 3.56-8.8z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.31c-.24-.72-.38-1.49-.38-2.31s.14-1.59.38-2.31V6.6H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.4l3.99-3.09z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.6l3.99 3.09c.95-2.85 3.6-4.94 6.72-4.94z"
                    />
                  </svg>
                </span>
                <span className="text-[#1A1916] transition-colors">
                  {signingIn ? 'Connecting with Google…' : 'Continue with Google'}
                </span>
              </button>
            </div>

            {/* Legal Agreement Card */}
            <div className="w-full p-3.5 sm:p-4 rounded-xl bg-white border border-[#E4E2DC] shadow-2xs text-center">
              <p className="text-xs sm:text-[13px] text-[#6B6960] leading-relaxed">
                By continuing you agree to the{' '}
                <a
                  href="https://lunao.org/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#1A1916] hover:text-[#2563EB] underline underline-offset-2 transition-colors"
                >
                  Terms of Service
                </a>{' '}
                and{' '}
                <a
                  href="https://lunao.org/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#1A1916] hover:text-[#2563EB] underline underline-offset-2 transition-colors"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Editorial Atmosphere (Desktop only) without the blue badge card */}
        <div className="hidden lg:flex relative flex-col justify-center items-center px-12 xl:px-20 bg-gradient-to-br from-[#EFF3FF]/60 via-[#F8F7F5] to-white border-l border-[#E4E2DC] overflow-hidden">
          {/* Subtle Soft Blue Lighting Sheen */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background: 'radial-gradient(ellipse 70% 80% at 75% 50%, rgba(37, 99, 235, 0.08) 0%, rgba(239, 243, 255, 0.4) 50%, transparent 80%)',
            }}
          />

          {/* Editorial Typography */}
          <div className="relative z-10 max-w-md w-full space-y-4">
            <h2 className="text-4xl xl:text-5xl font-serif text-[#1A1916] tracking-tight leading-[1.15]">
              Lunao.
              <span className="block font-sans font-light text-2xl xl:text-3xl text-[#6B6960] mt-2 tracking-normal">
                Acquire, keep, scale.
              </span>
            </h2>
            <p className="text-xs xl:text-sm text-[#6B6960] font-normal leading-relaxed max-w-sm pt-2">
              Automate local prospect discovery, personalized high-converting client sites, and real-time operations in one unified workspace.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
