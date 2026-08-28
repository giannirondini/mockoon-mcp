import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { promises as fs } from 'fs';
import {
  handleAddRoute,
  handleUpdateRoute,
  handleFindRoute,
  handleListRoutes,
} from '../src/tools/handlers/route-handlers.js';
import { makeEnv, makeRoute, writeTempEnv, parseResult } from './helpers.js';

describe('handleAddRoute', () => {
  it('creates a schema-complete route with lowercase method and slashless endpoint', async () => {
    const filePath = await writeTempEnv(makeEnv());
    const result = await handleAddRoute({
      filePath,
      method: 'POST',
      endpoint: '/api/orders',
      responseBody: '{"ok": true}',
    });
    assert.notEqual(result.isError, true);

    const saved = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    const route = saved.routes[0];
    // Mockoon stores lowercase methods and slashless endpoints
    assert.equal(route.method, 'post');
    assert.equal(route.endpoint, 'api/orders');
    // Fields required by the Mockoon schema (RouteDefault / RouteResponseDefault)
    assert.equal(route.type, 'http');
    assert.equal(route.responseMode, null);
    assert.equal(route.streamingMode, null);
    assert.equal(route.streamingInterval, 0);
    assert.equal(route.documentation, '');
    const response = route.responses[0];
    for (const field of [
      'latency',
      'bodyType',
      'filePath',
      'databucketID',
      'sendFileAsBody',
      'rules',
      'rulesOperator',
      'disableTemplating',
      'fallbackTo404',
      'crudKey',
      'callbacks',
    ]) {
      assert.ok(field in response, `response is missing schema field: ${field}`);
    }
    assert.equal(response.bodyType, 'INLINE');
    assert.equal(response.default, true);
  });

  it('rejects methods Mockoon does not support', async () => {
    const filePath = await writeTempEnv(makeEnv());
    const result = await handleAddRoute({
      filePath,
      method: 'FETCH',
      endpoint: 'api/x',
      responseBody: '{}',
    });
    assert.equal(result.isError, true);
    assert.equal(parseResult(result).error_code, 'INVALID_METHOD');
  });
});

describe('handleUpdateRoute', () => {
  it('normalizes method and endpoint on update', async () => {
    const route = makeRoute();
    const filePath = await writeTempEnv(makeEnv([route]));
    const result = await handleUpdateRoute({
      filePath,
      routeId: route.uuid,
      method: 'PUT',
      endpoint: '/api/things',
    });
    assert.notEqual(result.isError, true);

    const saved = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    assert.equal(saved.routes[0].method, 'put');
    assert.equal(saved.routes[0].endpoint, 'api/things');
  });

  it('rejects an invalid method without touching the file', async () => {
    const route = makeRoute();
    const filePath = await writeTempEnv(makeEnv([route]));
    const result = await handleUpdateRoute({ filePath, routeId: route.uuid, method: 'NOPE' });
    assert.equal(result.isError, true);
    const saved = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    assert.equal(saved.routes[0].method, 'get');
  });
});

describe('handleFindRoute', () => {
  it('finds a slashless stored endpoint when searching with a leading slash', async () => {
    const route = makeRoute({ endpoint: 'api/users' });
    const filePath = await writeTempEnv(makeEnv([route]));
    const payload = parseResult(await handleFindRoute({ filePath, endpoint: '/api/users' }));
    assert.equal(payload.found, true);
    assert.equal((payload.route as { uuid: string }).uuid, route.uuid);
  });

  it('prefix-matches before substring-matching', async () => {
    const routes = [
      makeRoute({ endpoint: 'api/users/details' }),
      makeRoute({ endpoint: 'xapi/users' }),
    ];
    const filePath = await writeTempEnv(makeEnv(routes));
    const payload = parseResult(await handleFindRoute({ filePath, endpoint: 'api/users' }));
    assert.equal(payload.found, true);
    assert.equal((payload.route as { endpoint: string }).endpoint, 'api/users/details');
  });

  it('returns a structured AMBIGUOUS_METHOD error without steering fields', async () => {
    const routes = [
      makeRoute({ endpoint: 'api/users', method: 'get' }),
      makeRoute({ endpoint: 'api/users', method: 'post' }),
    ];
    const filePath = await writeTempEnv(makeEnv(routes));
    const result = await handleFindRoute({ filePath, endpoint: 'api/users' });
    assert.equal(result.isError, true);
    const payload = parseResult(result);
    assert.equal(payload.error_code, 'AMBIGUOUS_METHOD');
    assert.equal((payload.available_choices as unknown[]).length, 2);
    assert.ok(!('instruction_to_llm' in payload));
    assert.ok(!('blocking' in payload));
  });

  it('filters by method case-insensitively', async () => {
    const routes = [
      makeRoute({ endpoint: 'api/users', method: 'get' }),
      makeRoute({ endpoint: 'api/users', method: 'post' }),
    ];
    const filePath = await writeTempEnv(makeEnv(routes));
    const payload = parseResult(
      await handleFindRoute({ filePath, endpoint: 'api/users', method: 'POST' })
    );
    assert.equal(payload.found, true);
    assert.equal((payload.route as { method: string }).method, 'post');
  });

  it('reports METHOD_NOT_FOUND with available choices', async () => {
    const route = makeRoute({ endpoint: 'api/users', method: 'get' });
    const filePath = await writeTempEnv(makeEnv([route]));
    const result = await handleFindRoute({ filePath, endpoint: 'api/users', method: 'DELETE' });
    assert.equal(result.isError, true);
    assert.equal(parseResult(result).error_code, 'METHOD_NOT_FOUND');
  });
});

describe('handleListRoutes', () => {
  it('paginates with offset/limit and reports hasMore', async () => {
    const routes = Array.from({ length: 5 }, (_, i) => makeRoute({ endpoint: `api/r${i}` }));
    const filePath = await writeTempEnv(makeEnv(routes));
    const payload = parseResult(await handleListRoutes({ filePath, offset: 2, limit: 2 }));
    assert.equal(payload.total, 5);
    assert.equal((payload.routes as unknown[]).length, 2);
    assert.equal(payload.hasMore, true);
  });
});
