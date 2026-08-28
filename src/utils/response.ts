/**
 * Response utility functions and the shared MCP result contract.
 *
 * Every tool returns JSON: successes via jsonResult(), failures via
 * errorResult() — a single error grammar ({ success: false, error, ... })
 * regardless of which handler failed.
 */

import { Response } from '../types/mockoon.js';

export interface ToolResult {
  // Index signature keeps this structurally compatible with the SDK's
  // CallToolResult type
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/**
 * Wrap any JSON-serializable payload as a successful tool result
 */
export function jsonResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Wrap an error message (plus optional structured context such as
 * error_code, suggestion, available choices) as a failed tool result
 */
export function errorResult(error: string, extra?: Record<string, unknown>): ToolResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: false, error, ...extra }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Helper function to find a response by ID or index
 */
export function findResponse(
  responses: Response[],
  responseId?: string,
  responseIndex?: number
): { response: Response | undefined; error?: string } {
  if (responseId) {
    const response = responses.find(r => r.uuid === responseId);
    if (!response) {
      return { response: undefined, error: `Response not found: ${responseId}` };
    }
    return { response };
  }

  if (responseIndex !== undefined) {
    if (responseIndex < 0 || responseIndex >= responses.length) {
      return {
        response: undefined,
        error: `Response index ${responseIndex} out of bounds (0-${responses.length - 1})`,
      };
    }
    return { response: responses[responseIndex] };
  }

  return { response: undefined, error: 'Either responseId or responseIndex must be provided' };
}
