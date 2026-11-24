export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256';

export type HashSet = Record<HashAlgorithm, string>;

export type AlgorithmStatus = 'match' | 'mismatch' | 'unverified';

export type OverallVerdict = 'verified' | 'tampered' | 'unverified' | 'idle' | 'computing';

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface AlgorithmProgress {
  bytesProcessed: number;
  percentage: number;
}

export interface HashProgress {
  bytesProcessed: number;
  totalBytes: number;
  percentage: number;
  chunksProcessed: number;
  totalChunks: number;
  elapsedMs: number;
  throughputMBps: number;
  byAlgorithm: Record<HashAlgorithm, AlgorithmProgress>;
}

export interface VerificationRecord {
  id: string;
  file: FileMetadata;
  computed: HashSet;
  expected: HashSet;
  verdict: 'verified' | 'tampered' | 'unverified';
  durationMs: number;
  algorithmDurationsMs?: Record<HashAlgorithm, number>;
  timestamp: number;
}

export interface BatchQueueItem {
  id: string;
  file: File;
  metadata: FileMetadata;
  status: 'queued' | 'computing' | 'verified' | 'tampered' | 'unverified' | 'error';
  progress: number;
  computed?: HashSet;
  expected?: Partial<HashSet>;
  durationMs?: number;
  algorithmDurationsMs?: Record<HashAlgorithm, number>;
  error?: string;
}

export type ActiveTab = 'verifier' | 'batch' | 'performance' | 'history' | 'algorithms';
