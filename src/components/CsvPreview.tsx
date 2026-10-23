/**
 * CsvPreview — Beautiful scrollable CSV data viewer for Email Campaign Wizard & Site Deploy
 * Shows parsed lead data with smooth scrolling, inline editing, and deletion.
 */

import React, { useRef, useState } from 'react';
import { X, Upload, FileSpreadsheet, ChevronDown, ChevronUp, Table2, Sparkles, CheckCircle2, Pencil, Check } from 'lucide-react';
import { PipelineLead } from '../lib/pipelineClient';

interface CsvPreviewProps {
  fileName: string;
  leads: PipelineLead[];
  totalCount: number;
  onClear: () => void;
  onRemoveLead?: (index: number) => void;
  onUpdateLead?: (index: number, updatedLead: PipelineLead) => void;
  ClearIcon?: React.ElementType;
}

export const CsvPreview: React.FC<CsvPreviewProps> = ({
  fileName,
  leads,
  totalCount,
  onClear,
  onRemoveLead,
  onUpdateLead,
  ClearIcon = X,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAutoScroll, setIsAutoScroll] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PipelineLead | null>(null);

  // Show max 50 leads initially, then expand
  const displayedLeads = showAll ? leads : leads.slice(0, 50);
  const hasMore = leads.length > 50;

  // Sample lead for preview header
  const sampleLead = leads[0];

  // Get column headers from sample lead
  const columns = sampleLead ? Object.keys(sampleLead).filter(k => k !== 'id') : [];

  const handleStartEdit = (idx: number, lead: PipelineLead) => {
    setEditingIndex(idx);
    setEditForm({ ...lead });
  };

  const handleSaveEdit = (idx: number) => {
    if (editForm && onUpdateLead) {
      onUpdateLead(idx, editForm);
    }
    setEditingIndex(null);
    setEditForm(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditForm(null);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-white via-accent-soft/5 to-white shadow-lg shadow-accent/10 animate-fade-in">
      {/* Decorative background glow */}
      <div className="absolute -top-20 -right-20 w-48 h-48 bg-accent/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent/6 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative px-3.5 py-3 sm:px-5 sm:py-4 border-b border-border-light/80 bg-gradient-to-r from-accent-soft/20 to-transparent">
        <div className="flex items-start justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            {/* Animated file icon */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-lg shadow-accent/30">
                <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              {/* Success pulse ring */}
              <span className="absolute inset-0 rounded-xl border-2 border-accent/40 animate-ping" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-success rounded-full flex items-center justify-center shadow-sm border-2 border-white">
                <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h4 className="text-xs sm:text-sm font-bold text-ink truncate max-w-[170px] sm:max-w-none">{fileName}</h4>
                <span className="px-2 py-0.5 bg-success/15 text-success text-[9px] sm:text-[10px] font-bold rounded-full shrink-0">
                  Validated & Editable
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-secondary">
                  <span className="font-bold text-ink">{totalCount.toLocaleString()}</span> leads parsed
                </span>
                {hasMore && (
                  <span className="text-[10px] text-ink-tertiary">
                    Showing {Math.min(50, leads.length).toLocaleString()} of {leads.length.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Clear button */}
          <button
            type="button"
            onClick={onClear}
            className="group p-2 rounded-lg hover:bg-danger/10 transition-all cursor-pointer shrink-0"
            title="Remove all leads"
          >
            <ClearIcon className="w-4 h-4 text-ink-tertiary group-hover:text-danger transition-colors" />
          </button>
        </div>
      </div>

      {/* Scrollable Data Container */}
      <div className="relative">
        {/* Scroll controls */}
        <div className="px-3.5 py-2 sm:px-5 sm:py-2.5 flex items-center justify-between gap-2 bg-gradient-to-r from-surface/80 to-transparent border-b border-border-light/50">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Table2 className="w-4 h-4 text-ink-secondary shrink-0" />
            <span className="text-[10px] sm:text-[11px] font-semibold text-ink-secondary truncate">
              Lead Data Preview <span className="hidden sm:inline">(Click Edit to modify details)</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Auto-scroll toggle */}
            <button
              type="button"
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                isAutoScroll
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-surface text-ink-secondary hover:bg-accent-soft hover:text-accent'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isAutoScroll ? 'bg-white animate-pulse' : 'bg-ink-tertiary'}`} />
              Auto-scroll
            </button>
          </div>
        </div>

        {/* Data Table with Scroll */}
        <div
          ref={scrollRef}
          className={`max-h-[380px] overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-accent/30 scrollbar-track-transparent transition-all duration-300 ${
            isAutoScroll ? 'scroll-smooth' : 'scroll-auto'
          }`}
        >
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm">
              <tr className="border-b border-border-light/80">
                <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-bold text-ink-secondary bg-surface whitespace-nowrap">
                  #
                </th>
                {columns.slice(0, 6).map((col) => (
                  <th
                    key={col}
                    className="px-3 sm:px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-bold text-ink-secondary bg-surface whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.replace(/_/g, ' ')}
                    </span>
                  </th>
                ))}
                {columns.length > 6 && (
                  <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-bold text-ink-tertiary bg-surface whitespace-nowrap">
                    +{columns.length - 6} more
                  </th>
                )}
                {(onRemoveLead || onUpdateLead) && (
                  <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold text-ink-secondary bg-surface whitespace-nowrap">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light/50">
              {displayedLeads.map((lead, idx) => {
                const isEditing = editingIndex === idx;
                return (
                  <tr
                    key={lead.id || idx}
                    className={`transition-colors group ${isEditing ? 'bg-accent-soft/40 ring-1 ring-accent/30' : 'hover:bg-accent-soft/30'}`}
                  >
                    <td className="px-4 py-2.5 text-[11px] text-ink-tertiary font-mono align-middle">
                      {idx + 1}
                    </td>
                    {columns.slice(0, 6).map((col) => (
                      <td
                        key={col}
                        className="px-4 py-2.5 text-ink group-hover:text-ink-secondary transition-colors align-middle"
                      >
                        {isEditing && editForm ? (
                          <input
                            type="text"
                            value={editForm[col] ?? ''}
                            onChange={(e) => {
                              const updated = { ...editForm, [col]: e.target.value };
                              setEditForm(updated);
                              if (onUpdateLead) {
                                onUpdateLead(idx, updated);
                              }
                            }}
                            className="w-full px-2.5 py-1 text-xs rounded-lg border border-accent bg-white text-ink shadow-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                        ) : (
                          <span className="inline-block max-w-[180px] truncate">
                            {String((lead as any)[col] ?? '—')}
                          </span>
                        )}
                      </td>
                    ))}
                    {columns.length > 6 && (
                      <td className="px-4 py-2.5 text-ink-tertiary text-[10px] align-middle">
                        ···
                      </td>
                    )}
                    {(onRemoveLead || onUpdateLead) && (
                      <td className="px-3 py-2.5 text-right align-middle">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(idx)}
                                className="p-1.5 rounded-lg bg-success text-white hover:bg-success/90 transition-colors cursor-pointer shadow-xs"
                                title="Save changes"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="p-1.5 rounded-lg bg-surface text-ink-secondary hover:bg-border-main transition-colors cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              {onUpdateLead && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(idx, lead)}
                                  className="p-1.5 rounded-lg text-ink-tertiary hover:text-accent hover:bg-accent-soft transition-colors opacity-75 group-hover:opacity-100 cursor-pointer"
                                  title="Edit lead info"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onRemoveLead && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveLead(idx);
                                  }}
                                  className="p-1.5 rounded-lg text-ink-tertiary hover:text-danger hover:bg-danger/10 transition-colors opacity-75 group-hover:opacity-100 cursor-pointer"
                                  title="Remove this lead"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Show more / less */}
          {hasMore && (
            <div className="sticky bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-8 pb-4 px-5">
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="w-full py-2.5 rounded-xl bg-accent-soft/80 border border-accent/20 text-[11px] font-bold text-accent hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Show all {leads.length.toLocaleString()} leads
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer stats */}
      <div className="px-5 py-3 border-t border-border-light/80 bg-gradient-to-r from-surface/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-ink-tertiary">
              <span className="font-bold text-ink">{columns.length}</span> columns detected
            </span>
            <span className="w-1 h-1 rounded-full bg-border-main" />
            <span className="text-[10px] text-ink-tertiary">
              <span className="font-bold text-ink">{leads.length.toLocaleString()}</span> active leads
            </span>
          </div>
          <span className="text-[10px] text-success font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Ready for Site Deploy
          </span>
        </div>
      </div>
    </div>
  );
};

export default CsvPreview;
