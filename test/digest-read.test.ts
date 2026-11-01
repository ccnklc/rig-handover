import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const runsDir = fileURLToPath(new URL('../runs', import.meta.url));

describe('readNight on the real nights', () => {
  it('2026-10-28: every value in the expected table', () => {
    expect(readNight(runsDir, '2026-10-28')).toEqual({
      night: '2026-10-28',
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          fails: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          fails: 0,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          fails: 0,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          fails: 1,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          fails: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('2026-10-27: 4 jobs, no bad lines, 7 ok', () => {
    const digest = readNight(runsDir, '2026-10-27');
    expect(digest?.rows).toHaveLength(4);
    expect(digest?.badLines).toBe(0);
    expect(digest?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });
});

describe('readNight on temp files', () => {
  const NIGHT = '2026-01-01';
  let dir: string;

  const read = (...lines: string[]) => {
    writeFileSync(join(dir, `${NIGHT}.jsonl`), lines.join('\n'));
    return readNight(dir, NIGHT);
  };
  const entry = (fields: Record<string, unknown>) =>
    JSON.stringify({ at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook', ...fields });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'digest-read-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('missing file gives null', () => {
    expect(readNight(dir, '2026-12-31')).toBeNull();
  });

  it.each(['../x', '..%2F..', '2026-1-1', '2026-01-01\n', ''])('invalid night name %j gives null', (name) => {
    expect(readNight(dir, name)).toBeNull();
  });

  it('checks the name before any file access', () => {
    writeFileSync(join(dir, 'x.jsonl'), entry({}));
    expect(readNight(join(dir, 'nested'), '../x')).toBeNull();
  });

  it('rethrows file errors other than a missing file', () => {
    mkdirSync(join(dir, '2026-02-02.jsonl'));
    expect(() => readNight(dir, '2026-02-02')).toThrow(/EISDIR/);
  });

  it('empty file gives no rows and no bad lines', () => {
    expect(read('')).toEqual({
      night: NIGHT,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('skips blank and whitespace-only lines without counting them', () => {
    const digest = read('', '   ', '\t', entry({}), '');
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows).toHaveLength(1);
  });

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['a number', '1'],
    ['at not a string', entry({ at: 1 })],
    ['at absent', entry({ at: undefined })],
    ['job not a string', entry({ job: null })],
    ['job absent', entry({ job: undefined })],
    ['status outside ok/retry/fail', entry({ status: 'done' })],
    ['status absent', entry({ status: undefined })],
    ['owner not string or null', entry({ owner: 7 })],
    ['error not a string', entry({ error: 503 })],
    ['error null', entry({ error: null })],
    ['not JSON', '{"at":"2026'],
  ])('a line of the wrong shape counts as bad: %s', (_name, line) => {
    const digest = read(line, entry({ job: 'good' }));
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual(['good']);
    expect(digest?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('absent owner becomes null and keeps the row', () => {
    const digest = read(entry({ owner: undefined }));
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows[0]?.owner).toBeNull();
  });

  it('owner is the owner of the last line of the job', () => {
    expect(read(entry({ owner: 'first' }), entry({ owner: 'last' }))?.rows[0]?.owner).toBe('last');
    expect(read(entry({ owner: 'first' }), entry({ owner: null }))?.rows[0]?.owner).toBeNull();
  });

  it('first, last and status follow file order, with times left as written', () => {
    const row = read(
      entry({ at: '2026-01-01T09:00:00+01:00', status: 'fail' }),
      entry({ at: '2026-01-01T02:00:00-05:00', status: 'ok' }),
      entry({ at: '2026-01-01T05:00:00+01:00', status: 'retry' }),
    )?.rows[0];
    expect(row?.firstAt).toBe('2026-01-01T09:00:00+01:00');
    expect(row?.lastAt).toBe('2026-01-01T05:00:00+01:00');
    expect(row?.lastStatus).toBe('retry');
  });

  it('lastError is the most recent error, even after a later ok', () => {
    const row = read(entry({ error: 'old' }), entry({ error: 'new' }), entry({ status: 'ok' }))?.rows[0];
    expect(row?.lastError).toBe('new');
    expect(row?.lastStatus).toBe('ok');
  });

  it('sorts rows by plain string compare, not locale', () => {
    const jobs = ['b', 'a', 'Z', 'é'].map((job) => entry({ job }));
    expect(read(...jobs)?.rows.map((row) => row.job)).toEqual(['Z', 'a', 'b', 'é']);
  });
});
