export interface ServerVersionInfo {
  name: string;
  version: string;
  buildId: string;
  builtAt: string;
  mode: 'embedded' | 'directory';
  embeddedAssets: number;
}

export async function fetchServerVersion(
  knownBuildId?: string | null
): Promise<{ status: 'unchanged' | 'updated' | 'unavailable'; info?: ServerVersionInfo }> {
  try {
    const headers: HeadersInit = {};
    if (knownBuildId) {
      headers['If-None-Match'] = `"${knownBuildId}"`;
    }

    const res = await fetch('/api/version', {
      method: 'GET',
      cache: 'no-store',
      headers,
    });

    if (res.status === 304) {
      return { status: 'unchanged' };
    }

    if (!res.ok) {
      return { status: 'unavailable' };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { status: 'unavailable' };
    }

    const data = (await res.json()) as Partial<ServerVersionInfo>;
    if (!data || typeof data.buildId !== 'string' || typeof data.version !== 'string') {
      return { status: 'unavailable' };
    }

    const info: ServerVersionInfo = {
      name: data.name ?? 'verihash',
      version: data.version,
      buildId: data.buildId,
      builtAt: data.builtAt ?? '',
      mode: data.mode === 'directory' ? 'directory' : 'embedded',
      embeddedAssets: typeof data.embeddedAssets === 'number' ? data.embeddedAssets : 0,
    };

    if (knownBuildId && info.buildId !== knownBuildId) {
      return { status: 'updated', info };
    }

    return { status: 'unchanged', info };
  } catch {
    return { status: 'unavailable' };
  }
}
