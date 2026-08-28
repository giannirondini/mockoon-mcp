/**
 * MCP tool definitions.
 *
 * Zod schemas are the single source of truth: they validate arguments at
 * dispatch time (see server.ts) and generate the JSON Schema advertised to
 * clients, so the two can never drift.
 */

import { z } from 'zod/v4';

const filePath = z.string().min(1).describe('Path to the Mockoon configuration file');
const routeId = z.string().min(1).describe('Route UUID');
const responseId = z
  .string()
  .min(1)
  .optional()
  .describe('Response UUID (alternative to responseIndex)');
const responseIndex = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Response index (0-based position in the responses array, alternative to responseId)');

export const toolDefinitions = {
  read_mockoon_config: {
    description: 'Read and parse a Mockoon configuration file',
    schema: z.object({ filePath }),
  },
  get_config_summary: {
    description: 'Get a quick summary of the configuration without loading full details',
    schema: z.object({ filePath }),
  },
  find_route: {
    description:
      'Find a route by endpoint path and method. Returns route UUID and response list for targeted operations. Supports partial endpoint matching; leading slashes are ignored when comparing.',
    schema: z.object({
      filePath,
      endpoint: z
        .string()
        .min(1)
        .describe('Endpoint path to search for (e.g., "api/users"). Supports partial matching.'),
      method: z
        .string()
        .min(1)
        .optional()
        .describe(
          'HTTP method (GET, POST, etc.). Optional - if omitted and multiple methods exist for the endpoint, an AMBIGUOUS_METHOD error listing the choices is returned.'
        ),
    }),
  },
  list_environments: {
    description:
      'List the environment contained in a Mockoon configuration file (one environment per file)',
    schema: z.object({ filePath }),
  },
  get_environment: {
    description: 'Get details of the environment (single environment per file)',
    schema: z.object({ filePath }),
  },
  list_routes: {
    description: 'List routes in the environment with pagination support',
    schema: z.object({
      filePath,
      offset: z.number().int().min(0).default(0).describe('Number of routes to skip (default: 0)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe('Maximum number of routes to return (default: 10, max: 100)'),
    }),
  },
  get_route: {
    description: 'Get details of a specific route with optimized response metadata',
    schema: z.object({
      filePath,
      routeId,
      includeBodies: z
        .boolean()
        .default(false)
        .describe('Include full response bodies (default: false, returns metadata only)'),
    }),
  },
  add_route: {
    description:
      'Add a new route to the environment. The generated route matches the full Mockoon schema (lowercase method, no leading slash on the endpoint).',
    schema: z.object({
      filePath,
      method: z.string().min(1).describe('HTTP method (GET, POST, PUT, DELETE, etc.)'),
      endpoint: z.string().min(1).describe('Route endpoint path'),
      responseBody: z.string().describe('Response body content'),
      statusCode: z.number().int().min(100).max(999).default(200).describe('HTTP status code'),
      documentation: z.string().optional().describe('Route documentation'),
    }),
  },
  update_route: {
    description: 'Update an existing route',
    schema: z.object({
      filePath,
      routeId,
      method: z.string().min(1).optional().describe('HTTP method'),
      endpoint: z.string().min(1).optional().describe('Route endpoint path'),
      enabled: z.boolean().optional().describe('Whether the route is enabled'),
      documentation: z.string().optional().describe('Route documentation'),
    }),
  },
  delete_route: {
    description: 'Delete a route from the environment',
    schema: z.object({ filePath, routeId }),
  },
  get_response_details: {
    description:
      'Get full details of a specific response including body, headers, and rules. Use either responseId (UUID) or responseIndex (0-based position).',
    schema: z.object({ filePath, routeId, responseId, responseIndex }),
  },
  update_response: {
    description:
      'Update a route response. Use either responseId (UUID) or responseIndex (0-based position).',
    schema: z.object({
      filePath,
      routeId,
      responseId,
      responseIndex,
      body: z.string().optional().describe('Response body'),
      statusCode: z.number().int().min(100).max(999).optional().describe('HTTP status code'),
      label: z.string().optional().describe('Response label'),
    }),
  },
  list_data_buckets: {
    description: 'List all data buckets in the environment',
    schema: z.object({ filePath }),
  },
  replace_dates_with_templates: {
    description:
      'Find static ISO 8601 dates in a response body and replace them with Mockoon template syntax. Supported formats: "2024-01-15", "2024-01-15T10:30", "2024-01-15T10:30:00", fractional seconds, and Z/±HH:mm timezone offsets. Strategies: relative (dates shifted from a request-body date), offset (dates offset from the current time), or manual (a custom template variable — note: EVERY matched field receives the same variable, so scope manual calls with fieldPattern or fieldNames). Use either responseId (UUID) or responseIndex (0-based position). Can be called MULTIPLE times per response to apply different strategies to different fields. Already-templated dates never match, so repeated runs are idempotent.',
    schema: z.object({
      filePath,
      routeId,
      responseId,
      responseIndex,
      strategy: z
        .enum(['relative', 'offset', 'manual'])
        .describe(
          'Date replacement strategy: relative=shift from a request body date, offset=offset from current date, manual=custom template variable'
        ),
      variableName: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Template variable name (default: requestDate). For relative strategy, use a request body path like "param_array.0.filters.search_date.0.string.gte"'
        ),
      offsetDays: z
        .number()
        .int()
        .default(0)
        .describe(
          'Number of days to offset dates (used with offset and relative strategies, default: 0)'
        ),
      fieldPattern: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Regex pattern to filter which date fields to process. Only fields with names matching this pattern will be replaced. Example: "pnr_.*" matches pnr_date, pnr_creation_date. Use for multi-strategy scenarios where different fields need different strategies.'
        ),
      fieldNames: z
        .array(z.string().min(1))
        .optional()
        .describe(
          'Explicit list of field names to process. Only these exact field names will have their dates replaced. Example: ["order_date", "ship_date"]. Alternative to fieldPattern for precise targeting.'
        ),
    }),
  },
} as const;

export type ToolName = keyof typeof toolDefinitions;

/**
 * Tool list advertised to MCP clients, with JSON Schemas derived from the
 * zod schemas above.
 */
export const tools = (Object.keys(toolDefinitions) as ToolName[]).map(name => {
  const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(toolDefinitions[name].schema, {
    io: 'input',
  }) as Record<string, unknown>;
  return {
    name,
    description: toolDefinitions[name].description,
    inputSchema,
  };
});
