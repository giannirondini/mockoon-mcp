/**
 * Handlers for response-related tools
 */

import { readMockoonConfig, writeMockoonConfig, getBodySize } from '../../utils/config.js';
import { findResponse, jsonResult, errorResult } from '../../utils/response.js';

export async function handleUpdateResponse(args: {
  filePath: string;
  routeId: string;
  responseId?: string;
  responseIndex?: number;
  body?: string;
  statusCode?: number;
  label?: string;
}) {
  const { filePath, routeId, responseId, responseIndex, body, statusCode, label } = args;

  const config = await readMockoonConfig(filePath);

  const route = config.routes.find(r => r.uuid === routeId);

  if (!route) {
    return errorResult(`Route not found: ${routeId}`, {
      suggestion: 'Use find_route or list_routes to get a valid routeId',
    });
  }

  const { response, error } = findResponse(route.responses, responseId, responseIndex);

  if (!response || error) {
    return errorResult(error || 'Response not found', {
      availableResponses: route.responses.map((r, index) => ({
        index,
        uuid: r.uuid,
        label: r.label || 'Unnamed',
        statusCode: r.statusCode,
      })),
    });
  }

  if (body !== undefined) response.body = body;
  if (statusCode !== undefined) response.statusCode = statusCode;
  if (label !== undefined) response.label = label;

  await writeMockoonConfig(filePath, config);

  return jsonResult({
    success: true,
    message: `Response updated for route: ${route.method} /${route.endpoint}`,
    routeId: route.uuid,
    responseId: response.uuid,
  });
}

export async function handleGetResponseDetails(args: {
  filePath: string;
  routeId: string;
  responseId?: string;
  responseIndex?: number;
}) {
  const { filePath, routeId, responseId, responseIndex } = args;
  const config = await readMockoonConfig(filePath);

  const route = config.routes.find(r => r.uuid === routeId);

  if (!route) {
    return errorResult(`Route not found: ${routeId}`, {
      suggestion: 'Use find_route or list_routes to get a valid routeId',
    });
  }

  const { response, error } = findResponse(route.responses, responseId, responseIndex);

  if (!response || error) {
    return errorResult(error || 'Response not found', {
      availableResponses: route.responses.map((r, index) => ({
        index,
        uuid: r.uuid,
        label: r.label || 'Unnamed',
        statusCode: r.statusCode,
      })),
    });
  }

  return jsonResult({
    uuid: response.uuid,
    label: response.label,
    statusCode: response.statusCode,
    body: response.body,
    bodySize: getBodySize(response.body || ''),
    headers: response.headers,
    rules: response.rules,
    default: response.default,
  });
}
