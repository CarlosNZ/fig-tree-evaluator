/**
 * The differential's corpus ("The corpus" in
 * docs-dev/v3-specs/v3-converter.md): what each case runs with, how the
 * extractor writes the cases, and what the written corpus promises.
 */
import { GRAPHQL_ENDPOINT, v2Options, type Case, type V2Io } from '../differential/case'
import { corpus } from '../differential/corpus'
import { renderCorpus } from '../differential/extract/renderCorpus'
import { literal } from '../differential/literal'

describe("a case's options", () => {
  const io = { http: { http: true }, postgres: { pg: true }, sqlite: { sqlite: true } }
  const options = (entry: Omit<Case, 'id' | 'from' | 'expression'>) =>
    v2Options({ id: 1, from: 'x', expression: null, ...entry }, io as unknown as V2Io)

  it("are the runner's defaults where the case has none", () => {
    expect(options({})).toEqual({
      httpClient: io.http,
      graphQLConnection: { endpoint: GRAPHQL_ENDPOINT, httpClient: io.http },
      sqlConnection: io.postgres,
    })
  })

  it("are the case's own over the defaults, on the same clients", () => {
    const headers = { Authorization: 'Bearer x' }
    expect(
      options({
        options: { data: { a: 1 }, graphQLConnection: { endpoint: 'https://a.b/', headers } },
        database: 'sqlite',
      })
    ).toEqual({
      data: { a: 1 },
      httpClient: io.http,
      graphQLConnection: { endpoint: 'https://a.b/', headers, httpClient: io.http },
      sqlConnection: io.sqlite,
    })
  })
})

describe('writing a value', () => {
  const evaluate = (source: string): unknown => new Function(`return ${source}`)()

  it('writes a function as its source, where asked', () => {
    const value = {
      arrow: (a: number) => a * 2,
      definition: { function: (s: string) => s.toUpperCase(), description: 'up' },
      method(n: number) {
        return n + 1
      },
    }
    const written = evaluate(literal(value, { functions: true })) as typeof value
    expect(written.arrow(4)).toBe(8)
    expect(written.definition.function('a')).toBe('A')
    expect(written.method(1)).toBe(2)
    expect(() => literal({ f: () => 1 })).toThrow(/function value at f,/)
    expect(() => literal({ f: Math.max }, { functions: true })).toThrow(/native/)
  })

  it('keeps undefined where it sits', () => {
    expect(evaluate(literal({ a: undefined, b: [1, undefined] }))).toEqual({
      a: undefined,
      b: [1, undefined],
    })
  })
})

describe('writing the corpus', () => {
  const source = renderCorpus(
    [
      { from: '1_a.test.ts › one', expression: '{ "operator": "+" }', options: '{ "data": {} }' },
      { from: '1_a.test.ts › two', expression: 'massiveQuery', options: '{ "data": {} }' },
      { from: '2_b.test.ts › three', expression: '5', database: 'sqlite' },
    ],
    '2.23.2'
  )

  it('numbers the cases, and shares options more than one case has', () => {
    expect(source).toContain('const options1: CaseOptions = { "data": {} }')
    expect(source.match(/options: options1/g)).toHaveLength(2)
    expect(source).toContain(
      `{ id: 3, from: "2_b.test.ts › three", expression: 5, database: "sqlite" }`
    )
  })

  it('reads the massive query from its file rather than holding it', () => {
    expect(source).toContain(`readFileSync('test/massiveQuery.json', 'utf8')`)
    expect(source).toContain('expression: massiveQuery')
  })
})

describe('the corpus', () => {
  it('numbers its cases from 1, each naming the v2 test it came from', () => {
    expect(corpus.map((entry) => entry.id)).toEqual(corpus.map((_, index) => index + 1))
    for (const entry of corpus) expect(entry.from).toMatch(/^\d+_\w+\.test\.ts › ./)
  })

  it('holds none of the options the runner supplies, drops or cannot map', () => {
    const never = [
      'httpClient',
      'sqlConnection',
      'objects',
      'returnErrorAsString',
      'allowJSONStringInput',
      'skipRuntimeTypeCheck',
      'excludeOperators',
      'supportDeprecatedValueNodes',
      'nullEqualsUndefined',
      'maxCacheSize',
      'maxCacheTime',
    ]
    for (const { options = {} } of corpus) {
      expect(Object.keys(options).filter((key) => never.includes(key))).toEqual([])
      expect(options.graphQLConnection).not.toEqual({ endpoint: GRAPHQL_ENDPOINT })
      expect(options.graphQLConnection?.httpClient).toBeUndefined()
    }
  })
})
