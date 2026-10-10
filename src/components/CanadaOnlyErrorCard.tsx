// CanadaOnlyErrorCard.tsx
//
// Premium error card shown when a user on a Free/Starter plan uploads a CSV
// containing non-Canadian phone numbers. The card:
//   1. Groups all country-blocked rows into a branded summary
//   2. Shows each invalid row with its flagged phone number
//   3. Offers "Remove non-Canadian rows & continue" to strip them out
//   4. Counts down how many Canadian rows remain so the user knows they
//      haven't lost all their data

import React, { useMemo } from 'react';
import { MapPin, AlertTriangle, X, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { CsvRowIssue } from '../lib/pipelineClient';

// Issue message prefixes we recognise as Canada-only violations
const COUNTRY_BLOCK_PREFIXES = [
  'Phone number is',
  'Canadian numbers only',
  'could not be recognised',
  'is not recognised',
];

function isCountryBlocked(issues: string[]): boolean {
  return issues.some((msg) =>
    COUNTRY_BLOCK_PREFIXES.some((p) => msg.includes(p))
  );
}

function friendlyCountry(msg: string): string {
  if (msg.includes('is American')) return 'American';
  if (msg.includes('is international') || msg.includes('non-Canadian')) return 'non-Canadian';
  if (msg.includes('could not be recognised') || msg.includes('is not recognised')) return 'unrecognised';
  return 'non-Canadian';
}

interface CanadaOnlyErrorCardProps {
  invalidRows: CsvRowIssue[];
  validCount: number;
  totalRows: number;
  allowedCountries?: string[] | null;
  onRemoveNonCanadian: () => void;
  onClearAll: () => void;
  onClose?: () => void;
}

const MAX_VISIBLE = 8; // collapsed list max

export const CanadaOnlyErrorCard: React.FC<CanadaOnlyErrorCardProps> = ({
  invalidRows,
  validCount,
  totalRows,
  allowedCountries,
  onRemoveNonCanadian,
  onClearAll,
  onClose,
}) => {
  const [showAll, setShowAll] = React.useState(false);

  // Split rows into "country blocked" vs "other errors"
  const { countryBlocked, otherErrors } = useMemo(() => {
    const blocked = invalidRows.filter((r) => isCountryBlocked(r.issues));
    const other = invalidRows.filter((r) => !isCountryBlocked(r.issues));
    return { countryBlocked: blocked, otherErrors: other };
  }, [invalidRows]);

  const hasCanadianRows = validCount > 0;
  const visibleRows = showAll ? countryBlocked : countryBlocked.slice(0, MAX_VISIBLE);
  const hiddenCount = countryBlocked.length - MAX_VISIBLE;

  return (
    <div className="rounded-xl border-2 border-danger/40 bg-danger-soft/30 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-danger/5 to-transparent px-5 py-4 flex items-start gap-3">
        {/* Maple leaf / flag icon */}
        <div className="w-10 h-10 rounded-lg bg-danger/10 flex items-center justify-center shrink-0 mt-0.5">
          <MapPin className="w-5 h-5 text-danger" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-danger flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Canadian numbers only
          </h3>
          <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
            {hasCanadianRows ? (
              <>
                <span className="font-semibold text-ink">{countryBlocked.length}</span> of your{' '}
                <span className="font-semibold text-ink">{totalRows}</span> rows have a non-Canadian phone number.
                Your <span className="font-semibold text-ink">Free Plan</span> only supports Canadian SMS campaigns.
                {otherErrors.length > 0 && (
                  <> {' '}<span className="font-semibold text-ink">{otherErrors.length}</span> row(s) also have other issues.</>
                )}
              </>
            ) : (
              <>
                All <span className="font-semibold text-ink">{totalRows}</span> rows have non-Canadian phone numbers.
                Your <span className="font-semibold text-ink">Free Plan</span> only supports Canadian SMS campaigns.
              </>
            )}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-off-white rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-ink-tertiary" />
          </button>
        )}
      </div>

      {/* Country-blocked rows */}
      {countryBlocked.length > 0 && (
        <div className="px-5 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary mb-2">
            Non-Canadian rows ({countryBlocked.length})
          </div>

          <div className="space-y-1.5">
            {visibleRows.map((row, i) => {
              const countryLabel = row.issues
                .filter((msg) => isCountryBlocked([msg]))
                .map(friendlyCountry)
                .filter(Boolean)[0] || 'non-Canadian';

              return (
                <div
                  key={i}
                  className="flex items-start gap-2.5 bg-white rounded-lg px-3 py-2 border border-border-main"
                >
                  {/* Flag badge */}
                  <div className="w-6 h-6 rounded bg-danger/10 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-danger" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{row.name || '(blank)'}</p>
                    <p className="text-[11px] text-danger font-mono mt-0.5">{row.phone || '—'}</p>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20 shrink-0 capitalize">
                    {countryLabel}
                  </span>
                </div>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 flex items-center gap-1.5 text-[11px] text-accent font-semibold hover:underline"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Show {hiddenCount} more
            </button>
          )}
          {showAll && countryBlocked.length > MAX_VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-tertiary font-semibold hover:underline"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              Show less
            </button>
          )}
        </div>
      )}

      {/* Other errors */}
      {otherErrors.length > 0 && (
        <div className="px-5 py-3 border-t border-border-main">
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary mb-2">
            Other issues ({otherErrors.length})
          </div>
          <div className="space-y-1">
            {otherErrors.slice(0, 3).map((row, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded bg-warn/10 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-3 h-3 text-warn" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-ink truncate">{row.name || '(blank)'}</p>
                  <p className="text-[10px] text-warn mt-0.5">{row.issues.join(' · ')}</p>
                </div>
              </div>
            ))}
            {otherErrors.length > 3 && (
              <p className="text-[11px] text-ink-tertiary pl-7">
                +{otherErrors.length - 3} more row(s) with other issues
              </p>
            )}
          </div>
        </div>
      )}

      {/* CTA footer */}
      <div className="px-5 py-4 border-t border-danger/20 bg-gradient-to-r from-white/80 to-transparent flex flex-wrap items-center gap-3">
        {/* Canadian rows remaining badge */}
        {hasCanadianRows && (
          <div className="flex items-center gap-1.5 text-[11px] text-success font-semibold bg-success-soft px-3 py-1.5 rounded-full border border-success/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {validCount} Canadian row{validCount !== 1 ? 's' : ''} ready
          </div>
        )}

        <div className="flex-1" />

        {hasCanadianRows ? (
          <button
            type="button"
            onClick={onRemoveNonCanadian}
            className="px-4 py-2 bg-danger hover:bg-danger/90 text-white text-xs font-bold rounded-lg transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            Remove non-Canadian & continue
          </button>
        ) : (
          <button
            type="button"
            onClick={onClearAll}
            className="px-4 py-2 border border-danger/40 text-danger hover:bg-danger/5 text-xs font-semibold rounded-lg transition-all"
          >
            Clear all & upload new CSV
          </button>
        )}
      </div>
    </div>
  );
};

export default CanadaOnlyErrorCard;
