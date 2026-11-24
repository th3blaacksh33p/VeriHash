import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { AlgorithmStatus, HashAlgorithm } from '../types/integrity';

interface SideBySideBitDiffProps {
  algorithm: HashAlgorithm;
  computed: string;
  expected: string;
  status: AlgorithmStatus;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}

interface ByteDiffRow {
  byteIndex: number;
  offsetHex: string;
  compHex: string;
  expHex: string;
  compBits: string;
  expBits: string;
  xorBits: string;
  hasDiff: boolean;
  diffBitCount: number;
}

function hexByteToBits(hexByte: string): string {
  const val = parseInt(hexByte, 16);
  if (Number.isNaN(val)) return '????????';
  return val.toString(2).padStart(8, '0');
}

export const SideBySideBitDiff: React.FC<SideBySideBitDiffProps> = ({
  algorithm,
  computed,
  expected,
  status,
  copiedKey,
  onCopy,
}) => {
  const [byteFilter, setByteFilter] = useState<'all' | 'mismatched'>('all');

  const isValidExpectedHex =
    expected.length === computed.length && /^[0-9a-f]+$/.test(expected);

  const bitAnalysis = useMemo(() => {
    if (!isValidExpectedHex) {
      return null;
    }

    const byteCount = computed.length / 2;
    const rows: ByteDiffRow[] = [];
    let differingBits = 0;
    let differingBytes = 0;

    for (let i = 0; i < byteCount; i++) {
      const compHex = computed.slice(i * 2, i * 2 + 2);
      const expHex = expected.slice(i * 2, i * 2 + 2);
      const compBits = hexByteToBits(compHex);
      const expBits = hexByteToBits(expHex);

      let xorBits = '';
      let byteDiffBits = 0;
      for (let b = 0; b < 8; b++) {
        const diff = compBits[b] !== expBits[b];
        xorBits += diff ? '1' : '0';
        if (diff) byteDiffBits += 1;
      }

      if (byteDiffBits > 0) {
        differingBits += byteDiffBits;
        differingBytes += 1;
      }

      rows.push({
        byteIndex: i,
        offsetHex: `0x${i.toString(16).padStart(2, '0')}`,
        compHex,
        expHex,
        compBits,
        expBits,
        xorBits,
        hasDiff: byteDiffBits > 0,
        diffBitCount: byteDiffBits,
      });
    }

    const totalBits = byteCount * 8;
    const diffPercent = totalBits > 0 ? ((differingBits / totalBits) * 100).toFixed(1) : '0.0';

    return {
      rows,
      totalBits,
      totalBytes: byteCount,
      differingBits,
      differingBytes,
      diffPercent,
    };
  }, [computed, expected, isValidExpectedHex]);

  const visibleRows = useMemo(() => {
    if (!bitAnalysis) return [];
    if (byteFilter === 'mismatched') {
      return bitAnalysis.rows.filter((r) => r.hasDiff);
    }
    return bitAnalysis.rows;
  }, [bitAnalysis, byteFilter]);

  return (
    <div className="space-y-4">
      {/* Side-by-Side Hex Comparison Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Computed */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">Computed</span>
            <button
              type="button"
              onClick={() => onCopy(`${algorithm}-computed`, computed)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              aria-label={`Copy computed ${algorithm} hash to clipboard`}
            >
              {copiedKey === `${algorithm}-computed` ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
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

          <div className="font-mono text-xs leading-relaxed break-all select-all bg-white border border-slate-200/80 rounded-md px-3 py-2">
            {status === 'mismatch' && expected
              ? computed.split('').map((char, idx) => {
                  const differs = expected[idx] !== char;
                  return (
                    <span
                      key={idx}
                      className={
                        differs
                          ? 'bg-red-100 text-red-900 font-semibold rounded-[2px]'
                          : 'text-slate-700'
                      }
                    >
                      {char}
                    </span>
                  );
                })
              : <span className="text-slate-900">{computed}</span>}
          </div>
        </div>

        {/* Right: Expected */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">Expected</span>
            {expected ? (
              <button
                type="button"
                onClick={() => onCopy(`${algorithm}-expected`, expected)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                aria-label={`Copy expected ${algorithm} hash to clipboard`}
              >
                {copiedKey === `${algorithm}-expected` ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy to Clipboard</span>
                  </>
                )}
              </button>
            ) : (
              <span className="text-xs text-slate-400">Not provided</span>
            )}
          </div>

          <div className="font-mono text-xs leading-relaxed break-all select-all bg-white border border-slate-200/80 rounded-md px-3 py-2">
            {!expected ? (
              <span className="font-sans text-slate-400">
                No expected {algorithm} hash provided
              </span>
            ) : status === 'mismatch' ? (
              expected.split('').map((char, idx) => {
                const differs = computed[idx] !== char;
                return (
                  <span
                    key={idx}
                    className={
                      differs
                        ? 'bg-emerald-100 text-emerald-900 font-semibold rounded-[2px]'
                        : 'text-slate-700'
                    }
                  >
                    {char}
                  </span>
                );
              })
            ) : (
              <span className="text-slate-900">{expected}</span>
            )}
          </div>
        </div>
      </div>

      {/* Bit-Level Diff Matrix when a mismatch occurs */}
      {status === 'mismatch' && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          {bitAnalysis ? (
            <>
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700 font-mono tabular-nums">
                  <span className="font-sans font-semibold text-slate-900">Bit-Level Diff</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {bitAnalysis.differingBits} / {bitAnalysis.totalBits} bits differ ({bitAnalysis.diffPercent}%)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {bitAnalysis.differingBytes} / {bitAnalysis.totalBytes} bytes affected
                  </span>
                </div>

                <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md">
                  <button
                    type="button"
                    onClick={() => setByteFilter('all')}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      byteFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Bytes ({bitAnalysis.totalBytes})
                  </button>
                  <button
                    type="button"
                    onClick={() => setByteFilter('mismatched')}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      byteFilter === 'mismatched'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Differing ({bitAnalysis.differingBytes})
                  </button>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-sans font-semibold text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Byte</th>
                      <th className="py-2 px-3">Computed Bits</th>
                      <th className="py-2 px-3">Expected Bits</th>
                      <th className="py-2 px-3">XOR Mask</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row) => (
                      <tr
                        key={row.byteIndex}
                        className={row.hasDiff ? 'bg-red-50/25' : 'bg-white'}
                      >
                        <td className="py-1.5 px-3 text-slate-500 whitespace-nowrap">
                          {row.offsetHex}
                        </td>

                        {/* Computed Hex + 8 Bits */}
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          <span className="inline-block w-6 text-slate-500 mr-1.5">
                            {row.compHex}
                          </span>
                          <span className="inline-flex items-center gap-[1px]">
                            {row.compBits.split('').map((bit, bIdx) => {
                              const differs = bit !== row.expBits[bIdx];
                              return (
                                <span
                                  key={bIdx}
                                  className={`inline-block w-[13px] text-center rounded-[2px] ${
                                    bIdx === 4 ? 'ml-1' : ''
                                  } ${
                                    differs
                                      ? 'bg-red-600 text-white font-semibold'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {bit}
                                </span>
                              );
                            })}
                          </span>
                        </td>

                        {/* Expected Hex + 8 Bits */}
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          <span className="inline-block w-6 text-slate-500 mr-1.5">
                            {row.expHex}
                          </span>
                          <span className="inline-flex items-center gap-[1px]">
                            {row.expBits.split('').map((bit, bIdx) => {
                              const differs = bit !== row.compBits[bIdx];
                              return (
                                <span
                                  key={bIdx}
                                  className={`inline-block w-[13px] text-center rounded-[2px] ${
                                    bIdx === 4 ? 'ml-1' : ''
                                  } ${
                                    differs
                                      ? 'bg-emerald-700 text-white font-semibold'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {bit}
                                </span>
                              );
                            })}
                          </span>
                        </td>

                        {/* XOR Difference Mask */}
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-[1px]">
                            {row.xorBits.split('').map((bit, bIdx) => (
                              <span
                                key={bIdx}
                                className={`inline-block w-[13px] text-center rounded-[2px] ${
                                  bIdx === 4 ? 'ml-1' : ''
                                } ${
                                  bit === '1'
                                    ? 'bg-amber-200 text-amber-950 font-semibold'
                                    : 'text-slate-400'
                                }`}
                              >
                                {bit}
                              </span>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="px-4 py-3 text-xs text-slate-600 bg-slate-50">
              Bit-level diff alignment requires a valid {computed.length}-character hexadecimal expected digest (currently {expected.length} characters).
            </div>
          )}
        </div>
      )}
    </div>
  );
};
