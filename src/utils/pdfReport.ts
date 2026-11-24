import { jsPDF } from 'jspdf';
import type { FileMetadata, HashAlgorithm, HashSet } from '../types/integrity';
import {
  HASH_ALGORITHMS,
  compareDigest,
  computeOverallVerdict,
  formatBytes,
  formatDuration,
  normalizeHex,
} from './hashing';

interface PdfReportInput {
  fileMeta: FileMetadata;
  computed: HashSet;
  expected: HashSet;
  durationMs: number;
  algorithmDurationsMs: Record<HashAlgorithm, number> | null;
}

const BIT_LENGTH: Record<HashAlgorithm, string> = {
  MD5: '128-bit',
  'SHA-1': '160-bit',
  'SHA-256': '256-bit',
};

function calcMBps(bytes: number, ms: number): number {
  if (bytes <= 0 || ms <= 0) return 0;
  return bytes / (1024 * 1024) / (ms / 1000);
}

function getCharacterSimilarity(
  computedHex: string,
  expectedHex: string
): { matchedChars: number; totalChars: number; pct: number; firstDiffIndex: number | null } {
  const normC = normalizeHex(computedHex);
  const normE = normalizeHex(expectedHex);
  if (!normE) {
    return { matchedChars: 0, totalChars: normC.length, pct: 0, firstDiffIndex: null };
  }
  const len = Math.max(normC.length, normE.length);
  let matchedChars = 0;
  let firstDiffIndex: number | null = null;
  for (let i = 0; i < len; i++) {
    if (normC[i] !== undefined && normC[i] === normE[i]) {
      matchedChars++;
    } else if (firstDiffIndex === null) {
      firstDiffIndex = i;
    }
  }
  const pct = len > 0 ? (matchedChars / len) * 100 : 0;
  return { matchedChars, totalChars: len, pct, firstDiffIndex };
}

export function downloadPdfReport({
  fileMeta,
  computed,
  expected,
  durationMs,
  algorithmDurationsMs,
}: PdfReportInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const generatedAt = new Date();

  const verdict = computeOverallVerdict(computed, expected);
  const matchedCount = HASH_ALGORITHMS.filter(
    (alg) => compareDigest(computed[alg], expected[alg]) === 'match'
  ).length;
  const checkedCount = HASH_ALGORITHMS.filter(
    (alg) => normalizeHex(expected[alg]).length > 0
  ).length;

  // ==========================================
  // PAGE 1: SUMMARY, METADATA & PERFORMANCE
  // ==========================================

  // Top Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 34, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('VeriHash', margin, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('File Integrity Verification & Performance Summary', margin, 22.5);

  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Generated: ${generatedAt.toISOString()}`, pageWidth - margin, 15, {
    align: 'right',
  });
  doc.text('Client-side 64 KiB streaming', pageWidth - margin, 22.5, {
    align: 'right',
  });

  let y = 44;

  // Verdict Summary Box
  if (verdict === 'verified') {
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.setDrawColor(167, 243, 208); // emerald-200
  } else if (verdict === 'tampered') {
    doc.setFillColor(254, 242, 242); // red-50
    doc.setDrawColor(254, 202, 202); // red-200
  } else {
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
  }
  doc.roundedRect(margin, y, contentWidth, 24, 2.5, 2.5, 'FD');

  if (verdict === 'verified') {
    doc.setTextColor(4, 120, 87); // emerald-700
  } else if (verdict === 'tampered') {
    doc.setTextColor(185, 28, 28); // red-700
  } else {
    doc.setTextColor(29, 78, 216); // blue-700
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const verdictHeadline =
    verdict === 'verified'
      ? 'VERIFIED: All Checked Digests Match'
      : verdict === 'tampered'
      ? 'INTEGRITY ALERT: Digest Mismatch Detected'
      : 'COMPUTED ONLY: No Reference Checksums Provided';
  doc.text(verdictHeadline, margin + 5, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85); // slate-700
  const verdictDetail =
    verdict === 'verified'
      ? `All ${checkedCount} checked digest(s) matched the expected reference checksums with zero discrepancies.`
      : verdict === 'tampered'
      ? `${matchedCount} of ${checkedCount} checked digest(s) matched. See Page 2 for highlighted byte-level comparisons.`
      : 'MD5, SHA-1, and SHA-256 digests were computed locally; no expected checksums were supplied for verification.';
  const wrappedVerdict = doc.splitTextToSize(verdictDetail, contentWidth - 10);
  doc.text(wrappedVerdict, margin + 5, y + 15.5);

  y += 33;

  // Section: File Metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('File Metadata', margin, y);
  y += 4;

  const totalThroughput = calcMBps(fileMeta.size, durationMs);
  const metadataRows: [string, string][] = [
    ['File Name', fileMeta.name],
    ['File Size', `${formatBytes(fileMeta.size)} (${fileMeta.size.toLocaleString()} bytes)`],
    ['Media Type', fileMeta.type || 'application/octet-stream'],
    ['Last Modified', new Date(fileMeta.lastModified).toISOString()],
    ['Stream Chunk Size', '64 KiB (65,536 bytes)'],
    [
      'Total Compute Time',
      `${formatDuration(durationMs)} (${totalThroughput > 0 ? `${totalThroughput.toFixed(1)} MB/s combined` : 'N/A'})`,
    ],
  ];

  const metaRowHeight = 8;
  const metaTableHeight = metadataRows.length * metaRowHeight;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, contentWidth, metaTableHeight, 2, 2, 'FD');

  metadataRows.forEach(([label, val], idx) => {
    const rowY = y + idx * metaRowHeight;
    if (idx > 0) {
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, rowY, margin + contentWidth, rowY);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(label, margin + 4, rowY + 5.3);

    doc.setFont(idx === 0 || idx === 1 ? 'courier' : 'helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const trimmedVal = val.length > 68 ? `${val.slice(0, 65)}...` : val;
    doc.text(trimmedVal, margin + 46, rowY + 5.3);
  });

  y += metaTableHeight + 11;

  // Section: Algorithm-Specific Performance Metrics
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Algorithm-Specific Performance Metrics', margin, y);
  y += 4;

  const colX = {
    alg: margin + 4,
    bits: margin + 32,
    status: margin + 56,
    time: margin + 88,
    speed: margin + 118,
    share: margin + 148,
  };

  // Table header
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 9, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Algorithm', colX.alg, y + 6);
  doc.text('Digest', colX.bits, y + 6);
  doc.text('Status', colX.status, y + 6);
  doc.text('Compute Time', colX.time, y + 6);
  doc.text('Throughput', colX.speed, y + 6);
  doc.text('CPU Share', colX.share, y + 6);

  const totalAlgTime = algorithmDurationsMs
    ? HASH_ALGORITHMS.reduce((sum, alg) => sum + (algorithmDurationsMs[alg] || 0), 0)
    : 0;

  const perfRowHeight = 12;
  HASH_ALGORITHMS.forEach((alg, idx) => {
    const rowY = y + 9 + idx * perfRowHeight;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, rowY, contentWidth, perfRowHeight, 'FD');

    const status = compareDigest(computed[alg], expected[alg]);
    const statusText =
      status === 'match' ? 'Match' : status === 'mismatch' ? 'Mismatch' : 'Not Checked';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(alg, colX.alg, rowY + 7.5);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(BIT_LENGTH[alg], colX.bits, rowY + 7.5);

    doc.setFont('helvetica', 'bold');
    if (status === 'match') doc.setTextColor(4, 120, 87);
    else if (status === 'mismatch') doc.setTextColor(185, 28, 28);
    else doc.setTextColor(100, 116, 139);
    doc.text(statusText, colX.status, rowY + 7.5);

    const algMs = algorithmDurationsMs?.[alg] ?? null;
    const algSpeed = algMs !== null ? calcMBps(fileMeta.size, algMs) : null;
    const sharePct =
      algMs !== null && totalAlgTime > 0 ? (algMs / totalAlgTime) * 100 : null;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(algMs !== null ? `${algMs.toFixed(2)} ms` : 'N/A', colX.time, rowY + 7.5);
    doc.text(
      algSpeed !== null
        ? fileMeta.size > 0
          ? `${algSpeed.toFixed(1)} MB/s`
          : '0.0 MB/s'
        : 'N/A',
      colX.speed,
      rowY + 7.5
    );

    if (sharePct !== null) {
      doc.text(`${sharePct.toFixed(1)}%`, colX.share, rowY + 5.2);
      // Proportional micro bar
      const barWidth = 24;
      doc.setFillColor(226, 232, 240);
      doc.rect(colX.share, rowY + 7.2, barWidth, 1.8, 'F');
      if (alg === 'MD5') doc.setFillColor(16, 185, 129);
      else if (alg === 'SHA-1') doc.setFillColor(59, 130, 246);
      else doc.setFillColor(99, 102, 241);
      doc.rect(colX.share, rowY + 7.2, (barWidth * Math.min(100, sharePct)) / 100, 1.8, 'F');
    } else {
      doc.setTextColor(148, 163, 184);
      doc.text('N/A', colX.share, rowY + 7.5);
    }
  });

  y += 9 + HASH_ALGORITHMS.length * perfRowHeight + 6;

  // Overhead insight note
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (algorithmDurationsMs && fileMeta.size > 0) {
    const md5Speed = calcMBps(fileMeta.size, algorithmDurationsMs.MD5);
    const sha256Speed = calcMBps(fileMeta.size, algorithmDurationsMs['SHA-256']);
    const ratio = sha256Speed > 0 ? (md5Speed / sha256Speed).toFixed(2) : '1.00';
    doc.text(
      `Performance Note: MD5 processed at ${md5Speed.toFixed(1)} MB/s vs SHA-256 at ${sha256Speed.toFixed(1)} MB/s (${ratio}x speed ratio on this device).`,
      margin,
      y
    );
  } else if (!algorithmDurationsMs) {
    doc.text(
      'Performance Note: Per-algorithm timings were not recorded for this historical entry.',
      margin,
      y
    );
  } else {
    doc.text('Performance Note: 0-byte file hashed across MD5, SHA-1, and SHA-256.', margin, y);
  }

  // Page 1 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('VeriHash · Zero-upload client-side integrity verification', margin, pageHeight - 10);
  doc.text('Page 1 of 2', pageWidth - margin, pageHeight - 10, { align: 'right' });

  // ==========================================
  // PAGE 2: DETAILED DIGEST COMPARISON
  // ==========================================
  doc.addPage();

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.line(0, 24, pageWidth, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Detailed Digest Comparison', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const targetLabel =
    fileMeta.name.length > 72 ? `${fileMeta.name.slice(0, 69)}...` : fileMeta.name;
  doc.text(`Target File: ${targetLabel}`, margin, 18.5);

  let py = 33;

  HASH_ALGORITHMS.forEach((alg) => {
    const computedVal = computed[alg];
    const expectedVal = normalizeHex(expected[alg]);
    const status = compareDigest(computedVal, expectedVal);
    const sim = getCharacterSimilarity(computedVal, expectedVal);

    const cardHeight = status === 'mismatch' ? 62 : 54;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, py, contentWidth, cardHeight, 2, 2, 'FD');

    // Card header bar
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, py, contentWidth, 10, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${alg} (${BIT_LENGTH[alg]})`, margin + 4, py + 6.7);

    if (expectedVal) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${sim.matchedChars}/${sim.totalChars} chars (${sim.pct.toFixed(1)}%)`,
        margin + 90,
        py + 6.7
      );
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    if (status === 'match') {
      doc.setTextColor(4, 120, 87);
      doc.text('MATCH', pageWidth - margin - 4, py + 6.7, { align: 'right' });
    } else if (status === 'mismatch') {
      doc.setTextColor(185, 28, 28);
      doc.text('DOES NOT MATCH', pageWidth - margin - 4, py + 6.7, { align: 'right' });
    } else {
      doc.setTextColor(100, 116, 139);
      doc.text('NOT CHECKED', pageWidth - margin - 4, py + 6.7, { align: 'right' });
    }

    // Computed row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Computed:', margin + 4, py + 18);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const computedLines = doc.splitTextToSize(computedVal, contentWidth - 32);
    doc.text(computedLines, margin + 26, py + 18);

    // Expected row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Expected:', margin + 4, py + 34);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    if (expectedVal) {
      doc.setTextColor(51, 65, 85);
      const expectedLines = doc.splitTextToSize(expectedVal, contentWidth - 32);
      doc.text(expectedLines, margin + 26, py + 34);
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text('No expected checksum provided', margin + 26, py + 34);
    }

    if (status === 'mismatch') {
      const diffCount = sim.totalChars - sim.matchedChars;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(185, 28, 28);
      doc.text(
        `Differs at ${diffCount} hex position(s) (first mismatch at index ${sim.firstDiffIndex ?? 0})`,
        margin + 4,
        py + 54
      );
    }

    py += cardHeight + 8;
  });

  // Page 2 Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('VeriHash · Zero-upload client-side integrity verification', margin, pageHeight - 10);
  doc.text('Page 2 of 2', pageWidth - margin, pageHeight - 10, { align: 'right' });

  doc.save(`${fileMeta.name}.integrity-report.pdf`);
}
