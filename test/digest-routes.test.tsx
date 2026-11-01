import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

let runsDir: string;

const line = (o: Record<string, unknown>) => JSON.stringify(o);
const T = '2026-10-30T01:00:00+01:00';

// zeta is written first so a missing sort shows up as wrong order.
const twoJobs = [
  line({ at: T, job: 'zeta', status: 'ok', owner: 'ana' }),
  line({ at: T, job: 'alpha', status: 'ok', owner: 'bo' }),
].join('\n');

const warnMix = [
  ...[1, 2, 3].map(() => line({ at: T, job: 'retry3', status: 'retry', owner: 'ana' })),
  line({ at: T, job: 'retry3', status: 'ok', owner: 'ana' }),
  line({ at: T, job: 'failed', status: 'fail', owner: 'ana', error: 'boom' }),
  ...[1, 2].map(() => line({ at: T, job: 'retry2', status: 'retry', owner: 'ana' })),
  line({ at: T, job: 'retry2', status: 'ok', owner: 'ana' }),
  line({ at: T, job: 'noowner', status: 'ok', owner: null }),
].join('\n');

const badLine = [
  line({ at: T, job: 'beta', status: 'ok', owner: 'ana' }),
  line({ at: T, job: 'alpha', status: 'ok', owner: 'ana' }),
  '{"at":"2026-10-30T01:00:00+01:00","job":"cut',
].join('\n');

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(runsDir, '2026-01-01.jsonl'), twoJobs + '\n');
  writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');
  writeFileSync(join(runsDir, '2026-01-03.jsonl'), badLine + '\n');
  writeFileSync(join(runsDir, '2026-01-04.jsonl'), warnMix + '\n');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  process.env.LANE_MARKER = 'TEST-MARKER';
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

async function page(night: string) {
  const res = await app().request(`/digest/${night}`);
  return { status: res.status, html: await res.text() };
}

async function json(night: string) {
  const res = await app().request(`/api/digest/${night}`);
  return { status: res.status, body: (await res.json()) as DigestNight };
}

// Row html in page order: the <tr ...> opening tag plus its first cell (the job name).
function pageRows(html: string) {
  return [...html.matchAll(/<tr( class="warn")?><td>([^<]*)<\/td><td>([^<]*)<\/td>/g)].map((m) => ({
    warn: m[1] !== undefined,
    job: m[2],
    owner: m[3],
  }));
}

describe('digest routes', () => {
  describe('200: a valid night with 2 jobs', () => {
    it('page lists both jobs', async () => {
      const { status, html } = await page('2026-01-01');
      expect(status).toBe(200);
      expect(html).toContain('<td>alpha</td>');
      expect(html).toContain('<td>zeta</td>');
    });

    it('JSON has both jobs', async () => {
      const { status, body } = await json('2026-01-01');
      expect(status).toBe(200);
      expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'zeta']);
    });
  });

  describe('404: no file for the night', () => {
    it('page', async () => {
      const { status } = await page('2026-02-02');
      expect(status).toBe(404);
    });

    it('JSON', async () => {
      const { status } = await json('2026-02-02');
      expect(status).toBe(404);
    });
  });

  describe('empty night: 0-byte file', () => {
    it('page says nothing ran', async () => {
      const { status, html } = await page('2026-01-02');
      expect(status).toBe(200);
      expect(html).toContain('nothing ran');
    });

    it('JSON has no rows', async () => {
      const { status, body } = await json('2026-01-02');
      expect(status).toBe(200);
      expect(body.rows).toEqual([]);
    });
  });

  describe('bad line: valid lines plus one cut-off line', () => {
    it('page shows the valid rows and the count', async () => {
      const { status, html } = await page('2026-01-03');
      expect(status).toBe(200);
      expect(pageRows(html).map((r) => r.job)).toEqual(['alpha', 'beta']);
      expect(html).toContain('1 bad line not read');
    });

    it('JSON has the valid rows and badLines 1', async () => {
      const { status, body } = await json('2026-01-03');
      expect(status).toBe(200);
      expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'beta']);
      expect(body.badLines).toBe(1);
    });
  });

  describe('page and JSON agree', () => {
    it('same job order', async () => {
      const { html } = await page('2026-01-04');
      const { body } = await json('2026-01-04');
      const order = ['failed', 'noowner', 'retry2', 'retry3'];
      expect(body.rows.map((r) => r.job)).toEqual(order);
      expect(pageRows(html).map((r) => r.job)).toEqual(order);
    });

    it('warn rows: retries 3 and a fail are warn, retries 2 is not', async () => {
      const { html } = await page('2026-01-04');
      const byJob = Object.fromEntries(pageRows(html).map((r) => [r.job, r.warn]));
      expect(byJob['retry3']).toBe(true);
      expect(byJob['failed']).toBe(true);
      expect(byJob['retry2']).toBe(false);
    });

    it('null owner: dash on the page, null in JSON', async () => {
      const { html } = await page('2026-01-04');
      const { body } = await json('2026-01-04');
      expect(pageRows(html).find((r) => r.job === 'noowner')?.owner).toBe('—');
      expect(body.rows.find((r) => r.job === 'noowner')?.owner).toBeNull();
    });
  });
});
