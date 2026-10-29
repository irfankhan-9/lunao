// SmsDestinationResults.tsx
//
// Simple issue list. Each issue = one red error row with title, detail,
// "Fix in Telnyx" button. If overallStatus === 'ready', show green
// confirmation. No auto-configure, no magic.
//
// The whole point: clear errors + clear CTAs. User does the fix themselves.

import React from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, ExternalLink, Shield,
  Loader2, Globe, ChevronDown, ChevronUp, BookOpen, Copy, Check,
} from 'lucide-react';

interface Issue {
  severity: 'error' | 'warning';
  code: string;
  title: string;
  detail: string;
  fixLabel: string;
  fixUrl: string;
  docsUrl?: string;
  requirement?: string;
  steps?: string[];
  expectedValue?: string;
  missingCountries?: string[];
}

interface Props {
  issues: Issue[];
  overallStatus: 'ready' | 'blocked';
  phoneNumber?: string;
  profile?: {
    id: string;
    name: string;
    enabled: boolean;
    webhookUrl: string | null;
  } | null;
  numberType?: string | null;
  numberCountry?: string | null;
  targetCountries?: string[];
  // The webhook URL Lunao needs. Server passes this in.
  expectedWebhookUrl?: string;
  isLoading?: boolean;
  onRecheck?: () => void;
}

// ---- Copyable URL row ----
// Used to show webhook + failover webhook URLs inside the modal so the user
// can paste them straight into Telnyx Mission Control.
function CopyableUrl({
  label,
  url,
  hint,
  tone = 'default',
}: {
  label: string;
  url: string;
  hint?: string;
  tone?: 'default' | 'success';
}) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (_) { /* noop */ }
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
            {label}
          </p>
          {hint && (
            <p className="text-[10px] text-ink-tertiary mt-0.5">{hint}</p>
          )}
        </div>
      </div>
      <div className="flex items-stretch gap-1.5">
        <code
          className={`flex-1 min-w-0 px-3 py-2 border rounded-lg text-[11px] font-mono truncate ${
            tone === 'success'
              ? 'bg-success-soft/30 border-success/30 text-success'
              : 'bg-white border-border-main text-ink'
          }`}
        >
          {url}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className={`px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 ${
            copied
              ? 'bg-success border-success text-white'
              : 'bg-white hover:bg-off-white border-border-main text-ink'
          }`}
          title="Copy URL"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function IssueRow({ issue, defaultExpanded }: { issue: Issue; defaultExpanded?: boolean; key?: React.Key }) {
  const [expanded, setExpanded] = React.useState(!!defaultExpanded);
  const hasSteps = Array.isArray(issue.steps) && issue.steps.length > 0;

  return (
    <div className="rounded-xl border-2 border-danger/30 bg-danger-soft/30 overflow-hidden">
      <div className="p-3.5 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-danger flex items-center justify-center shrink-0 mt-0.5">
          <XCircle className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-danger">{issue.title}</p>
            {issue.requirement && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-danger text-white font-bold">
                <Shield className="w-2.5 h-2.5" />
                {issue.requirement}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-secondary mt-1 whitespace-pre-line">
            {issue.detail}
          </p>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            <a
              href={issue.fixUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {issue.fixLabel}
            </a>
            {hasSteps && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-off-white border border-border-main text-ink text-xs font-bold rounded-lg transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                {expanded ? 'Hide steps' : 'Show steps'}
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            {issue.docsUrl && (
              <a
                href={issue.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-off-white border border-border-main text-ink text-xs font-bold rounded-lg transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                Guide
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Expanded steps */}
      {expanded && hasSteps && (
        <div className="border-t border-danger/20 bg-white/60 px-3.5 py-3">
          <p className="text-xs font-bold text-ink mb-2">Steps to fix in Telnyx:</p>
          <ol className="space-y-1.5">
            {issue.steps!.map((s, i) => (
              <li key={i} className="text-xs text-ink-secondary flex gap-2">
                <span className="text-danger shrink-0 w-4 h-4 rounded-full bg-danger-soft text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ReadyBanner({
  phoneNumber,
  profile,
  numberType,
  targetCountries,
}: {
  phoneNumber: string;
  profile: { name: string } | null;
  numberType: string | null;
  targetCountries: string[];
}) {
  return (
    <div className="rounded-xl border-2 border-success/40 bg-success-soft/40 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-success">Ready to send SMS</p>
        <p className="text-xs text-ink-secondary mt-1">
          <span className="font-mono">{phoneNumber}</span>
          {profile && <> · profile <span className="font-semibold">{profile.name}</span></>}
          {numberType && <> · {numberType}</>}
          {targetCountries.length > 0 && (
            <> · sending to {targetCountries.join(', ')}</>
          )}
        </p>
        <p className="text-[11px] text-ink-tertiary mt-1">
          Profile is active, webhook is set, and all CSV destinations are allowed.
        </p>
      </div>
    </div>
  );
}

export default function SmsDestinationResults({
  issues,
  overallStatus,
  phoneNumber,
  profile,
  numberType,
  numberCountry,
  targetCountries = [],
  expectedWebhookUrl,
  isLoading = false,
  onRecheck,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8">
        <Loader2 className="w-5 h-5 text-ink-tertiary animate-spin" />
        <span className="text-sm text-ink-secondary">Checking Telnyx…</span>
      </div>
    );
  }

  if (overallStatus === 'ready') {
    return (
      <div className="space-y-3">
        <ReadyBanner
          phoneNumber={phoneNumber || ''}
          profile={profile}
          numberType={numberType}
          targetCountries={targetCountries}
        />
        {onRecheck && (
          <button
            type="button"
            onClick={onRecheck}
            className="px-4 py-2 bg-white hover:bg-off-white border border-border-main text-ink text-xs font-bold rounded-lg flex items-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Re-check
          </button>
        )}
      </div>
    );
  }

  // Sort: registration-required errors first (10DLC, DLT, AE), then structural (profile/webhook)
  const sorted = [...issues].sort((a, b) => {
    const priority = [
      'NO_PROFILE',
      'PROFILE_DISABLED',
      'PROFILE_NOT_FOUND',
      'WEBHOOK_MISSING',
      'WEBHOOK_WRONG',
      'COUNTRIES_NOT_ALLOWED',
      'US_10DLC_REQUIRED',
      'TOLL_FREE_VERIFY_REQUIRED',
      'IN_DLT_REQUIRED',
      'AE_SENDER_ID_REQUIRED',
    ];
    return priority.indexOf(a.code) - priority.indexOf(b.code);
  });

  return (
    <div className="space-y-3">
      {/* Webhook URLs panel — always shown when there's a webhook URL to set,
          so the user can paste straight into Telnyx Mission Control. */}
      {expectedWebhookUrl && (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-xs font-bold text-ink">Webhook URLs to paste in Telnyx</p>
          </div>
          <CopyableUrl
            label="Webhook URL"
            url={expectedWebhookUrl}
            hint="Primary: Lunao receives all delivery callbacks here. Paste into Telnyx → Messaging Profile → Webhook URL."
          />
          <CopyableUrl
            label="Webhook Failover URL"
            url={expectedWebhookUrl}
            hint="Backup if the primary fails. Paste into the Failover URL field. Same value is fine."
          />
          {profile?.webhookUrl && profile.webhookUrl !== expectedWebhookUrl && (
            <div className="rounded-lg bg-danger-soft/60 border border-danger/20 px-2.5 py-2 mt-1">
              <p className="text-[10px] font-bold text-danger uppercase tracking-wider">
                Currently set (wrong):
              </p>
              <code className="block text-[11px] font-mono text-danger mt-0.5 break-all">
                {profile.webhookUrl}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Issue summary banner */}
      <div className="rounded-xl border-2 border-danger/40 bg-danger-soft/40 p-3.5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold text-danger">
            {issues.length} issue{issues.length > 1 ? 's' : ''} to fix in Telnyx
          </p>
          <p className="text-xs text-ink-secondary mt-0.5">
            Lunao cannot auto-fix these. Click each "Fix" button — Telnyx opens
            on the exact page you need.
          </p>
        </div>
      </div>

      {/* Issue rows */}
      <div className="space-y-2">
        {sorted.map((issue) => (
          <IssueRow
            key={issue.code}
            issue={issue}
            defaultExpanded={issue.steps && issue.steps.length > 0}
          />
        ))}
      </div>

      {/* Re-check button at bottom */}
      {onRecheck && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onRecheck}
            className="px-4 py-2 bg-white hover:bg-off-white border border-border-main text-ink text-xs font-bold rounded-lg flex items-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Re-check after fixing
          </button>
        </div>
      )}
    </div>
  );
}
