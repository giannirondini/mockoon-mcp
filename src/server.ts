/**
 * MCP Server setup and request handlers
 */

import { readFileSync } from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { tools, toolDefinitions, ToolName } from './tools/definitions.js';
import { errorResult, ToolResult } from './utils/response.js';
import {
  handleReadConfig,
  handleGetConfigSummary,
  handleListEnvironments,
  handleGetEnvironment,
  handleListRoutes,
  handleGetRoute,
  handleAddRoute,
  handleUpdateRoute,
  handleDeleteRoute,
  handleFindRoute,
  handleUpdateResponse,
  handleGetResponseDetails,
  handleListDataBuckets,
  handleReplaceDatesWithTemplates,
} from './tools/handlers/index.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as { name: string; version: string };

/**
 * One handler per tool, typed against the tool's zod schema so handler
 * signatures cannot drift from the advertised input schema.
 */
const handlers: {
  [K in ToolName]: (args: z.output<(typeof toolDefinitions)[K]['schema']>) => Promise<ToolResult>;
} = {
  read_mockoon_config: handleReadConfig,
  get_config_summary: handleGetConfigSummary,
  find_route: handleFindRoute,
  list_environments: handleListEnvironments,
  get_environment: handleGetEnvironment,
  list_routes: handleListRoutes,
  get_route: handleGetRoute,
  add_route: handleAddRoute,
  update_route: handleUpdateRoute,
  delete_route: handleDeleteRoute,
  get_response_details: handleGetResponseDetails,
  update_response: handleUpdateResponse,
  list_data_buckets: handleListDataBuckets,
  replace_dates_with_templates: handleReplaceDatesWithTemplates,
};

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: 'mockoon-mcp',
      version: packageJson.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Call tool handler: validate arguments against the tool's zod schema
  // before dispatching, and surface every failure in the shared
  // { success: false, error, ... } grammar.
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    if (!(name in handlers)) {
      return errorResult(`Unknown tool: ${name}`, { error_code: 'UNKNOWN_TOOL' });
    }
    const toolName = name as ToolName;

    const parsed = toolDefinitions[toolName].schema.safeParse(args ?? {});
    if (!parsed.success) {
      return errorResult('Invalid arguments', {
        error_code: 'INVALID_ARGUMENTS',
        issues: parsed.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    try {
      return await handlers[toolName](parsed.data as never);
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  });

  return server;
}
