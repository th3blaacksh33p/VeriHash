import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Columns2,
  Copy,
  Download,
  FileText,
  Info,
  Rows3,
  XCircle,
} from 'lucide-react';
import type { FileMetadata, HashAlgorithm, HashProgress, HashSet } from '../types/integrity';
import {
  HASH_ALGORITHMS,
  buildTextReport,
  compareDigest,
  computeOverallVerdict,
  formatBytes,
  normalizeHex,
} from '../utils/hashing';
import { SideBySideBitDiff } from './SideBySideBitDiff';
import { HashSimilarityChart } from './HashSimilarityChart';
import { downloadPdfReport } from '../utils/pdfReport';

interface ComparisonResultsProps {
  fileMeta: FileMetadata | null;
  computed: HashSet | null;
  expected: HashSet;
  durationMs: number | null;
  algorithmDurationsMs: Record<HashAlgorithm, number> | null;
  isComputing: boolean;
  progress: HashProgress | null;
}

const HighlightedHexDiff: React.FC<{ computed: string; expected: string }> = ({
  computed,
  expected,
}) => {
  const normComputed = normalizeHex(computed);
  const normExpected = normalizeHex(expected);

  if (!normExpected) {
    return (
      <span className="text-slate-400 dark:text-slate-500 italic font-sans text-xs">
        No expected hash entered
      </span>
    );
  }

  return (
    <span className="break-all select-all">
      {normComputed.split('').map((char, idx) => {
        const expChar = normExpected[idx];
        const differs = expChar === undefined || char !== expChar;
        return (
          <span
            key={idx}
            className={
              differs
                ? 'bg-red-100 dark:bg-red-900/70 text-red-800 dark:text-red-200 font-semibold rounded-[2px]'
                : 'text-slate-700 dark:text-slate-300'
            }
          >
            {char}
          </span>
        );
      })}
    </span>
  );
};

export const ComparisonResults: React.FC<ComparisonResultsProps> = ({
  fileMeta,
  computed,
  expected,
  durationMs,
  algorithmDurationsMs,
  isComputing,
  progress,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'stacked' | 'side-by-side'>('stacked');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportMenuOpen]);

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
      }, 1600);
    } catch {
      // Clipboard access denied
    }
  };

  const handleDownloadTxt = () => {
    if (!fileMeta || !computed || durationMs === null) return;
    const text = buildTextReport(fileMeta, computed, expected, durationMs);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileMeta.name}.integrity-report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (!fileMeta || !computed || durationMs === null) return;
    const payload = {
      file: fileMeta,
      durationMs: Math.round(durationMs),
      algorithmDurationsMs: algorithmDurationsMs
        ? Object.fromEntries(
            HASH_ALGORITHMS.map((alg) => [alg, Number(algorithmDurationsMs[alg].toFixed(2))])
          )
        : null,
      timestamp: new Date().toISOString(),
      verdict: computeOverallVerdict(computed, expected),
      digests: HASH_ALGORITHMS.map((alg) => ({
        algorithm: alg,
        computed: computed[alg],
        expected: normalizeHex(expected[alg]) || null,
        status: compareDigest(computed[alg], expected[alg]),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileMeta.name}.integrity-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    if (!fileMeta || !computed || durationMs === null) return;
    downloadPdfReport({
      fileMeta,
      computed,
      expected,
      durationMs,
      algorithmDurationsMs,
    });
  };

  if (isComputing) {
    const totalBytes = progress?.totalBytes ?? fileMeta?.size ?? 0;

    return (
      <section
        aria-label="Computing hashes"
        aria-live="polite"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Computing Cryptographic Digests
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
              {progress
                ? `Chunk ${progress.chunksProcessed.toLocaleString()} / ${progress.totalChunks.toLocaleString()} · ${progress.throughputMBps.toFixed(1)} MB/s`
                : 'Preparing 64 KiB stream...'}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">
            {progress ? `${progress.percentage}%` : '0%'}
          </span>
        </div>

        <div className="space-y-3.5">
          {HASH_ALGORITHMS.map((alg) => {
            const algProgress = progress?.byAlgorithm?.[alg];
            const algBytes = algProgress?.bytesProcessed ?? 0;
            const algPct = algProgress?.percentage ?? 0;

            return (
              <div
                key={alg}
                className="p-4 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-2"
              >
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{alg}</span>
                    <span className="text-slate-400 dark:text-slate-500 font-mono">
                      {alg === 'MD5' ? '128-bit' : alg === 'SHA-1' ? '160-bit' : '256-bit'}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {formatBytes(algBytes)} / {formatBytes(totalBytes)} ({algPct.toFixed(1)}%)
                  </span>
                </div>

                <div
                  className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden"
                  role="progressbar"
                  aria-label={`${alg} hashing progress`}
                  aria-valuenow={Math.round(algPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-blue-700 dark:bg-blue-500 transition-transform duration-150 origin-left"
                    style={{ transform: `scaleX(${Math.max(0.02, algPct / 100)})` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (!computed || !fileMeta) {
    return (
      <section
        aria-label="Comparison results empty state"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center"
      >
        <div className="mx-auto w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 mb-3">
          <FileText className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Digest Comparison Output
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          Drop a file above or load one of the sample artifacts to compute MD5, SHA-1, and SHA-256 hashes and compare them against your expected values.
        </p>
      </section>
    );
  }

  const verdict = computeOverallVerdict(computed, expected);
  const matchedCount = HASH_ALGORITHMS.filter(
    (alg) => compareDigest(computed[alg], expected[alg]) === 'match'
  ).length;
  const checkedCount = HASH_ALGORITHMS.filter(
    (alg) => normalizeHex(expected[alg]).length > 0
  ).length;

  return (
    <section aria-labelledby="comparison-results-heading" className="space-y-5">
      {/* Integrity Verdict Banner */}
      <div
        role="status"
        className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          verdict === 'verified'
            ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/35 text-emerald-950 dark:text-emerald-100'
            : verdict === 'tampered'
            ? 'border-red-200 dark:border-red-800/80 bg-red-50/70 dark:bg-red-950/35 text-red-950 dark:text-red-100'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 shrink-0">
            {verdict === 'verified' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            ) : verdict === 'tampered' ? (
              <AlertTriangle className="w-6 h-6 text-red-700 dark:text-red-400" aria-hidden="true" />
            ) : (
              <Info className="w-6 h-6 text-blue-700 dark:text-blue-400" aria-hidden="true" />
            )}
          </div>
          <div>
            <h2 id="comparison-results-heading" className="text-base font-semibold">
              {verdict === 'verified'
                ? 'Integrity Verified — File Matches Expected Hashes'
                : verdict === 'tampered'
                ? 'Integrity Check Failed — File May Be Tampered With'
                : 'Digests Computed — No Expected Hashes Provided'}
            </h2>
            <p className="mt-1 text-sm opacity-90">
              {verdict === 'verified'
                ? `All ${checkedCount} checked digest${checkedCount > 1 ? 's' : ''} match the expected reference values. No tampering or corruption detected.`
                : verdict === 'tampered'
                ? `${matchedCount} of ${checkedCount} checked digest${checkedCount > 1 ? 's' : ''} matched. Highlighted bytes below show differences against expected checksums.`
                : 'Enter expected checksums in the panel to verify whether this file matches a trusted source.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              handleCopy(
                'report',
                buildTextReport(fileMeta, computed, expected, durationMs ?? 0)
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedKey === 'report' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>Copied Report</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy Report</span>
              </>
            )}
          </button>
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              onClick={() => setExportMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Report</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
            </button>

            {exportMenuOpen && (
              <div
                role="menu"
                aria-label="Export report format"
                className="absolute right-0 mt-1.5 w-52 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md py-1 z-20"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleDownloadPdf();
                    setExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-between cursor-pointer"
                >
                  <span>PDF Summary Report</span>
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">.pdf</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleDownloadJson();
                    setExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-between cursor-pointer"
                >
                  <span>Formatted JSON</span>
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">.json</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleDownloadTxt();
                    setExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-between cursor-pointer"
                >
                  <span>Plain Text Report</span>
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">.txt</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Graphical Character Similarity Overview */}
      <HashSimilarityChart computed={computed} expected={expected} />

      {/* Per-Algorithm Comparison Rows */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
        <div className="px-5 py-3.5 bg-slate-50/60 dark:bg-slate-950/50 flex flex-wrap items-center justify-between gap-3 rounded-t-xl">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Digest Comparison
          </span>

          <div
            role="group"
            aria-label="Comparison view mode"
            className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg"
          >
            <button
              type="button"
              onClick={() => setViewMode('stacked')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'stacked'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Rows3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Stacked</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'side-by-side'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Side-by-Side Diff</span>
            </button>
          </div>
        </div>

        {HASH_ALGORITHMS.map((alg: HashAlgorithm) => {
          const computedVal = computed[alg];
          const expectedVal = normalizeHex(expected[alg]);
          const status = compareDigest(computedVal, expectedVal);

          return (
            <div key={alg} className="p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alg}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {computedVal.length * 4}-bit · {computedVal.length} hex chars
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {status === 'match' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>Match</span>
                    </span>
                  )}
                  {status === 'mismatch' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                      <span>Does Not Match</span>
                    </span>
                  )}
                  {status === 'unverified' && (
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Not Checked
                    </span>
                  )}
                </div>
              </div>

              {viewMode === 'side-by-side' ? (
                <SideBySideBitDiff
                  algorithm={alg}
                  computed={computedVal}
                  expected={expectedVal}
                  status={status}
                  copiedKey={copiedKey}
                  onCopy={handleCopy}
                />
              ) : (
                <div className="grid grid-cols-1 gap-2.5 text-xs sm:text-[13px] font-mono tabular-nums">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <span className="w-20 shrink-0 font-sans text-xs font-medium text-slate-500 dark:text-slate-400">
                      Computed
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-lg px-3 py-2">
                        {status === 'mismatch' ? (
                          <HighlightedHexDiff computed={computedVal} expected={expectedVal} />
                        ) : (
                          <span className="text-slate-900 dark:text-slate-100 break-all select-all">
                            {computedVal}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(`${alg}-computed`, computedVal)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 font-sans text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:focus-visible:ring-blue-500"
                        aria-label={`Copy computed ${alg} hash to clipboard`}
                      >
                        {copiedKey === `${alg}-computed` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copy to Clipboard</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <span className="w-20 shrink-0 font-sans text-xs font-medium text-slate-500 dark:text-slate-400">
                      Expected
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div className="flex-1 min-w-0 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800 rounded-lg px-3 py-2">
                        {expectedVal ? (
                          <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                            {expectedVal}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 font-sans text-xs">
                            No expected {alg} hash provided
                          </span>
                        )}
                      </div>
                      {expectedVal && (
                        <button
                          type="button"
                          onClick={() => handleCopy(`${alg}-expected`, expectedVal)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 font-sans text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:focus-visible:ring-blue-500"
                          aria-label={`Copy expected ${alg} hash to clipboard`}
                        >
                          {copiedKey === `${alg}-expected` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Copy to Clipboard</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
