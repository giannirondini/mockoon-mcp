/**
 * Shared test fixtures
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MockoonConfig, Route } from '../src/types/mockoon.js';

let uuidCounter = 0;

export function testUuid(): string {
  uuidCounter++;
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
}

export function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    uuid: testUuid(),
    type: 'http',
    documentation: '',
    method: 'get',
    endpoint: 'api/users',
    enabled: true,
    responseMode: null,
    streamingMode: null,
    streamingInterval: 0,
    responses: [
      {
        uuid: testUuid(),
        body: '{}',
        statusCode: 200,
        label: 'Default response',
        default: true,
      },
    ],
    ...overrides,
  };
}

export function makeEnv(routes: Route[] = []): MockoonConfig {
  return {
    uuid: testUuid(),
    name: 'Test environment',
    port: 3000,
    hostname: '',
    routes,
    data: [],
  };
}

export async function writeTempEnv(config: MockoonConfig): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockoon-mcp-test-'));
  const filePath = path.join(dir, 'env.json');
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
  return filePath;
}

export function parseResult(result: {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}
