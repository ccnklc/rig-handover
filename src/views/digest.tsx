import type { DigestNight } from '../digest/types.js';

const dash = '—';

function BadLines({ count }: { count: number }) {
  if (count === 0) return null;
  return <p class="warn">{`${count} bad ${count === 1 ? 'line' : 'lines'} not read`}</p>;
}

export function Digest({ night }: { night: DigestNight }) {
  return (
    <>
      <h1>digest {night.night}</h1>
      <BadLines count={night.badLines} />
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((r) => (
              <tr class={r.retries >= 3 || r.fails >= 1 ? 'warn' : undefined}>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td>{r.retries}</td>
                <td>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestNotFound({ night }: { night: string }) {
  return (
    <>
      <h1>digest</h1>
      <p class="mute">{`no digest for ${night}`}</p>
    </>
  );
}
