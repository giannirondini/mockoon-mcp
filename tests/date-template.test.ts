import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isIsoDateString,
  findDatePatterns,
  generateDateTemplate,
  replaceDatesWithTemplates,
  DatePattern,
} from '../src/utils/date-template.js';
import { handleReplaceDatesWithTemplates } from '../src/tools/handlers/date-template-handlers.js';
import { makeEnv, makeRoute, writeTempEnv, parseResult } from './helpers.js';
import { promises as fs } from 'fs';

describe('isIsoDateString', () => {
  const accepted: [string, boolean][] = [
    ['2024-01-15', false],
    ['2024-02-29', false], // leap year
    ['2024-01-15T10:30', true], // minute precision
    ['2024-01-15T10:30:00', true],
    ['2024-01-15T10:30:00Z', true],
    ['2024-01-15T10:30:00.123Z', true],
    ['2024-01-15T10:30:00.123456789Z', true], // long fractional seconds
    ['2024-01-15T10:30:00+02:00', true], // timezone offset
    ['2024-01-15T10:30:00.12-0500', true], // compact offset, short fraction
    ['2024-01-15T00:00', true], // midnight, lower bound
    ['2024-01-15T23:59:59Z', true], // upper bound of every time component
  ];

  for (const [value, isDateTime] of accepted) {
    it(`accepts ${value}`, () => {
      assert.deepEqual(isIsoDateString(value), { matches: true, isDateTime });
    });
  }

  const rejected = [
    '9999-99-99', // not a real date
    '2024-02-30', // February 30th
    '2023-02-29', // not a leap year
    '2024-13-01', // month 13
    '2024-01-15T10', // hour-only time
    '2024-01-15T99:99', // impossible hour/minute
    '2024-01-15T24:00', // hour out of range
    '2024-01-15T10:60', // minute out of range
    '2024-01-15T10:30:99', // second out of range
    '2024-01-15T10:30:00+25:00', // offset hour out of range
    '2024-01-15T10:30:00+02:60', // offset minute out of range
    'not a date',
    '{{now}}',
    "{{dateTimeShift days=1 format='yyyy-MM-dd'}}",
    '20240115',
    '2024-01-15 extra',
  ];

  for (const value of rejected) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      assert.equal(isIsoDateString(value).matches, false);
    });
  }
});

describe('findDatePatterns', () => {
  it('finds dates in nested objects and arrays with segment paths', () => {
    const body = {
      order_date: '2024-01-15',
      items: [{ ship_date: '2024-02-01T08:00:00Z' }, { ship_date: 'not-a-date' }],
    };
    const patterns = findDatePatterns(body);
    assert.equal(patterns.length, 2);
    assert.deepEqual(patterns[0].segments, ['order_date']);
    assert.deepEqual(patterns[1].segments, ['items', 0, 'ship_date']);
    assert.equal(patterns[1].isDateTime, true);
  });

  it('uses the nearest non-index key as fieldName for dates inside arrays', () => {
    const body = { dates: ['2024-01-15', '2024-01-16'] };
    const patterns = findDatePatterns(body);
    assert.equal(patterns.length, 2);
    assert.equal(patterns[0].fieldName, 'dates');
    assert.deepEqual(patterns[0].segments, ['dates', 0]);
  });

  it('handles keys containing dots', () => {
    const body = { 'billing.date': '2024-01-15' };
    const patterns = findDatePatterns(body);
    assert.equal(patterns.length, 1);
    assert.deepEqual(patterns[0].segments, ['billing.date']);
  });

  it('never matches already-templated values (idempotence)', () => {
    const body = { a: "{{dateTimeShift days=1 format='yyyy-MM-dd'}}", b: '2024-01-15' };
    const patterns = findDatePatterns(body);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].fieldName, 'b');
  });

  it('filters by fieldNames and fieldPattern', () => {
    const body = { order_date: '2024-01-15', ship_date: '2024-01-16', other: '2024-01-17' };
    assert.equal(findDatePatterns(body, { fieldNames: ['ship_date'] }).length, 1);
    assert.equal(findDatePatterns(body, { fieldPattern: '_date$' }).length, 2);
  });
});

describe('generateDateTemplate', () => {
  const dateOnly: DatePattern = {
    segments: ['d'],
    path: 'd',
    value: '2024-01-15',
    isDateTime: false,
    fieldName: 'd',
  };
  const dateTime: DatePattern = { ...dateOnly, value: '2024-01-15T10:00:00Z', isDateTime: true };

  it('relative datetime uses dateTimeShift hash arguments', () => {
    assert.equal(
      generateDateTemplate(dateTime, 'relative', { variableName: 'params.from', offsetDays: 2 }),
      "{{dateTimeShift date=(bodyRaw 'params.from') days=2}}"
    );
  });

  it('relative date-only honors offsetDays and formats as yyyy-MM-dd', () => {
    assert.equal(
      generateDateTemplate(dateOnly, 'relative', { variableName: 'params.from', offsetDays: 7 }),
      "{{dateTimeShift date=(bodyRaw 'params.from') days=7 format='yyyy-MM-dd'}}"
    );
  });

  it('offset strategy shifts from now', () => {
    assert.equal(
      generateDateTemplate(dateTime, 'offset', { offsetDays: -1 }),
      '{{dateTimeShift days=-1}}'
    );
    assert.equal(
      generateDateTemplate(dateOnly, 'offset', { offsetDays: 5 }),
      "{{dateTimeShift days=5 format='yyyy-MM-dd'}}"
    );
  });

  it('manual strategy emits the bare variable', () => {
    assert.equal(
      generateDateTemplate(dateOnly, 'manual', { variableName: 'myDate' }),
      '{{myDate}}'
    );
  });

  it('manual strategy defaults to requestDate when variableName is omitted', () => {
    assert.equal(generateDateTemplate(dateOnly, 'manual'), '{{requestDate}}');
  });

  it('never emits the random `date` helper', () => {
    for (const strategy of ['relative', 'offset', 'manual'] as const) {
      const template = generateDateTemplate(dateOnly, strategy, { variableName: 'x' });
      assert.ok(!template.startsWith('{{date '), `unexpected date helper in: ${template}`);
    }
  });
});

describe('replaceDatesWithTemplates', () => {
  it('replaces values at segment paths, including dotted keys and arrays', () => {
    const body = {
      'billing.date': '2024-01-15',
      items: [{ ship_date: '2024-02-01T08:00:00Z' }],
    };
    const patterns = findDatePatterns(body);
    const { templatedBody, result } = replaceDatesWithTemplates(body, patterns, 'offset', {
      offsetDays: 0,
    });
    const templated = templatedBody as Record<string, unknown>;
    assert.equal(result.replacementsCount, 2);
    assert.equal(templated['billing.date'], "{{dateTimeShift days=0 format='yyyy-MM-dd'}}");
    assert.equal(
      (templated.items as { ship_date: string }[])[0].ship_date,
      '{{dateTimeShift days=0}}'
    );
    // The input object is not mutated
    assert.equal(body['billing.date'], '2024-01-15');
  });

  it('is idempotent: a second scan of the templated body finds nothing', () => {
    const body = { a: '2024-01-15' };
    const { templatedBody } = replaceDatesWithTemplates(body, findDatePatterns(body), 'offset');
    assert.equal(findDatePatterns(templatedBody).length, 0);
  });
});

describe('handleReplaceDatesWithTemplates', () => {
  it('rewrites the response body and reports details', async () => {
    const route = makeRoute();
    route.responses[0].body = JSON.stringify({ order_date: '2024-01-15' });
    const filePath = await writeTempEnv(makeEnv([route]));

    const result = await handleReplaceDatesWithTemplates({
      filePath,
      routeId: route.uuid,
      responseIndex: 0,
      strategy: 'offset',
      offsetDays: 3,
    });
    const payload = parseResult(result);
    assert.equal(payload.success, true);
    assert.equal(payload.operationPerformed, true);

    const saved = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    const savedBody = JSON.parse(saved.routes[0].responses[0].body);
    assert.equal(savedBody.order_date, "{{dateTimeShift days=3 format='yyyy-MM-dd'}}");

    // Second run: nothing left to replace
    const second = parseResult(
      await handleReplaceDatesWithTemplates({
        filePath,
        routeId: route.uuid,
        responseIndex: 0,
        strategy: 'offset',
        offsetDays: 3,
      })
    );
    assert.equal(second.operationPerformed, false);
  });

  it('manual without variableName reports the requestDate fallback it actually used', async () => {
    const route = makeRoute();
    route.responses[0].body = JSON.stringify({ order_date: '2024-01-15' });
    const filePath = await writeTempEnv(makeEnv([route]));

    const payload = parseResult(
      await handleReplaceDatesWithTemplates({
        filePath,
        routeId: route.uuid,
        responseIndex: 0,
        strategy: 'manual',
      })
    );
    assert.equal(payload.operationPerformed, true);
    // The reported variableName must match the template that was written
    assert.equal(payload.variableName, 'requestDate');
    const saved = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    assert.equal(JSON.parse(saved.routes[0].responses[0].body).order_date, '{{requestDate}}');
  });

  it('requires variableName for the relative strategy', async () => {
    const route = makeRoute();
    const filePath = await writeTempEnv(makeEnv([route]));
    const result = await handleReplaceDatesWithTemplates({
      filePath,
      routeId: route.uuid,
      responseIndex: 0,
      strategy: 'relative',
    });
    assert.equal(result.isError, true);
  });
});
