import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readMockoonConfig, writeMockoonConfig } from '../src/utils/config.js';
import { makeEnv, writeTempEnv } from './helpers.js';

describe('readMockoonConfig', () => {
  it('round-trips a valid environment', async () => {
    const env = makeEnv();
    const filePath = await writeTempEnv(env);
    const config = await readMockoonConfig(filePath);
    assert.equal(config.uuid, env.uuid);
  });

  it('rejects JSON that is not a Mockoon environment', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockoon-mcp-test-'));
    const filePath = path.join(dir, 'other.json');
    await fs.writeFile(filePath, JSON.stringify({ foo: 1 }), 'utf-8');
    await assert.rejects(readMockoonConfig(filePath), /Not a Mockoon environment file/);

    await fs.writeFile(filePath, JSON.stringify([1, 2, 3]), 'utf-8');
    await assert.rejects(readMockoonConfig(filePath), /Not a Mockoon environment file/);
  });
});

describe('writeMockoonConfig', () => {
  it('writes atomically and leaves no temp files behind', async () => {
    const env = makeEnv();
    const filePath = await writeTempEnv(env);
    env.name = 'Renamed';
    await writeMockoonConfig(filePath, env);

    const config = await readMockoonConfig(filePath);
    assert.equal(config.name, 'Renamed');

    const leftovers = (await fs.readdir(path.dirname(filePath))).filter(f => f.endsWith('.tmp'));
    assert.deepEqual(leftovers, []);
  });
});

describe('MOCKOON_MCP_ROOT confinement', () => {
  afterEach(() => {
    delete process.env.MOCKOON_MCP_ROOT;
  });

  it('rejects paths outside the configured root', async () => {
    const env = makeEnv();
    const filePath = await writeTempEnv(env);
    process.env.MOCKOON_MCP_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'mockoon-root-'));

    await assert.rejects(readMockoonConfig(filePath), /outside MOCKOON_MCP_ROOT/);
    await assert.rejects(writeMockoonConfig(filePath, env), /outside MOCKOON_MCP_ROOT/);
  });

  it('allows paths inside the configured root', async () => {
    const env = makeEnv();
    const filePath = await writeTempEnv(env);
    process.env.MOCKOON_MCP_ROOT = path.dirname(filePath);

    const config = await readMockoonConfig(filePath);
    assert.equal(config.uuid, env.uuid);
  });
});
