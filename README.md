# VeriHash — File Integrity Checker

VeriHash is a client-side cryptographic file integrity verification web application. It computes **MD5**, **SHA-1**, and **SHA-256** digests directly in your browser using **64 KiB (65,536-byte) streaming chunks**—matching standard `hashlib` chunked verification—and compares them against expected checksums without ever uploading your files to a server.

---

## Prerequisites

- **Node.js** 18.0 or newer (Node.js 20+ LTS recommended)
- **npm** (included with Node.js)

---

## Installation & Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the development server:**

   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:3000`.

3. **Other available scripts:**

   ```bash
   npm run build    # Create a production build in dist/
   npm run preview  # Preview the production build locally
   npm run lint     # Run TypeScript type checking (tsc --noEmit)
   ```

---

## How to Use VeriHash

### 1. Verify a Single File (`Verifier` Tab)

1. **Select or drop a file:**
   - Drag and drop any local file onto the drop zone, or click **Select File** / **Browse Local File**.
   - If you just want to try the workflow immediately, click **Test Valid Sample** or **Test Tampered Sample** to generate an in-memory sample file with matching or 1-word altered bytes.
2. **Provide expected checksums:**
   - **Manual entry:** Type or paste MD5 (32 hex), SHA-1 (40 hex), or SHA-256 (64 hex) reference digests into the **Expected Checksums** fields.
   - **Smart Paste:** Click **Smart Paste** to paste raw hex strings, key-value lines (`MD5: ...`, `SHA-256: ...`), or `sha256sum`/`md5sum` output; VeriHash automatically assigns each digest by length.
   - **Auto-detection from filename or companion files:** With **Auto-detect from filename & .txt / .sha256 files** enabled, VeriHash automatically parses hashes embedded in filenames (for example `release-sha256-<hex>.zip`) or companion `.txt`, `.sha256`, `.sha1`, or `.md5` files dropped alongside your target file (or loaded via **Load .txt / .sha256**).
   - **Quick presets:** Use **Use Computed** to lock in the current file's digests as a baseline, **Script Defaults** to restore default test values, or **Clear** to reset the fields.
3. **Inspect comparison results:**
   - **Integrity Verdict:** Shows whether all checked digests match (**Integrity Verified**) or whether any mismatch indicates corruption or tampering (**Integrity Check Failed**).
   - **Character Similarity Overview:** Displays a color-coded similarity bar chart and positional sparkline strip for each checked algorithm.
   - **View Modes:** Toggle between **Stacked** and **Side-by-Side Diff** in the comparison header. In **Side-by-Side Diff** mode, mismatches also open a **Bit-Level Diff** table showing Hamming distance, affected bytes, and an XOR bitmask highlighting every flipped bit.
   - **Copy & Export:** Click **Copy to Clipboard** next to any individual Computed or Expected hash string, **Copy Report** to copy a full text summary, or **Export Report** to download the results as **Formatted JSON (`.json`)** or **Plain Text (`.txt`)**.

### 2. Verify Multiple Files (`Batch Queue` Tab)

1. Drag and drop multiple files or click **Add Files** to queue them.
2. Optionally paste a `SHA256SUMS`, `SHA1SUMS`, or `MD5SUMS` manifest into **Checksum Manifest** to auto-match each queued file by filename.
3. Click **Verify Queue** to compute all digests sequentially, or click **Export SHA256SUMS** to download a standard manifest of the computed SHA-256 hashes.

### 3. Review Past Checks (`History` Tab)

- Every verification performed in the `Verifier` tab is saved locally in your browser's `localStorage`.
- Filter entries by filename, hash prefix, or verdict (**All**, **Match**, **Mismatch**, **Computed**), click any row to reload it into the Verifier, or click **Export CSV** to download your verification log.

### 4. Understand Hash Algorithms (`Algorithms` Tab)

- Open the **Algorithms** tab for a beginner-friendly **Learn About These Algorithms** overview of MD5, SHA-1, and SHA-256 alongside a technical specification table and details on 64 KiB chunked streaming.

---

## Standalone Cross-Platform Binary (C99 + Mongoose)

VeriHash can be packaged into a single, dependency-free C99 executable (`dist-native/verihash` or `dist-native/verihash.exe`) powered by Mongoose (`src/native/server.c`), embedding the minified `dist/` Web UI directly in read-only memory and exposing `/api/version` (`ETag`/`304`) so open browser tabs detect updated server builds.

### Build for Your Current OS

Requires a standard C compiler (`gcc`, `clang`, or MSVC/MinGW on Windows):

```bash
bash scripts/build.sh
# or via npm:
npm run build:native
```

On Windows Command Prompt (after `npm run build && npm run build:assets`):

```bat
scripts\build-native.bat
```

### Run the Standalone Binary

```bash
./dist-native/verihash              # Auto-picks a free port and opens your browser
./dist-native/verihash --port 8080  # Bind a specific port
./dist-native/verihash --no-open    # Print URL without launching a browser
./dist-native/verihash --dir dist   # Serve live dist/ directory from disk instead of embedded headers
```

### Cross-Compile for Windows, macOS, and Linux

Install [Zig](https://ziglang.org/) (`zig cc` bundles sysroots for all targets without separate toolchains) and run:

```bash
bash scripts/build.sh --target all
```

Supported `--target` values: `native`, `linux-amd64`, `linux-arm64`, `windows-amd64`, `macos-amd64`, `macos-arm64`, `all`.

---

## Privacy & Local Processing

All file slicing and cryptographic hashing (`spark-md5`, `js-sha1`, `js-sha256`) run 100% locally in your browser. Files are read incrementally in 64 KiB chunks to keep memory usage constant even for large archives or disk images, and no file data is transmitted over the network.
