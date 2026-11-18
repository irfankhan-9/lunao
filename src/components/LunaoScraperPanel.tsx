import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import {
  crawlScraperBatch,
  downloadScrapedCsv,
  parseScraperCsv,
  ScraperInputRow,
  ScraperResultRow,
} from '../lib/emailScraperCsv';

interface LunaoScraperPanelProps {
  userPlan?: string;
  onUpgrade?: () => void;
  onClose?: () => void;
}

const BATCH_SIZE = 15;

function isPaidPlan(plan?: string): boolean {
  const normalized = String(plan || 'Free Plan').trim().toLowerCase();
  if (!normalized || normalized === 'free' || normalized === 'free plan') {
    return false;
  }
  return true;
}

export const LunaoScraperPanel: React.FC<LunaoScraperPanelProps> = ({
  userPlan = 'Free Plan',
  onUpgrade,
  onClose,
}) => {
  const unlocked = isPaidPlan(userPlan);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [inputRows, setInputRows] = useState<ScraperInputRow[]>([]);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [results, setResults] = useState<ScraperResultRow[]>([]);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFileName(null);
    setInputRows([]);
    setExtraColumns([]);
    setResults([]);
    setProcessedCount(0);
    setIsRunning(false);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file.');
      return;
    }

    setError(null);
    setResults([]);
    setProcessedCount(0);

    try {
      const text = await file.text();
      const parsed = parseScraperCsv(text);
      if (!parsed.ok) {
        setFileName(null);
        setInputRows([]);
        setExtraColumns([]);
        setError(parsed.error || 'Could not read CSV file.');
        return;
      }

      setFileName(file.name);
      setInputRows(parsed.rows);
      setExtraColumns(parsed.extraColumns);
      setResults(
        parsed.rows.map((r) => ({
          ...r,
          status: r.website.trim() ? 'pending' : 'no_website',
        })),
      );
    } catch {
      setError('Could not read the selected CSV file.');
    }
  };

  const handleStartScrape = async () => {
    if (!unlocked || inputRows.length === 0 || isRunning) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setError(null);
    setProcessedCount(0);

    const working: ScraperResultRow[] = inputRows.map((r) => ({
      ...r,
      status: r.website.trim() ? 'pending' : 'no_website',
    }));
    setResults([...working]);

    try {
      for (let i = 0; i < inputRows.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;
        const batch = inputRows.slice(i, i + BATCH_SIZE);
        const batchResults = await crawlScraperBatch(batch, userPlan, controller.signal);

        batchResults.forEach((rowResult, offset) => {
          working[i + offset] = rowResult;
        });

        setResults([...working]);
        setProcessedCount(Math.min(i + batch.length, inputRows.length));
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Could not finish scraping all rows.');
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    const baseName = fileName ? fileName.replace(/\.csv$/i, '') : 'lunao-leads';
    downloadScrapedCsv(results, extraColumns, `${baseName}-emails.csv`);
  };

  const foundCount = results.filter((r) => r.status === 'found' && r.email).length;
  const totalCount = inputRows.length;
  const hasFinishedAny = processedCount > 0 || foundCount > 0;

  return (
    <div className="rounded-2xl border border-border-main bg-white p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm sm:text-base font-serif font-bold text-ink">
              Lunao Scraper
            </h4>
            {!unlocked && <Lock className="w-3.5 h-3.5 text-ink-tertiary shrink-0" />}
          </div>
          <p className="text-xs sm:text-sm text-ink-secondary">
            {unlocked
              ? 'Upload a CSV with business names and websites to find contact emails and download the results.'
              : 'Available on paid plans. Upgrade your plan to extract emails from a business CSV.'}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={() => {
              if (isRunning) handleStop();
              onClose();
            }}
            aria-label="Close Lunao Scraper"
            className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink hover:bg-surface transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!unlocked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-light bg-surface/60 px-4 py-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-ink-secondary">
            <Lock className="w-4 h-4 text-ink-tertiary shrink-0" />
            <span>Locked on Free Plan</span>
          </div>
          {onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              View Plans
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {!fileName ? (
            <label className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-dashed border-border-main hover:border-accent/60 bg-surface/50 px-4 py-4 cursor-pointer transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-ink">Choose CSV file</p>
                  <p className="text-[11px] sm:text-xs text-ink-tertiary">
                    Columns: business_name, website (optional: city, phone)
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shrink-0 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                Upload CSV
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileChange(file);
                }}
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-light bg-surface/60 px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-ink truncate">
                    {fileName}
                  </span>
                  <span className="text-xs text-ink-tertiary shrink-0">
                    ({totalCount} rows)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {!isRunning ? (
                    <button
                      type="button"
                      onClick={handleStartScrape}
                      className="px-3.5 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {hasFinishedAny ? 'Re-run Scraper' : 'Start Scraping'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border-main bg-white hover:bg-surface text-ink text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                      Stop ({processedCount}/{totalCount})
                    </button>
                  )}

                  {results.length > 0 && hasFinishedAny && (
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border-main bg-white hover:bg-surface text-ink text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download CSV
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isRunning}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-ink-secondary hover:text-ink hover:bg-white disabled:opacity-50 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {(isRunning || hasFinishedAny) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-ink-secondary">
                    <span>
                      Processed {processedCount} of {totalCount}
                    </span>
                    <span className="font-semibold text-ink">
                      {foundCount} email{foundCount === 1 ? '' : 's'} found
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{
                        width: `${totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {results.length > 0 && (
                <div className="rounded-xl border border-border-light overflow-hidden">
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface/80 text-ink-secondary border-b border-border-light sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Business</th>
                          <th className="px-3 py-2 font-semibold">Website</th>
                          <th className="px-3 py-2 font-semibold">Email</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light bg-white">
                        {results.map((row, idx) => (
                          <tr key={`${row.business_name}-${row.website}-${idx}`}>
                            <td className="px-3 py-2 font-medium text-ink max-w-[180px] truncate">
                              {row.business_name || '—'}
                            </td>
                            <td className="px-3 py-2 text-ink-secondary max-w-[200px] truncate">
                              {row.website || '—'}
                            </td>
                            <td className="px-3 py-2 font-medium text-ink max-w-[200px] truncate">
                              {row.email || '—'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-ink-secondary">
                              {row.status === 'found'
                                ? 'Found'
                                : row.status === 'no_website'
                                  ? 'No website'
                                  : row.status === 'not_found'
                                    ? 'Not found'
                                    : 'Pending'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-danger/20 bg-danger/5 px-3.5 py-2.5 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
