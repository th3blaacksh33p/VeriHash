import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Moon, Sun } from 'lucide-react';
import { AlgorithmsView } from './components/AlgorithmsView';
import { BatchQueueView } from './components/BatchQueueView';
import { ComparisonResults } from './components/ComparisonResults';
import { DropZone } from './components/DropZone';
import { ExpectedHashesPanel, type DetectionNotice } from './components/ExpectedHashesPanel';
import { Header } from './components/Header';
import { HistoryView } from './components/HistoryView';
import { InstructionsModal } from './components/InstructionsModal';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { VerificationLog } from './components/VerificationLog';
import type {
  ActiveTab,
  BatchQueueItem,
  FileMetadata,
  HashAlgorithm,
  HashProgress,
  HashSet,
  VerificationRecord,
} from './types/integrity';
import {
  DEFAULT_SCRIPT_HASHES,
  EMPTY_HASHES,
  computeFileHashes,
  computeOverallVerdict,
  createSampleArtifact,
  extractHashesFromFilename,
  extractMetadata,
  isCompanionCandidateFile,
  isDedicatedChecksumFile,
  parseCompanionChecksumContent,
} from './utils/hashing';

const HISTORY_STORAGE_KEY = 'verihash_history_v1';
const THEME_STORAGE_KEY = 'verihash_theme_v1';

function loadStoredHistory(): VerificationRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getInitialTheme());
  const [activeTab, setActiveTab] = useState<ActiveTab>('verifier');
  const [fileMeta, setFileMeta] = useState<FileMetadata | null>(null);
  const [expectedHashes, setExpectedHashes] = useState<HashSet>({ ...DEFAULT_SCRIPT_HASHES });
  const [computedHashes, setComputedHashes] = useState<HashSet | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [algorithmDurationsMs, setAlgorithmDurationsMs] = useState<Record<
    HashAlgorithm,
    number
  > | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState<HashProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [detectionNotice, setDetectionNotice] = useState<DetectionNotice | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const [history, setHistory] = useState<VerificationRecord[]>(() => loadStoredHistory());
  const [sessionLog, setSessionLog] = useState<VerificationRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) return;

      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const hasMod = e.ctrlKey || e.metaKey;
      const keyLower = e.key.toLowerCase();

      if (hasMod && !e.shiftKey) {
        if (keyLower === 'o') {
          e.preventDefault();
          globalFileInputRef.current?.click();
          return;
        }
        if (keyLower === 'h') {
          e.preventDefault();
          setActiveTab('history');
          return;
        }
        if (keyLower === 'b') {
          e.preventDefault();
          setActiveTab('batch');
          return;
        }
        if (keyLower === 'i') {
          e.preventDefault();
          setShowInstructions((prev) => !prev);
          return;
        }
        if (keyLower === '1') {
          e.preventDefault();
          setActiveTab('verifier');
          return;
        }
        if (keyLower === '2') {
          e.preventDefault();
          setActiveTab('batch');
          return;
        }
        if (keyLower === '3') {
          e.preventDefault();
          setActiveTab('performance');
          return;
        }
        if (keyLower === '4') {
          e.preventDefault();
          setActiveTab('history');
          return;
        }
        if (keyLower === '5') {
          e.preventDefault();
          setActiveTab('algorithms');
          return;
        }
      }

      if (hasMod && e.shiftKey && keyLower === 'd') {
        e.preventDefault();
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
        return;
      }

      if (!hasMod && !isEditable && e.key === '?') {
        e.preventDefault();
        setShowInstructions((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  const runHashCheck = async (file: File, overrideExpected?: HashSet) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const meta = extractMetadata(file);
    const activeExpected = overrideExpected ?? expectedHashes;

    if (overrideExpected) {
      setExpectedHashes(overrideExpected);
    }

    setActiveTab('verifier');
    setErrorMsg(null);
    setFileMeta(meta);
    setComputedHashes(null);
    setDurationMs(null);
    setAlgorithmDurationsMs(null);
    setIsComputing(true);
    setProgress({
      bytesProcessed: 0,
      totalBytes: file.size,
      percentage: 0,
      chunksProcessed: 0,
      totalChunks: Math.max(1, Math.ceil(file.size / 65536)),
      elapsedMs: 0,
      throughputMBps: 0,
      byAlgorithm: {
        MD5: { bytesProcessed: 0, percentage: 0 },
        'SHA-1': { bytesProcessed: 0, percentage: 0 },
        'SHA-256': { bytesProcessed: 0, percentage: 0 },
      },
    });

    try {
      const {
        hashes,
        durationMs: elapsed,
        algorithmDurationsMs,
      } = await computeFileHashes(
        file,
        (prog) => setProgress(prog),
        controller.signal
      );

      if (controller.signal.aborted) return;

      setComputedHashes(hashes);
      setDurationMs(elapsed);
      setAlgorithmDurationsMs(algorithmDurationsMs);
      setIsComputing(false);

      const verdict = computeOverallVerdict(hashes, activeExpected);
      const record: VerificationRecord = {
        id: `${meta.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: meta,
        computed: hashes,
        expected: { ...activeExpected },
        verdict,
        durationMs: elapsed,
        algorithmDurationsMs,
        timestamp: Date.now(),
      };
      setActiveRecordId(record.id);
      setHistory((prev) => [record, ...prev].slice(0, 100));
      setSessionLog((prev) => [record, ...prev]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsComputing(false);
        return;
      }
      setIsComputing(false);
      setErrorMsg(err instanceof Error ? err.message : 'Unable to read or hash the selected file.');
    }
  };

  const handleCancelCompute = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsComputing(false);
    setProgress(null);
  };

  const handleClearFile = () => {
    handleCancelCompute();
    setFileMeta(null);
    setComputedHashes(null);
    setDurationMs(null);
    setAlgorithmDurationsMs(null);
    setErrorMsg(null);
    setDetectionNotice(null);
  };

  const applyDetectedHashes = (detected: Partial<HashSet>, notice: DetectionNotice) => {
    const nextExpected: HashSet = {
      ...EMPTY_HASHES,
      ...detected,
    };
    setExpectedHashes(nextExpected);
    setDetectionNotice(notice);
    return nextExpected;
  };

  const parseCompanionFile = async (
    companionFile: File,
    targetName?: string
  ): Promise<Partial<HashSet>> => {
    if (companionFile.size > 1024 * 1024) return {};
    const text = await companionFile.text();
    return parseCompanionChecksumContent(text, targetName);
  };

  const handleLoadCompanionFile = async (file: File) => {
    setErrorMsg(null);
    const parsed = await parseCompanionFile(file, fileMeta?.name);
    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      setDetectionNotice({
        tone: 'warning',
        message: `No valid MD5, SHA-1, or SHA-256 checksums found inside ${file.name}.`,
      });
      return;
    }

    applyDetectedHashes(parsed, {
      tone: 'info',
      message: `Parsed ${keys.join(', ')} from companion file ${file.name}.`,
    });
  };

  const handleScanFilename = () => {
    if (!fileMeta) return;
    const fromName = extractHashesFromFilename(fileMeta.name);
    const keys = Object.keys(fromName);
    if (keys.length === 0) {
      setDetectionNotice({
        tone: 'warning',
        message: `No MD5, SHA-1, or SHA-256 digest strings found in "${fileMeta.name}".`,
      });
      return;
    }
    applyDetectedHashes(fromName, {
      tone: 'info',
      message: `Detected ${keys.join(', ')} from filename "${fileMeta.name}".`,
    });
  };

  const handleDropZoneFiles = async (files: File[]) => {
    if (files.length === 0) return;

    if (files.length > 1) {
      const companions = files.filter(
        (f) => isCompanionCandidateFile(f.name) && f.size <= 1024 * 1024
      );
      const targets = files.filter((f) => !companions.includes(f));
      const targetFile = targets[0] ?? files[0];

      if (autoDetectEnabled && companions.length > 0) {
        let merged: Partial<HashSet> = extractHashesFromFilename(targetFile.name);
        const usedCompanions: string[] = [];

        for (const comp of companions) {
          if (comp === targetFile) continue;
          const parsed = await parseCompanionFile(comp, targetFile.name);
          if (Object.keys(parsed).length > 0) {
            merged = { ...merged, ...parsed };
            usedCompanions.push(comp.name);
          }
        }

        const keys = Object.keys(merged);
        if (keys.length > 0) {
          const nextExpected = applyDetectedHashes(merged, {
            tone: 'info',
            message:
              usedCompanions.length > 0
                ? `Auto-detected ${keys.join(', ')} from ${usedCompanions.join(', ')}.`
                : `Auto-detected ${keys.join(', ')} from filename "${targetFile.name}".`,
          });
          await runHashCheck(targetFile, nextExpected);
          return;
        }
      }

      setDetectionNotice(null);
      await runHashCheck(targetFile);
      return;
    }

    const singleFile = files[0];

    if (
      autoDetectEnabled &&
      isCompanionCandidateFile(singleFile.name) &&
      singleFile.size <= 1024 * 1024
    ) {
      const dedicated = isDedicatedChecksumFile(singleFile.name);
      const parsed = await parseCompanionFile(singleFile, fileMeta?.name);
      const keys = Object.keys(parsed);

      const looksLikeChecksumTxt =
        singleFile.name.toLowerCase().endsWith('.txt') &&
        keys.length > 0 &&
        (Boolean(fileMeta) || /sum|hash|sha|md5|checksum/i.test(singleFile.name));

      if ((dedicated && keys.length > 0) || looksLikeChecksumTxt) {
        applyDetectedHashes(parsed, {
          tone: 'info',
          message: `Parsed ${keys.join(', ')} from companion file ${singleFile.name}.`,
          companionFile: singleFile,
        });
        return;
      }

      if (dedicated && keys.length === 0) {
        setDetectionNotice({
          tone: 'warning',
          message: `No valid checksums found inside ${singleFile.name}.`,
          companionFile: singleFile,
        });
        return;
      }
    }

    if (autoDetectEnabled) {
      const fromName = extractHashesFromFilename(singleFile.name);
      const keys = Object.keys(fromName);
      if (keys.length > 0) {
        const nextExpected = applyDetectedHashes(fromName, {
          tone: 'info',
          message: `Auto-detected ${keys.join(', ')} from filename "${singleFile.name}".`,
        });
        await runHashCheck(singleFile, nextExpected);
        return;
      }
    }

    setDetectionNotice(null);
    await runHashCheck(singleFile);
  };

  const handleLoadSample = async (tampered: boolean) => {
    setDetectionNotice(null);
    const { file, expectedHashes: sampleExpected } = await createSampleArtifact(tampered);
    await runHashCheck(file, sampleExpected);
  };

  const handleLoadHistoryRecord = (record: VerificationRecord) => {
    handleCancelCompute();
    setFileMeta(record.file);
    setComputedHashes(record.computed);
    setExpectedHashes(record.expected);
    setDurationMs(record.durationMs);
    setAlgorithmDurationsMs(record.algorithmDurationsMs ?? null);
    setActiveRecordId(record.id);
    setErrorMsg(null);
    setDetectionNotice(null);
    setActiveTab('verifier');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <input
        ref={globalFileInputRef}
        type="file"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            handleDropZoneFiles(Array.from(files));
            e.target.value = '';
          }
        }}
        className="sr-only"
        aria-label="Select file from header"
      />

      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onPickFile={() => globalFileInputRef.current?.click()}
        historyCount={history.length}
        batchCount={batchQueue.length}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Page Heading + Theme Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">
              File Integrity Checker
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              Compute MD5, SHA-1, and SHA-256 digests directly in your browser using 64 KiB chunked reads and verify against known reference checksums.
            </p>
          </div>

          <div
            role="group"
            aria-label="Color theme"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0 self-start"
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              aria-pressed={theme === 'light'}
            >
              <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-800 text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              aria-pressed={theme === 'dark'}
            >
              <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 dark:border-red-800/80 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200"
          >
            {errorMsg}
          </div>
        )}

        {activeTab === 'verifier' && (
          <div className="space-y-6">
            <DropZone
              fileMeta={fileMeta}
              isComputing={isComputing}
              progress={progress}
              durationMs={durationMs}
              onFilesSelected={handleDropZoneFiles}
              onCancelCompute={handleCancelCompute}
              onClearFile={handleClearFile}
              onLoadSample={handleLoadSample}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5">
                <ExpectedHashesPanel
                  expected={expectedHashes}
                  computed={computedHashes}
                  currentFileName={fileMeta?.name ?? null}
                  autoDetectEnabled={autoDetectEnabled}
                  detectionNotice={detectionNotice}
                  onToggleAutoDetect={setAutoDetectEnabled}
                  onScanFilename={handleScanFilename}
                  onLoadCompanionFile={handleLoadCompanionFile}
                  onHashCompanionAsTarget={(file) => {
                    setDetectionNotice(null);
                    runHashCheck(file);
                  }}
                  onChangeExpected={setExpectedHashes}
                  onResetDefaults={() => {
                    setDetectionNotice(null);
                    setExpectedHashes({ ...DEFAULT_SCRIPT_HASHES });
                  }}
                  onClearExpected={() => {
                    setDetectionNotice(null);
                    setExpectedHashes({ ...EMPTY_HASHES });
                  }}
                />
              </div>

              <div className="lg:col-span-7">
                <ComparisonResults
                  fileMeta={fileMeta}
                  computed={computedHashes}
                  expected={expectedHashes}
                  durationMs={durationMs}
                  algorithmDurationsMs={algorithmDurationsMs}
                  isComputing={isComputing}
                  progress={progress}
                />
              </div>
            </div>

            <VerificationLog
              entries={sessionLog}
              activeRecordId={activeRecordId}
              onInspectRecord={handleLoadHistoryRecord}
              onClearSessionLog={() => setSessionLog([])}
            />
          </div>
        )}

        {activeTab === 'batch' && (
          <BatchQueueView queue={batchQueue} onUpdateQueue={setBatchQueue} />
        )}

        {activeTab === 'performance' && (
          <PerformanceDashboard
            history={history}
            batchQueue={batchQueue}
            onRecordBenchmark={(rec) => {
              setHistory((prev) => [rec, ...prev].slice(0, 100));
              setSessionLog((prev) => [rec, ...prev]);
            }}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            records={history}
            onClearHistory={() => setHistory([])}
            onLoadRecord={handleLoadHistoryRecord}
          />
        )}

        {activeTab === 'algorithms' && <AlgorithmsView />}
      </main>

      <InstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
      />

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-5 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>VeriHash · Client-side cryptographic file verification</span>
          <div className="flex flex-wrap items-center gap-4">
            <span>64 KiB chunked streaming · Zero server uploads</span>
            <button
              type="button"
              onClick={() => setShowInstructions(true)}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2 cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Instructions &amp; Shortcuts (Ctrl+I)</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
