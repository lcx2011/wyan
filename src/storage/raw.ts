const PREFIX = 'wenyan:';

export interface DecodedStorageValue {
  data: unknown;
  version: number;
  canonical: boolean;
}

export function withStoragePrefix(key: string): string {
  return key.startsWith(PREFIX) ? key : `${PREFIX}${key}`;
}

export function decodeHistoricalValue(raw: string): unknown {
  const first = JSON.parse(raw) as unknown;
  return typeof first === 'string' ? JSON.parse(first) as unknown : first;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeStorageValue(raw: string): DecodedStorageValue {
  const parsed = decodeHistoricalValue(raw);
  if (isRecord(parsed) && typeof parsed.schemaVersion === 'number' && 'data' in parsed) {
    return { data: parsed.data, version: parsed.schemaVersion, canonical: true };
  }
  if (isRecord(parsed) && 'state' in parsed) {
    return {
      data: parsed.state,
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      canonical: false,
    };
  }
  return { data: parsed, version: 0, canonical: false };
}
