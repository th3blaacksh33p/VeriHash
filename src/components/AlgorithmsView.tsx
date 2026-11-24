import React from 'react';

const ALGORITHM_SPECS = [
  {
    name: 'MD5',
    bits: '128-bit',
    hexLength: '32 chars',
    collisionResistance: 'Broken (Legacy)',
    recommendation:
      'Suitable only for detecting accidental download corruption or matching legacy checksums. Do not rely on MD5 alone against deliberate tampering.',
  },
  {
    name: 'SHA-1',
    bits: '160-bit',
    hexLength: '40 chars',
    collisionResistance: 'Deprecated',
    recommendation:
      'Historically used in Git and older release manifests. Vulnerable to chosen-prefix collision attacks; verify alongside SHA-256 whenever possible.',
  },
  {
    name: 'SHA-256',
    bits: '256-bit',
    hexLength: '64 chars',
    collisionResistance: 'Strong (Recommended)',
    recommendation:
      'Industry standard for software distribution, package managers, and cryptographic integrity verification. Resistant to practical collision and preimage attacks.',
  },
];

const EDUCATIONAL_SUMMARIES = [
  {
    name: 'MD5',
    subtitle: '1992 · 128-bit · Legacy integrity check',
    summary:
      'MD5 (Message-Digest Algorithm 5) compresses any file into a compact 32-character fingerprint. It is very fast and widely used on older websites to confirm a download did not get scrambled by a dropped internet connection.',
    caveat:
      'Security note: Researchers discovered how to craft two different files with the exact same MD5 hash, so it can no longer prove a file was not intentionally altered.',
  },
  {
    name: 'SHA-1',
    subtitle: '1995 · 160-bit · Deprecated seal',
    summary:
      'SHA-1 (Secure Hash Algorithm 1) produces a 40-character hexadecimal signature. For two decades it powered software certificates, code signing, and version-control systems like Git.',
    caveat:
      'Security note: Because modern hardware can force SHA-1 collisions, browsers and software vendors have phased it out in favor of SHA-256.',
  },
  {
    name: 'SHA-256',
    subtitle: '2001 · 256-bit · Modern standard',
    summary:
      'SHA-256 belongs to the SHA-2 family and generates a 64-character fingerprint with 2²⁵⁶ possible outcomes—more combinations than atoms in the observable universe. Even a single flipped bit completely scrambles the output.',
    caveat:
      'Best choice: Always prefer SHA-256 when verifying operating system images, security updates, or downloaded installers.',
  },
];

export const AlgorithmsView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Educational Section for Users Unfamiliar with Hashing */}
      <section
        aria-labelledby="learn-algorithms-heading"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
      >
        <div className="space-y-1.5 max-w-3xl">
          <h2 id="learn-algorithms-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Learn About These Algorithms
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            A cryptographic hash works like a unique digital fingerprint for a file. No matter whether a file is a 10-byte note or a 4 GB disk image, a hash function produces a fixed-length string—and changing even one character inside the file causes an{' '}
            <span className="font-medium text-slate-800 dark:text-slate-100">avalanche effect</span> that changes roughly half of the output bits.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
          {EDUCATIONAL_SUMMARIES.map((item) => (
            <article
              key={item.name}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                    {item.subtitle}
                  </p>
                </div>
                <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  {item.summary}
                </p>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 pt-3 border-t border-slate-200/80 dark:border-slate-800 leading-relaxed">
                {item.caveat}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Technical Comparison Matrix */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Technical Specifications
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
            VeriHash streams files in 65,536-byte (64 KiB) chunks and feeds each slice incrementally into MD5, SHA-1, and SHA-256 accumulators simultaneously.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-5">Algorithm</th>
                <th className="py-3 px-5">Digest Width</th>
                <th className="py-3 px-5">Hex Length</th>
                <th className="py-3 px-5">Security Status</th>
                <th className="py-3 px-5">Operational Guidance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {ALGORITHM_SPECS.map((spec) => (
                <tr key={spec.name} className="align-top">
                  <td className="py-4 px-5 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {spec.name}
                  </td>
                  <td className="py-4 px-5 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {spec.bits}
                  </td>
                  <td className="py-4 px-5 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {spec.hexLength}
                  </td>
                  <td className="py-4 px-5 text-xs font-semibold whitespace-nowrap">
                    <span
                      className={
                        spec.name === 'SHA-256'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : spec.name === 'SHA-1'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'
                      }
                    >
                      {spec.collisionResistance}
                    </span>
                  </td>
                  <td className="py-4 px-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-md">
                    {spec.recommendation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Why 64 KiB Chunked Streaming Matters
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
          Reading an entire ISO image or archive into memory at once can exhaust browser tab memory limits. By slicing the file via the HTML5 File API into 65,536-byte chunks—identical to the 64K buffer loop in Python&apos;s{' '}
          <span className="font-mono text-xs text-slate-800 dark:text-slate-200">hashlib</span>—VeriHash maintains constant memory overhead regardless of file size while reporting real-time throughput.
        </p>
      </section>
    </div>
  );
};
