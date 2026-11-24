import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileUp,
  Info,
  Play,
  Square,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type { BatchQueueItem, HashSet } from '../types/integrity';
import {
  HASH_ALGORITHMS,
  compareDigest,
  computeFileHashes,
  extractHashesFromFilename,
  extractMetadata,
  formatBytes,
  formatDuration,
  parseChecksumManifest,
} from '../utils/hashing';

interface BatchQueueViewProps {
  queue: BatchQueueItem[];
  onUpdateQueue: React.Dispatch<React.SetStateAction<BatchQueueItem[]>>;
}

interface BatchRunProgress {
  currentIndex: number;
  totalCount: number;
  currentFileName: string;
  currentPercentage: number;
}

interface BatchCompletionNotice {
  title: string;
  body: string;
  variant: 'success' | 'alert' | 'info';
  browserDelivered: boolean;
}

const NOTIF_PREF_KEY = 'verihash_batch_notifications_v1';

function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function getInitialNotifEnabled(permission: NotificationPermission | 'unsupported'): boolean {
  if (permission === 'unsupported' || permission === 'denied') return false;
  try {
    const saved = localStorage.getItem(NOTIF_PREF_KEY);
    if (saved === 'true') return permission === 'granted';
    if (saved === 'false') return false;
  } catch {
    // Ignore storage access errors
  }
  return permission === 'granted';
}

export const BatchQueueView: React.FC<BatchQueueViewProps> = ({ queue, onUpdateQueue }) => {
  const [manifestText, setManifestText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchRunProgress | null>(null);
  const [batchFinishedAt, setBatchFinishedAt] = useState<number | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getNotificationPermission()
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() =>
    getInitialNotifEnabled(getNotificationPermission())
  );
  const [completionNotice, setCompletionNotice] = useState<BatchCompletionNotice | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const persistNotifPref = (enabled: boolean) => {
    try {
      localStorage.setItem(NOTIF_PREF_KEY, String(enabled));
    } catch {
      // Ignore storage access errors
    }
  };

  const handleToggleNotifications = async () => {
    if (notifPermission === 'unsupported') return;

    if (notifPermission === 'granted') {
      const next = !notificationsEnabled;
      setNotificationsEnabled(next);
      persistNotifPref(next);
      return;
    }

    if (notifPermission === 'denied') {
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      const granted = result === 'granted';
      setNotificationsEnabled(granted);
      persistNotifPref(granted);
    } catch {
      setNotifPermission('unsupported');
      setNotificationsEnabled(false);
    }
  };

  const parsedManifest = parseChecksumManifest(manifestText);

  const evaluateBatchItem = (
    computed: HashSet,
    expected?: Partial<HashSet>
  ): 'verified' | 'tampered' | 'unverified' => {
    if (!expected) return 'unverified';
    const entries = Object.entries(expected).filter(([, val]) => Boolean(val && val.trim()));
    if (entries.length === 0) return 'unverified';
    const allMatch = entries.every(
      ([alg, val]) => compareDigest(computed[alg as keyof HashSet], val || '') === 'match'
    );
    return allMatch ? 'verified' : 'tampered';
  };

  const resolveExpectedForName = (
    fileName: string,
    manifestMap: Map<string, Partial<HashSet>>
  ): Partial<HashSet> | undefined => {
    const fromManifest = manifestMap.get(fileName);
    if (fromManifest && Object.keys(fromManifest).length > 0) {
      return fromManifest;
    }
    const fromFilename = extractHashesFromFilename(fileName);
    return Object.keys(fromFilename).length > 0 ? fromFilename : undefined;
  };

  const enqueueFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newItems: BatchQueueItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      metadata: extractMetadata(file),
      status: 'queued',
      progress: 0,
      expected: resolveExpectedForName(file.name, parsedManifest),
    }));

    onUpdateQueue((prev) => [...prev, ...newItems]);
  };

  const handleApplyManifestToExisting = (nextManifestText: string) => {
    setManifestText(nextManifestText);
    const map = parseChecksumManifest(nextManifestText);
    onUpdateQueue((prev) =>
      prev.map((item) => {
        const expected = resolveExpectedForName(item.metadata.name, map);
        if (!item.computed) {
          return { ...item, expected };
        }
        const verdict = evaluateBatchItem(item.computed, expected);
        return { ...item, expected, status: verdict };
      })
    );
  };

  const handleRunQueue = async () => {
    if (isProcessing) return;
    const pending = queue.filter((item) => item.status === 'queued' || item.status === 'error');
    if (pending.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsProcessing(true);
    setBatchFinishedAt(null);
    setCompletionNotice(null);
    const latestManifest = parseChecksumManifest(manifestText);

    let processedCount = 0;
    let verifiedCount = 0;
    let tamperedCount = 0;
    let unverifiedCount = 0;
    let errorCount = 0;
    let totalRunBytes = 0;
    let totalRunMs = 0;
    let wasAborted = false;

    for (let i = 0; i < pending.length; i++) {
      if (controller.signal.aborted) {
        wasAborted = true;
        break;
      }
      const item = pending[i];

      setBatchProgress({
        currentIndex: i + 1,
        totalCount: pending.length,
        currentFileName: item.metadata.name,
        currentPercentage: 0,
      });

      onUpdateQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'computing', progress: 0 } : q))
      );

      try {
        const { hashes, durationMs, algorithmDurationsMs } = await computeFileHashes(
          item.file,
          (prog) => {
            setBatchProgress({
              currentIndex: i + 1,
              totalCount: pending.length,
              currentFileName: item.metadata.name,
              currentPercentage: prog.percentage,
            });
            onUpdateQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, progress: prog.percentage } : q))
            );
          },
          controller.signal
        );

        const expected = resolveExpectedForName(item.metadata.name, latestManifest) ?? item.expected;
        const verdict = evaluateBatchItem(hashes, expected);

        processedCount += 1;
        totalRunBytes += item.metadata.size;
        totalRunMs += durationMs;
        if (verdict === 'verified') verifiedCount += 1;
        else if (verdict === 'tampered') tamperedCount += 1;
        else unverifiedCount += 1;

        onUpdateQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: verdict,
                  progress: 100,
                  computed: hashes,
                  expected,
                  durationMs,
                  algorithmDurationsMs,
                }
              : q
          )
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          wasAborted = true;
          onUpdateQueue((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, status: 'queued', progress: 0 } : q
            )
          );
          break;
        }
        processedCount += 1;
        errorCount += 1;
        onUpdateQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'error',
                  error: err instanceof Error ? err.message : 'Failed to hash file',
                }
              : q
          )
        );
      }
    }

    abortRef.current = null;
    setIsProcessing(false);
    setBatchProgress(null);
    setBatchFinishedAt(Date.now());

    if (!wasAborted && processedCount > 0) {
      let title = 'VeriHash: Batch Hashing Complete';
      let body = `Batch hashing complete: ${processedCount}/${pending.length} files hashed (${formatBytes(totalRunBytes)} in ${formatDuration(totalRunMs)}).`;
      let variant: BatchCompletionNotice['variant'] = 'info';

      if (tamperedCount > 0 || errorCount > 0) {
        const checkedTotal = verifiedCount + tamperedCount + errorCount;
        title = 'VeriHash: Integrity Alert';
        body = `Verification complete: ${verifiedCount}/${checkedTotal} matched, ${tamperedCount} mismatch(es), ${errorCount} error(s).`;
        variant = 'alert';
      } else if (verifiedCount > 0 && unverifiedCount === 0) {
        title = 'VeriHash: Verification Complete';
        body = `Verification complete: ${verifiedCount}/${processedCount} files matched (${formatBytes(totalRunBytes)} in ${formatDuration(totalRunMs)}).`;
        variant = 'success';
      } else if (verifiedCount > 0) {
        title = 'VeriHash: Verification Complete';
        body = `Verification complete: ${verifiedCount}/${processedCount} matched, ${unverifiedCount} computed only (${formatDuration(totalRunMs)}).`;
        variant = 'success';
      }

      let browserDelivered = false;
      if (
        notificationsEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          const notification = new Notification(title, {
            body,
            tag: 'verihash-batch-complete',
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
          browserDelivered = true;
        } catch {
          browserDelivered = false;
        }
      }

      setCompletionNotice({
        title,
        body,
        variant,
        browserDelivered,
      });
    }
  };

  const handleCancelBatch = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  const handleRemoveItem = (id: string) => {
    if (isProcessing) return;
    onUpdateQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const summary = useMemo(() => {
    const completedItems = queue.filter((q) => q.computed);
    const verifiedCount = queue.filter((q) => q.status === 'verified').length;
    const tamperedCount = queue.filter((q) => q.status === 'tampered').length;
    const unverifiedCount = queue.filter((q) => q.status === 'unverified').length;
    const errorCount = queue.filter((q) => q.status === 'error').length;
    const queuedCount = queue.filter((q) => q.status === 'queued').length;
    const totalBytesHashed = completedItems.reduce((acc, q) => acc + q.metadata.size, 0);
    const totalDurationMs = completedItems.reduce((acc, q) => acc + (q.durationMs ?? 0), 0);
    const throughputMBps =
      totalDurationMs > 0 ? totalBytesHashed / (1024 * 1024) / (totalDurationMs / 1000) : 0;

    return {
      totalItems: queue.length,
      completedCount: completedItems.length,
      verifiedCount,
      tamperedCount,
      unverifiedCount,
      errorCount,
      queuedCount,
      totalBytesHashed,
      totalDurationMs,
      throughputMBps,
    };
  }, [queue]);

  const buildBatchSummaryText = () => {
    const completed = queue.filter((q) => q.computed || q.status === 'error');
    const lines = [
      'VeriHash Batch Verification Summary Report',
      '==========================================',
      `Generated: ${new Date(batchFinishedAt ?? Date.now()).toISOString()}`,
      `Files Processed: ${summary.completedCount} / ${summary.totalItems} (${formatBytes(summary.totalBytesHashed)})`,
      `Verified Matches: ${summary.verifiedCount}`,
      `Mismatches: ${summary.tamperedCount}`,
      `Computed Only: ${summary.unverifiedCount}`,
      `Errors: ${summary.errorCount}`,
      `Total Hashing Time: ${formatDuration(summary.totalDurationMs)}`,
      '',
      'Per-File Results:',
      ...completed.flatMap((item) => {
        if (item.status === 'error') {
          return [`- ${item.metadata.name}: ERROR (${item.error || 'Unknown error'})`];
        }
        return [
          `- ${item.metadata.name} (${formatBytes(item.metadata.size)}) [${item.status.toUpperCase()}] in ${formatDuration(item.durationMs ?? 0)}`,
          `    MD5:     ${item.computed!.MD5}`,
          `    SHA-1:   ${item.computed!['SHA-1']}`,
          `    SHA-256: ${item.computed!['SHA-256']}`,
        ];
      }),
    ];
    return lines.join('\n');
  };

  const handleCopySummary = async () => {
    const text = buildBatchSummaryText();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 1600);
    } catch {
      // Clipboard denied
    }
  };

  const handleExportSummaryTxt = () => {
    const blob = new Blob([buildBatchSummaryText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verihash-batch-summary-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSummaryJson = () => {
    const payload = {
      generatedAt: new Date(batchFinishedAt ?? Date.now()).toISOString(),
      summary: {
        totalQueued: summary.totalItems,
        completed: summary.completedCount,
        verified: summary.verifiedCount,
        tampered: summary.tamperedCount,
        unverified: summary.unverifiedCount,
        errors: summary.errorCount,
        totalBytesHashed: summary.totalBytesHashed,
        totalDurationMs: Math.round(summary.totalDurationMs),
      },
      files: queue
        .filter((item) => item.computed || item.status === 'error')
        .map((item) => ({
          file: item.metadata,
          status: item.status,
          durationMs: item.durationMs ? Math.round(item.durationMs) : null,
          computed: item.computed ?? null,
          expected: item.expected ?? null,
          error: item.error ?? null,
        })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verihash-batch-summary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSha256Sums = () => {
    const completed = queue.filter((item) => item.computed);
    if (completed.length === 0) return;
    const lines = completed.map((item) => `${item.computed!['SHA-256']}  ${item.metadata.name}`);
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SHA256SUMS.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const showSummaryReport =
    !isProcessing && (summary.completedCount > 0 || summary.errorCount > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Multi-file Drop Box */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) enqueueFiles(e.dataTransfer.files);
          }}
          className={`lg:col-span-6 rounded-xl border p-6 space-y-4 transition-colors ${
            isDragging
              ? 'border-blue-700 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => {
              if (e.target.files) enqueueFiles(e.target.files);
              e.target.value = '';
            }}
            className="sr-only"
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Multi-File Batch Queue
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Queue multiple files for sequential 64 KiB chunked hashing and generate a summary report at the end of the run.
              </p>
            </div>

            <button
              type="button"
              disabled={notifPermission === 'unsupported' || notifPermission === 'denied'}
              onClick={handleToggleNotifications}
              aria-pressed={notificationsEnabled && notifPermission === 'granted'}
              title={
                notifPermission === 'denied'
                  ? 'Browser notifications are blocked in site settings'
                  : notifPermission === 'unsupported'
                  ? 'Browser notifications are not supported in this browser'
                  : 'Notify me when batch hashing finishes'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                notificationsEnabled && notifPermission === 'granted'
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/80'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {notificationsEnabled && notifPermission === 'granted' ? (
                <>
                  <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Browser Alerts: On</span>
                </>
              ) : notifPermission === 'denied' ? (
                <>
                  <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Alerts Blocked</span>
                </>
              ) : notifPermission === 'unsupported' ? (
                <>
                  <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Alerts Unavailable</span>
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Enable Browser Alerts</span>
                </>
              )}
            </button>
          </div>

          <div className="rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40 p-6 text-center space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
              Drag multiple files here or select from disk
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Files</span>
              </button>
              {isProcessing ? (
                <button
                  type="button"
                  onClick={handleCancelBatch}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-950/80 border border-red-200 dark:border-red-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Stop Batch</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={summary.queuedCount + summary.errorCount === 0}
                  onClick={handleRunQueue}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <span>
                    Run Sequential Hash ({summary.queuedCount + summary.errorCount})
                  </span>
                </button>
              )}
            </div>

            {isProcessing && batchProgress && (
              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 text-left space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span className="truncate">
                    File {batchProgress.currentIndex} / {batchProgress.totalCount}: {batchProgress.currentFileName}
                  </span>
                  <span className="shrink-0">{batchProgress.currentPercentage}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-700 dark:bg-blue-500 transition-transform duration-150 origin-left"
                    style={{ transform: `scaleX(${Math.max(0.03, batchProgress.currentPercentage / 100)})` }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Checksum Manifest Input */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Checksum Manifest (Optional)
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                Paste SHA256SUMS, SHA1SUMS, or MD5SUMS lines to auto-match files by name.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {parsedManifest.size} {parsedManifest.size === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <textarea
            rows={5}
            value={manifestText}
            onChange={(e) => handleApplyManifestToExisting(e.target.value)}
            placeholder={`fe2ed2077eb58c0d8bbad20864fcb0ce04f96e1d56cdf20bfe0cba4c345a90ed  release-package-v1.0.bin\n9a3d12e0e4db940488d3f93c5a7b5010  archive.tar.gz`}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-blue-700 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
          />
        </section>
      </div>

      {completionNotice && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-5 py-3.5 flex items-center justify-between gap-4 ${
            completionNotice.variant === 'alert'
              ? 'border-red-200 dark:border-red-800/80 bg-red-50/70 dark:bg-red-950/40 text-red-900 dark:text-red-100'
              : completionNotice.variant === 'success'
              ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100'
              : 'border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <Bell className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
            <div className="text-xs sm:text-sm min-w-0">
              <span className="font-semibold">{completionNotice.title}:</span>{' '}
              <span>{completionNotice.body}</span>
              {completionNotice.browserDelivered && (
                <span className="ml-2 text-[11px] opacity-75">
                  (Desktop notification sent)
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCompletionNotice(null)}
            aria-label="Dismiss batch completion notice"
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* End-of-Batch Summary Report */}
      {showSummaryReport && (
        <section
          aria-labelledby="batch-summary-heading"
          className={`rounded-xl border overflow-hidden ${
            summary.tamperedCount > 0 || summary.errorCount > 0
              ? 'border-red-200 dark:border-red-800/80 bg-red-50/50 dark:bg-red-950/25'
              : summary.verifiedCount > 0
              ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/25'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 shrink-0">
                {summary.tamperedCount > 0 || summary.errorCount > 0 ? (
                  <AlertTriangle className="w-6 h-6 text-red-700 dark:text-red-400" aria-hidden="true" />
                ) : summary.verifiedCount > 0 ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                ) : (
                  <Info className="w-6 h-6 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                )}
              </div>
              <div>
                <h3
                  id="batch-summary-heading"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Batch Summary Report
                </h3>
                <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                  {summary.tamperedCount > 0 || summary.errorCount > 0
                    ? `Completed ${summary.completedCount} file(s): ${summary.tamperedCount} mismatch(es) and ${summary.errorCount} error(s) detected.`
                    : summary.verifiedCount > 0
                    ? `All ${summary.verifiedCount} verified file(s) matched their expected checksums with zero discrepancies.`
                    : `Sequentially hashed ${summary.completedCount} file(s). Provide a checksum manifest to verify matches.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedSummary ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    <span>Copied Summary</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy Summary</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleExportSummaryTxt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Summary TXT</span>
              </button>
              <button
                type="button"
                onClick={handleExportSummaryJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Summary JSON</span>
              </button>
            </div>
          </div>

          {/* 4-column Summary Metrics Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800 bg-white/75 dark:bg-slate-900/80">
            <div className="p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Files Processed
              </div>
              <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {summary.completedCount} / {summary.totalItems}
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {formatBytes(summary.totalBytesHashed)} total
              </div>
            </div>

            <div className="p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Verified Matches
              </div>
              <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {summary.verifiedCount}
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.unverifiedCount} computed only
              </div>
            </div>

            <div className="p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Mismatches &amp; Errors
              </div>
              <div
                className={`mt-1 text-lg font-semibold font-mono tabular-nums ${
                  summary.tamperedCount + summary.errorCount > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {summary.tamperedCount + summary.errorCount}
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.tamperedCount} tampered · {summary.errorCount} error
              </div>
            </div>

            <div className="p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Batch Duration
              </div>
              <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatDuration(summary.totalDurationMs)}
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.throughputMBps > 0 ? `${summary.throughputMBps.toFixed(1)} MB/s avg` : '64 KiB chunks'}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Queue Data Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Queued Files
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {queue.length} total · {summary.completedCount} hashed
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={summary.completedCount === 0}
              onClick={handleExportSha256Sums}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export SHA256SUMS</span>
            </button>
            <button
              type="button"
              disabled={queue.length === 0 || isProcessing}
              onClick={() => {
                onUpdateQueue([]);
                setBatchFinishedAt(null);
                setExpandedIds({});
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Queue</span>
            </button>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No files in the batch queue yet. Add two or more files above to compute and verify them sequentially.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <th className="py-2.5 px-4">File</th>
                  <th className="py-2.5 px-4 text-right">Size</th>
                  <th className="py-2.5 px-4">SHA-256 Digest</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Time</th>
                  <th className="py-2.5 px-4 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {queue.map((item) => {
                  const isExpanded = Boolean(expandedIds[item.id]);
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-[220px]">
                          <button
                            type="button"
                            disabled={!item.computed}
                            onClick={() => toggleExpand(item.id)}
                            className="inline-flex items-center gap-1.5 max-w-full text-left disabled:cursor-default cursor-pointer"
                          >
                            {item.computed && (
                              isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                              )
                            )}
                            <span className="truncate">{item.metadata.name}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatBytes(item.metadata.size)}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300 max-w-[280px] truncate">
                          {item.computed ? item.computed['SHA-256'] : '—'}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {item.status === 'verified' && (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Match</span>
                            </span>
                          )}
                          {item.status === 'tampered' && (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Mismatch</span>
                            </span>
                          )}
                          {item.status === 'unverified' && (
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                              Computed
                            </span>
                          )}
                          {item.status === 'computing' && (
                            <span className="font-mono tabular-nums text-blue-700 dark:text-blue-400 font-medium">
                              Hashing {item.progress}%
                            </span>
                          )}
                          {item.status === 'queued' && (
                            <span className="text-slate-500 dark:text-slate-400">Queued</span>
                          )}
                          {item.status === 'error' && (
                            <span className="text-red-700 dark:text-red-400 font-medium">
                              {item.error || 'Error'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {item.durationMs !== undefined ? formatDuration(item.durationMs) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleRemoveItem(item.id)}
                            aria-label={`Remove ${item.metadata.name} from queue`}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 rounded cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>

                      {isExpanded && item.computed && (
                        <tr className="bg-slate-50/70 dark:bg-slate-950/60">
                          <td colSpan={6} className="px-5 py-3">
                            <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px] tabular-nums">
                              {HASH_ALGORITHMS.map((alg) => {
                                const expVal = item.expected?.[alg];
                                const status = expVal
                                  ? compareDigest(item.computed![alg], expVal)
                                  : 'unverified';
                                return (
                                  <div
                                    key={alg}
                                    className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"
                                  >
                                    <span className="w-16 shrink-0 font-sans font-semibold text-slate-600 dark:text-slate-300">
                                      {alg}
                                    </span>
                                    <span className="text-slate-800 dark:text-slate-200 break-all select-all flex-1">
                                      {item.computed![alg]}
                                    </span>
                                    {status !== 'unverified' && (
                                      <span
                                        className={`font-sans font-semibold shrink-0 ${
                                          status === 'match'
                                            ? 'text-emerald-700 dark:text-emerald-400'
                                            : 'text-red-700 dark:text-red-400'
                                        }`}
                                      >
                                        {status === 'match' ? 'Match' : 'Mismatch'}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
