import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileUp,
  Play,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { BatchQueueItem, HashSet } from '../types/integrity';
import {
  compareDigest,
  computeFileHashes,
  extractMetadata,
  formatBytes,
  formatDuration,
  parseChecksumManifest,
} from '../utils/hashing';

interface BatchQueueViewProps {
  queue: BatchQueueItem[];
  onUpdateQueue: React.Dispatch<React.SetStateAction<BatchQueueItem[]>>;
}

export const BatchQueueView: React.FC<BatchQueueViewProps> = ({ queue, onUpdateQueue }) => {
  const [manifestText, setManifestText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedManifest = parseChecksumManifest(manifestText);

  const enqueueFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newItems: BatchQueueItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      metadata: extractMetadata(file),
      status: 'queued',
      progress: 0,
      expected: parsedManifest.get(file.name),
    }));

    onUpdateQueue((prev) => [...prev, ...newItems]);
  };

  const handleApplyManifestToExisting = (nextManifestText: string) => {
    setManifestText(nextManifestText);
    const map = parseChecksumManifest(nextManifestText);
    onUpdateQueue((prev) =>
      prev.map((item) => {
        const expected = map.get(item.metadata.name);
        if (!item.computed) {
          return { ...item, expected };
        }
        const verdict = evaluateBatchItem(item.computed, expected);
        return { ...item, expected, status: verdict };
      })
    );
  };

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

  const handleRunQueue = async () => {
    if (isProcessing) return;
    const pending = queue.filter((item) => item.status === 'queued' || item.status === 'error');
    if (pending.length === 0) return;

    setIsProcessing(true);
    const latestManifest = parseChecksumManifest(manifestText);

    for (const item of pending) {
      onUpdateQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'computing', progress: 0 } : q))
      );

      try {
        const { hashes, durationMs } = await computeFileHashes(item.file, (prog) => {
          onUpdateQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, progress: prog.percentage } : q))
          );
        });
        const expected = latestManifest.get(item.metadata.name) ?? item.expected;
        const verdict = evaluateBatchItem(hashes, expected);

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
                }
              : q
          )
        );
      } catch (err) {
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

    setIsProcessing(false);
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

  const queuedCount = queue.filter((q) => q.status === 'queued').length;
  const completedCount = queue.filter((q) => q.computed).length;

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
          className={`lg:col-span-6 rounded-xl border p-6 bg-white space-y-4 ${
            isDragging ? 'border-blue-700 bg-blue-50/50' : 'border-slate-200'
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
          <div>
            <h2 className="text-base font-semibold text-slate-900">Multi-File Batch Queue</h2>
            <p className="mt-1 text-sm text-slate-600">
              Drop multiple files to compute MD5, SHA-1, and SHA-256 digests in sequence or verify against a checksum manifest.
            </p>
          </div>

          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center space-y-3">
            <p className="text-sm text-slate-700 font-medium">
              Drag multiple files here or select from disk
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Files</span>
              </button>
              <button
                type="button"
                disabled={queuedCount === 0 || isProcessing}
                onClick={handleRunQueue}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                <span>{isProcessing ? 'Verifying...' : `Verify Queue (${queuedCount})`}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Checksum Manifest Input */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Checksum Manifest (Optional)
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Paste SHA256SUMS, SHA1SUMS, or MD5SUMS lines to auto-match files by name.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {parsedManifest.size} {parsedManifest.size === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <textarea
            rows={5}
            value={manifestText}
            onChange={(e) => handleApplyManifestToExisting(e.target.value)}
            placeholder={`fe2ed2077eb58c0d8bbad20864fcb0ce04f96e1d56cdf20bfe0cba4c345a90ed  release-package-v1.0.bin\n9a3d12e0e4db940488d3f93c5a7b5010  archive.tar.gz`}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
          />
        </section>
      </div>

      {/* Queue Data Table */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Queued Files</h3>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {queue.length} total · {completedCount} hashed
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={completedCount === 0}
              onClick={handleExportSha256Sums}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export SHA256SUMS</span>
            </button>
            <button
              type="button"
              disabled={queue.length === 0 || isProcessing}
              onClick={() => onUpdateQueue([])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Queue</span>
            </button>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No files in the batch queue yet. Add two or more files above to compute and verify them together.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">File</th>
                  <th className="py-2.5 px-4 text-right">Size</th>
                  <th className="py-2.5 px-4">SHA-256 Digest</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-slate-900 max-w-[220px] truncate">
                      {item.metadata.name}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatBytes(item.metadata.size)}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 max-w-[300px] truncate">
                      {item.computed ? item.computed['SHA-256'] : '—'}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {item.status === 'verified' && (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Match</span>
                        </span>
                      )}
                      {item.status === 'tampered' && (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Mismatch</span>
                        </span>
                      )}
                      {item.status === 'unverified' && (
                        <span className="text-slate-600 font-medium">Computed</span>
                      )}
                      {item.status === 'computing' && (
                        <span className="font-mono tabular-nums text-blue-700 font-medium">
                          Hashing {item.progress}%
                        </span>
                      )}
                      {item.status === 'queued' && (
                        <span className="text-slate-500">Queued</span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-red-700 font-medium">{item.error || 'Error'}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {item.durationMs !== undefined ? formatDuration(item.durationMs) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
