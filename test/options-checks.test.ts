/**
 * The checks on the options' own values (src/optionChecks.ts; "The shape"
 * in the Options area of docs-dev/v3-specs/v3-api.md, #268): every
 * problem an `invalid-options` issue at its path, all of them in one throw
 * with any registry issues, at construction, `updateOptions()`, `with()`
 * and per call.
 */
import { FigTree, isFigTreeError, type FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const thrown = (act: () => unknown): FigTreeError => {
  try {
    act()
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected a throw')
}

const construct = (options: unknown) => () => new FigTree(options as never)

describe('maxDepth and maxNodes take a whole number, 0 or more', () => {
  it.each([
    ['NaN', NaN],
    ['a numeric string', '5'],
    ['another string', 'x'],
    ['a negative', -1],
    ['a fraction', 1.5],
    ['Infinity', Infinity],
    ['a boolean', true],
  ])('%s is refused', (_label, bad) => {
    for (const key of ['maxDepth', 'maxNodes']) {
      const error = thrown(construct({ [key]: bad }))
      expect(error.code).toBe('invalid-options')
      expect(error.message).toBe(`'${key}' must be a whole number, 0 or more`)
      expect(error.path).toEqual([key])
    }
  })

  it.each([0, 1, 50])('%p is accepted', (good) => {
    expect(construct({ maxDepth: good, maxNodes: good })).not.toThrow()
  })

  it('null removes the limit, as for every option', async () => {
    const fig = new FigTree({ maxDepth: 0 })
    await expect(fig.evaluate({ $plus: [1, 2] })).rejects.toThrow()
    fig.updateOptions({ maxDepth: null })
    expect(await fig.evaluate({ $plus: [1, 2] })).toBe(3)
    expect(construct({ maxDepth: null })).not.toThrow()
  })
})

describe('http and graphQL', () => {
  it.each([
    ['a URL string', { http: 'https://api.example.com' }, ['http'], "'http' must be an object"],
    ['an array', { http: ['https://api.example.com'] }, ['http'], "'http' must be an object"],
    [
      'a numeric baseEndpoint',
      { http: { baseEndpoint: 5 } },
      ['http', 'baseEndpoint'],
      "'http.baseEndpoint' must be an http(s) URL, or ''",
    ],
    [
      'a baseEndpoint without a scheme',
      { http: { baseEndpoint: 'api.example.com' } },
      ['http', 'baseEndpoint'],
      "'http.baseEndpoint' must be an http(s) URL, or ''",
    ],
    [
      'string headers',
      { http: { headers: 'Bearer x' } },
      ['http', 'headers'],
      "'http.headers' must be an object of strings, numbers, booleans or nulls",
    ],
    [
      'array headers',
      { http: { headers: ['Bearer x'] } },
      ['http', 'headers'],
      "'http.headers' must be an object of strings, numbers, booleans or nulls",
    ],
    [
      'an object header value',
      { http: { headers: { Authorization: { token: 'x' } } } },
      ['http', 'headers'],
      "'http.headers' must be an object of strings, numbers, booleans or nulls",
    ],
    ['a string graphQL block', { graphQL: 'x' }, ['graphQL'], "'graphQL' must be an object"],
    [
      'a numeric endpoint',
      { graphQL: { endpoint: 5 } },
      ['graphQL', 'endpoint'],
      "'graphQL.endpoint' must be a string",
    ],
    [
      'string graphQL headers',
      { graphQL: { headers: 'x' } },
      ['graphQL', 'headers'],
      "'graphQL.headers' must be an object of strings, numbers, booleans or nulls",
    ],
  ])('%s is refused', (_label, options, path, message) => {
    const error = thrown(construct(options))
    expect(error.code).toBe('invalid-options')
    expect(error.message).toBe(message)
    expect(error.path).toEqual(path)
  })

  it('accepts what the requests accept', () => {
    expect(
      construct({
        http: {
          baseEndpoint: 'HTTPS://api.example.com',
          headers: { A: 'x', B: 2, C: true, D: null },
        },
        graphQL: { endpoint: 'graphql', headers: {} },
      })
    ).not.toThrow()
    // `''` is unset, as a relative `url` already reads it
    expect(construct({ http: { baseEndpoint: '' } })).not.toThrow()
  })

  it('checks a block after the merge, whole', () => {
    const fig = new FigTree({ http: { baseEndpoint: 'https://api.example.com' } })
    fig.updateOptions({ http: { headers: { A: 'x' } } })
    expect(fig.getOptions().http).toEqual({
      baseEndpoint: 'https://api.example.com',
      headers: { A: 'x' },
    })
    const error = thrown(() => fig.updateOptions({ http: { baseEndpoint: 5 as never } }))
    expect(error.path).toEqual(['http', 'baseEndpoint'])
  })
})

describe('trace and strictDataPaths take a boolean', () => {
  it.each([
    ['trace', 'false'],
    ['strictDataPaths', 1],
  ])('%s: %p is refused', (key, bad) => {
    const error = thrown(construct({ [key]: bad }))
    expect(error.message).toBe(`'${key}' must be true or false`)
    expect(error.path).toEqual([key])
  })

  it('trace is checked per call too', async () => {
    const error = await rejection<FigTreeError>(
      new FigTree().evaluate({ $plus: [1] }, { trace: 'yes' as never })
    )
    expect(error.code).toBe('invalid-options')
    expect(error.message).toBe("'trace' must be true or false")
  })

  it.each([
    [
      'a misspelt per-call key',
      'tracee',
      "'tracee' is not an option — did you mean 'trace'?",
      'trace',
    ],
    // Suggesting `maxDepth` would only lead to the refusal below
    ['a misspelt instance key', 'maxdepth', "'maxdepth' is not an option", undefined],
    [
      'an instance option',
      'maxDepth',
      "'maxDepth' is not a per-call option — a call may supply data, signal, timeout and trace; configure the rest at construction or via updateOptions()",
      undefined,
    ],
  ])('%s is refused per call', async (_label, key, message, suggestion) => {
    const error = await rejection<FigTreeError>(
      new FigTree().evaluate({ $plus: [1] }, { [key]: 5 } as never)
    )
    expect(error.code).toBe('invalid-options')
    expect(error.message).toBe(message)
    expect(error.path).toEqual([key])
    expect(error.issues?.[0].suggestion).toBe(suggestion)
  })

  it("a call's problems are reported in one throw", async () => {
    const error = await rejection<FigTreeError>(
      new FigTree().evaluate({ $plus: [1] }, {
        timeout: -1,
        data: {},
        trace: 'yes',
        maxDepth: 3,
      } as never)
    )
    expect(error.issues?.map((issue) => issue.path)).toEqual([['timeout'], ['trace'], ['maxDepth']])
    expect(error.message).toBe(
      "'timeout' must be a positive number of milliseconds (+ 2 more issues)"
    )
  })
})

describe('an unknown key is refused', () => {
  it.each([
    ['at the top level', { maxdepth: 5 }, ['maxdepth'], "'maxdepth'", 'maxDepth'],
    ['inside http', { http: { baseUrl: 'x' } }, ['http', 'baseUrl'], "'http.baseUrl'", undefined],
    ['inside cache', { cache: { maxsize: 5 } }, ['cache', 'maxsize'], "'cache.maxsize'", 'maxSize'],
    [
      'left over from v2',
      { skipRuntimeTypeCheck: true },
      ['skipRuntimeTypeCheck'],
      "'skipRuntimeTypeCheck'",
      undefined,
    ],
  ])('%s', (_label, options, path, name, suggestion) => {
    const error = thrown(construct(options))
    expect(error.code).toBe('invalid-options')
    expect(error.path).toEqual(path)
    expect(error.message).toBe(
      `${name} is not an option${suggestion ? ` — did you mean '${suggestion}'?` : ''}`
    )
    expect(error.issues?.[0].suggestion).toBe(suggestion)
  })
})

describe('every problem is reported in one throw', () => {
  it('collects the issues, in key order', () => {
    const error = thrown(
      construct({ maxDepth: '5', http: { baseUrl: 'x' }, cache: { maxSize: 0 } })
    )
    expect(error.issues?.map((issue) => issue.path)).toEqual([
      ['maxDepth'],
      ['http', 'baseUrl'],
      ['cache', 'maxSize'],
    ])
    expect(error.message).toBe("'maxDepth' must be a whole number, 0 or more (+ 2 more issues)")
  })

  it('alongside the registry issues', () => {
    const error = thrown(construct({ maxDepth: -1, operators: 'core' }))
    expect(error.issues?.map((issue) => issue.path)).toEqual([['maxDepth'], ['operators']])
  })
})

describe('a refused update changes nothing', () => {
  it.each([
    ['updateOptions', (fig: FigTree, update: object) => fig.updateOptions(update as never)],
    ['with', (fig: FigTree, update: object) => fig.with(update as never)],
  ])('%s', async (_label, apply) => {
    const fig = new FigTree({ maxDepth: 3, http: { baseEndpoint: 'https://a.example.com' } })
    const before = fig.getOptions()
    for (const update of [
      { maxDepth: '10' },
      { http: { headers: 'Bearer x' } },
      { cache: { maxTime: 0 } },
      { timeout: -1 },
      { maxNodes: 5, tiemout: 10 },
    ]) {
      expect(thrown(() => apply(fig, update)).code).toBe('invalid-options')
      expect(fig.getOptions()).toEqual(before)
    }
    expect(await fig.evaluate({ $plus: [1, 2] })).toBe(3)
  })
})

describe('what stays open', () => {
  it('data takes any value', () => {
    for (const data of [5, 'x', [1], new Map(), null]) expect(construct({ data })).not.toThrow()
  })

  it('an undefined value is "not supplied"', () => {
    expect(
      construct({ maxDepth: undefined, http: { baseEndpoint: undefined }, trace: undefined })
    ).not.toThrow()
  })
})
