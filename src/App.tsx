import React, { useEffect, useRef, useState } from 'react';
import { AlgorithmsView } from './components/AlgorithmsView';
import { BatchQueueView } from './components/BatchQueueView';
import { ComparisonResults } from './components/ComparisonResults';
import { DropZone } from './components/DropZone';
import { ExpectedHashesPanel, type DetectionNotice } from './components/ExpectedHashesPanel';
import { Header } from './components/Header';
import { HistoryView } from './components/HistoryView';
import type {
  ActiveTab,
  BatchQueueItem,
  FileMetadata,
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('verifier');
  const [fileMeta, setFileMeta] = useState<FileMetadata | null>(null);
  const [expectedHashes, setExpectedHashes] = useState<HashSet>({ ...DEFAULT_SCRIPT_HASHES });
  const [computedHashes, setComputedHashes] = useState<HashSet | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState<HashProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [detectionNotice, setDetectionNotice] = useState<DetectionNotice | null>(null);

  const [history, setHistory] = useState<VerificationRecord[]>(() => loadStoredHistory());
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);

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
    setIsComputing(true);
    setProgress({
      bytesProcessed: 0,
      totalBytes: file.size,
      percentage: 0,
      chunksProcessed: 0,
      totalChunks: Math.max(1, Math.ceil(file.size / 65536)),
      elapsedMs: 0,
      throughputMBps: 0,
    });

    try {
      const { hashes, durationMs: elapsed } = await computeFileHashes(
        file,
        (prog) => setProgress(prog),
        controller.signal
      );

      if (controller.signal.aborted) return;

      setComputedHashes(hashes);
      setDurationMs(elapsed);
      setIsComputing(false);

      const verdict = computeOverallVerdict(hashes, activeExpected);
      const record: VerificationRecord = {
        id: `${meta.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: meta,
        computed: hashes,
        expected: { ...activeExpected },
        verdict,
        durationMs: elapsed,
        timestamp: Date.now(),
      };
      setHistory((prev) => [record, ...prev].slice(0, 100));
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

    // Multi-file drop: look for target artifact + companion .txt/.sha256 checksum file
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

    // Single-file drop
    const singleFile = files[0];

    if (autoDetectEnabled && isCompanionCandidateFile(singleFile.name) && singleFile.size <= 1024 * 1024) {
      const dedicated = isDedicatedChecksumFile(singleFile.name);
      const parsed = await parseCompanionFile(singleFile, fileMeta?.name);
      const keys = Object.keys(parsed);

      const looksLikeChecksumTxt =
        singleFile.name.toLowerCase().endsWith('.txt') &&
        keys.length > 0 &&
        (Boolean(fileMeta) ||
          /sum|hash|sha|md5|checksum/i.test(singleFile.name));

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
    setErrorMsg(null);
    setDetectionNotice(null);
    setActiveTab('verifier');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <input
        ref={globalFileInputRef}
        type="file"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            runHashCheck(files[0]);
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
        {/* Page Heading */}
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            File Integrity Checker
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Compute MD5, SHA-1, and SHA-256 digests directly in your browser using 64 KiB chunked reads and verify against known reference checksums.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
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
                  isComputing={isComputing}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'batch' && (
          <BatchQueueView queue={batchQueue} onUpdateQueue={setBatchQueue} />
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

      <footer className="border-t border-slate-200 bg-white py-5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>VeriHash · Client-side cryptographic file verification</span>
          <span>64 KiB chunked streaming · Zero server uploads</span>
        </div>
      </footer>
    </div>
  );
}
