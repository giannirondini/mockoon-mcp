/**
 * Mockoon configuration type definitions
 *
 * These interfaces deliberately model only the subset of the Mockoon
 * environment schema this server reads or mutates (reference:
 * `@mockoon/commons` environment-schema.constants.ts). Unknown fields survive
 * edits because handlers mutate the parsed object and serialize it back
 * whole — never rebuild a config object field-by-field from these types, or
 * unmodeled fields would be silently dropped.
 */

export interface MockoonEnvironment {
  uuid: string;
  name: string;
  port: number;
  hostname: string;
  routes: Route[];
  proxyMode?: boolean;
  proxyHost?: string;
  cors?: boolean;
  headers?: Header[];
  data?: DataBucket[];
}

export interface Route {
  uuid: string;
  type?: 'http' | 'crud' | 'ws';
  method: string;
  endpoint: string;
  responses: Response[];
  enabled: boolean;
  documentation?: string;
  responseMode?: string | null;
  streamingMode?: string | null;
  streamingInterval?: number;
}

export interface Response {
  uuid: string;
  body: string;
  statusCode: number;
  label?: string;
  latency?: number;
  headers?: Header[];
  bodyType?: 'INLINE' | 'FILE' | 'DATABUCKET';
  filePath?: string;
  sendFileAsBody?: boolean;
  rules?: ResponseRule[];
  rulesOperator?: 'OR' | 'AND';
  disableTemplating?: boolean;
  fallbackTo404?: boolean;
  default?: boolean;
  crudKey?: string;
  databucketID?: string;
  callbacks?: Callback[];
}

export interface Header {
  key: string;
  value: string;
}

export interface ResponseRule {
  target: string;
  modifier: string;
  value: string;
  operator: string;
}

export interface DataBucket {
  id: string;
  name: string;
  value: string;
  parsed?: boolean;
}

export interface Callback {
  name: string;
  method: string;
  uri: string;
  body?: string;
  headers?: Header[];
}

/**
 * Optimized response metadata (without full body)
 */
export interface OptimizedResponseMetadata {
  uuid: string;
  label?: string;
  statusCode: number;
  default?: boolean;
  bodySize: string;
  bodyPreview: string;
  hasTemplating: boolean;
  templateCount: number;
  hasRules: boolean;
  ruleCount: number;
}

/**
 * Full optimized response (includes body, headers, and rules)
 */
export interface OptimizedResponseFull extends OptimizedResponseMetadata {
  body: string;
  headers?: Header[];
  rules?: ResponseRule[];
}

export type MockoonConfig = MockoonEnvironment;
