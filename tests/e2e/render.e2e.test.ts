/**
 * Rendering test: templates the fixture, then serves it with the REAL
 * Mockoon CLI and asserts the rendered dates — the ground truth that the
 * generated template syntax is valid Mockoon templating.
 *
 * Opt-in (set MOCKOON_E2E_RENDER=1): it downloads @mockoon/cli via npx,
 * binds a local port, and needs network on first run.
 *
 *   MOCKOON_E2E_RENDER=1 npm run test:e2e
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { handleReplaceDatesWithTemplates } from '../../src/tools/handlers/date-template-handlers.js';

const enabled = process.env.MOCKOON_E2E_RENDER === '1';
const PORT = 3199;
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'sample-env.json');
const GTE_PATH = 'params.param_array.0.filters.creation_date.0.string.gte';

const localIsoDate = (daysFromToday: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const postBooking = async (gte: string): Promise<Record<string, unknown> | undefined> => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'Booking Widget',
        params: { param_array: [{ filters: { creation_date: [{ string: { gte } }] } }] },
      }),
      signal: AbortSignal.timeout(2000),
    });
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

describe('templated file renders in real Mockoon', { skip: !enabled, timeout: 180_000 }, () => {
  let cli: ChildProcess | undefined;

  before(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockoon-mcp-render-'));
    const filePath = path.join(dir, 'env.json');
    await fs.copyFile(fixturePath, filePath);

    const routeId = 'e2e00000-0000-4000-8000-000000000002';
    const shared = { filePath, routeId, responseIndex: 0 } as const;
    await handleReplaceDatesWithTemplates({
      ...shared,
      strategy: 'relative',
      variableName: GTE_PATH,
      fieldPattern: '^bookings\\.0\\.creation_date$',
    });
    await handleReplaceDatesWithTemplates({
      ...shared,
      strategy: 'relative',
      variableName: GTE_PATH,
      fieldPattern: 'departure_timestamp',
      offsetDays: 7,
    });
    await handleReplaceDatesWithTemplates({
      ...shared,
      strategy: 'offset',
      offsetDays: -30,
      fieldPattern: '^meta\\.',
    });

    cli = spawn(
      'npx',
      ['-y', '@mockoon/cli', 'start', '--data', filePath, '--port', String(PORT)],
      {
        stdio: ['pipe', 'ignore', 'ignore'],
      }
    );
    // Minimal fixtures trigger the CLI's "attempt to repair?" prompt — accept it
    cli.stdin?.write('y\n');

    // Poll until the mock answers (first run may download the CLI)
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await postBooking('2025-01-01')) return;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('mockoon-cli never became reachable');
  });

  after(() => {
    cli?.kill('SIGTERM');
  });

  it('renders request-relative and offset dates correctly', async () => {
    const body = await postBooking('2025-03-10');
    assert.ok(body, 'no response from mock');
    const booking = (body.bookings as Record<string, string>[])[0];
    assert.equal(booking.creation_date, '2025-03-10');
    assert.equal(booking.departure_timestamp, '2025-03-17');

    const meta = body.meta as {
      params: { param_array: { filters: { creation_date: { string: { gte: string } }[] } }[] };
    };
    assert.equal(meta.params.param_array[0].filters.creation_date[0].string.gte, localIsoDate(-30));
  });

  it('dates are genuinely request-relative, not baked in', async () => {
    const body = await postBooking('2026-01-01');
    assert.ok(body, 'no response from mock');
    const booking = (body.bookings as Record<string, string>[])[0];
    assert.equal(booking.creation_date, '2026-01-01');
    assert.equal(booking.departure_timestamp, '2026-01-08');
  });
});
