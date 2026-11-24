import SparkMD5 from 'spark-md5';
import { sha1 } from 'js-sha1';
import { sha256 } from 'js-sha256';
import type {
  AlgorithmStatus,
  FileMetadata,
  HashAlgorithm,
  HashProgress,
  HashSet,
} from '../types/integrity';

export const CHUNK_SIZE_BYTES = 65536; // 64 KiB matching Python hashlib chunk size

export const DEFAULT_SCRIPT_HASHES: HashSet = {
  MD5: '9a3d12e0e4db940488d3f93c5a7b5010',
  'SHA-1': 'c7a232e1c2b7898a1ca52f8aa59cb7a92c36bffc',
  'SHA-256': 'fe2ed2077eb58c0d8bbad20864fcb0ce04f96e1d56cdf20bfe0cba4c345a90ed',
};

export const EMPTY_HASHES: HashSet = {
  MD5: '',
  'SHA-1': '',
  'SHA-256': '',
};

export const HASH_ALGORITHMS: HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256'];

export const EXPECTED_HEX_LENGTH: Record<HashAlgorithm, number> = {
  MD5: 32,
  'SHA-1': 40,
  'SHA-256': 64,
};

export function normalizeHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, '');
}

export function isValidHex(value: string, algorithm?: HashAlgorithm): boolean {
  const normalized = normalizeHex(value);
  if (!normalized) return false;
  if (!/^[0-9a-f]+$/.test(normalized)) return false;
  if (algorithm) {
    return normalized.length === EXPECTED_HEX_LENGTH[algorithm];
  }
  return normalized.length === 32 || normalized.length === 40 || normalized.length === 64;
}

export function compareDigest(computed: string, expected: string): AlgorithmStatus {
  const normExpected = normalizeHex(expected);
  if (!normExpected) return 'unverified';
  const normComputed = normalizeHex(computed);
  return normComputed === normExpected ? 'match' : 'mismatch';
}

export function computeOverallVerdict(
  computed: HashSet,
  expected: HashSet
): 'verified' | 'tampered' | 'unverified' {
  const activeAlgorithms = HASH_ALGORITHMS.filter((alg) => normalizeHex(expected[alg]).length > 0);
  if (activeAlgorithms.length === 0) {
    return 'unverified';
  }
  const allMatch = activeAlgorithms.every(
    (alg) => compareDigest(computed[alg], expected[alg]) === 'match'
  );
  return allMatch ? 'verified' : 'tampered';
}

export async function computeFileHashes(
  file: File,
  onProgress?: (progress: HashProgress) => void,
  signal?: AbortSignal
): Promise<{ hashes: HashSet; durationMs: number }> {
  const spark = new SparkMD5.ArrayBuffer();
  const sha1Hasher = sha1.create();
  const sha256Hasher = sha256.create();

  const totalBytes = file.size;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE_BYTES));
  const startTime = performance.now();

  let offset = 0;
  let chunksProcessed = 0;

  if (totalBytes === 0) {
    const emptyBuf = new ArrayBuffer(0);
    spark.append(emptyBuf);
    sha1Hasher.update(new Uint8Array(emptyBuf));
    sha256Hasher.update(new Uint8Array(emptyBuf));
    const elapsedMs = Math.max(1, performance.now() - startTime);
    onProgress?.({
      bytesProcessed: 0,
      totalBytes: 0,
      percentage: 100,
      chunksProcessed: 1,
      totalChunks: 1,
      elapsedMs,
      throughputMBps: 0,
    });
  } else {
    while (offset < totalBytes) {
      if (signal?.aborted) {
        throw new DOMException('Hashing aborted', 'AbortError');
      }

      const end = Math.min(offset + CHUNK_SIZE_BYTES, totalBytes);
      const slice = file.slice(offset, end);
      const buffer = await slice.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      spark.append(buffer);
      sha1Hasher.update(uint8);
      sha256Hasher.update(uint8);

      offset = end;
      chunksProcessed += 1;

      const elapsedMs = Math.max(1, performance.now() - startTime);
      const shouldNotify = chunksProcessed % 8 === 0 || offset >= totalBytes;

      if (shouldNotify && onProgress) {
        const throughputMBps = offset / (1024 * 1024) / (elapsedMs / 1000);
        onProgress({
          bytesProcessed: offset,
          totalBytes,
          percentage: Math.min(100, Math.round((offset / totalBytes) * 100)),
          chunksProcessed,
          totalChunks,
          elapsedMs,
          throughputMBps,
        });
        // Yield briefly to keep UI responsive on large files
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  const durationMs = Math.max(1, performance.now() - startTime);

  return {
    hashes: {
      MD5: spark.end().toLowerCase(),
      'SHA-1': sha1Hasher.hex().toLowerCase(),
      'SHA-256': sha256Hasher.hex().toLowerCase(),
    },
    durationMs,
  };
}

/**
 * Parses pasted text containing one or more hashes (raw hex, key-value pairs,
 * or standard sha256sum / md5sum / sha1sum manifests).
 */
export function parseChecksumInput(rawText: string): Partial<HashSet> {
  const found: Partial<HashSet> = {};
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Look for labeled matches first, e.g. "MD5: <hex>" or "SHA-256 = <hex>"
    const labeledMatch = trimmed.match(/(md5|sha-?1|sha-?256)\s*[:=]\s*([0-9a-fA-F]{32,64})/i);
    if (labeledMatch) {
      const key = labeledMatch[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
      const hex = labeledMatch[2].toLowerCase();
      if (key === 'MD5' && hex.length === 32) found.MD5 = hex;
      if (key === 'SHA1' && hex.length === 40) found['SHA-1'] = hex;
      if (key === 'SHA256' && hex.length === 64) found['SHA-256'] = hex;
      continue;
    }

    // Otherwise scan tokens for 32/40/64-char hex strings
    const tokens = trimmed.split(/[\s,*]+/);
    for (const token of tokens) {
      const clean = normalizeHex(token);
      if (/^[0-9a-f]+$/.test(clean)) {
        if (clean.length === 32 && !found.MD5) found.MD5 = clean;
        else if (clean.length === 40 && !found['SHA-1']) found['SHA-1'] = clean;
        else if (clean.length === 64 && !found['SHA-256']) found['SHA-256'] = clean;
      }
    }
  }

  return found;
}

/**
 * Parses a multi-file checksum manifest (like SHA256SUMS) mapping filenames to expected hashes.
 */
export function parseChecksumManifest(rawText: string): Map<string, Partial<HashSet>> {
  const map = new Map<string, Partial<HashSet>>();
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Standard format: "<hex>  <filename>" or "<hex> *<filename>"
    const stdMatch = trimmed.match(/^([0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64})\s+[*]?(.+)$/);
    if (stdMatch) {
      const hex = stdMatch[1].toLowerCase();
      const rawName = stdMatch[2].trim();
      const fileName = rawName.split(/[\\/]/).pop() || rawName;
      const existing = map.get(fileName) || {};

      if (hex.length === 32) existing.MD5 = hex;
      else if (hex.length === 40) existing['SHA-1'] = hex;
      else if (hex.length === 64) existing['SHA-256'] = hex;

      map.set(fileName, existing);
      continue;
    }

    // BSD format: "SHA256 (filename) = <hex>"
    const bsdMatch = trimmed.match(/^(MD5|SHA1|SHA-1|SHA256|SHA-256)\s*\((.+?)\)\s*=\s*([0-9a-fA-F]{32,64})$/i);
    if (bsdMatch) {
      const algRaw = bsdMatch[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rawName = bsdMatch[2].trim();
      const fileName = rawName.split(/[\\/]/).pop() || rawName;
      const hex = bsdMatch[3].toLowerCase();
      const existing = map.get(fileName) || {};

      if (algRaw === 'MD5' && hex.length === 32) existing.MD5 = hex;
      else if (algRaw === 'SHA1' && hex.length === 40) existing['SHA-1'] = hex;
      else if (algRaw === 'SHA256' && hex.length === 64) existing['SHA-256'] = hex;

      map.set(fileName, existing);
    }
  }

  return map;
}

const DEDICATED_CHECKSUM_EXTENSIONS = [
  '.sha256',
  '.sha256sum',
  '.sha256sums',
  '.sha1',
  '.sha1sum',
  '.sha1sums',
  '.md5',
  '.md5sum',
  '.md5sums',
  '.sum',
  '.sums',
];

const DEDICATED_CHECKSUM_BASENAMES = new Set([
  'sha256sums',
  'sha1sums',
  'md5sums',
  'checksums',
  'hashes',
]);

export function isDedicatedChecksumFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (DEDICATED_CHECKSUM_BASENAMES.has(lower)) return true;
  return DEDICATED_CHECKSUM_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isCompanionCandidateFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return isDedicatedChecksumFile(lower) || lower.endsWith('.txt');
}

/**
 * Attempts to extract MD5 (32 hex), SHA-1 (40 hex), or SHA-256 (64 hex) digest tokens
 * embedded directly inside a filename (e.g. "release-sha256-fe2ed2...ed.tar.gz").
 */
export function extractHashesFromFilename(filename: string): Partial<HashSet> {
  const found: Partial<HashSet> = {};
  const regex = /(?:^|[^0-9a-fA-F])([0-9a-fA-F]{64}|[0-9a-fA-F]{40}|[0-9a-fA-F]{32})(?=$|[^0-9a-fA-F])/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(filename)) !== null) {
    const hex = match[1].toLowerCase();
    if (hex.length === 64 && !found['SHA-256']) {
      found['SHA-256'] = hex;
    } else if (hex.length === 40 && !found['SHA-1']) {
      found['SHA-1'] = hex;
    } else if (hex.length === 32 && !found.MD5) {
      found.MD5 = hex;
    }
  }

  return found;
}

/**
 * Parses a companion checksum file (.txt, .sha256, .md5, .sha1, SHA256SUMS).
 * If targetFileName is given and present in a manifest, prioritizes that file's entry.
 */
export function parseCompanionChecksumContent(
  content: string,
  targetFileName?: string
): Partial<HashSet> {
  const manifest = parseChecksumManifest(content);

  if (targetFileName && manifest.size > 0) {
    const exact = manifest.get(targetFileName);
    if (exact && Object.keys(exact).length > 0) {
      return exact;
    }
    const lowerTarget = targetFileName.toLowerCase();
    for (const [name, hashes] of manifest.entries()) {
      if (name.toLowerCase() === lowerTarget && Object.keys(hashes).length > 0) {
        return hashes;
      }
    }
  }

  if (manifest.size === 1) {
    const first = manifest.values().next().value;
    if (first && Object.keys(first).length > 0) {
      return first;
    }
  }

  return parseChecksumInput(content);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value >= 10 || exp === 0 ? value.toFixed(exp === 0 ? 0 : 1) : value.toFixed(2)} ${units[exp]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function extractMetadata(file: File): FileMetadata {
  return {
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified,
  };
}

/**
 * Generates an in-memory sample release file and its exact hashes so users can test
 * both verified and tampered flows immediately without needing to locate a local file.
 */
export async function createSampleArtifact(tampered: boolean): Promise<{
  file: File;
  expectedHashes: HashSet;
}> {
  const cleanPayload =
    'VeriHash Release Artifact v1.0\n' +
    'Build: 2026-11-23T16:00:00Z\n' +
    'Payload: Deterministic integrity verification sample (64KB chunked test).\n' +
    'Checksum Target: Valid reference binary stream.\n';

  const cleanFile = new File([cleanPayload], 'release-package-v1.0.bin', {
    type: 'application/octet-stream',
    lastModified: Date.UTC(2026, 10, 23, 16, 0, 0),
  });

  const { hashes: expectedHashes } = await computeFileHashes(cleanFile);

  if (!tampered) {
    return { file: cleanFile, expectedHashes };
  }

  // Introduce a subtle 1-character alteration to demonstrate cryptographic avalanche effect
  const tamperedPayload = cleanPayload.replace('Valid reference', 'Altered reference');
  const tamperedFile = new File([tamperedPayload], 'release-package-v1.0-tampered.bin', {
    type: 'application/octet-stream',
    lastModified: Date.UTC(2026, 10, 23, 16, 5, 0),
  });

  return { file: tamperedFile, expectedHashes };
}

export function buildTextReport(
  file: FileMetadata,
  computed: HashSet,
  expected: HashSet,
  durationMs: number
): string {
  const verdict = computeOverallVerdict(computed, expected);
  const lines: string[] = [
    'File Integrity Verification Report',
    '==================================',
    `File Name: ${file.name}`,
    `File Size: ${formatBytes(file.size)} (${file.size.toLocaleString()} bytes)`,
    `Computed In: ${formatDuration(durationMs)} (64 KiB chunks)`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    'Computed Hashes:',
    ...HASH_ALGORITHMS.map((alg) => `${alg.padEnd(8)} ${computed[alg]}`),
    '',
    'Expected Hashes:',
    ...HASH_ALGORITHMS.map((alg) => `${alg.padEnd(8)} ${normalizeHex(expected[alg]) || '(not provided)'}`),
    '',
    'Comparison:',
    ...HASH_ALGORITHMS.map((alg) => {
      const status = compareDigest(computed[alg], expected[alg]);
      if (status === 'match') return `${alg.padEnd(8)} Match`;
      if (status === 'mismatch') {
        return `${alg.padEnd(8)} MISMATCH (Expected: ${normalizeHex(expected[alg])}, Computed: ${computed[alg]})`;
      }
      return `${alg.padEnd(8)} Not checked (no expected hash)`;
    }),
    '',
    'Verdict:',
    verdict === 'verified'
      ? 'The file hashes match. The file is authentic and not tampered with.'
      : verdict === 'tampered'
      ? 'The file hashes do not match. The file may be tampered with or corrupted.'
      : 'Digests computed. Provide expected hashes to verify integrity.',
  ];
  return lines.join('\n');
}
