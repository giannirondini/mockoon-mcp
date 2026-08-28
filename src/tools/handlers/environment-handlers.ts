/**
 * Handlers for environment-related tools.
 * Mockoon files contain exactly one environment, so these tools take no
 * environment selector.
 */

import { readMockoonConfig } from '../../utils/config.js';
import { jsonResult } from '../../utils/response.js';

export async function handleListEnvironments(args: { filePath: string }) {
  const { filePath } = args;
  const config = await readMockoonConfig(filePath);

  return jsonResult([
    {
      uuid: config.uuid,
      name: config.name,
      port: config.port,
      hostname: config.hostname,
      routeCount: config.routes.length,
    },
  ]);
}

export async function handleGetEnvironment(args: { filePath: string }) {
  const { filePath } = args;
  const config = await readMockoonConfig(filePath);
  return jsonResult(config);
}
