/**
 * Configuration file I/O utilities
 */

import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MockoonConfig } from '../types/mockoon.js';

/**
 * Regex pattern to match Mockoon template expressions: {{...}}
 * Supports nested braces and handles edge cases
 */
const MOCKOON_TEMPLATE_PATTERN = /\{\{(?:[^}]|\}(?!\}))+\}\}/;
const MOCKOON_TEMPLATE_PATTERN_GLOBAL = new RegExp(MOCKOON_TEMPLATE_PATTERN.source, 'g');

/**
 * Resolve a user-supplied path, enforcing the optional MOCKOON_MCP_ROOT
 * confinement. When the env var is set, any path outside that directory is
 * rejected — this server can otherwise read/write arbitrary files on behalf
 * of an LLM client.
 */
export function resolveConfigPath(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const root = process.env.MOCKOON_MCP_ROOT;
  if (root) {
    const absoluteRoot = path.resolve(root);
    if (absolutePath !== absoluteRoot && !absolutePath.startsWith(absoluteRoot + path.sep)) {
      throw new Error(
        `Access denied: path is outside MOCKOON_MCP_ROOT (${absoluteRoot}): ${absolutePath}`
      );
    }
  }
  return absolutePath;
}

/**
 * Minimal shape check that the parsed JSON is plausibly a Mockoon
 * environment. Prevents mutating tools from rewriting arbitrary JSON files.
 */
function assertMockoonConfig(parsed: unknown, filePath: string): asserts parsed is MockoonConfig {
  const candidate = parsed as Partial<MockoonConfig> | null;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    Array.isArray(candidate) ||
    typeof candidate.uuid !== 'string' ||
    !Array.isArray(candidate.routes)
  ) {
    throw new Error(
      `Not a Mockoon environment file (expected an object with "uuid" and "routes"): ${filePath}`
    );
  }
}

/**
 * Read and parse a Mockoon configuration file
 */
export async function readMockoonConfig(filePath: string): Promise<MockoonConfig> {
  const absolutePath = resolveConfigPath(filePath);
  const content = await fs.readFile(absolutePath, 'utf-8');
  const parsed: unknown = JSON.parse(content);
  assertMockoonConfig(parsed, filePath);
  return parsed;
}

/**
 * Write a Mockoon configuration to file.
 * Writes to a temp file in the same directory and renames it into place so a
 * crash mid-write cannot leave a truncated config behind.
 */
export async function writeMockoonConfig(filePath: string, config: MockoonConfig): Promise<void> {
  const absolutePath = resolveConfigPath(filePath);
  const tempPath = `${absolutePath}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    await fs.rename(tempPath, absolutePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

/**
 * Calculate the size of a string in bytes and format as human-readable
 */
export function getBodySize(body: string): string {
  return formatByteSize(Buffer.byteLength(body, 'utf-8'));
}

/**
 * Format a byte count as human-readable
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get a preview of the body (first 100 characters)
 */
export function getBodyPreview(body: string, maxLength: number = 100): string {
  if (body.length <= maxLength) return body;
  return body.substring(0, maxLength) + '...';
}

/**
 * Detect if body contains Mockoon templating syntax
 */
export function hasTemplating(body: string): boolean {
  return MOCKOON_TEMPLATE_PATTERN.test(body);
}

/**
 * Count the number of template expressions in the body
 */
export function countTemplates(body: string): number {
  const matches = body.match(MOCKOON_TEMPLATE_PATTERN_GLOBAL);
  return matches ? matches.length : 0;
}
