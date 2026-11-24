import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: 'Ctrl + O', description: 'Select a local file to verify' },
  { keys: 'Ctrl + H', description: 'Open Verification History' },
  { keys: 'Ctrl + B', description: 'Open Multi-File Batch Queue' },
  { keys: 'Ctrl + I  /  ?', description: 'Toggle Instructions & Keyboard Shortcuts' },
  { keys: 'Ctrl + 1..5', description: 'Switch between Verifier, Batch, Performance, History, Algorithms' },
  { keys: 'Ctrl + Shift + D', description: 'Toggle Light / Dark theme' },
  { keys: 'Esc', description: 'Close this dialog or open menus' },
];

export const InstructionsModal: React.FC<InstructionsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="instructions-modal-title"
        className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
            <h2
              id="instructions-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Instructions &amp; Keyboard Shortcuts
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close instructions"
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              How Verification Works
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
              <li>
                Drop any file onto the drop zone (or press <span className="font-mono text-xs text-slate-800 dark:text-slate-200">Ctrl+O</span>) to compute MD5, SHA-1, and SHA-256 digests locally in 64 KiB chunks.
              </li>
              <li>
                Enter expected checksums manually, paste `sha256sum` output via <span className="font-medium text-slate-800 dark:text-slate-200">Smart Paste</span>, or drop a companion <span className="font-mono text-xs text-slate-800 dark:text-slate-200">.txt</span> / <span className="font-mono text-xs text-slate-800 dark:text-slate-200">.sha256</span> file alongside your artifact.
              </li>
              <li>
                Review the verdict banner, character similarity chart, or switch to <span className="font-medium text-slate-800 dark:text-slate-200">Side-by-Side Diff</span> to inspect exact differing bits.
              </li>
              <li>
                Use <span className="font-medium text-slate-800 dark:text-slate-200">Export Report</span> to save results as PDF, JSON, or Plain Text, or switch to <span className="font-medium text-slate-800 dark:text-slate-200">Batch Queue</span> for sequential multi-file verification.
              </li>
            </ol>
          </section>

          <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Global Keyboard Shortcuts
            </h3>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {SHORTCUTS.map((sc) => (
                <div
                  key={sc.keys}
                  className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs sm:text-sm"
                >
                  <span className="text-slate-700 dark:text-slate-300">{sc.description}</span>
                  <kbd className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0">
                    {sc.keys}
                  </kbd>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              On macOS, <span className="font-mono">Cmd (⌘)</span> also works in place of <span className="font-mono">Ctrl</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
