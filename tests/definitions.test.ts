import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tools, toolDefinitions } from '../src/tools/definitions.js';

describe('tool definitions', () => {
  it('advertises every defined tool with a derived JSON Schema', () => {
    assert.equal(tools.length, Object.keys(toolDefinitions).length);
    for (const tool of tools) {
      assert.ok(tool.name.length > 0);
      assert.ok(tool.description.length > 0);
      assert.equal((tool.inputSchema as { type?: string }).type, 'object');
      assert.ok(!('$schema' in tool.inputSchema));
    }
  });

  it('no longer exposes the fake multi-environment surface', () => {
    const serialized = JSON.stringify(tools);
    assert.ok(!serialized.includes('environmentId'));
  });

  it('validates arguments (types, required fields, clamped pagination)', () => {
    const listRoutes = toolDefinitions.list_routes.schema;
    assert.equal(listRoutes.safeParse({ filePath: 'x' }).success, true);
    assert.equal(listRoutes.safeParse({}).success, false);
    assert.equal(listRoutes.safeParse({ filePath: 'x', limit: 0 }).success, false);
    assert.equal(listRoutes.safeParse({ filePath: 'x', limit: 101 }).success, false);
    assert.equal(listRoutes.safeParse({ filePath: 42 }).success, false);

    const parsed = listRoutes.parse({ filePath: 'x' });
    assert.equal(parsed.offset, 0);
    assert.equal(parsed.limit, 10);

    const updateRoute = toolDefinitions.update_route.schema;
    assert.equal(
      updateRoute.safeParse({ filePath: 'x', routeId: 'y', endpoint: '' }).success,
      false
    );

    const replaceDates = toolDefinitions.replace_dates_with_templates.schema;
    assert.equal(
      replaceDates.safeParse({ filePath: 'x', routeId: 'y', strategy: 'bogus' }).success,
      false
    );
    assert.equal(
      replaceDates.safeParse({ filePath: 'x', routeId: 'y', strategy: 'offset' }).success,
      true
    );
  });
});
