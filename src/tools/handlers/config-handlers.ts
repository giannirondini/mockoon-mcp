/**
 * Handlers for configuration-related tools
 */

import { readMockoonConfig, formatByteSize, hasTemplating } from '../../utils/config.js';
import { jsonResult } from '../../utils/response.js';

export async function handleReadConfig(args: { filePath: string }) {
  const { filePath } = args;
  const config = await readMockoonConfig(filePath);
  return jsonResult(config);
}

export async function handleGetConfigSummary(args: { filePath: string }) {
  const { filePath } = args;
  const config = await readMockoonConfig(filePath);

  // Calculate response statistics
  let totalResponses = 0;
  let largestResponseSize = 0;
  let templatesUsed = 0;

  for (const route of config.routes) {
    totalResponses += route.responses.length;
    for (const response of route.responses) {
      const body = response.body || '';
      const bodyLength = Buffer.byteLength(body, 'utf-8');
      if (bodyLength > largestResponseSize) {
        largestResponseSize = bodyLength;
      }
      if (hasTemplating(body)) {
        templatesUsed++;
      }
    }
  }

  // Rough complexity indicator meant to steer clients toward paginated /
  // metadata-only tools: "medium" from 50 routes or 100 responses,
  // "deep" from 100 routes, 200 responses, or a body over 10 KB.
  let dataDepth = 'shallow';
  if (config.routes.length > 50 || totalResponses > 100) {
    dataDepth = 'medium';
  }
  if (config.routes.length > 100 || totalResponses > 200 || largestResponseSize > 10240) {
    dataDepth = 'deep';
  }

  return jsonResult({
    name: config.name,
    port: config.port,
    hostname: config.hostname,
    routeCount: config.routes.length,
    totalResponses,
    largestResponse: formatByteSize(largestResponseSize),
    templatesUsed,
    dataBucketCount: config.data?.length || 0,
    dataDepth,
  });
}
