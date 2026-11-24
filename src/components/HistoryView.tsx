import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Search, Trash2, XCircle } from 'lucide-react';
import type { VerificationRecord } from '../types/integrity';
import { formatBytes, formatDuration } from '../utils/hashing';

interface HistoryViewProps {
  records: VerificationRecord[];
  onClearHistory: () => void;
  onLoadRecord: (record: VerificationRecord) => void;
}

type FilterOption = 'all' | 'verified' | 'tampered' | 'unverified';

export const HistoryView: React.FC<HistoryViewProps> = ({
  records,
  onClearHistory,
  onLoadRecord,
}) => {
  const [filter, setFilter] = useState<FilterOption>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((rec) => {
      if (filter !== 'all' && rec.verdict !== filter) return false;
      if (!q) return true;
      return (
        rec.file.name.toLowerCase().includes(q) ||
        rec.computed['SHA-256'].includes(q) ||
        rec.computed.MD5.includes(q)
      );
    });
  }, [records, filter, query]);

  const handleExportCsv = () => {
    if (records.length === 0) return;
    const header = [
      'Timestamp',
      'FileName',
      'SizeBytes',
      'Verdict',
      'MD5',
      'SHA1',
      'SHA256',
      'DurationMs',
    ].join(',');
    const rows = records.map((r) =>
      [
        new Date(r.timestamp).toISOString(),
        `"${r.file.name.replace(/"/g, '""')}"`,
        r.file.size,
        r.verdict,
        r.computed.MD5,
        r.computed['SHA-1'],
        r.computed['SHA-256'],
        Math.round(r.durationMs),
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verihash-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Verification History</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Session log of local integrity checks stored in your browser. Click any entry to inspect its digests.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter filename or hash..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/70 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-700 focus:outline-none w-52"
            />
          </div>

          {/* Interactive segmented filter control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'verified', label: 'Match' },
                { id: 'tampered', label: 'Mismatch' },
                { id: 'unverified', label: 'Computed' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={records.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            disabled={records.length === 0}
            onClick={onClearHistory}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-500">
          {records.length === 0
            ? 'No verification checks recorded yet. Drop a file in the Verifier tab to log your first check.'
            : 'No verification entries match your current filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">File</th>
                <th className="py-2.5 px-4 text-right">Size</th>
                <th className="py-2.5 px-4">SHA-256 Digest</th>
                <th className="py-2.5 px-4">Result</th>
                <th className="py-2.5 px-4 text-right">Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.map((rec) => (
                <tr
                  key={rec.id}
                  onClick={() => onLoadRecord(rec)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 font-medium text-slate-900 max-w-[220px] truncate">
                    {rec.file.name}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {formatBytes(rec.file.size)}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 max-w-[300px] truncate">
                    {rec.computed['SHA-256']}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {rec.verdict === 'verified' && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Match</span>
                      </span>
                    )}
                    {rec.verdict === 'tampered' && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Tampered</span>
                      </span>
                    )}
                    {rec.verdict === 'unverified' && (
                      <span className="text-slate-600 font-medium">Computed</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {new Date(rec.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {formatDuration(rec.durationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
