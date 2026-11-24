import React from 'react';
import type { HashAlgorithm, HashSet } from '../types/integrity';
import { HASH_ALGORITHMS, normalizeHex } from '../utils/hashing';

interface HashSimilarityChartProps {
  computed: HashSet;
  expected: HashSet;
}

interface SimilarityMetrics {
  algorithm: HashAlgorithm;
  totalChars: number;
  matchedChars: number;
  similarityPct: number;
  hasExpected: boolean;
  positions: { index: number; compChar: string; expChar: string; match: boolean }[];
}

function computeSimilarity(
  algorithm: HashAlgorithm,
  computedHex: string,
  expectedHex: string
): SimilarityMetrics {
  const normComp = normalizeHex(computedHex);
  const normExp = normalizeHex(expectedHex);
  const totalChars = normComp.length;

  if (!normExp) {
    return {
      algorithm,
      totalChars,
      matchedChars: 0,
      similarityPct: 0,
      hasExpected: false,
      positions: [],
    };
  }

  let matchedChars = 0;
  const positions = normComp.split('').map((compChar, index) => {
    const expChar = normExp[index] ?? '';
    const match = compChar === expChar && normExp.length === normComp.length;
    if (match) matchedChars += 1;
    return { index, compChar, expChar, match };
  });

  // If lengths differ, still highlight positional matches up to min length without awarding 100%
  if (normExp.length !== normComp.length) {
    matchedChars = 0;
    for (let i = 0; i < totalChars; i++) {
      const match = i < normExp.length && normComp[i] === normExp[i];
      positions[i].match = match;
      if (match) matchedChars += 1;
    }
  }

  const denom = Math.max(totalChars, normExp.length);
  const similarityPct = denom > 0 ? (matchedChars / denom) * 100 : 0;

  return {
    algorithm,
    totalChars: denom,
    matchedChars,
    similarityPct,
    hasExpected: true,
    positions,
  };
}

export const HashSimilarityChart: React.FC<HashSimilarityChartProps> = ({
  computed,
  expected,
}) => {
  const metrics = HASH_ALGORITHMS.map((alg) =>
    computeSimilarity(alg, computed[alg], expected[alg])
  );

  const anyChecked = metrics.some((m) => m.hasExpected);

  if (!anyChecked) {
    return null;
  }

  return (
    <section
      aria-labelledby="similarity-chart-heading"
      className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id="similarity-chart-heading" className="text-sm font-semibold text-slate-900">
            Character Similarity Overview
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Proportional character match rate and positional alignment across each digest.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" aria-hidden="true" />
            <span>Matched</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-red-600 inline-block" aria-hidden="true" />
            <span>Mismatch</span>
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {metrics.map((m) => {
          const isFullMatch =
            m.hasExpected &&
            m.matchedChars === m.totalChars &&
            normalizeHex(expected[m.algorithm]).length === normalizeHex(computed[m.algorithm]).length;

          return (
            <div key={m.algorithm} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-800">{m.algorithm}</span>
                {m.hasExpected ? (
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      isFullMatch ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {m.matchedChars} / {m.totalChars} chars · {m.similarityPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-slate-400">Not checked</span>
                )}
              </div>

              {/* Color-coded horizontal similarity bar */}
              <div
                className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden"
                role="img"
                aria-label={
                  m.hasExpected
                    ? `${m.algorithm} character similarity: ${m.similarityPct.toFixed(1)}%`
                    : `${m.algorithm} not checked`
                }
              >
                {m.hasExpected && (
                  <div
                    className={`h-full transition-all duration-300 ${
                      isFullMatch
                        ? 'bg-emerald-600'
                        : m.similarityPct >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-600'
                    }`}
                    style={{ width: `${Math.max(m.similarityPct, 2)}%` }}
                  />
                )}
              </div>

              {/* Positional character-by-character sparkline strip */}
              {m.hasExpected && m.positions.length > 0 && (
                <svg
                  viewBox={`0 0 ${m.positions.length * 4} 10`}
                  preserveAspectRatio="none"
                  className="w-full h-2.5 rounded-xs overflow-hidden block"
                  aria-hidden="true"
                >
                  {m.positions.map((pos) => (
                    <rect
                      key={pos.index}
                      x={pos.index * 4}
                      y={pos.match ? 2 : 0}
                      width={3}
                      height={pos.match ? 6 : 10}
                      rx={0.5}
                      fill={pos.match ? '#16A34A' : '#DC2626'}
                    >
                      <title>
                        {`Char #${pos.index + 1}: computed '${pos.compChar}' vs expected '${pos.expChar || '∅'}' (${pos.match ? 'Match' : 'Mismatch'})`}
                      </title>
                    </rect>
                  ))}
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
