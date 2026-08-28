# Mockoon MCP Server

[![Open in VS Code](https://img.shields.io/badge/Open%20in-VS%20Code-blue?logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/giannirondini-maker/mockoon-mcp)
[![Open in GitHub.dev](https://img.shields.io/badge/Open%20in-GitHub.dev-181717?logo=github&logoColor=white)](https://github.dev/giannirondini-maker/mockoon-mcp)

Open this repository in a web-based editor (vscode.dev or GitHub.dev).

A Model Context Protocol (MCP) server for managing Mockoon configuration files. This server provides tools to read, create, update, and manage Mockoon mock API configurations programmatically.

## Features

- Read and parse Mockoon configuration files
- List and manage environments
- Create, read, update, and delete routes
- Manage route responses
- Replace static dates with Mockoon templates
- List data buckets
- Full TypeScript support
- **Context-optimized tools** - Reduces LLM context usage by 90%+ with:
  - Pagination for large route lists
  - Metadata-only responses (bodies loaded on-demand)
  - Quick config summaries for discovery
  - Efficient workflows for browsing and editing

## Installation

```bash
npm install
npm run build
```

## Usage

### With Claude Desktop

Add this to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mockoon": {
      "command": "node",
      "args": ["/absolute/path/to/mockoon-mcp/build/index.js"],
      "env": {
        "MOCKOON_MCP_ROOT": "/path/to/your/mockoon/configs"
      }
    }
  }
}
```

### Restricting Filesystem Access

The server reads and writes the files an MCP client points it at. Setting the optional `MOCKOON_MCP_ROOT` environment variable confines every read and write to that directory tree — recommended, since it stops a misbehaving client (or a prompt-injected LLM) from touching unrelated files. Writes are always atomic (temp file + rename), and files that don't look like Mockoon environments are refused before any mutation.

### With Other MCP Clients

Run the server using stdio transport:

```bash
npm start
```

Or for development:

```bash
npm run dev
```

## Project Structure

The codebase is organized into a modular structure for maintainability. See [ARCHITECTURE.md](doc/ARCHITECTURE.md) for detailed documentation.

- `/src/types/` - TypeScript interfaces
- `/src/utils/` - Utility functions
- `/src/tools/` - Tool definitions and handlers
- `/src/server.ts` - Server configuration
- `/src/index.ts` - Entry point

## Development Commands

```bash
npm run build      # Compile TypeScript
npm run dev        # Development mode with auto-reload
npm run lint       # Check code quality
npm run lint:fix   # Auto-fix linting issues
```

## Available Tools

### read_mockoon_config

Read and parse a Mockoon configuration file.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file

### get_config_summary

Get a quick summary of the configuration without loading full details. **Use this first** to understand config scope.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file

**Returns:** Summary with route count, response statistics, and complexity metrics.

**Example Response:**
```json
{
  "name": "My API",
  "port": 3001,
  "routeCount": 127,
  "totalResponses": 312,
  "largestResponse": "42 KB",
  "templatesUsed": 18,
  "dataBucketCount": 3,
  "dataDepth": "deep"
}
```

### list_environments

List all environments in a Mockoon configuration file.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file

### get_environment

Get details of the environment (Mockoon files contain a single environment).

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file

### list_routes

List routes in the environment with pagination support.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `offset` (number, optional): Number of routes to skip (default: 0)
- `limit` (number, optional): Maximum number of routes to return (default: 10, max: 100)

**Returns:** Paginated response with `routes`, `total`, `offset`, `limit`, `hasMore` fields.

**Example Response:**
```json
{
  "routes": [/* first 10 routes */],
  "total": 127,
  "offset": 0,
  "limit": 10,
  "hasMore": true
}
```

### get_route

Get details of a specific route with optimized response metadata.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `routeId` (string): Route UUID
- `includeBodies` (boolean, optional): Include full response bodies (default: false)

**Returns:** Route details with response metadata including `bodySize`, `bodyPreview`, `hasTemplating`, `templateCount`, `hasRules`, `ruleCount`. Full bodies only included if `includeBodies=true`.

**Example Response (default):**
```json
{
  "uuid": "abc-123",
  "method": "POST",
  "endpoint": "api/users",
  "responseCount": 1,
  "responses": [{
    "uuid": "xyz-456",
    "statusCode": 200,
    "bodySize": "1.8 KB",
    "bodyPreview": "{\"users\":[{...truncated...}]}",
    "hasTemplating": true,
    "templateCount": 3
  }]
}
```

### find_route

Find a route by endpoint path and method. Returns route UUID and response list for targeted operations. Supports partial endpoint matching.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `endpoint` (string): Endpoint path to search for (e.g., "api/users"). Supports partial matching; leading slashes are ignored when comparing.
- `method` (string, optional): HTTP method (GET, POST, etc.). If omitted and only one route matches the endpoint, it is returned directly. If multiple routes with different methods match, an `AMBIGUOUS_METHOD` error is returned listing the available choices.

**Returns:** Route details with response list including indices, or a structured error (`error_code`, `available_choices`, `hint`) when the method is needed.

**Example Response:**
```json
{
  "found": true,
  "route": {
    "uuid": "abc-123",
    "method": "GET",
    "endpoint": "/api/users",
    "enabled": true
  },
  "responses": [
    { "index": 0, "uuid": "resp-1", "label": "Success", "statusCode": 200, "default": true },
    { "index": 1, "uuid": "resp-2", "label": "Error", "statusCode": 500, "default": false }
  ]
}
```

### add_route

Add a new route to the environment. The generated route matches the full Mockoon schema: methods are stored lowercase, endpoints without a leading slash, and every schema field is populated so the file stays loadable by the Mockoon desktop app and CLI.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `method` (string): HTTP method (GET, POST, PUT, DELETE, etc.)
- `endpoint` (string): Route endpoint path
- `responseBody` (string): Response body content
- `statusCode` (number, optional): HTTP status code (default: 200)
- `documentation` (string, optional): Route documentation

### update_route

Update an existing route. Methods and endpoints are normalized to Mockoon's conventions (lowercase method, no leading slash).

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `routeId` (string): Route UUID
- `method` (string, optional): HTTP method
- `endpoint` (string, optional): Route endpoint path
- `enabled` (boolean, optional): Whether the route is enabled
- `documentation` (string, optional): Route documentation

### delete_route

Delete a route from the environment.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `routeId` (string): Route UUID

### get_response_details

Get full details of a specific response including body, headers, and rules. **Use only when you need to edit or analyze the full response body.**

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `routeId` (string): Route UUID
- `responseId` (string, optional): Response UUID (alternative to responseIndex)
- `responseIndex` (number, optional): Response index, 0-based (alternative to responseId)

**Returns:** Complete response details including full body content.

### update_response

Update a route response.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `routeId` (string): Route UUID
- `responseId` (string, optional): Response UUID (alternative to responseIndex)
- `responseIndex` (number, optional): Response index, 0-based (alternative to responseId)
- `body` (string, optional): Response body
- `statusCode` (number, optional): HTTP status code
- `label` (string, optional): Response label

### replace_dates_with_templates

Find static dates in a response body and replace them with Mockoon template syntax.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file
- `routeId` (string): Route UUID
- `responseId` (string, optional): Response UUID (alternative to responseIndex)
- `responseIndex` (number, optional): Response index, 0-based (alternative to responseId)
- `strategy` (string): Date replacement strategy - `relative` (dates relative to request), `offset` (dates offset from now), or `manual` (custom variable)
- `variableName` (string, optional): Template variable name (default: requestDate; required for `relative`)
- `offsetDays` (number, optional): Days to offset dates (for `offset` and `relative` strategies)
- `fieldPattern` (string, optional): Regex pattern to filter which fields to process (e.g., `pnr_.*` to only process fields starting with "pnr_")
- `fieldNames` (array of strings, optional): Explicit list of field names to process (e.g., `["departure_date", "arrival_date"]`)

**Strategies:**

- **relative**: Generates templates like `{{dateTimeShift date=(bodyRaw 'params.search_date') days=0}}` (date-only fields add `format='yyyy-MM-dd'`) - dates relative to request body values
- **offset**: Generates templates like `{{dateTimeShift days=5}}` (date-only fields add `format='yyyy-MM-dd'`) - dates offset from current time
- **manual**: Generates templates like `{{customVariable}}` - note that **every matched field receives the same variable**, so always scope manual calls with `fieldPattern` or `fieldNames`

**Field Targeting:**

When you need different strategies for different date fields in the same response, use `fieldPattern` or `fieldNames` to target specific fields:

```javascript
// Replace only pnr_creation_date fields with offset strategy
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "route-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 7,
  fieldPattern: "pnr_creation_date"  // Or use fieldNames: ["pnr_creation_date"]
})

// Then replace departure dates with relative strategy
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "route-123",
  responseIndex: 0,
  strategy: "relative",
  variableName: "params.bookingDate",
  fieldPattern: "departure_.*"  // Matches departure_timestamp, departure_date, etc.
})
```

---

## Complex Date Replacement Workflows

This section explains how to handle complex scenarios involving multiple date fields and different replacement strategies. **This is critical for avoiding file corruption** - always use `replace_dates_with_templates` for date operations, never `update_response` with manual JSON edits.

### Multi-Strategy Date Replacement

When you need to replace dates with different strategies in the same response:

1. **Locate the route**: Use `find_route` to get routeId and response indices
2. **Sequential replacement**: Call `replace_dates_with_templates` multiple times
3. **Target specific fields**: Use `fieldPattern` or `fieldNames` to control which dates are replaced

#### Example A: Single Response, Multiple Fields, Different Strategies

**Scenario**: A booking response has `pnr_creation_date` (should be offset from today) and `departure_timestamp` (should be relative to request parameter).

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/config.json",
  endpoint: "api/bookings",
  method: "POST"
})
// Returns: { routeId: "abc-123", responses: [{ index: 0, uuid: "..." }] }

// Step 2: Replace pnr_creation_date with offset strategy (+7 days)
replace_dates_with_templates({
  filePath: "/path/to/config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 7,
  fieldPattern: "pnr_creation_date"
})

// Step 3: Replace departure_timestamp with relative strategy
replace_dates_with_templates({
  filePath: "/path/to/config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "relative",
  variableName: "params.departure_date",
  fieldPattern: "departure_.*"
})
```

#### Example B: Multiple Responses, Same Fields, Different Strategies

**Scenario**: A route has two responses (success and alternate). Both have date fields but need different templating.

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/config.json",
  endpoint: "api/orders",
  method: "GET"
})
// Returns: { routeId: "xyz-789", responses: [{ index: 0, ... }, { index: 1, ... }] }

// Step 2: Process first response (index 0) - offset dates by 14 days
replace_dates_with_templates({
  filePath: "/path/to/config.json",
  routeId: "xyz-789",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 14
})

// Step 3: Process second response (index 1) - relative to request
replace_dates_with_templates({
  filePath: "/path/to/config.json",
  routeId: "xyz-789",
  responseIndex: 1,
  strategy: "relative",
  variableName: "params.order_date"
})
```

#### Example C: Multiple Responses, Multiple Fields, Mixed Strategies

**Scenario**: Complex booking API with two responses, each needing different strategies for different fields.

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/config.json",
  endpoint: "dypapi/dp/dp_bookings_enriched",
  method: "POST"
})

// Step 2: First response - pnr_creation_date with offset (+7 days)
replace_dates_with_templates({
  filePath: "/path/to/config.json",
  routeId: "route-uuid",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 7,
  fieldPattern: "pnr_creation_date"
})

// Step 3: First response - departure_timestamp with relative
replace_dates_with_templates({
  filePath: "/path/to/config.json",
  routeId: "route-uuid",
  responseIndex: 0,
  strategy: "relative",
  variableName: "params.param_array.0.bookingdate",
  fieldPattern: "departure_timestamp.*"
})

// Step 4: Second response - departure_timestamp with offset (+7 days)
replace_dates_with_templates({
  filePath: "/path/to/config.json",
  routeId: "route-uuid",
  responseIndex: 1,
  strategy: "offset",
  offsetDays: 7,
  fieldPattern: "departure_timestamp.*"
})

// Step 5: Second response - pnr_creation_date with relative
replace_dates_with_templates({
  filePath: "/path/to/config.json",
  routeId: "route-uuid",
  responseIndex: 1,
  strategy: "relative",
  variableName: "params.param_array.0.startDate",
  fieldPattern: "pnr_creation_date"
})
```

### Using responseIndex for Direct Targeting

The `responseIndex` parameter allows you to target responses by their position (0-based) instead of UUID:

| Parameter | Use Case |
|-----------|----------|
| `responseIndex: 0` | First response in the route |
| `responseIndex: 1` | Second response in the route |
| `responseId: "uuid-..."` | Target by specific UUID |

**Preferred workflow with responseIndex:**
```
1. find_route(endpoint, method) → Get routeId and response list with indices
2. replace_dates_with_templates(routeId, responseIndex=0, ...) → Process first response
3. replace_dates_with_templates(routeId, responseIndex=1, ...) → Process second response
```

### Idempotency and Skipping Already-Templated Dates

The tool is **idempotent** - values already containing Mockoon templates never match the date detector, so:

- ✅ You can safely call the tool multiple times
- ✅ A second run over a fully templated response reports `operationPerformed: false`
- ✅ No risk of corrupting existing templates

**Example output:**
```json
{
  "success": true,
  "operationPerformed": true,
  "statistics": { "datesFound": 3, "datesReplaced": 3 },
  "details": [
    {
      "field": "order_date",
      "path": "order_date",
      "originalValue": "2024-01-15",
      "template": "{{dateTimeShift days=0 format='yyyy-MM-dd'}}"
    }
  ]
}
```

### ⚠️ Important: What NOT to Do

**NEVER** use `update_response` for date replacement operations. This can corrupt the Mockoon file structure:

```javascript
// ❌ WRONG - DO NOT DO THIS
update_response({
  filePath: "config.json",
  routeId: "route-123",
  responseIndex: 0,
  body: '{"date": "{{now \'yyyy-MM-dd\'}}"}' // Manual JSON editing
})

// ✅ CORRECT - Always use the specialized tool
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "route-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 0
})
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "No date patterns found" | Check that the response body contains valid ISO 8601 dates (e.g., `2024-01-15`, `2024-01-15T10:30`, `2024-01-15T10:30:00Z`, fractional seconds and `±HH:mm` offsets are supported) |
| Field not being replaced | Use `fieldPattern` with a regex that matches the field name, or specify exact names with `fieldNames` |
| Wrong dates replaced | Be more specific with `fieldPattern` - use anchors like `^pnr_` for "starts with" |
| Template syntax errors | Verify the `variableName` matches the actual request body structure |
| Multiple strategies needed | Call the tool multiple times, once per strategy, targeting different fields |

See [doc/EXAMPLES_DATE_REPLACEMENT.md](doc/EXAMPLES_DATE_REPLACEMENT.md) for more detailed examples.

---

**Example Usage:**

Once you have connected this MCP server to Claude Desktop or another MCP client, you can use natural language commands like:

```
For file '/path/to/mockoon-config.json', use just MCP tools to find the desired route/s and replace dates.
Replace the static dates in the first and second responses of the route `/api/users` with method `GET`.
For the first response I want to use the offset strategy, adding one week from today, while for the second response, I want to use the relative strategy, using this variable name as placeholder `params.param_array.0.my_variable`.
```

### list_data_buckets

List all data buckets in the environment.

**Parameters:**

- `filePath` (string): Path to the Mockoon configuration file

## Project Structure

The codebase is organized into a modular structure for maintainability. See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation.

- `/src/types/` - TypeScript interfaces
- `/src/utils/` - Utility functions
- `/src/tools/` - Tool definitions and handlers
- `/src/server.ts` - Server configuration
- `/src/index.ts` - Entry point

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode with auto-reload
npm run dev

# Run the unit test suite
npm test

# Run the end-to-end suite (spawns the built server over stdio)
npm run test:e2e

# Also verify rendering against the real Mockoon CLI (downloads @mockoon/cli, binds a port)
MOCKOON_E2E_RENDER=1 npm run test:e2e

# Everything
npm run test:all
```

## Example Usage

Once connected to Claude Desktop or another MCP client, you can use natural language commands like:

- "List all environments in my Mockoon config at /path/to/config.json"
- "Add a new GET route to the 'API' environment at /users with a 200 response"
- "Show me all routes in the 'Development' environment"
- "Update the response body for route xyz to include user data"
- "Delete the route with UUID abc123"

## Mockoon Configuration Format

This server works with standard Mockoon configuration files (typically `.json` files exported from Mockoon). The configuration includes:

- **Environments**: Mock API server instances with their own port and hostname
- **Routes**: API endpoints with HTTP methods and responses
- **Responses**: Response configurations including status codes, headers, and bodies
- **Data Buckets**: Reusable data templates
- **Callbacks**: Webhook configurations

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
