/**
 * Date pattern detection and template generation utilities
 */

export interface DatePattern {
  /** Path as segments — the only representation used for navigation, so keys containing dots are safe */
  segments: (string | number)[];
  /** Human-readable dotted path, for reporting only */
  path: string;
  value: string;
  isDateTime: boolean;
  /** Nearest non-index key in the path (e.g. "dates" for dates[0]) */
  fieldName: string;
}

export type DateStrategy = 'relative' | 'offset' | 'manual';

export interface ReplacementResult {
  replacementsCount: number;
  details: {
    field: string;
    path: string;
    originalValue: string;
    newValue: string;
  }[];
}

/**
 * ISO 8601 date/datetime pattern:
 * - date part: yyyy-MM-dd (calendar validity checked separately)
 * - optional time: HH:mm, HH:mm:ss, fractional seconds 1-9 digits, with
 *   range-checked components (hours 00-23, minutes/seconds 00-59)
 * - optional zone: Z, ±HH:mm or ±HHmm (offset hours 00-23, minutes 00-59)
 * Anchored, so values containing template syntax ({{...}}) can never match —
 * that anchor is what makes replacement idempotent.
 */
const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/;

/**
 * Check that a string is an ISO 8601 date (optionally with time) AND a real
 * calendar date — the pattern alone would accept values like "9999-99-99".
 */
export function isIsoDateString(value: string): { matches: boolean; isDateTime: boolean } {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return { matches: false, isDateTime: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day;

  return { matches: isRealDate, isDateTime: match[4] !== undefined };
}

/**
 * Check if a field name matches the given filter criteria
 */
export function matchesFieldFilter(
  fieldName: string,
  path: string,
  fieldPattern?: string,
  fieldNames?: string[]
): boolean {
  // If no filter specified, match all fields
  if (!fieldPattern && (!fieldNames || fieldNames.length === 0)) {
    return true;
  }

  // Check explicit field names list
  if (fieldNames && fieldNames.length > 0) {
    return fieldNames.includes(fieldName);
  }

  // Check regex pattern against field name
  if (fieldPattern) {
    try {
      const regex = new RegExp(fieldPattern);
      // Match against field name or full path
      return regex.test(fieldName) || regex.test(path);
    } catch {
      // If regex is invalid, treat as literal match
      return fieldName.includes(fieldPattern) || path.includes(fieldPattern);
    }
  }

  return true;
}

/**
 * Find all ISO 8601 date strings in an object.
 * Values already containing Mockoon templates never match (the pattern is
 * anchored), so repeated runs are idempotent.
 */
export function findDatePatterns(
  obj: unknown,
  options?: {
    fieldPattern?: string;
    fieldNames?: string[];
  }
): DatePattern[] {
  const dates: DatePattern[] = [];

  const traverse = (current: unknown, segments: (string | number)[]): void => {
    if (typeof current === 'string') {
      const { matches, isDateTime } = isIsoDateString(current);
      if (!matches) return;

      // Nearest non-index key, so dates inside arrays keep a useful name
      const lastKey = [...segments].reverse().find((s): s is string => typeof s === 'string');
      const fieldName = lastKey ?? String(segments[segments.length - 1] ?? '');
      const displayPath = segments.join('.');

      if (matchesFieldFilter(fieldName, displayPath, options?.fieldPattern, options?.fieldNames)) {
        dates.push({
          segments,
          path: displayPath,
          value: current,
          isDateTime,
          fieldName,
        });
      }
    } else if (Array.isArray(current)) {
      current.forEach((item, index) => {
        traverse(item, [...segments, index]);
      });
    } else if (typeof current === 'object' && current !== null) {
      Object.keys(current).forEach(key => {
        traverse((current as Record<string, unknown>)[key], [...segments, key]);
      });
    }
  };

  traverse(obj, []);
  return dates;
}

/**
 * Generate a Mockoon template for a date based on strategy.
 *
 * Helper syntax notes (see mockoon.com/docs — templating helpers):
 * - dateTimeShift only takes named hash arguments (date=, days=, format=)
 *   and defaults to the current time when date= is omitted.
 * - the `date` helper returns a RANDOM date between two bounds and must not
 *   be used for deterministic formatting.
 */
export function generateDateTemplate(
  dateInfo: DatePattern,
  strategy: DateStrategy,
  options: {
    variableName?: string;
    offsetDays?: number;
  } = {}
): string {
  const { variableName = 'requestDate', offsetDays = 0 } = options;

  switch (strategy) {
    case 'relative':
      // Relative to a date taken from the request body
      if (dateInfo.isDateTime) {
        return `{{dateTimeShift date=(bodyRaw '${variableName}') days=${offsetDays}}}`;
      } else {
        return `{{dateTimeShift date=(bodyRaw '${variableName}') days=${offsetDays} format='yyyy-MM-dd'}}`;
      }

    case 'offset':
      // Offset from the current time (dateTimeShift defaults to now)
      if (dateInfo.isDateTime) {
        return `{{dateTimeShift days=${offsetDays}}}`;
      } else {
        return `{{dateTimeShift days=${offsetDays} format='yyyy-MM-dd'}}`;
      }

    case 'manual':
      // Custom template variable. Note: every matched field receives the
      // same variable — callers should scope with fieldNames/fieldPattern.
      return `{{${variableName}}}`;

    default:
      throw new Error(`Unknown date strategy: ${strategy}`);
  }
}

/**
 * Replace dates in an object with templates.
 * Navigation uses the segments captured during detection, so keys containing
 * dots or numeric-looking object keys are handled correctly.
 */
export function replaceDatesWithTemplates(
  obj: unknown,
  datePatterns: DatePattern[],
  strategy: DateStrategy,
  options: {
    variableName?: string;
    offsetDays?: number;
  } = {}
): { templatedBody: unknown; result: ReplacementResult } {
  // Deep clone the object
  const templatedBody: unknown = JSON.parse(JSON.stringify(obj));
  const result: ReplacementResult = {
    replacementsCount: 0,
    details: [],
  };

  datePatterns.forEach(dateInfo => {
    let current: unknown = templatedBody;

    // Navigate to the parent of the target value
    for (let i = 0; i < dateInfo.segments.length - 1; i++) {
      const segment = dateInfo.segments[i];
      if (Array.isArray(current)) {
        current = current[segment as number];
      } else if (typeof current === 'object' && current !== null) {
        current = (current as Record<string, unknown>)[String(segment)];
      } else {
        throw new Error(`Cannot navigate to path: ${dateInfo.path}`);
      }
    }

    const lastSegment = dateInfo.segments[dateInfo.segments.length - 1];
    const template = generateDateTemplate(dateInfo, strategy, options);

    if (Array.isArray(current)) {
      current[lastSegment as number] = template;
    } else if (typeof current === 'object' && current !== null) {
      (current as Record<string, unknown>)[String(lastSegment)] = template;
    } else {
      throw new Error(`Cannot replace value at path: ${dateInfo.path}`);
    }

    result.replacementsCount++;
    result.details.push({
      field: dateInfo.fieldName,
      path: dateInfo.path,
      originalValue: dateInfo.value,
      newValue: template,
    });
  });

  return { templatedBody, result };
}
