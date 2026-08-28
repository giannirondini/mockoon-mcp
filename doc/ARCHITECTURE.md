# Project Structure

## Directory Layout

```
src/
├── index.ts                    # Entry point - starts the MCP server
├── server.ts                   # Server configuration and request routing
├── types/
│   └── mockoon.ts             # TypeScript interfaces for Mockoon data structures
├── utils/
│   ├── config.ts              # File I/O (validated reads, atomic writes, optional root confinement)
│   ├── response.ts            # findResponse + shared jsonResult/errorResult result contract
│   ├── date-template.ts       # ISO date detection and Mockoon template generation
│   └── mockoon-defaults.ts    # Schema-complete route/response factories, method/endpoint normalization
└── tools/
    ├── definitions.ts         # MCP tool definitions (schemas)
    └── handlers/              # Tool implementation handlers
        ├── index.ts           # Handler exports
        ├── config-handlers.ts     # Configuration reading tools
        ├── environment-handlers.ts # Environment management tools
        ├── route-handlers.ts      # Route CRUD operations
        ├── response-handlers.ts   # Response modification tools
        ├── databucket-handlers.ts # Data bucket tools
        └── date-template-handlers.ts # Date template replacement tools
```

## Module Responsibilities

### Entry Point (`index.ts`)

- Minimal entry point that bootstraps the server
- Handles transport setup (stdio)
- Error handling for server startup

### Server Setup (`server.ts`)

- Creates and configures the MCP server
- Registers request handlers
- Routes tool calls to appropriate handlers

### Types (`types/mockoon.ts`)

- All TypeScript interfaces for Mockoon configuration structures
- Centralized type definitions used throughout the codebase

### Utilities (`utils/`)

- **config.ts**: File I/O operations, configuration reading and writing, path resolution, and body metadata utilities (size calculation, previews, templating detection)
- **date-template.ts**: Date pattern detection and Mockoon template generation utilities

### Tool Definitions (`tools/definitions.ts`)

- MCP tool schemas with JSON Schema validation
- Tool metadata (name, description, parameters)

### Tool Handlers (`tools/handlers/`)

Organized by functional area:

- **config-handlers**: Read configuration files, get config summaries
- **environment-handlers**: List and get environments
- **route-handlers**: CRUD operations for routes, find route by endpoint
- **response-handlers**: Update route responses, get response details
- **date-template-handlers**: Replace static dates with Mockoon templates
- **databucket-handlers**: List data buckets

## Code Quality

### ESLint Configuration

The project uses ESLint with TypeScript support:

- Detects unused variables and imports
- Warns about `any` types
- Enforces consistent code style
- Configured in `eslint.config.mjs`

### Development Commands

```bash
npm run build      # Compile TypeScript
npm run dev        # Development mode with auto-reload
npm test           # Unit tests (node:test via tsx, tests/ directory)
npm run test:e2e   # E2E: spawns build/index.js and drives it over real stdio JSON-RPC
                   # (tests/e2e/; set MOCKOON_E2E_RENDER=1 to also serve the templated
                   #  fixture with @mockoon/cli and assert the rendered dates)
npm run test:all   # Unit + E2E
npm run lint       # Check code quality
npm run lint:fix   # Auto-fix linting issues
npm run prettier   # Format code with Prettier
```

### Input Validation

Tool arguments are validated at dispatch time with zod (`src/tools/definitions.ts`).
The zod schemas are the single source of truth: the JSON Schemas advertised to
MCP clients are generated from them, and each handler's signature is typed
against its schema in `server.ts`, so the three can never drift.

### File Safety

- Reads validate that the parsed JSON is plausibly a Mockoon environment
  (`uuid` + `routes`) before any tool operates on it.
- Writes go to a temp file in the same directory followed by an atomic rename,
  so a crash mid-write can never leave a truncated config.
- Setting the `MOCKOON_MCP_ROOT` environment variable confines all reads and
  writes to that directory tree.

## Context Optimization Architecture

The server implements several optimizations to reduce LLM context pollution:

### Direct Endpoint Lookup
- New `find_route` tool for direct route discovery by endpoint path and method
- Returns route UUID and response list with indices
- Supports partial endpoint matching
- Eliminates need to paginate through routes for common operations

### Response Index Support
- Tools `get_response_details`, `update_response`, and `replace_dates_with_templates` support `responseIndex`
- Use 0-based index as alternative to UUID
- Enables quick access: `find_route` → `replace_dates_with_templates(responseIndex=0)`

### Pagination System
- `list_routes` supports `offset` and `limit` parameters
- Default page size: 10 routes
- Returns metadata: `total`, `offset`, `limit`, `hasMore`
- Reduces context by ~90% for large configs

### Metadata-First Approach
- `get_route` returns response metadata by default
- Includes: `bodySize`, `bodyPreview` (100 chars), `hasTemplating`, `templateCount`, `hasRules`, `ruleCount`
- Full bodies loaded only when `includeBodies=true`
- Reduces context by ~85% per route

### On-Demand Body Loading
- `get_response_details` tool for explicit body retrieval
- Separates route structure exploration from body editing
- Only fetches full bodies when necessary

### Quick Summaries
- `get_config_summary` tool for config overview
- Returns aggregate stats without loading full config
- Helps LLM decide which detailed tools to call
- Reduces initial context by ~99%

### Utility Functions
The `config.ts` module provides:
- `getBodySize()`: Human-readable size formatting
- `getBodyPreview()`: Truncated body preview
- `hasTemplating()`: Mockoon template detection
- `countTemplates()`: Template expression counting

The `date-template.ts` module provides:
- `isIsoDateString()`: ISO 8601 detection with real-calendar-date validation
- `findDatePatterns()`: date detection with field filtering; paths are captured
  as segment arrays so keys containing dots are handled correctly
- `replaceDatesWithTemplates()`: template generation with detailed results
- `matchesFieldFilter()`: field name pattern matching


## Date Template Replacement Architecture

The `replace_dates_with_templates` tool implements several advanced features:

### Field-Specific Targeting
- `fieldPattern`: Regex pattern to match specific field names
- `fieldNames`: Explicit list of field names to process
- Enables multi-strategy workflows where different fields need different strategies

### Idempotency
- The date detector is anchored, so values already carrying Mockoon templates
  (`{{...}}`) can never match — repeated runs are inherently safe
- A second run over a fully templated response reports `operationPerformed: false`
- Returns statistics: `datesFound` and `datesReplaced`

### Validation & Error Handling
- Arguments validated with zod before dispatch
- Pre-flight validation of the response body's JSON structure
- Atomic file writes — a failed write leaves the original file untouched
- Detailed error messages with recovery suggestions, all in the shared
  `{ success: false, error, ... }` grammar

### Multi-Strategy Workflow
The recommended workflow for complex date replacement:
```
1. find_route(endpoint, method) → Get routeId and responseIndex
2. replace_dates_with_templates(responseIndex=0, strategy=A, fieldPattern=X)
3. replace_dates_with_templates(responseIndex=0, strategy=B, fieldPattern=Y)
4. Repeat for additional responses as needed
```

See [EXAMPLES_DATE_REPLACEMENT.md](EXAMPLES_DATE_REPLACEMENT.md) for detailed examples.

## Benefits of This Structure

1. **Separation of Concerns**: Each file has a single, clear responsibility
2. **Maintainability**: Easy to find and modify specific functionality
3. **Testability**: Handlers can be unit tested independently
4. **Scalability**: New tools can be added by creating new handler files
5. **Type Safety**: Centralized types prevent duplication and inconsistencies
6. **Code Quality**: ESLint catches common issues during development
7. **Context Efficiency**: Optimized tools reduce LLM context usage by 90%+
8. **Idempotency**: Date replacement is safe to repeat without data corruption
