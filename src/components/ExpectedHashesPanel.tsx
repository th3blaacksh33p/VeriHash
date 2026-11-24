import React, { useRef, useState } from 'react';
import {
  ClipboardPaste,
  CopyCheck,
  Eraser,
  FileSearch,
  FileText,
  RotateCcw,
} from 'lucide-react';
import type { HashAlgorithm, HashSet } from '../types/integrity';
import {
  EXPECTED_HEX_LENGTH,
  HASH_ALGORITHMS,
  normalizeHex,
  parseChecksumInput,
} from '../utils/hashing';

export interface DetectionNotice {
  message: string;
  tone: 'info' | 'warning';
  companionFile?: File;
}

interface ExpectedHashesPanelProps {
  expected: HashSet;
  computed: HashSet | null;
  currentFileName: string | null;
  autoDetectEnabled: boolean;
  detectionNotice: DetectionNotice | null;
  onToggleAutoDetect: (enabled: boolean) => void;
  onScanFilename: () => void;
  onLoadCompanionFile: (file: File) => void;
  onHashCompanionAsTarget: (file: File) => void;
  onChangeExpected: (next: HashSet) => void;
  onResetDefaults: () => void;
  onClearExpected: () => void;
}

export const ExpectedHashesPanel: React.FC<ExpectedHashesPanelProps> = ({
  expected,
  computed,
  currentFileName,
  autoDetectEnabled,
  detectionNotice,
  onToggleAutoDetect,
  onScanFilename,
  onLoadCompanionFile,
  onHashCompanionAsTarget,
  onChangeExpected,
  onResetDefaults,
  onClearExpected,
}) => {
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);
  const [isDraggingChecksum, setIsDraggingChecksum] = useState(false);
  const companionInputRef = useRef<HTMLInputElement>(null);

  const handleFieldChange = (alg: HashAlgorithm, value: string) => {
    onChangeExpected({
      ...expected,
      [alg]: value,
    });
  };

  const handleApplyPaste = () => {
    const parsed = parseChecksumInput(pasteText);
    const detectedCount = Object.keys(parsed).length;
    if (detectedCount === 0) {
      setPasteFeedback('No valid 32, 40, or 64-character hex digests detected.');
      return;
    }

    onChangeExpected({
      ...expected,
      ...parsed,
    });
    setPasteText('');
    setShowPasteBox(false);
    setPasteFeedback(
      `Populated ${detectedCount} digest${detectedCount > 1 ? 's' : ''}: ${Object.keys(parsed).join(', ')}.`
    );
  };

  const handleUseComputed = () => {
    if (!computed) return;
    onChangeExpected({ ...computed });
    setPasteFeedback('Copied computed digests into expected reference fields.');
  };

  const handlePanelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingChecksum(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onLoadCompanionFile(files[0]);
    }
  };

  return (
    <section
      aria-labelledby="expected-hashes-heading"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDraggingChecksum) setIsDraggingChecksum(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingChecksum(false);
        }
      }}
      onDrop={handlePanelDrop}
      className={`rounded-xl border p-6 space-y-5 transition-colors ${
        isDraggingChecksum ? 'border-blue-700 bg-blue-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <input
        ref={companionInputRef}
        type="file"
        accept=".txt,.sha256,.sha256sum,.sha256sums,.sha1,.sha1sum,.sha1sums,.md5,.md5sum,.md5sums,.sum,.sums"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            onLoadCompanionFile(files[0]);
            e.target.value = '';
          }
        }}
        className="sr-only"
        aria-label="Load companion checksum file"
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 id="expected-hashes-heading" className="text-base font-semibold text-slate-900">
            Expected Checksums
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Enter reference digests or auto-parse from a filename or companion .txt / .sha256 file.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowPasteBox((prev) => !prev);
              setPasteFeedback(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Smart Paste</span>
          </button>

          {computed && (
            <button
              type="button"
              onClick={handleUseComputed}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CopyCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Use Computed</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onResetDefaults();
              setPasteFeedback('Restored default reference hashes.');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Script Defaults</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClearExpected();
              setPasteFeedback(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Auto-Detect Companion & Filename Checksums Bar */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoDetectEnabled}
              onChange={(e) => onToggleAutoDetect(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
            />
            <span>Auto-detect from filename &amp; .txt / .sha256 files</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {currentFileName && (
              <button
                type="button"
                onClick={onScanFilename}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSearch className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Scan Filename</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => companionInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Load .txt / .sha256</span>
            </button>
          </div>
        </div>

        {detectionNotice && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-xs ${
              detectionNotice.tone === 'warning' ? 'text-amber-800' : 'text-emerald-800'
            }`}
          >
            <span className="font-medium">{detectionNotice.message}</span>
            {detectionNotice.companionFile && (
              <button
                type="button"
                onClick={() => onHashCompanionAsTarget(detectionNotice.companionFile!)}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Hash file as target instead
              </button>
            )}
          </div>
        )}
      </div>

      {showPasteBox && (
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
          <label htmlFor="smart-paste-input" className="block text-xs font-medium text-slate-700">
            Paste raw hex, sha256sum/md5sum lines, or key-value checksum output
          </label>
          <textarea
            id="smart-paste-input"
            rows={3}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`MD5: 9a3d12e0e4db940488d3f93c5a7b5010\nSHA-256: fe2ed2077eb58c0d8bbad20864fcb0ce04f96e1d56cdf20bfe0cba4c345a90ed`}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPasteBox(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyPaste}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
            >
              Extract Checksums
            </button>
          </div>
        </div>
      )}

      {pasteFeedback && (
        <p className="text-xs text-slate-600 font-medium">{pasteFeedback}</p>
      )}

      <div className="space-y-3.5">
        {HASH_ALGORITHMS.map((alg) => {
          const rawValue = expected[alg];
          const normalized = normalizeHex(rawValue);
          const targetLen = EXPECTED_HEX_LENGTH[alg];
          const hasValue = normalized.length > 0;
          const validChars = /^[0-9a-f]*$/.test(normalized);
          const isComplete = normalized.length === targetLen && validChars;

          return (
            <div key={alg} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor={`expected-${alg}`} className="font-semibold text-slate-700">
                  {alg}
                </label>
                <span
                  className={`font-mono tabular-nums ${
                    !hasValue
                      ? 'text-slate-400'
                      : !validChars
                      ? 'text-red-600'
                      : isComplete
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {!hasValue
                    ? `Optional · ${targetLen} hex chars`
                    : !validChars
                    ? 'Contains non-hex characters'
                    : `${normalized.length} / ${targetLen} hex`}
                </span>
              </div>
              <input
                id={`expected-${alg}`}
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={rawValue}
                onChange={(e) => handleFieldChange(alg, e.target.value)}
                placeholder={`Enter ${targetLen}-character ${alg} hex digest`}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 transition-colors"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
