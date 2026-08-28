/**
 * Handlers for data bucket-related tools
 */

import { readMockoonConfig } from '../../utils/config.js';
import { jsonResult } from '../../utils/response.js';

export async function handleListDataBuckets(args: { filePath: string }) {
  const { filePath } = args;
  const config = await readMockoonConfig(filePath);

  const buckets = (config.data || []).map(bucket => ({
    id: bucket.id,
    name: bucket.name,
    parsed: bucket.parsed,
  }));

  return jsonResult(buckets);
}
