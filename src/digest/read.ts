import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightCounts, ReadNight, RunStatus } from './types.js';

const NIGHT_NAME = /^\d{4}-\d{2}-\d{2}$/;

type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isRunStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;

  return { at, job, status, owner: owner ?? null, ...(error === undefined ? {} : { error }) };
}

function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT_NAME.test(night)) return null;

  const log = readLog(join(runsDir, `${night}.jsonl`));
  if (log === null) return null;

  const rows = new Map<string, DigestRow>();
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const text of log.split('\n')) {
    if (text.trim() === '') continue;

    const line = parseLine(text);
    if (line === null) {
      badLines += 1;
      continue;
    }

    counts[line.status] += 1;

    const row = rows.get(line.job) ?? {
      job: line.job,
      owner: line.owner,
      runs: 0,
      retries: 0,
      fails: 0,
      lastStatus: line.status,
      lastError: null,
      firstAt: line.at,
      lastAt: line.at,
    };
    row.owner = line.owner;
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    if (line.status === 'fail') row.fails += 1;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastAt = line.at;
    rows.set(line.job, row);
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, badLines, counts };
};
