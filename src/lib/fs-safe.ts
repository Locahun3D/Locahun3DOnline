/**
 * Safe filesystem write for environments where node:fs may hang (Cloudflare Workers).
 * With nodejs_compat, Workers provides node:fs but has no writable filesystem —
 * mkdir/writeFile hang forever. We skip writes entirely on Workers.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

let _canWrite: boolean | null = null;

export function canAccessLocalFs(): boolean {
  return canWriteFs();
}

function canWriteFs(): boolean {
  if (_canWrite !== null) return _canWrite;
  try {
    const g = globalThis as Record<string, unknown>;
    const nav = g.navigator as { userAgent?: string } | undefined;
    if (nav?.userAgent === "Cloudflare-Workers") {
      _canWrite = false;
      return false;
    }
    const cwd = process.cwd();
    _canWrite = cwd !== "/" && cwd.length > 1;
  } catch {
    _canWrite = false;
  }
  return _canWrite;
}

export async function safeWriteFile(
  filePath: string,
  data: string | Buffer,
): Promise<boolean> {
  if (!canWriteFs()) return false;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return true;
  } catch {
    return false;
  }
}
