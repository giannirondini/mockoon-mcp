/**
 * Factories producing route/response objects that match the Mockoon
 * environment schema (reference: `@mockoon/commons`
 * environment-schema.constants.ts — RouteDefault / RouteResponseDefault).
 *
 * Mockoon stores HTTP methods lowercase ('get', 'post', ...) and endpoints
 * without a leading slash; objects missing schema fields may be refused or
 * repaired by mockoon-cli / the desktop app.
 */

import { randomUUID } from 'crypto';
import { Route, Response } from '../types/mockoon.js';

export const MOCKOON_METHODS = [
  'all',
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'propfind',
  'proppatch',
  'move',
  'copy',
  'mkcol',
  'lock',
  'unlock',
] as const;

/**
 * Normalize an HTTP method to Mockoon's lowercase convention.
 * Returns undefined when the method is not one Mockoon supports.
 */
export function normalizeMethod(method: string): string | undefined {
  const normalized = method.trim().toLowerCase();
  return (MOCKOON_METHODS as readonly string[]).includes(normalized) ? normalized : undefined;
}

/**
 * Normalize an endpoint to Mockoon's convention (no leading slash).
 */
export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/^\/+/, '');
}

/**
 * Build a response object carrying every field RouteResponseDefault defines.
 */
export function buildResponse(options: {
  body: string;
  statusCode?: number;
  label?: string;
  isDefault?: boolean;
}): Response {
  return {
    uuid: randomUUID(),
    body: options.body,
    latency: 0,
    statusCode: options.statusCode ?? 200,
    label: options.label ?? '',
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    bodyType: 'INLINE',
    filePath: '',
    databucketID: '',
    sendFileAsBody: false,
    rules: [],
    rulesOperator: 'OR',
    disableTemplating: false,
    fallbackTo404: false,
    default: options.isDefault ?? false,
    crudKey: 'id',
    callbacks: [],
  };
}

/**
 * Build an HTTP route object carrying every field RouteDefault defines.
 * `method` must already be normalized via normalizeMethod().
 */
export function buildRoute(options: {
  method: string;
  endpoint: string;
  responses: Response[];
  documentation?: string;
}): Route {
  return {
    uuid: randomUUID(),
    type: 'http',
    documentation: options.documentation ?? '',
    method: options.method,
    endpoint: normalizeEndpoint(options.endpoint),
    responses: options.responses,
    enabled: true,
    responseMode: null,
    streamingMode: null,
    streamingInterval: 0,
  };
}
