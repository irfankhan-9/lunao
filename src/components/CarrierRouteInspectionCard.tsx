import React, { useState } from 'react';
import {
  ShieldCheck, AlertCircle, CheckCircle2, Globe, Phone,
  ExternalLink, ChevronDown, ChevronUp, Filter, Mail, Info, X
} from 'lucide-react';
import { RouteInspectionSummary, LeadCompatibilityResult } from '../lib/phoneRouteValidator';
import { playSoftTap } from '../utils/audio';

interface CarrierRouteInspectionCardProps {
  summary: RouteInspectionSummary;
  onExcludeIncompatible?: () => void;
  senderPhone?: string | null;
}

const SUPPORT_EMAIL = 'lunaoxx77@gmail.com';

export const CarrierRouteInspectionCard: React.FC<CarrierRouteInspectionCardProps> = ({
  summary,
  onExcludeIncompatible,
  senderPhone,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'all' | 'incompatible' | 'valid'>('all');

  const {
    totalLeads,
    compatibleCount,
    incompatibleCount,
    results,
    hasCountryMismatch,
    hasInvalidFormat,
    hasTollFree,
    senderCountry,
  } = summary;

  if (totalLeads === 0) return null;

  const displayPhone = senderPhone || summary.senderPhone || '+1 (604) 953-9651';

  const displayedResults = results.filter((r) => {
    if (activeTab === 'incompatible') return !r.isCompatible;
    if (activeTab === 'valid') return r.isCompatible;
    return true;
  });

  // 100% Compatible Banner
  if (incompatibleCount === 0) {
    return (
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-emerald-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-ink">Carrier Route Verified</h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  100% Deliverable
                </span>
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">
                All {totalLeads} lead phone numbers match your {displayPhone} carrier route ({senderCountry}). E.164 telecom formatting verified.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playSoftTap();
              setIsExpanded(!isExpanded);
            }}
            className="text-xs font-semibold text-ink-secondary hover:text-ink flex items-center gap-1 self-start sm:self-center cursor-pointer"
          >
            <span>{isExpanded ? 'Hide Details' : 'View Verified List'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {isExpanded && (
          <div className="pt-3 border-t border-emerald-100 space-y-2">
            <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-surface border border-border-light flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-ink truncate block">{r.lead.name}</span>
                    <span className="font-mono text-[11px] text-ink-secondary">{r.normalizedPhone || r.rawPhone}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-ink-tertiary">{r.destinationCountry}</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Deliverable
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Incompatible Numbers Detected
  return (
    <div className="p-4 sm:p-6 rounded-2xl bg-white border border-blue-200/90 shadow-xs space-y-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <Phone className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-ink">Carrier Route & Phone Compatibility Check</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-mono">
                {compatibleCount} Deliverable · {incompatibleCount} Incompatible
              </span>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              We inspected all {totalLeads} CSV leads against your selected Telnyx sender ({displayPhone}). Here are the exact technical reasons why some numbers cannot receive SMS:
            </p>
          </div>
        </div>

        {onExcludeIncompatible && incompatibleCount > 0 && (
          <button
            type="button"
            onClick={() => {
              playSoftTap();
              onExcludeIncompatible();
            }}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Exclude {incompatibleCount} Incompatible</span>
          </button>
        )}
      </div>

      {/* Summary Filter Pills (Brand Consistent: Blue, Emerald, Slate) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Deliverable Leads</span>
            <span className="text-xs font-semibold text-emerald-900">Matches 10DLC route</span>
          </div>
          <span className="text-lg font-bold font-mono text-emerald-700">{compatibleCount}</span>
        </div>

        <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-blue-800 block">Cross-Border / Incompatible</span>
            <span className="text-xs font-semibold text-blue-900">Requires route review</span>
          </div>
          <span className="text-lg font-bold font-mono text-blue-700">{incompatibleCount}</span>
        </div>

        <div className="p-3 rounded-xl bg-surface border border-border-light flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-ink-tertiary block">Sender Profile</span>
            <span className="text-xs font-semibold text-ink font-mono truncate max-w-[140px] block">{displayPhone}</span>
          </div>
          <span className="text-xs font-bold text-ink-secondary">{senderCountry}</span>
        </div>
      </div>

      {/* Issues Breakdown Chips */}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
        <span className="text-[11px] font-semibold text-ink-tertiary">Detected issues:</span>
        {hasCountryMismatch && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-medium">
            <Globe className="w-3 h-3 text-blue-600" />
            <span>Cross-border destination mismatch</span>
          </span>
        )}
        {hasInvalidFormat && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-border-main text-ink text-[11px] font-medium">
            <AlertCircle className="w-3 h-3 text-ink-secondary" />
            <span>Incomplete / Invalid E.164 digits</span>
          </span>
        )}
        {hasTollFree && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-border-main text-ink text-[11px] font-medium">
            <Phone className="w-3 h-3 text-ink-secondary" />
            <span>Toll-free destination prefix</span>
          </span>
        )}
      </div>

      {/* Expandable Lead List with Technical Reasons */}
      <div className="border-t border-border-light pt-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          {/* Sub-filter tabs */}
          <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-border-light">
            <button
              type="button"
              onClick={() => { playSoftTap(); setActiveTab('all'); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'all' ? 'bg-white text-ink shadow-2xs font-bold' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              All ({totalLeads})
            </button>
            <button
              type="button"
              onClick={() => { playSoftTap(); setActiveTab('incompatible'); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'incompatible' ? 'bg-blue-600 text-white font-bold' : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              Incompatible ({incompatibleCount})
            </button>
            <button
              type="button"
              onClick={() => { playSoftTap(); setActiveTab('valid'); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'valid' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              Deliverable ({compatibleCount})
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              playSoftTap();
              setIsExpanded(!isExpanded);
            }}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
          >
            <span>{isExpanded ? 'Collapse' : 'Inspect All Reasons'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Lead Table / Cards */}
        {isExpanded ? (
          <div className="space-y-2.5 max-h-80 overflow-y-auto scrollbar-thin pr-1">
            {displayedResults.map((item, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border transition-all text-xs space-y-2 ${
                  item.isCompatible
                    ? 'bg-white border-border-light'
                    : 'bg-blue-50/40 border-blue-200'
                }`}
              >
                {/* Lead Headline */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-ink truncate">{item.lead.name}</span>
                    <span className="text-[11px] font-mono text-ink-secondary bg-surface px-1.5 py-0.5 rounded border border-border-light shrink-0">
                      {item.rawPhone || 'No phone'}
                    </span>
                    <span className="text-[10px] text-ink-tertiary">
                      ({item.destinationCountry})
                    </span>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 inline-flex items-center gap-1 ${
                    item.isCompatible
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-blue-100 text-blue-800 border-blue-300'
                  }`}>
                    {item.isCompatible ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Info className="w-3 h-3 text-blue-600" />}
                    <span>{item.isCompatible ? 'Deliverable' : 'Route Restricted'}</span>
                  </span>
                </div>

                {/* Real Telecom Reason & Action */}
                <div className="p-2.5 rounded-lg bg-white border border-border-light text-[11px] space-y-1">
                  <p className="text-ink leading-relaxed">
                    <strong className="text-blue-900 font-semibold">Technical Reason:</strong> {item.realReason}
                  </p>
                  {!item.isCompatible && (
                    <p className="text-ink-secondary leading-relaxed border-t border-border-light pt-1">
                      <strong className="text-ink font-medium">Recommended Action:</strong> {item.recommendedAction}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Collapsed preview showing first 2 incompatible leads */
          <div className="space-y-2">
            {displayedResults.slice(0, 2).map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-surface border border-border-light text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink truncate">{item.lead.name}</span>
                    <span className="text-[11px] font-mono text-ink-secondary">{item.rawPhone}</span>
                  </div>
                  <p className="text-[11px] text-ink-secondary truncate max-w-xl">
                    <strong className="text-blue-900 font-medium">Reason:</strong> {item.realReason}
                  </p>
                </div>

                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  item.isCompatible
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-blue-100 text-blue-800 border-blue-300'
                }`}>
                  {item.isCompatible ? 'Deliverable' : 'Route Restricted'}
                </span>
              </div>
            ))}

            {displayedResults.length > 2 && (
              <button
                type="button"
                onClick={() => {
                  playSoftTap();
                  setIsExpanded(true);
                }}
                className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer block"
              >
                + View {displayedResults.length - 2} more inspected recipients with full reasons
              </button>
            )}
          </div>
        )}
      </div>

      {/* Support and portal footer */}
      <div className="p-3 rounded-xl bg-surface border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-ink-secondary">
        <span>
          Need to enable international cross-border destinations on Telnyx? Contact{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-blue-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </span>
        <a
          href="https://portal.telnyx.com/#/app/messaging"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline flex items-center gap-1 font-semibold shrink-0"
        >
          Manage Telnyx Messaging Profile <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default CarrierRouteInspectionCard;
