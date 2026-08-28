/**
 * Handlers for route-related tools
 */

import {
  readMockoonConfig,
  writeMockoonConfig,
  getBodySize,
  getBodyPreview,
  hasTemplating,
  countTemplates,
} from '../../utils/config.js';
import {
  buildResponse,
  buildRoute,
  normalizeEndpoint,
  normalizeMethod,
  MOCKOON_METHODS,
} from '../../utils/mockoon-defaults.js';
import { jsonResult, errorResult } from '../../utils/response.js';
import { Route, OptimizedResponseMetadata, OptimizedResponseFull } from '../../types/mockoon.js';

export async function handleListRoutes(args: {
  filePath: string;
  offset?: number;
  limit?: number;
}) {
  const { filePath, offset = 0, limit = 10 } = args;
  const config = await readMockoonConfig(filePath);

  const total = config.routes.length;
  const paginatedRoutes = config.routes.slice(offset, offset + limit);

  const routes = paginatedRoutes.map(route => ({
    uuid: route.uuid,
    method: route.method,
    endpoint: route.endpoint,
    enabled: route.enabled,
    responseCount: route.responses.length,
    documentation: route.documentation,
  }));

  return jsonResult({
    routes,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
  });
}

export async function handleGetRoute(args: {
  filePath: string;
  routeId: string;
  includeBodies?: boolean;
}) {
  const { filePath, routeId, includeBodies = false } = args;
  const config = await readMockoonConfig(filePath);

  const route = config.routes.find(r => r.uuid === routeId);

  if (!route) {
    return errorResult(`Route not found: ${routeId}`, {
      suggestion: 'Use find_route or list_routes to get a valid routeId',
    });
  }

  // Optimize response data based on includeBodies flag
  const optimizedRoute = {
    uuid: route.uuid,
    method: route.method,
    endpoint: route.endpoint,
    enabled: route.enabled,
    documentation: route.documentation,
    responseCount: route.responses.length,
    responses: route.responses.map(
      (response): OptimizedResponseMetadata | OptimizedResponseFull => {
        const baseResponse: OptimizedResponseMetadata = {
          uuid: response.uuid,
          label: response.label,
          statusCode: response.statusCode,
          default: response.default,
          bodySize: getBodySize(response.body || ''),
          bodyPreview: getBodyPreview(response.body || ''),
          hasTemplating: hasTemplating(response.body || ''),
          templateCount: countTemplates(response.body || ''),
          hasRules: !!(response.rules && response.rules.length > 0),
          ruleCount: response.rules?.length || 0,
        };

        // Only include full body if explicitly requested
        if (includeBodies) {
          return {
            ...baseResponse,
            body: response.body,
            headers: response.headers,
            rules: response.rules,
          } as OptimizedResponseFull;
        }

        return baseResponse;
      }
    ),
  };

  return jsonResult(optimizedRoute);
}

export async function handleAddRoute(args: {
  filePath: string;
  method: string;
  endpoint: string;
  responseBody: string;
  statusCode?: number;
  documentation?: string;
}) {
  const { filePath, method, endpoint, responseBody, statusCode = 200, documentation } = args;

  const normalizedMethod = normalizeMethod(method);
  if (!normalizedMethod) {
    return errorResult(`Unsupported HTTP method: ${method}`, {
      error_code: 'INVALID_METHOD',
      supportedMethods: MOCKOON_METHODS,
    });
  }

  const config = await readMockoonConfig(filePath);

  const newRoute: Route = buildRoute({
    method: normalizedMethod,
    endpoint,
    documentation,
    responses: [
      buildResponse({
        body: responseBody,
        statusCode,
        label: 'Default response',
        isDefault: true,
      }),
    ],
  });

  config.routes.push(newRoute);
  await writeMockoonConfig(filePath, config);

  return jsonResult({
    success: true,
    message: `Route added: ${newRoute.method} /${newRoute.endpoint}`,
    routeId: newRoute.uuid,
    method: newRoute.method,
    endpoint: newRoute.endpoint,
  });
}

export async function handleUpdateRoute(args: {
  filePath: string;
  routeId: string;
  method?: string;
  endpoint?: string;
  enabled?: boolean;
  documentation?: string;
}) {
  const { filePath, routeId, method, endpoint, enabled, documentation } = args;

  const config = await readMockoonConfig(filePath);

  const route = config.routes.find(r => r.uuid === routeId);

  if (!route) {
    return errorResult(`Route not found: ${routeId}`, {
      suggestion: 'Use find_route or list_routes to get a valid routeId',
    });
  }

  if (method !== undefined) {
    const normalizedMethod = normalizeMethod(method);
    if (!normalizedMethod) {
      return errorResult(`Unsupported HTTP method: ${method}`, {
        error_code: 'INVALID_METHOD',
        supportedMethods: MOCKOON_METHODS,
      });
    }
    route.method = normalizedMethod;
  }
  if (endpoint !== undefined) route.endpoint = normalizeEndpoint(endpoint);
  if (enabled !== undefined) route.enabled = enabled;
  if (documentation !== undefined) route.documentation = documentation;

  await writeMockoonConfig(filePath, config);

  return jsonResult({
    success: true,
    message: `Route updated: ${route.method} /${route.endpoint}`,
    routeId: route.uuid,
  });
}

export async function handleDeleteRoute(args: { filePath: string; routeId: string }) {
  const { filePath, routeId } = args;

  const config = await readMockoonConfig(filePath);

  const routeIndex = config.routes.findIndex(r => r.uuid === routeId);

  if (routeIndex === -1) {
    return errorResult(`Route not found: ${routeId}`, {
      suggestion: 'Use find_route or list_routes to get a valid routeId',
    });
  }

  const deletedRoute = config.routes[routeIndex];
  config.routes.splice(routeIndex, 1);
  await writeMockoonConfig(filePath, config);

  return jsonResult({
    success: true,
    message: `Route deleted: ${deletedRoute.method} /${deletedRoute.endpoint}`,
    routeId: deletedRoute.uuid,
  });
}

export async function handleFindRoute(args: {
  filePath: string;
  endpoint: string;
  method?: string;
}) {
  const { filePath, endpoint, method } = args;
  const config = await readMockoonConfig(filePath);

  // Mockoon stores endpoints without a leading slash, but callers frequently
  // search with one — strip leading slashes on both sides before comparing.
  const normalizedSearch = normalizeEndpoint(endpoint).toLowerCase();
  const normalized = (value: string): string => normalizeEndpoint(value).toLowerCase();

  // Helper to find all matching routes using the matching hierarchy
  const findMatchingRoutes = (): typeof config.routes => {
    // 1. Check for exact matches first
    const exactMatches = config.routes.filter(r => normalized(r.endpoint) === normalizedSearch);
    if (exactMatches.length > 0) return exactMatches;

    // 2. Look for prefix matches (e.g., "api" matches "api/users")
    const prefixMatches = config.routes.filter(r =>
      normalized(r.endpoint).startsWith(normalizedSearch + '/')
    );
    if (prefixMatches.length > 0) return prefixMatches;

    // 3. Fallback to substring matches
    return config.routes.filter(r => normalized(r.endpoint).includes(normalizedSearch));
  };

  const matchingRoutes = findMatchingRoutes();

  // No matches found
  if (matchingRoutes.length === 0) {
    return jsonResult({
      found: false,
      message: `No route found matching endpoint: ${endpoint}`,
    });
  }

  const routeSummary = (route: (typeof config.routes)[number]) => ({
    uuid: route.uuid,
    method: route.method,
    endpoint: route.endpoint,
  });

  const foundResult = (route: (typeof config.routes)[number], others: typeof config.routes) =>
    jsonResult({
      found: true,
      route: {
        uuid: route.uuid,
        method: route.method,
        endpoint: route.endpoint,
        enabled: route.enabled,
        documentation: route.documentation,
      },
      responses: route.responses.map((r, index) => ({
        index,
        uuid: r.uuid,
        label: r.label,
        statusCode: r.statusCode,
        default: r.default,
      })),
      alternatives: others.length > 0 ? others.map(routeSummary) : undefined,
    });

  // If method is specified, filter by it
  if (method) {
    const methodFiltered = matchingRoutes.filter(
      r => r.method.toLowerCase() === method.toLowerCase()
    );

    if (methodFiltered.length === 0) {
      return errorResult(`No ${method.toUpperCase()} route matches endpoint '${endpoint}'`, {
        error_code: 'METHOD_NOT_FOUND',
        available_choices: matchingRoutes.map(routeSummary),
        hint: 'Call find_route again with one of the listed methods.',
      });
    }

    // Return the first match when method is specified
    return foundResult(methodFiltered[0], methodFiltered.slice(1));
  }

  // Method not specified - check for ambiguity
  const uniqueMethods = [...new Set(matchingRoutes.map(r => r.method))];

  // If only one route matches, or all matching routes have the same method, return the first one
  if (matchingRoutes.length === 1 || uniqueMethods.length === 1) {
    return foundResult(matchingRoutes[0], matchingRoutes.slice(1));
  }

  // Multiple routes with different methods - the caller must pick one
  return errorResult(`Multiple routes match endpoint '${endpoint}' with different HTTP methods`, {
    error_code: 'AMBIGUOUS_METHOD',
    available_choices: matchingRoutes.map(routeSummary),
    hint: 'Call find_route again with the method parameter set to one of the listed methods.',
  });
}
