import React from 'react';
import { Upload } from 'lucide-react';
import type { ActiveTab } from '../types/integrity';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onPickFile: () => void;
  historyCount: number;
  batchCount: number;
}

const NAV_ITEMS: { id: ActiveTab; label: string }[] = [
  { id: 'verifier', label: 'Verifier' },
  { id: 'batch', label: 'Batch Queue' },
  { id: 'performance', label: 'Performance' },
  { id: 'history', label: 'History' },
  { id: 'algorithms', label: 'Algorithms' },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onPickFile,
  historyCount,
  batchCount,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#verifier"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('verifier');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:focus-visible:ring-blue-500 rounded-sm"
        >
          VeriHash
        </a>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const suffix =
              item.id === 'history' && historyCount > 0
                ? ` (${historyCount})`
                : item.id === 'batch' && batchCount > 0
                ? ` (${batchCount})`
                : '';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:focus-visible:ring-blue-500 rounded-sm ${
                  isActive
                    ? 'text-slate-900 dark:text-slate-100 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
                {suffix && (
                  <span className="ml-1 font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                    {suffix.trim()}
                  </span>
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-blue-700 dark:bg-blue-500"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPickFile}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 active:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>Select File</span>
          </button>
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center gap-5 px-4 py-2 border-t border-slate-100 dark:border-slate-800 overflow-x-auto text-sm font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'text-blue-700 dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
