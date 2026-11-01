export type RunStatus = 'ok' | 'retry' | 'fail';

// One job in one night. Times are the log's strings, offset kept (docs/styleguide.md:7).
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;      // valid lines for this job, of any status
  retries: number;   // lines with status "retry"
  fails: number;     // lines with status "fail"
  lastStatus: RunStatus;
  lastError: string | null; // the most recent `error` on any line of this job, even if a later line was ok
  firstAt: string;
  lastAt: string;
};

export type NightCounts = { ok: number; retry: number; fail: number }; // valid log lines by status

export type DigestNight = {
  night: string;      // YYYY-MM-DD
  rows: DigestRow[];  // sorted by job, plain string compare, not locale
  badLines: number;   // lines that did not parse or had the wrong shape
  counts: NightCounts;
};

// null = no such night: no file, or a name that is not YYYY-MM-DD.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
