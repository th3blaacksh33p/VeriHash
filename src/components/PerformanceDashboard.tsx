import React, { useMemo, useState } from 'react';
import { Gauge, Play } from 'lucide-react';
import type { BatchQueueItem, HashAlgorithm, VerificationRecord } from '../types/integrity';
import { HASH_ALGORITHMS, computeFileHashes, formatBytes, formatDuration } from '../utils/hashing';

interface PerformanceDashboardProps {
  history: VerificationRecord[];
  batchQueue: BatchQueueItem[];
  onRecordBenchmark: (record: VerificationRecord) => void;
}

interface TimedRun {
  id: string;
  name: string;
  size: number;
  timestamp: number;
  totalDurationMs: number;
  algorithmDurationsMs: Record<HashAlgorithm, number>;
  source: 'Verifier' | 'Batch';
}

function calcMBps(bytes: number, durationMs: number): number {
  if (bytes <= 0 || durationMs <= 0) return 0;
  return bytes / (1024 * 1024) / (durationMs / 1000);
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  history,
  batchQueue,
  onRecordBenchmark,
}) => {
  const [isBenchmarking, setIsBenchmarking] = useState(false);

  const timedRuns = useMemo<TimedRun[]>(() => {
    const runs: TimedRun[] = [];

    for (const rec of history) {
      if (rec.algorithmDurationsMs && rec.file.size > 0) {
        runs.push({
          id: rec.id,
          name: rec.file.name,
          size: rec.file.size,
          timestamp: rec.timestamp,
          totalDurationMs: rec.durationMs,
          algorithmDurationsMs: rec.algorithmDurationsMs,
          source: 'Verifier',
        });
      }
    }

    for (const item of batchQueue) {
      if (item.computed && item.algorithmDurationsMs && item.durationMs && item.metadata.size > 0) {
        runs.push({
          id: item.id,
          name: item.metadata.name,
          size: item.metadata.size,
          timestamp: item.metadata.lastModified || Date.now(),
          totalDurationMs: item.durationMs,
          algorithmDurationsMs: item.algorithmDurationsMs,
          source: 'Batch',
        });
      }
    }

    return runs;
  }, [history, batchQueue]);

  const stats = useMemo(() => {
    if (timedRuns.length === 0) return null;

    const totalBytes = timedRuns.reduce((sum, r) => sum + r.size, 0);
    const byAlg = HASH_ALGORITHMS.map((alg) => {
      const totalAlgMs = timedRuns.reduce((sum, r) => sum + r.algorithmDurationsMs[alg], 0);
      const avgMBps = calcMBps(totalBytes, totalAlgMs);
      const perRunSpeeds = timedRuns.map((r) => calcMBps(r.size, r.algorithmDurationsMs[alg]));
      const peakMBps = Math.max(...perRunSpeeds);
      const minMBps = Math.min(...perRunSpeeds);

      return {
        algorithm: alg,
        totalAlgMs,
        avgMBps,
        peakMBps,
        minMBps,
      };
    });

    const maxAvgMBps = Math.max(...byAlg.map((a) => a.avgMBps), 0.01);
    const fastest = byAlg.reduce((best, curr) => (curr.avgMBps > best.avgMBps ? curr : best), byAlg[0]);
    const md5Stat = byAlg.find((a) => a.algorithm === 'MD5')!;
    const sha256Stat = byAlg.find((a) => a.algorithm === 'SHA-256')!;
    const sha256Relative =
      md5Stat.avgMBps > 0 && sha256Stat.avgMBps > 0
        ? md5Stat.avgMBps / sha256Stat.avgMBps
        : 1;

    return {
      totalBytes,
      byAlg,
      maxAvgMBps,
      fastest,
      sha256Relative,
    };
  }, [timedRuns]);

  const handleRunBenchmark = async () => {
    if (isBenchmarking) return;
    setIsBenchmarking(true);
    try {
      const sizeBytes = 4 * 1024 * 1024; // 4 MiB deterministic payload
      const buffer = new Uint8Array(sizeBytes);
      for (let i = 0; i < sizeBytes; i += 4096) {
        buffer[i] = (i >> 8) & 0xff;
        buffer[i + 1] = i & 0xff;
      }
      const benchFile = new File([buffer], 'benchmark-payload-4mb.bin', {
        type: 'application/octet-stream',
        lastModified: Date.now(),
      });
      const { hashes, durationMs, algorithmDurationsMs } = await computeFileHashes(benchFile);
      onRecordBenchmark({
        id: `bench-${Date.now()}`,
        file: {
          name: benchFile.name,
          size: benchFile.size,
          type: benchFile.type,
          lastModified: benchFile.lastModified,
        },
        computed: hashes,
        expected: { ...hashes },
        verdict: 'verified',
        durationMs,
        algorithmDurationsMs,
        timestamp: Date.now(),
      });
    } finally {
      setIsBenchmarking(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Algorithm Hashing Performance
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
            Empirical throughput (MB/s) measured per algorithm across previous successful computations on your device.
          </p>
        </div>

        <button
          type="button"
          disabled={isBenchmarking}
          onClick={handleRunBenchmark}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isBenchmarking ? 'Running 4 MB Benchmark...' : 'Run 4 MB Benchmark'}</span>
        </button>
      </section>

      {!stats ? (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400">
            <Gauge className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No Performance Telemetry Yet
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            Hash any file in the Verifier or Batch Queue, or click <span className="font-medium">Run 4 MB Benchmark</span> above to measure real MD5, SHA-1, and SHA-256 throughput.
          </p>
        </section>
      ) : (
        <>
          {/* 4-Column KPI Summary Row */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
            <div className="p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Measured Runs
              </div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {timedRuns.length}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Successful computations
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Data Hashed
              </div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatBytes(stats.totalBytes)}
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                64 KiB streaming chunks
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Fastest Algorithm
              </div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {stats.fastest.algorithm}
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {stats.fastest.avgMBps.toFixed(1)} MB/s average
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                SHA-256 vs MD5 Ratio
              </div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {stats.sha256Relative >= 1
                  ? `${stats.sha256Relative.toFixed(2)}x`
                  : `${(1 / stats.sha256Relative).toFixed(2)}x`}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {stats.sha256Relative >= 1
                  ? 'MD5 faster per byte'
                  : 'SHA-256 faster per byte'}
              </div>
            </div>
          </section>

          {/* Average Throughput Bar Chart */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Average Hashing Speed by Algorithm
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                Weighted average throughput (total bytes processed divided by cumulative compute time per algorithm).
              </p>
            </div>

            <div className="space-y-4">
              {stats.byAlg.map((row) => {
                const widthPct = Math.max(4, (row.avgMBps / stats.maxAvgMBps) * 100);
                const overheadFactor =
                  row.avgMBps > 0 ? stats.fastest.avgMBps / row.avgMBps : 1;

                return (
                  <div key={row.algorithm} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {row.algorithm}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {row.algorithm === stats.fastest.algorithm
                            ? 'Fastest baseline'
                            : `${overheadFactor.toFixed(2)}x compute time vs ${stats.fastest.algorithm}`}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {row.avgMBps.toFixed(1)} MB/s
                      </span>
                    </div>

                    <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          row.algorithm === 'MD5'
                            ? 'bg-emerald-600 dark:bg-emerald-500'
                            : row.algorithm === 'SHA-1'
                            ? 'bg-blue-700 dark:bg-blue-500'
                            : 'bg-indigo-600 dark:bg-indigo-500'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Algorithm Comparison Table */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Per-Algorithm Speed &amp; Overhead Metrics
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <th className="py-2.5 px-4">Algorithm</th>
                    <th className="py-2.5 px-4 text-right">Avg Speed</th>
                    <th className="py-2.5 px-4 text-right">Peak Speed</th>
                    <th className="py-2.5 px-4 text-right">Min Speed</th>
                    <th className="py-2.5 px-4 text-right">Total CPU Time</th>
                    <th className="py-2.5 px-4 text-right">Relative Speed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs font-mono tabular-nums">
                  {stats.byAlg.map((row) => {
                    const relPct = (row.avgMBps / stats.fastest.avgMBps) * 100;
                    return (
                      <tr key={row.algorithm} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                          {row.algorithm}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                          {row.avgMBps.toFixed(1)} MB/s
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-300">
                          {row.peakMBps.toFixed(1)} MB/s
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-300">
                          {row.minMBps.toFixed(1)} MB/s
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-300">
                          {formatDuration(row.totalAlgMs)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300">
                          {relPct.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent Timed Runs */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recent Timed Computations
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <th className="py-2.5 px-4">File</th>
                    <th className="py-2.5 px-4 text-right">Size</th>
                    <th className="py-2.5 px-4 text-right">MD5</th>
                    <th className="py-2.5 px-4 text-right">SHA-1</th>
                    <th className="py-2.5 px-4 text-right">SHA-256</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs font-mono tabular-nums">
                  {timedRuns.slice(0, 10).map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
                        {run.name}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatBytes(run.size)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {calcMBps(run.size, run.algorithmDurationsMs.MD5).toFixed(1)} MB/s
                      </td>
                      <td className="py-2.5 px-4 text-right text-blue-700 dark:text-blue-400 whitespace-nowrap">
                        {calcMBps(run.size, run.algorithmDurationsMs['SHA-1']).toFixed(1)} MB/s
                      </td>
                      <td className="py-2.5 px-4 text-right text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
                        {calcMBps(run.size, run.algorithmDurationsMs['SHA-256']).toFixed(1)} MB/s
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDuration(run.totalDurationMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
