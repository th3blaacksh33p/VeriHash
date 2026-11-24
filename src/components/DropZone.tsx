import React, { useRef, useState } from 'react';
import { FileCheck2, FileUp, FlaskConical, ShieldAlert, X } from 'lucide-react';
import type { FileMetadata, HashProgress } from '../types/integrity';
import { formatBytes, formatDuration } from '../utils/hashing';

interface DropZoneProps {
  fileMeta: FileMetadata | null;
  isComputing: boolean;
  progress: HashProgress | null;
  durationMs: number | null;
  onFilesSelected: (files: File[]) => void;
  onCancelCompute: () => void;
  onClearFile: () => void;
  onLoadSample: (tampered: boolean) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  fileMeta,
  isComputing,
  progress,
  durationMs,
  onFilesSelected,
  onCancelCompute,
  onClearFile,
  onLoadSample,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onFilesSelected(Array.from(files));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(Array.from(files));
      e.target.value = '';
    }
  };

  return (
    <section
      aria-label="File drop target"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-xl border transition-colors p-6 ${
        isDragging
          ? 'border-blue-700 bg-blue-50/70'
          : 'border-slate-200 bg-white'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleInputChange}
        className="sr-only"
        aria-label="Choose a file to check integrity"
      />

      {!fileMeta && !isComputing ? (
        <div
          className={`rounded-lg border-2 border-dashed p-8 sm:p-10 text-center transition-colors ${
            isDragging ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 bg-slate-50/50'
          }`}
        >
          <div className="mx-auto w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-700 mb-4">
            <FileUp className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Drag and drop a file to verify its integrity
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 max-w-lg mx-auto">
            Hashes are computed locally in 64 KiB streaming chunks. Drop a file—optionally alongside a companion .txt or .sha256 file—to auto-detect expected checksums.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>Browse Local File</span>
            </button>

            <button
              type="button"
              onClick={() => onLoadSample(false)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              <FlaskConical className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span>Test Valid Sample</span>
            </button>

            <button
              type="button"
              onClick={() => onLoadSample(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              <ShieldAlert className="w-4 h-4 text-red-600" aria-hidden="true" />
              <span>Test Tampered Sample</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
                <FileCheck2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 truncate" title={fileMeta?.name}>
                  {fileMeta?.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-mono tabular-nums">
                  <span>{fileMeta ? formatBytes(fileMeta.size) : '—'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{fileMeta ? `${fileMeta.size.toLocaleString()} bytes` : '—'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[200px]">{fileMeta?.type || 'application/octet-stream'}</span>
                  {durationMs !== null && !isComputing && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Hashed in {formatDuration(durationMs)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isComputing ? (
                <button
                  type="button"
                  onClick={onCancelCompute}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Cancel</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Replace File</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClearFile}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    aria-label="Clear selected file"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Clear</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {isComputing && progress && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
                <span>
                  Reading 64 KiB chunks ({progress.chunksProcessed.toLocaleString()} / {progress.totalChunks.toLocaleString()})
                </span>
                <span>
                  {progress.percentage}% · {progress.throughputMBps.toFixed(1)} MB/s
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${Math.max(0.02, progress.percentage / 100)})` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
