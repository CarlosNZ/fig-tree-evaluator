/**
 * The differential's runner ("Options", "Comparing", "Output" and "The
 * baseline" in docs-dev/v3-specs/v3-converter.md): each case's v3
 * evaluator, how two outcomes compare, the status a case gets, and the
 * baseline it is checked against.
 */
import * as v2 from 'fig-tree-evaluator-v2'
import { FetchClient, FigTree, type SqlConnection } from '../src'
import { checkBaseline, renderBaseline } from '../differential/baseline'
import { renderDifferences } from '../differential/report'
import type { Case, V2Io } from '../differential/case'
import { mockFetch } from '../differential/mocks/fetch'
import { onUnanswered, unanswered } from '../differential/mocks/unanswered'
import { sameResult } from '../differential/outcome'
import { describeRequest, sameRequests } from '../differential/requests'
import { createRunner, type CaseResult } from '../differential/run'
import { toV3Options, type V3Io } from '../differential/v3Options'

const noDatabase = { query: () => Promise.reject(new Error('no database here')) }
const v3Io: V3Io = {
  http: new FetchClient(mockFetch),
  postgres: noDatabase as SqlConnection,
}
const v2Io: V2Io = {
  http: v2.FetchClient(mockFetch as unknown as Parameters<typeof v2.FetchClient>[0]),
  postgres: noDatabase as unknown as V2Io['postgres'],
}
const entry = (fields: Partial<Case>): Case => ({ id: 1, from: 'x', expression: null, ...fields })

describe('toV3Options', () => {
  it("maps a case's options as a host migrates them by hand", () => {
    const { options } = toV3Options(
      entry({
        options: {
          data: { a: 1 },
          caseInsensitive: true,
          baseEndpoint: 'https://a.b/',
          headers: { h: 'x' },
          graphQLConnection: { endpoint: 'https://g.q/', headers: { g: 'y' } },
          evaluateFullObject: true,
          noShorthand: true,
          useCache: false,
        },
      }),
      v3Io
    )
    expect(options).toMatchObject({
      data: { a: 1 },
      operatorDefaults: { equal: { caseInsensitive: true }, notEqual: { caseInsensitive: true } },
      http: { baseEndpoint: 'https://a.b/', headers: { h: 'x' } },
      graphQL: { endpoint: 'https://g.q/', headers: { g: 'y' } },
    })
    expect(Object.keys(options)).not.toEqual(
      expect.arrayContaining(['evaluateFullObject', 'noShorthand', 'useCache'])
    )
    expect(toV3Options(entry({}), v3Io).options.graphQL).toEqual({
      endpoint: 'https://countries.trevorblades.com/',
    })
  })

  it('registers each v2 function as an operator of its name, called as v2 called it', async () => {
    const { options, notes } = toV3Options(
      entry({
        options: {
          functions: {
            double: (n: number) => n * 2,
            pair: { function: (input: object, ...args: string[]) => [input, ...args] },
            not: () => 'taken',
          },
        },
      }),
      v3Io
    )
    const fig = new FigTree(options)
    expect(await fig.evaluate({ $double: [4] })).toBe(8)
    expect(await fig.evaluate({ operator: 'pair', input: { a: 1 }, args: ['b'] })).toEqual([
      { a: 1 },
      'b',
    ])
    expect(notes).toEqual([expect.stringMatching(/^not: /)])
  })

  it('migrates the fragments, keeping their issues', async () => {
    const { options, fragmentIssues } = toV3Options(
      entry({
        options: { fragments: { trail: { operator: 'split', value: 'a,', delimiter: ',' } } },
      }),
      v3Io
    )
    expect(await new FigTree(options).evaluate({ fragment: 'trail' })).toEqual(['a', ''])
    expect(fragmentIssues.map((issue) => issue.code)).toEqual(['split-trailing-empty'])
  })

  it('stops at an option it cannot map', () => {
    const unknown = entry({ options: { returnErrorAsString: true } as Case['options'] })
    expect(() => toV3Options(unknown, v3Io)).toThrow(/returnErrorAsString/)
  })
})

describe('comparing', () => {
  it("reads v2's undefined as JSON does, and ignores key order", () => {
    // A key holding it is absent
    expect(sameResult({ value: { a: 1, b: undefined } }, { value: { a: 1 } })).toBe(true)
    expect(sameResult({ value: { a: 1, b: undefined } }, { value: { a: 1, b: null } })).toBe(false)
    // An array element, or the whole value, is null
    expect(sameResult({ value: [1, undefined] }, { value: [1, null] })).toBe(true)
    expect(sameResult({ value: undefined }, { value: null })).toBe(true)
    // At any depth
    expect(
      sameResult(
        { value: { a: [{ b: undefined, c: [undefined] }] } },
        { value: { a: [{ c: [null] }] } }
      )
    ).toBe(true)
    expect(sameResult({ value: { a: 1, b: 2 } }, { value: { b: 2, a: 1 } })).toBe(true)
    expect(sameResult({ value: 1 }, { value: '1' })).toBe(false)
  })

  it('matches two failures, whatever their messages', () => {
    expect(sameResult({ error: 'one' }, { error: 'two' })).toBe(true)
    expect(sameResult({ error: 'one' }, { value: null })).toBe(false)
  })
})

describe('requests', () => {
  it('reads a request without what the two clients decide themselves', () => {
    const http = { kind: 'http', method: 'GET', url: 'https://a.b', headers: {} } as const
    // The headers both clients set, and a header set to nothing
    expect(
      describeRequest({
        ...http,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Key': 'k',
          Unset: undefined as unknown as string,
        },
      })
    ).toBe('GET https://a.b/ headers {"x-key":"k"}')
    // v2's empty GraphQL variables, and a body's key order
    expect(
      describeRequest({ ...http, method: 'POST', body: '{"variables":{},"query":"{ a }"}' })
    ).toBe('POST https://a.b/ {"query":"{ a }"}')
    expect(describeRequest({ ...http, method: 'POST', body: '{"b":1,"a":{"d":1,"c":2}}' })).toBe(
      'POST https://a.b/ {"a":{"c":2,"d":1},"b":1}'
    )
    expect(describeRequest({ kind: 'sql', text: 'SELECT $1', values: [1] })).toBe(
      'SQL SELECT $1 [1]'
    )
    expect(describeRequest({ kind: 'sql', text: 'SELECT 1' })).toBe('SQL SELECT 1 []')
  })

  it('compares them in any order, counting each', () => {
    expect(sameRequests(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameRequests(['a', 'a'], ['a'])).toBe(false)
  })
})

describe('a case', () => {
  const requests: string[] = []
  beforeAll(() => onUnanswered((message) => requests.push(message)))
  afterAll(() => onUnanswered(undefined))
  const run = (fields: Partial<Case>, reviewed: Record<number, string> = {}, io = v3Io) =>
    createRunner(v2, { v2: v2Io, v3: io }, reviewed, requests).run(entry(fields))

  it('is ✓ when both engines give the same outcome', async () => {
    expect(await run({ expression: { operator: '+', values: [1, 2] } })).toMatchObject({
      status: '✓',
      v2: { value: 3 },
      v3: { value: 3 },
    })
  })

  it('is ⚠ when they differ and the conversion raised an issue, or the case is reviewed', async () => {
    const split = await run({ expression: { operator: 'split', value: 'a,', delimiter: ',' } })
    expect(split.status).toBe('⚠')
    expect(split.issues.map((issue) => issue.code)).toEqual(['split-trailing-empty'])
    const plus = { id: 7, expression: { operator: '+', values: ['a', 1] } }
    expect((await run(plus)).status).toBe('✗')
    expect(await run(plus, { 7: 'guide: no implicit coercion' })).toMatchObject({
      status: '⚠',
      note: 'guide: no implicit coercion',
    })
  })

  it('fails in v3 where only v3 makes a request no double answers, and says so', async () => {
    const lost = { request: () => Promise.reject(unanswered('Unmocked fetch: GET elsewhere')) }
    const url = 'https://restcountries.com/v3.1/name/zealand'
    const result = await run({ expression: { operator: 'GET', url } }, {}, { ...v3Io, http: lost })
    expect(result).toMatchObject({
      v2: { value: expect.anything() },
      v3: { error: expect.any(String) },
    })
    expect(result.status).not.toBe('✓')
    expect(result.unanswered).toEqual(['Unmocked fetch: GET elsewhere'])
  })

  it('stops the run where v2 makes a request no double answers', async () => {
    await expect(
      run({ expression: { operator: 'GET', url: 'https://nowhere.test/' } })
    ).rejects.toThrow(
      /v2 made a request no double answers: Unmocked fetch: GET https:\/\/nowhere\.test\//
    )
  })

  it('records what each engine sent, and whether the two are the same', async () => {
    const url = 'https://restcountries.com/v3.1/name/zealand'
    expect((await run({ expression: { operator: 'GET', url } })).requests).toEqual({
      v2: [`GET ${url}`],
      v3: [`GET ${url}`],
      same: true,
    })
    expect((await run({ expression: { operator: '+', values: [1, 2] } })).requests).toBeUndefined()
  })

  it("clears v3's cache before each case, so each sends its own requests", async () => {
    const runner = createRunner(v2, { v2: v2Io, v3: v3Io }, {}, requests)
    const get = entry({
      expression: { operator: 'GET', url: 'https://restcountries.com/v3.1/name/zealand' },
    })
    await runner.run(get)
    expect((await runner.run(get)).requests).toMatchObject({ same: true, v3: [expect.any(String)] })
  })

  it('counts the issues of the fragments it calls, directly or through another', async () => {
    const options = {
      fragments: {
        trail: { operator: 'split', value: 'a,', delimiter: ',' },
        outer: { operator: '+', values: [{ fragment: 'trail' }] },
        other: { operator: '+', values: [1] },
      },
    }
    const through = await run({ expression: { fragment: 'outer' }, options })
    expect(through.status).toBe('⚠')
    expect(through.issues.map((issue) => issue.code)).toEqual(['split-trailing-empty'])
    const apart = await run({ expression: { operator: '+', values: ['a', 1] }, options })
    expect(apart).toMatchObject({ status: '✗', issues: [] })
  })
})

describe('the baseline', () => {
  const result = (id: number, status: CaseResult['status'], codes: string[] = []) =>
    ({ entry: entry({ id }), status, issues: codes.map((code) => ({ code })) }) as CaseResult

  it('holds a line per case, with its status and issue codes', () => {
    const baseline = JSON.parse(
      renderBaseline(
        [result(1, '✓'), result(2, '⚠', ['output-type', 'values-cut', 'output-type'])],
        '2.23.2'
      )
    )
    expect(baseline).toEqual({
      v2: '2.23.2',
      totals: { cases: 2, '✓': 1, '⚠': 1, '✗': 0 },
      cases: { 1: '✓', 2: '⚠ output-type values-cut' },
    })
  })

  it('names each case that moved, in either direction', () => {
    const accepted = renderBaseline(
      [result(1, '✓'), result(2, '✗'), result(3, '⚠', ['x'])],
      '2.23.2'
    )
    const moved = checkBaseline(
      accepted,
      [result(1, '✗'), result(2, '✓'), result(4, '✓')],
      '2.23.3'
    )
    expect(moved).toEqual([
      'v2 2.23.2 → 2.23.3',
      '#1  ✓ → ✗',
      '#2  ✗ → ✓',
      '#3  ⚠ x → (no case)',
      '#4  (no case) → ✓',
    ])
    expect(
      checkBaseline(accepted, [result(1, '✓'), result(2, '✗'), result(3, '⚠', ['x'])], '2.23.2')
    ).toEqual([])
  })
})

describe('the differences file', () => {
  const result = (id: number, status: CaseResult['status'], fields: Partial<CaseResult> = {}) =>
    ({
      entry: entry({
        id,
        from: `f.test.ts › case ${id}`,
        expression: { operator: '+', values: [id] },
      }),
      converted: { operator: 'plus', values: [id] },
      issues: [],
      v2: { value: id },
      v3: { error: 'it failed' },
      status,
      ...fields,
    }) as CaseResult

  it('holds every case that differs, the unexplained first, with what a debugger needs', () => {
    const issue = {
      code: 'output-type',
      tag: 'lossy-default',
      path: ['values', 0],
      message: 'Said why',
    }
    const { markdown } = renderDifferences(
      [
        result(1, '✓'),
        result(2, '⚠', { issues: [issue] as CaseResult['issues'] }),
        result(3, '✗', { unanswered: ['Unmocked fetch: GET x'] }),
      ],
      '2.23.2'
    )
    expect(markdown).not.toContain('case 1')
    expect(markdown.indexOf('case 3')).toBeLessThan(markdown.indexOf('case 2'))
    for (const text of [
      '"operator": "plus"',
      '`output-type` (lossy-default) at `values[0]`: Said why',
      'it failed',
      'Unmocked fetch: GET x',
    ])
      expect(markdown).toContain(text)
  })

  it('spells out the values JSON cannot hold, rather than writing them as null', () => {
    const { markdown } = renderDifferences(
      [result(1, '✗', { v2: { value: [undefined, NaN, Infinity, -Infinity, null] } })],
      '2.23.2'
    )
    expect(markdown.replace(/\s+/g, '')).toContain(
      '["(undefined)","(NaN)","(Infinity)","(-Infinity)",null]'
    )
  })

  it("shows what each engine sent: once where the two are the same, else each's", () => {
    const sent = ['GET https://a.b/']
    const { markdown } = renderDifferences(
      [
        result(1, '✗', { requests: { v2: sent, v3: sent, same: true } }),
        result(2, '✗', { requests: { v2: sent, v3: [], same: false } }),
      ],
      '2.23.2'
    )
    expect(markdown).toContain(
      '**Requests:** the same from both engines\n\n```text\nGET https://a.b/\n```'
    )
    expect(markdown).toContain(
      '**Requests differ**\n\nv2:\n\n```text\nGET https://a.b/\n```\n\nv3:\n\nNone.'
    )
  })

  it('writes a value too large to read inline to a file of its own', () => {
    const large = { values: Array.from({ length: 5000 }, (_, index) => index) }
    const { markdown, files } = renderDifferences([result(7, '✗', { converted: large })], '2.23.2')
    expect(Object.keys(files)).toEqual(['7.converted.json'])
    expect(JSON.parse(files['7.converted.json'])).toEqual(large)
    expect(markdown).toContain('(7.converted.json)')
  })

  it('counts an issue list too long to read inline, and writes it whole to a file', () => {
    const issue = {
      code: 'custom-function-call',
      tag: 'non-convertible',
      path: [0],
      message: 'x'.repeat(200),
    }
    const issues = Array.from({ length: 200 }, () => issue) as CaseResult['issues']
    const { markdown, files } = renderDifferences([result(8, '⚠', { issues })], '2.23.2')
    expect(markdown).toContain('`custom-function-call` ×200')
    expect(files['8.issues.md'].split('\n')).toHaveLength(201)
  })
})
