import { createHash } from 'crypto';

export function normalizeUrlKey(rawUrl: string): string {
  try {
    return new URL(rawUrl).toString();
  } catch {
    return rawUrl.trim();
  }
}

export function getUrlId(rawUrl: string): string {
  return `url_${createHash('sha256').update(normalizeUrlKey(rawUrl)).digest('hex')}`;
}
