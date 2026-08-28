# Mockoon MCP Server

## Project Overview

This is a Model Context Protocol (MCP) server for manipulating Mockoon configuration files. It provides tools to read, modify, and manage Mockoon environments, routes, responses, and data buckets programmatically.

## Technology Stack

- TypeScript 5.6
- MCP SDK ^1.30
- Zod 3.25 (v4 API via `zod/v4`) — validates tool arguments at dispatch and generates the JSON Schemas advertised to clients
- Node.js 22+
- Tests: node:test runner via tsx (`npm test`, `tests/` directory)

## Available Tools

### Configuration Tools
1. **read_mockoon_config** - Read and parse Mockoon configuration files
2. **get_config_summary** - Get quick config overview (route count, response stats, complexity) ⚡ *Optimized - use first*

### Environment Tools
3. **list_environments** - List the environment in a configuration (Mockoon files hold one environment; there is no environment selector parameter)
4. **get_environment** - Get details of the environment

### Route Tools
5. **list_routes** - List routes with pagination support (offset, limit) ⚡ *Optimized - 10 routes default*
6. **get_route** - Get route details with metadata only (no bodies by default) ⚡ *Optimized*
7. **find_route** - Find a route by endpoint path and method ⚡ *NEW - Preferred for direct lookup*
8. **add_route** - Add a new route (schema-complete: lowercase method, slashless endpoint, all Mockoon fields populated)
9. **update_route** - Update an existing route (method/endpoint normalized to Mockoon conventions)
10. **delete_route** - Delete a route from the environment

### Response Tools
11. **get_response_details** - Get full response body, headers, rules ⚡ *Supports responseIndex*
12. **update_response** - Update a route response ⚡ *Supports responseIndex*

### Template & Data Tools
13. **replace_dates_with_templates** - Replace static dates with Mockoon template syntax ⚡ *Supports responseIndex*
14. **list_data_buckets** - List data buckets in an environment

## Context Optimization Guidelines

⚡ **Important**: This server is optimized to reduce LLM context pollution:

- **Discovery Phase (by endpoint)**: Use `find_route(endpoint, method)` → get route and response UUIDs directly
- **Discovery Phase (browsing)**: Use `get_config_summary` → `list_routes` (paginated) → `get_route` (metadata)
- **Editing Phase**: Use `get_response_details` or action tools with `responseIndex` for quick access
- **Avoid**: Loading full configs or all routes at once unless necessary

### Preferred Tool Usage Pattern (Endpoint-based):
```
1. find_route(endpoint="/api/orders", method="GET") → { routeId, responses: [{index: 0, uuid: "..."}] }
2. replace_dates_with_templates(routeId, responseIndex=0, strategy="offset") → Done!
```

### Alternative Tool Usage Pattern (Browsing):
```
1. get_config_summary → Understand scope (127 routes, 312 responses)
2. list_routes(offset=0, limit=10) → Browse first 10 routes
3. get_route(routeId) → See metadata (bodySize: 1.8KB, templateCount: 3)
4. get_response_details(routeId, responseIndex=0) → Get full body when editing
```


---

## Date Replacement Tool Usage Patterns

### ⚠️ CRITICAL: Tool Selection for Date Operations

When the user requests date replacement, templating, or any date-related modifications:

1. **ALWAYS** use `replace_dates_with_templates` tool
2. **NEVER** use `update_response` or manual JSON editing for date operations
3. **Multiple invocations are supported and encouraged** for multi-strategy scenarios

Using `update_response` for date operations can corrupt the Mockoon file structure. The specialized `replace_dates_with_templates` tool handles JSON parsing, template generation, and validation automatically.

### Multi-Strategy Workflow Pattern

When a single response requires multiple date replacement strategies (e.g., different strategies for different fields):

**Step 1**: Use `find_route(endpoint, method)` to get routeId and response indices

**Step 2**: For EACH date field/strategy combination, call `replace_dates_with_templates` with:
- `routeId`: from step 1
- `responseIndex`: 0-based index (e.g., 0 for first response)
- `strategy`: "offset", "relative", or "manual"
- `fieldPattern`: regex to target specific fields (e.g., `pnr_.*` for fields starting with "pnr_")
- Strategy-specific parameters (`offsetDays`, `variableName`, etc.)

### Complete Example: Multi-Strategy Date Replacement

**User Request**: "Replace dates in route `/api/bookings`: use offset (+7 days) for `pnr_creation_date`, use relative strategy with variable `params.departure_date` for `departure_timestamp`"

**Correct Tool Sequence**:
```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/config.json",
  endpoint: "api/bookings"
})
// Returns: { routeId: "abc-123", responses: [{ index: 0, uuid: "..." }] }

// Step 2: Replace pnr_creation_date with offset strategy
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
  fieldPattern: "departure_timestamp"
})
```

### Decision Tree

```
User requests date replacement
│
├─ Single field OR all fields, same strategy?
│  └─ Call replace_dates_with_templates ONCE
│     (omit fieldPattern to replace all dates)
│
├─ Multiple fields, DIFFERENT strategies in ONE response?
│  └─ Call replace_dates_with_templates MULTIPLE times:
│     - Each call targets specific fields via fieldPattern
│     - Use same responseIndex for all calls
│     - Different strategy/parameters per call
│
└─ Multiple responses, each with date replacements?
   └─ For EACH response:
      └─ Call replace_dates_with_templates with appropriate responseIndex
         (and repeat for each strategy if multi-field)
```

### Field-Specific Replacement Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `fieldPattern` | Regex pattern to match field names | `pnr_.*` matches `pnr_date`, `pnr_creation_date` |
| `fieldNames` | Explicit list of field names | `["order_date", "ship_date"]` |
| Neither | Process ALL date fields in response | Replaces every ISO date found |

### Idempotency Behavior

The tool is **idempotent**:
- Values already carrying Mockoon templates never match the date detector
- Safe to call multiple times; a fully templated response reports `operationPerformed: false`
- Returns statistics (`datesFound`, `datesReplaced`)
- No risk of corrupting existing templates

### Common Mistakes to Avoid

| ❌ Wrong Approach | ✅ Correct Approach |
|-------------------|---------------------|
| Using `update_response` with manual JSON | Use `replace_dates_with_templates` |
| Editing JSON body directly | Let the tool handle JSON parsing |
| Single call for multiple strategies | Multiple calls with `fieldPattern` |
| Guessing responseId UUIDs | Use `find_route` to get indices |

---

## Development Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run in development mode with auto-reload
- `npm start` - Run the compiled server
- `npm test` - Run the unit test suite (node:test via tsx)
- `npm run test:e2e` - End-to-end: drives the built server over real stdio JSON-RPC; `MOCKOON_E2E_RENDER=1` additionally serves the templated fixture with @mockoon/cli and asserts rendered dates
- `npm run lint` - Check code quality with ESLint
- `npm run lint:fix` - Auto-fix linting issues

## Documentation Maintenance

⚠️ **Important**: When making major changes to the codebase, always update:

1. **README.md** - User-facing documentation, features, usage
2. **doc/ARCHITECTURE.md** - Technical architecture, structure, design decisions
3. **.github/copilot-instructions.md** - This file, project context for AI assistants

Major changes include: new features, structural refactoring, API changes, new tools, or significant architectural decisions.

## Configuration

Configure this server in Claude Desktop by adding to your MCP settings:

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

`MOCKOON_MCP_ROOT` is optional but recommended: when set, every read and write is confined to that directory tree.

## Project Structure

- `/src/` - Source code organized by functionality
  - `/types/` - TypeScript type definitions
  - `/utils/` - Utility functions
  - `/tools/` - MCP tool definitions and handlers
  - `index.ts` - Entry point
  - `server.ts` - Server configuration
- `/build/` - Compiled JavaScript output
- `/tests/` - Test suite (node:test)
- `/doc/` - Project documentation
  - `ARCHITECTURE.md` - Detailed architecture documentation

For detailed architecture information, see [doc/ARCHITECTURE.md](../doc/ARCHITECTURE.md).
