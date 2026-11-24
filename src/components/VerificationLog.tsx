import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  GitCompareArrows,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { VerificationRecord } from '../types/integrity';
import { HASH_ALGORITHMS, formatBytes, formatDuration } from '../utils/hashing';

interface VerificationLogProps {
  entries: VerificationRecord[];
  activeRecordId?: string | null;
  onInspectRecord: (record: VerificationRecord) => void;
  onClearSessionLog: () => void;
}

export const VerificationLog: React.FC<VerificationLogProps> = ({
  entries,
  activeRecordId,
  onInspectRecord,
  onClearSessionLog,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const comparedPair = useMemo(() => {
    if (selectedIds.length !== 2) return null;
    const first = entries.find((e) => e.id === selectedIds[0]);
    const second = entries.find((e) => e.id === selectedIds[1]);
    if (!first || !second) return null;
    return [first, second] as const;
  }, [entries, selectedIds]);

  const handleCopy = async (key: string, value: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1500);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <section
      aria-labelledby="verification-log-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              id="verification-log-heading"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Session Verification Log
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {entries.length} {entries.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            Timestamped feed of every digest computed in this session. Select any two entries to compare files directly without clearing the main results view.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Clear Selection ({selectedIds.length})
            </button>
          )}
          <button
            type="button"
            disabled={entries.length === 0}
            onClick={() => {
              setSelectedIds([]);
              onClearSessionLog();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear Session Log</span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Cross-File Comparison Panel when 2 entries are selected */}
      {comparedPair && (
        <div className="p-5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <GitCompareArrows className="w-4 h-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
              <span>
                Comparing {comparedPair[0].file.name} vs {comparedPair[1].file.name}
              </span>
            </div>
            <span
              className={`text-xs font-semibold ${
                comparedPair[0].computed['SHA-256'] === comparedPair[1].computed['SHA-256']
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {comparedPair[0].computed['SHA-256'] === comparedPair[1].computed['SHA-256']
                ? 'Files Are Byte-Identical'
                : 'Files Differ'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs font-mono tabular-nums">
            {HASH_ALGORITHMS.map((alg) => {
              const h1 = comparedPair[0].computed[alg];
              const h2 = comparedPair[1].computed[alg];
              const same = h1 === h2;
              return (
                <div
                  key={alg}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 lg:grid-cols-12 gap-2 items-center"
                >
                  <div className="lg:col-span-2 flex items-center justify-between lg:justify-start gap-2">
                    <span className="font-sans font-semibold text-slate-800 dark:text-slate-200">
                      {alg}
                    </span>
                    <span
                      className={`font-sans text-[11px] font-semibold ${
                        same
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {same ? 'Identical' : 'Different'}
                    </span>
                  </div>
                  <div className="lg:col-span-5 text-slate-700 dark:text-slate-300 truncate" title={h1}>
                    {h1}
                  </div>
                  <div className="lg:col-span-5 text-slate-700 dark:text-slate-300 truncate" title={h2}>
                    {h2}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No files hashed yet in this session. Each file you verify will appear here chronologically so you can compare sequential runs.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {entries.map((entry) => {
            const isSelected = selectedIds.includes(entry.id);
            const isCurrent = activeRecordId === entry.id;

            return (
              <article
                key={entry.id}
                className={`p-5 space-y-3 transition-colors ${
                  isSelected
                    ? 'bg-blue-50/40 dark:bg-blue-950/20'
                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(entry.id)}
                      aria-label={`Select ${entry.file.name} for cross-file comparison`}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-700 focus:ring-blue-700 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {entry.file.name}
                        </span>
                        {isCurrent && (
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                            · Current View
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2 mt-0.5">
                        <span>
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatBytes(entry.file.size)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDuration(entry.durationMs)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {entry.verdict === 'verified' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Match</span>
                      </span>
                    )}
                    {entry.verdict === 'tampered' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Mismatch</span>
                      </span>
                    )}
                    {entry.verdict === 'unverified' && (
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Computed
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onInspectRecord(entry)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Inspect</span>
                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-1.5 pl-7 font-mono text-xs tabular-nums">
                  {HASH_ALGORITHMS.map((alg) => {
                    const hashVal = entry.computed[alg];
                    const copyId = `${entry.id}-${alg}`;
                    return (
                      <div
                        key={alg}
                        className="flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800 rounded-md px-2.5 py-1.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-16 shrink-0 font-sans text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {alg}
                          </span>
                          <span className="text-slate-800 dark:text-slate-200 truncate select-all">
                            {hashVal}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(copyId, hashVal)}
                          aria-label={`Copy ${alg} hash for ${entry.file.name}`}
                          className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded cursor-pointer shrink-0"
                        >
                          {copiedKey === copyId ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
