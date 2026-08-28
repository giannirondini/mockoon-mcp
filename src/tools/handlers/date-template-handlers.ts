/**
 * Handlers for date templating tools
 */

import { readMockoonConfig, writeMockoonConfig } from '../../utils/config.js';
import {
  findDatePatterns,
  replaceDatesWithTemplates,
  DateStrategy,
} from '../../utils/date-template.js';
import { findResponse, jsonResult, errorResult } from '../../utils/response.js';

export async function handleReplaceDatesWithTemplates(args: {
  filePath: string;
  routeId: string;
  responseId?: string;
  responseIndex?: number;
  strategy: DateStrategy;
  variableName?: string;
  offsetDays?: number;
  fieldPattern?: string;
  fieldNames?: string[];
}) {
  const {
    filePath,
    routeId,
    responseId,
    responseIndex,
    strategy,
    variableName,
    offsetDays = 0,
    fieldPattern,
    fieldNames,
  } = args;

  // For the relative strategy, variableName must be explicitly provided
  if (strategy === 'relative' && !variableName) {
    return errorResult('Missing required parameter for relative strategy', {
      suggestion:
        'Provide variableName parameter with the request body path (e.g., "params.search_date")',
      example: 'variableName: "params.param_array.0.booking_date"',
    });
  }

  // The template generator falls back to 'requestDate' for the manual
  // strategy — resolve that here so the reported variableName always matches
  // the templates actually written (relative is validated non-empty above,
  // offset ignores it).
  const resolvedVariableName =
    strategy === 'manual' ? (variableName ?? 'requestDate') : variableName;

  const config = await readMockoonConfig(filePath);

  // Find route in the environment
  const route = config.routes.find(r => r.uuid === routeId);
  if (!route) {
    return errorResult(`Route not found: ${routeId}`, {
      suggestion: 'Use find_route tool to get the correct routeId',
      availableRoutes: config.routes.slice(0, 5).map(r => ({
        uuid: r.uuid,
        endpoint: r.endpoint,
        method: r.method,
      })),
    });
  }

  // Find response using helper
  const { response, error } = findResponse(route.responses, responseId, responseIndex);
  if (!response || error) {
    return errorResult(error || 'Response not found', {
      suggestion: 'Use responseIndex (0-based) or responseId. Available responses:',
      availableResponses: route.responses.map((r, idx) => ({
        index: idx,
        uuid: r.uuid,
        label: r.label || 'Unnamed',
        statusCode: r.statusCode,
      })),
    });
  }

  // Validate response body is not empty
  if (!response.body || response.body.trim() === '') {
    return errorResult('Response body is empty', {
      suggestion: 'The response has no body content to process',
      route: `${route.method} /${route.endpoint}`,
      response: response.label || 'Unnamed',
    });
  }

  // Parse response body
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(response.body);
  } catch (parseError) {
    return errorResult('Failed to parse response body as JSON', {
      details: parseError instanceof Error ? parseError.message : String(parseError),
      suggestion:
        'The response body must be valid JSON. Check for syntax errors or use a JSON validator.',
      bodyPreview: response.body.substring(0, 200) + (response.body.length > 200 ? '...' : ''),
    });
  }

  // Find date patterns with field filtering
  const datePatterns = findDatePatterns(responseBody, {
    fieldPattern,
    fieldNames,
  });

  if (datePatterns.length === 0) {
    // Provide helpful message based on whether filtering was used
    const filterInfo =
      fieldPattern || fieldNames
        ? {
            fieldPattern,
            fieldNames,
            suggestion: 'No dates found matching the specified filter. Try:',
            tips: [
              'Remove fieldPattern/fieldNames to see all available date fields',
              'Use a less restrictive pattern (e.g., "date" instead of "creation_date")',
              'Verify field names in the response body match your filter',
            ],
          }
        : {
            suggestion: 'No ISO 8601 date patterns found in the response body',
            tips: [
              'Supported formats: "2024-01-15", "2024-01-15T10:30", "2024-01-15T10:30:00Z", fractional seconds, ±HH:mm offsets',
              'Dates already carrying Mockoon templates never match (replacement is idempotent)',
              'Verify the response body contains date fields',
            ],
          };

    return jsonResult({
      success: true,
      operationPerformed: false,
      message: 'No date patterns found to replace',
      route: `${route.method} /${route.endpoint}`,
      response: response.label || 'Unnamed',
      ...filterInfo,
    });
  }

  // Replace dates with templates
  const { templatedBody, result } = replaceDatesWithTemplates(
    responseBody,
    datePatterns,
    strategy,
    {
      variableName: resolvedVariableName,
      offsetDays,
    }
  );

  response.body = JSON.stringify(templatedBody);
  await writeMockoonConfig(filePath, config);

  return jsonResult({
    success: true,
    operationPerformed: true,
    message: `Replaced ${result.replacementsCount} date(s) with ${strategy} strategy`,
    route: `${route.method} /${route.endpoint}`,
    response: response.label || 'Unnamed',
    responseIndex: route.responses.indexOf(response),
    strategy,
    ...(strategy === 'offset' && { offsetDays }),
    ...(strategy === 'relative' && { variableName: resolvedVariableName, offsetDays }),
    ...(strategy === 'manual' && { variableName: resolvedVariableName }),
    ...(fieldPattern && { fieldPattern }),
    ...(fieldNames && { fieldNames }),
    statistics: {
      datesFound: datePatterns.length,
      datesReplaced: result.replacementsCount,
    },
    details: result.details.map(d => ({
      field: d.field,
      path: d.path,
      originalValue: d.originalValue,
      template: d.newValue,
    })),
  });
}
