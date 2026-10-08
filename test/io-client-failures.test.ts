/**
 * #239 — what an I/O client's failure becomes ("Client failures: codes and
 * the enforced shape" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * A fallback branches on `$error.code` and `$error.errorData`, so `http`,
 * `graphQL` and `sql` hold every client to its codes' promised fields: a
 * failure that fits passes as thrown, and anything else becomes
 * `request-failure`, keeping only the client's message. The engine's own
 * classification of timeouts and cancellation comes first, whatever the
 * client throws.
 */
import {
  AxiosClient,
  FetchClient,
  FigTree,
  FigTreeError,
  OperatorFailure,
  PostgresConnection,
  coreOperators,
  httpFailure,
  httpOperators,
  sqlFailure,
  sqlOperators,
} from '../src'
import type {
  AxiosLike,
  FallbackError,
  FetchLike,
  FigTreeOptions,
  HttpClient,
  SqlConnection,
} from '../src'
import { clientFailure, invalidResponse } from '../src/clients/failures'
import { spyOp } from './fixtures/evalOperators'
import { MockHttpClient } from './helpers'
import { rejection } from './helpers/rejection'

const URL = 'https://x.test/a'

const OPERATORS = [
  { operator: 'http', kind: 'http', expression: { operator: 'http', url: URL } },
  {
    operator: 'graphQL',
    kind: 'http',
    expression: { operator: 'graphQL', query: '{ a }', url: URL },
  },
  { operator: 'sql', kind: 'sql', expression: { operator: 'sql', query: 'SELECT 1' } },
] as const

/** One instance whose client and connection both answer with `respond`. */
const instance = (
  respond: () => Promise<unknown>,
  options: Partial<FigTreeOptions> = {},
  extra: FigTreeOptions['operators'] = []
) => {
  const client: HttpClient = { request: respond }
  const connection: SqlConnection = { query: respond as SqlConnection['query'] }
  return new FigTree({
    operators: [coreOperators, httpOperators(client), sqlOperators(connection), ...extra],
    ...options,
  })
}

const throwing = (thrown: unknown) =>
  instance(async () => {
    throw thrown
  })

/** What the node's fallback receives. */
const caught = async (fig: FigTree, expression: object): Promise<FallbackError> =>
  (await fig.evaluate({ ...expression, fallback: '$error' })) as FallbackError

const abortError = () => {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

/** Rewritten from any client. */
const FROM_ANY: [string, unknown, string][] = [
  ['a raw Error', new Error('socket hang up'), 'socket hang up'],
  // The client's own, with no engine abort behind it
  ['an AbortError', abortError(), 'The operation was aborted'],
  ['a string', 'refused', 'refused'],
  ['a plain object', { status: 500 }, '[object Object]'],
  [
    'an OperatorFailure with no code',
    new OperatorFailure('down', { errorData: { status: 500 } }),
    'down',
  ],
  ['a host code', new OperatorFailure('slow down', { code: 'rate-limited' }), 'slow down'],
  [
    'request-timeout, which only the engine raises',
    new OperatorFailure('late', { code: 'request-timeout' }),
    'late',
  ],
  ['type-check', new OperatorFailure('bad input', { code: 'type-check' }), 'bad input'],
  [
    'graphql-errors, which only graphQL raises',
    new OperatorFailure('1 error', { code: 'graphql-errors', errorData: { errors: [] } }),
    '1 error',
  ],
  [
    'a code naming an Object.prototype member',
    new OperatorFailure('odd', { code: 'constructor' }),
    'odd',
  ],
  [
    'a FigTreeError, located in an expression of its own',
    new FigTreeError({ code: 'type-check', message: 'inner', path: ['elsewhere'] }),
    'inner',
  ],
  // Neither is this evaluation's kill switch: passed through, either would
  // cut through every fallback
  [
    'a FigTreeError coded timeout',
    new FigTreeError({ code: 'timeout', message: 'evaluation exceeded its timeout', path: [] }),
    'evaluation exceeded its timeout',
  ],
  [
    'a FigTreeError coded aborted',
    new FigTreeError({ code: 'aborted', message: 'evaluation was aborted', path: [] }),
    'evaluation was aborted',
  ],
]

const STATUS = { status: 404, statusText: 'Not Found', url: URL, response: null }

/** Rewritten from an HTTP client. */
const FROM_HTTP: [string, unknown, string][] = [
  [
    'sql-error, a SQL connection’s code',
    sqlFailure('postgres', new Error('nope')),
    'postgres: nope',
  ],
  [
    'http-status with no errorData',
    new OperatorFailure('failed', { code: 'http-status' }),
    'failed',
  ],
  [
    'http-status with no status',
    new OperatorFailure('failed', {
      code: 'http-status',
      errorData: { statusText: 'Not Found', url: URL, response: null },
    }),
    'failed',
  ],
  [
    'http-status with a string status',
    new OperatorFailure('failed', { code: 'http-status', errorData: { ...STATUS, status: '404' } }),
    'failed',
  ],
  [
    'invalid-response with no url',
    new OperatorFailure('bad body', { code: 'invalid-response', errorData: { response: 'x' } }),
    'bad body',
  ],
]

/** Rewritten from a SQL connection. */
const FROM_SQL: [string, unknown, string][] = [
  ['http-status, an HTTP client’s code', httpFailure(STATUS), `request failed (404): ${URL}`],
  [
    'sql-error with no driver',
    new OperatorFailure('refused', { code: 'sql-error', errorData: { driverCode: '42P01' } }),
    'refused',
  ],
  [
    'sql-error with a numeric driverCode',
    new OperatorFailure('refused', {
      code: 'sql-error',
      errorData: { driver: 'mysql', driverCode: 1146 },
    }),
    'refused',
  ],
]

describe.each(OPERATORS)('$operator', ({ operator, kind, expression }) => {
  describe('becomes request-failure, with only the client’s message', () => {
    test.each([...FROM_ANY, ...(kind === 'http' ? FROM_HTTP : FROM_SQL)])(
      '%s',
      async (_name, thrown, message) => {
        expect(await caught(throwing(thrown), expression)).toStrictEqual({
          code: 'request-failure',
          message: `${operator} – ${message}`,
          path: [],
          operator,
        })
      }
    )

    test('a client that throws before returning a promise', async () => {
      const fig = instance((() => {
        throw new Error('sync')
      }) as never)
      expect(await caught(fig, expression)).toMatchObject({ code: 'request-failure' })
    })

    test('a failure the fallback does not catch', async () => {
      const error = await rejection<FigTreeError>(throwing(abortError()).evaluate(expression))
      expect(error.code).toBe('request-failure')
      expect(error.errorData).toBeUndefined()
    })
  })

  test('is located at its own node', async () => {
    const fig = throwing(new FigTreeError({ code: 'type-check', message: 'x', path: ['b', 0] }))
    expect(
      await fig.evaluate({ regions: { ...expression, fallback: '$error.path' } })
    ).toStrictEqual({ regions: ['regions'] })
  })
})

describe('a failure that fits passes as thrown', () => {
  test.each([
    ['http', OPERATORS[0].expression],
    ['graphQL', OPERATORS[1].expression],
  ])('http-status, extra fields and all, through %s', async (operator, expression) => {
    const failure = httpFailure({ ...STATUS, response: { message: 'Unknown region' } })
    failure.errorData!.retryAfter = 30
    const error = await caught(throwing(failure), expression)
    expect(error).toMatchObject({
      code: 'http-status',
      message: `${operator} – request failed (404): ${URL}`,
    })
    // The client's own object, by reference
    expect(error.errorData).toBe(failure.errorData)
  })

  test('invalid-response, an absent response read as null', async () => {
    const failure = new OperatorFailure('not JSON', {
      code: 'invalid-response',
      errorData: { url: URL },
    })
    expect(await caught(throwing(failure), OPERATORS[0].expression)).toMatchObject({
      code: 'invalid-response',
      errorData: { url: URL },
    })
  })

  test('sql-error, with the driver’s unpromised extras', async () => {
    const failure = sqlFailure(
      'postgres',
      Object.assign(new Error('relation "nope" does not exist'), { code: '42P01', table: 'nope' })
    )
    const error = await caught(throwing(failure), OPERATORS[2].expression)
    expect(error).toStrictEqual({
      code: 'sql-error',
      message: 'sql – postgres: relation "nope" does not exist',
      path: [],
      operator: 'sql',
      errorData: { driver: 'postgres', driverCode: '42P01', table: 'nope' },
    })
  })

  test('sql-error with no driverCode', async () => {
    const error = await caught(throwing(sqlFailure('mysql', 'gone')), OPERATORS[2].expression)
    expect(error).toMatchObject({ code: 'sql-error', errorData: { driver: 'mysql' } })
  })

  test('the issue’s example: the server’s message, reached through $error', async () => {
    const http = new MockHttpClient({
      failStatus: 400,
      failMessage: 'Bad Request',
      failResponse: { message: 'Invalid country entered in previous response' },
    })
    const fig = new FigTree({ operators: [coreOperators, httpOperators(http)] })
    const url = 'https://api.example.com/regions'
    expect(
      await fig.evaluate({
        regions: { $http: url, fallback: '$error' },
        message: { $http: url, fallback: '$error.errorData.response.message' },
      })
    ).toStrictEqual({
      regions: {
        code: 'http-status',
        message: `http – request failed (400): ${url}`,
        path: ['regions'],
        operator: 'http',
        errorData: {
          status: 400,
          statusText: 'Bad Request',
          url,
          response: { message: 'Invalid country entered in previous response' },
        },
      },
      message: 'Invalid country entered in previous response',
    })
  })
})

describe('every failure the package builds fits its code', () => {
  test.each([
    ['httpFailure', httpFailure(STATUS), 'http'],
    ['invalidResponse', invalidResponse('not JSON', URL, 'text'), 'http'],
    ['sqlFailure', sqlFailure('sqlite', Object.assign(new Error('x'), { code: 'E' })), 'sql'],
    ['sqlFailure with no code', sqlFailure('sqlite', 'x'), 'sql'],
  ] as const)('%s', (_name, failure, kind) => {
    expect(clientFailure(failure, kind)).toBe(failure)
  })
})

describe('the bundled clients, through their operators', () => {
  test('FetchClient: a network error is request-failure', async () => {
    const fetch = (async () => {
      throw new TypeError('fetch failed')
    }) as FetchLike
    const fig = new FigTree({ operators: [coreOperators, httpOperators(new FetchClient(fetch))] })
    expect(await caught(fig, OPERATORS[0].expression)).toStrictEqual({
      code: 'request-failure',
      message: 'http – fetch failed',
      path: [],
      operator: 'http',
    })
  })

  test('AxiosClient: a transport error keeps nothing of its config', async () => {
    const SECRET = 'Bearer SUPER-SECRET-VALUE'
    const axios = (async (config: Record<string, unknown>) => {
      // axios' own errors are Errors, carrying the whole config
      throw Object.assign(new Error('Network Error'), { isAxiosError: true, config })
    }) as unknown as AxiosLike
    ;(axios as { isAxiosError: unknown }).isAxiosError = () => true
    const fig = new FigTree({
      operators: [coreOperators, httpOperators(new AxiosClient(axios))],
      http: { headers: { Authorization: SECRET } },
    })
    const error = await caught(fig, OPERATORS[0].expression)
    expect(error).toStrictEqual({
      code: 'request-failure',
      message: 'http – Network Error',
      path: [],
      operator: 'http',
    })
    expect(JSON.stringify(error)).not.toContain('SUPER-SECRET')
  })

  test('PostgresConnection: named binds are sql-error, with no driverCode', async () => {
    const pg = { query: async () => ({ rows: [] }) }
    const fig = new FigTree({
      operators: [coreOperators, sqlOperators(new PostgresConnection(pg))],
    })
    const expression = { operator: 'sql', query: 'SELECT name FROM t WHERE id = :id' }
    expect(await caught(fig, { ...expression, values: { id: 42 } })).toMatchObject({
      code: 'sql-error',
      message: expect.stringMatching(/^sql – postgres: takes positional binds/),
      errorData: { driver: 'postgres' },
    })
  })
})

describe('the operators’ own failures keep their codes', () => {
  const answering = (body: unknown) => instance(async () => body, {})

  test('an input check: a relative URL with no base', async () => {
    const fig = answering({})
    expect(await caught(fig, { operator: 'http', url: '/users' })).toMatchObject({
      code: 'type-check',
    })
  })

  test.each([
    ['not an object', 'OK'],
    ['neither data nor errors', { other: 1 }],
    ['empty', null],
  ])('graphQL: a response that is %s is invalid-response', async (_name, body) => {
    expect(await caught(answering(body), OPERATORS[1].expression)).toMatchObject({
      code: 'invalid-response',
      errorData: { url: URL, response: body },
    })
  })

  test('graphQL: an errors array is graphql-errors', async () => {
    const errors = [{ message: 'Cannot query field "a"' }]
    expect(await caught(answering({ errors }), OPERATORS[1].expression)).toMatchObject({
      code: 'graphql-errors',
      message: 'graphQL – the GraphQL response carried 1 error: Cannot query field "a"',
      errorData: { errors },
    })
  })

  test('sql: a shape the rows cannot take', async () => {
    const fig = answering([{ a: 1, b: 2 }])
    expect(await caught(fig, { ...OPERATORS[2].expression, shape: 'firstValue' })).toMatchObject({
      code: 'type-check',
    })
  })
})

describe('timeouts and cancellation, whatever the client throws', () => {
  const NEVER = Symbol('never settles')

  const ON_ABORT: [string, unknown][] = [
    ['an AbortError', abortError()],
    ['a failure that fits', httpFailure(STATUS)],
    ['a FigTreeError coded aborted', new FigTreeError({ code: 'aborted', message: 'x', path: [] })],
    ['a string', 'gone'],
    ['nothing, ever', NEVER],
  ]

  /** A client that waits for its signal, then throws `thrown`. */
  const onAbort = (
    thrown: unknown,
    options: Partial<FigTreeOptions> = {},
    extra: FigTreeOptions['operators'] = []
  ) => {
    const seen = { started: 0, aborted: 0 }
    const respond = ({ signal }: { signal?: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        seen.started += 1
        const abort = () => {
          seen.aborted += 1
          if (thrown !== NEVER) reject(thrown)
        }
        if (signal?.aborted) abort()
        else signal?.addEventListener('abort', abort, { once: true })
      })
    return { seen, fig: instance(respond as () => Promise<never>, options, extra) }
  }

  describe.each(OPERATORS)('$operator', ({ expression }) => {
    test.each(ON_ABORT)('its own timeout is request-timeout, caught: %s', async (_name, thrown) => {
      const { fig } = onAbort(thrown)
      expect(await fig.evaluate({ ...expression, timeout: 20, fallback: '$error.code' })).toBe(
        'request-timeout'
      )
    })

    test.each(ON_ABORT)(
      'the caller’s signal is aborted, past the fallback: %s',
      async (_name, thrown) => {
        const { fig, seen } = onAbort(thrown)
        const controller = new AbortController()
        const running = fig.evaluate(
          { ...expression, fallback: 'caught' },
          { signal: controller.signal }
        )
        await new Promise((resolve) => setTimeout(resolve, 10))
        controller.abort()
        expect((await rejection<FigTreeError>(running)).code).toBe('aborted')
        expect(seen.started).toBe(1)
      }
    )

    test.each(ON_ABORT)(
      'the evaluation’s timeout cuts through a dynamic fallback: %s',
      async (_name, thrown) => {
        const { fig } = onAbort(thrown, { timeout: 20 })
        const running = fig.evaluate({ ...expression, fallback: { $plus: [1, 1] } })
        expect((await rejection<FigTreeError>(running)).code).toBe('timeout')
      }
    )

    test.each(ON_ABORT)(
      'and a shielded fallback answers it as timeout: %s',
      async (_name, thrown) => {
        const { fig } = onAbort(thrown, { timeout: 20 })
        expect(await fig.evaluate({ ...expression, fallback: '$error.code' })).toBe('timeout')
      }
    )

    test.each(ON_ABORT)(
      'a sibling deciding first cancels it silently: %s',
      async (_name, thrown) => {
        const spy = spyOp('caught', {})
        const { fig, seen } = onAbort(thrown, {}, [spy.definition])
        expect(
          await fig.evaluate({ $or: [true, { ...expression, fallback: { $caught: {} } }] })
        ).toBe(true)
        // It started, was told, and its failure reached nothing
        expect(seen).toEqual({ started: 1, aborted: 1 })
        expect(spy.calls).toHaveLength(0)
      }
    )
  })
})
