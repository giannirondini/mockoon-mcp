/**
 * End-to-end test: spawns the BUILT server (build/index.js) and drives it
 * over real stdio JSON-RPC with the MCP SDK client — the same path an MCP
 * host uses. Requires a build; run via `npm run test:e2e`.
 *
 * The fixture mirrors a real-world minimal Mockoon export: the same field
 * name (`creation_date`) appears both as booking data and inside the
 * request-echo under `meta.params`, so the scenario exercises path-anchored
 * fieldPattern scoping.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const serverEntry = path.join(repoRoot, 'build', 'index.js');
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'sample-env.json');

const GTE_PATH = 'params.param_array.0.filters.creation_date.0.string.gte';

let client: Client;
let filePath: string;

function parse(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return { payload: parse(result), isError: result.isError === true };
}

describe('MCP server over stdio', () => {
  before(async () => {
    await fs.access(serverEntry).catch(() => {
      throw new Error(
        `Missing ${serverEntry} — run \`npm run build\` first (or \`npm run test:e2e\`)`
      );
    });

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockoon-mcp-e2e-'));
    filePath = path.join(dir, 'env.json');
    await fs.copyFile(fixturePath, filePath);

    client = new Client({ name: 'e2e-test', version: '0.0.0' });
    await client.connect(new StdioClientTransport({ command: 'node', args: [serverEntry] }));
  });

  after(async () => {
    await client.close();
  });

  it('advertises every tool with an object input schema', async () => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 14);
    for (const tool of tools) {
      assert.equal((tool.inputSchema as { type?: string }).type, 'object');
    }
  });

  it('find_route matches despite a leading slash in the query', async () => {
    const { payload, isError } = await call('find_route', {
      filePath,
      endpoint: '/api/bookings',
      method: 'POST',
    });
    assert.equal(isError, false);
    assert.equal(payload.found, true);
    assert.equal((payload.route as { endpoint: string }).endpoint, 'api/bookings');
  });

  it('rejects relative strategy without variableName', async () => {
    const { payload, isError } = await call('replace_dates_with_templates', {
      filePath,
      routeId: 'e2e00000-0000-4000-8000-000000000002',
      responseIndex: 0,
      strategy: 'relative',
    });
    assert.equal(isError, true);
    assert.match(String(payload.error), /relative strategy/);
  });

  it('rejects an invalid strategy at schema validation', async () => {
    const { payload, isError } = await call('replace_dates_with_templates', {
      filePath,
      routeId: 'e2e00000-0000-4000-8000-000000000002',
      responseIndex: 0,
      strategy: 'bogus',
    });
    assert.equal(isError, true);
    assert.equal(payload.error_code, 'INVALID_ARGUMENTS');
  });

  it('applies three path-scoped strategies to one response', async () => {
    const routeId = 'e2e00000-0000-4000-8000-000000000002';

    // Booking data date: relative to the request's gte filter
    const first = await call('replace_dates_with_templates', {
      filePath,
      routeId,
      responseIndex: 0,
      strategy: 'relative',
      variableName: GTE_PATH,
      fieldPattern: '^bookings\\.0\\.creation_date$',
    });
    assert.equal(first.isError, false);
    assert.equal((first.payload.statistics as { datesReplaced: number }).datesReplaced, 1);

    // Departure: same reference date, one week later
    const second = await call('replace_dates_with_templates', {
      filePath,
      routeId,
      responseIndex: 0,
      strategy: 'relative',
      variableName: GTE_PATH,
      fieldPattern: 'departure_timestamp',
      offsetDays: 7,
    });
    assert.equal(second.isError, false);

    // The request echo in meta: offset from today
    const third = await call('replace_dates_with_templates', {
      filePath,
      routeId,
      responseIndex: 0,
      strategy: 'offset',
      offsetDays: -30,
      fieldPattern: '^meta\\.',
    });
    assert.equal(third.isError, false);

    const saved = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    const body = JSON.parse(saved.routes[0].responses[0].body);
    assert.equal(
      body.bookings[0].creation_date,
      `{{dateTimeShift date=(bodyRaw '${GTE_PATH}') days=0 format='yyyy-MM-dd'}}`
    );
    assert.equal(
      body.bookings[0].departure_timestamp,
      `{{dateTimeShift date=(bodyRaw '${GTE_PATH}') days=7 format='yyyy-MM-dd'}}`
    );
    assert.equal(
      body.meta.params.param_array[0].filters.creation_date[0].string.gte,
      "{{dateTimeShift days=-30 format='yyyy-MM-dd'}}"
    );
  });

  it('is idempotent once everything is templated', async () => {
    const { payload, isError } = await call('replace_dates_with_templates', {
      filePath,
      routeId: 'e2e00000-0000-4000-8000-000000000002',
      responseIndex: 0,
      strategy: 'offset',
    });
    assert.equal(isError, false);
    assert.equal(payload.operationPerformed, false);
  });

  it('changed only the response body — every other field survives verbatim', async () => {
    const original = JSON.parse(await fs.readFile(fixturePath, 'utf-8'));
    const worked = JSON.parse(await fs.readFile(filePath, 'utf-8'));

    for (const key of Object.keys(original)) {
      if (key !== 'routes')
        assert.deepEqual(worked[key], original[key], `env field changed: ${key}`);
    }
    const [origResponse] = original.routes[0].responses;
    const [workedResponse] = worked.routes[0].responses;
    for (const key of Object.keys(origResponse)) {
      if (key !== 'body') {
        assert.deepEqual(workedResponse[key], origResponse[key], `response field changed: ${key}`);
      }
    }
  });
});
