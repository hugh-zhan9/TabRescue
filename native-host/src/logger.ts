import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

const logPath = join(homedir(), '.tabrescue', 'native-host.log');

function ensureLogDir() {
  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function stringifyArg(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: (value as Error & { code?: string }).code,
    });
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function logNativeHost(message: string, details?: unknown) {
  ensureLogDir();
  const parts = [`[${new Date().toISOString()}]`, message];
  if (details !== undefined) {
    parts.push(stringifyArg(details));
  }
  appendFileSync(logPath, `${parts.join(' ')}\n`, 'utf-8');
}

export function getNativeHostLogPath() {
  return logPath;
}
