/**
 * Batch 8 — I/O ("Batch 8 — I/O" in
 * docs-dev/v3-specs/v3-operator-parameters-2.md).
 *
 * The one operator group that ships as factories rather than definitions,
 * because a definition here cannot exist without a client closed over it.
 * Clients are wiring, never options ("Operator registration" in the
 * Options area of docs-dev/v3-specs/v3-api.md), so they never reach a body
 * through `context.options` and a host cannot swap one per call.
 *
 * Registration is therefore structural, and so is absence: on a clientless
 * instance these operators do not exist, so `{ $http: … }` is an
 * unknown-operator error at `validate()` — v2's evaluation-time
 * 'No HTTP client provided' moves from the end user's runtime to the
 * author's toolchain.
 *
 * **The read contract.** v3 treats every I/O node as an idempotent read:
 * the machinery the rest of the engine grants — parallel children, early
 * resolution with cancellation, memoization, re-evaluation — is only
 * legitimate over requests that can be fired, cancelled, duplicated or
 * skipped without changing the world. That is why `method` admits `get`
 * and `post` only. It is documented rather than policed: a lint on SQL
 * write verbs was considered and dropped (Carl, September 2026), because
 * mutating POSTs are equally reachable and unlintable, so singling out SQL
 * would be inconsistent. The enforcement that works is a read-only role on
 * the connection.
 */
import { defineOperator } from '../defineOperator'
import { FetchClient } from '../clients/http'
import { ErrorCodes } from '../errorCodes'
import { FigTreeError } from '../FigTreeError'
import { OperatorFailure } from '../OperatorFailure'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import type { HttpClient, SqlConnection } from '../types'
import {
  assembleUrl,
  drill,
  graphQLData,
  isNonEmpty,
  jsonHeaders,
  mergeHeaders,
  requestKey,
  reshape,
  type EffectiveRequest,
  type SqlShape,
} from './ioHelpers'
import { pathFindings } from './shared'

/** The `timeout` declaration all three share, spelled once. */
const TIMEOUT = {
  type: 'integer',
  required: false,
  description:
    'Per-request deadline in ms; expiry is an ordinary failure this node’s fallback catches',
} as const

/** `returnPath`, likewise — `get.path`'s grammar, applied to a response. */
const RETURN_PATH = {
  type: ['string', 'array'],
  required: false,
  description: 'Dot/bracket path or segments array applied to the response; a miss is null',
} as const

const httpDefinition = (client: HttpClient) =>
  defineOperator({
    name: 'http',
    description: 'One HTTP request — GET or POST — returning the parsed JSON response',
    parameters: {
      url: {
        type: 'string',
        description:
          'A full http(s) URL is used verbatim; anything else — including an empty string — joins http.baseEndpoint',
      },
      method: {
        type: { literal: ['get', 'post'] },
        default: 'get',
        description:
          'Lowercase; the mutating verbs are deliberately absent — an expression is a read',
      },
      query: {
        type: 'object',
        required: false,
        elementNullPolicy: 'value',
        description: 'Query-string pairs; a null value omits its pair, a composite one is an error',
      },
      body: {
        // NOT `any`: register row 27 needs the type to EXCLUDE null, so a
        // whole-null body reads as unset. With `any` the engine would
        // deliver `null` and a missing payload would POST a JSON null
        // document — the opposite of the ruling
        type: ['string', 'number', 'boolean', 'array', 'object'],
        required: false,
        description:
          'The JSON payload; a whole-null body means NO body, while nulls inside one are JSON nulls',
      },
      headers: {
        type: 'object',
        required: false,
        elementNullPolicy: 'value',
        description:
          'Merged over the http.headers option per key; a null value removes an inherited pair',
      },
      returnPath: RETURN_PATH,
      timeout: TIMEOUT,
    },
    positionalParams: ['url'],
    timeoutParam: 'timeout',
    useCache: true,
    cache: 'manual',
    returns: 'any',
    validate: ({ returnPath, method, body }) => [
      ...pathFindings(returnPath, 'returnPath'),
      ...methodFindings(method),
      ...bodyFindings(method, body),
    ],
    evaluate: async ({ url, method, query, body, headers, returnPath }, context) => {
      if (method === 'get' && body !== undefined)
        throw new OperatorFailure("a GET carries no body — did you mean method: 'post'?", {
          code: ErrorCodes.typeCheck,
        })
      const request: EffectiveRequest = {
        method,
        url: assembleUrl(url, query, context.options.http?.baseEndpoint),
        headers: mergeHeaders(
          jsonHeaders(body !== undefined),
          context.options.http?.headers,
          headers
        ),
        ...(body !== undefined ? { body } : {}),
      }
      const response = await context.cache.memo(requestKey(request), () =>
        client.request({ ...request, signal: context.signal })
      )
      // Post-cache, and so outside the key: two nodes drilling one
      // response differently share the single fetch
      return drill(response, returnPath)
    },
  })

const graphQLDefinition = (client: HttpClient) =>
  defineOperator({
    name: 'graphQL',
    description: 'One GraphQL query — a POST of { query, variables } — returning the data field',
    parameters: {
      query: {
        type: 'string',
        description: 'The GraphQL document — the protocol’s own word, as sql.query is',
      },
      variables: {
        type: 'object',
        required: false,
        elementNullPolicy: 'value',
        description:
          'Query variables; a null value is CARRIED as JSON null, a nullable argument being meaningful GraphQL',
      },
      url: {
        type: 'string',
        required: false,
        description: 'Per-node endpoint override; unset means the graphQL.endpoint option',
      },
      headers: {
        type: 'object',
        required: false,
        elementNullPolicy: 'value',
        description: 'Merged over http.headers then graphQL.headers; a null value removes a pair',
      },
      returnPath: RETURN_PATH,
      timeout: TIMEOUT,
    },
    positionalParams: ['query', 'variables'],
    timeoutParam: 'timeout',
    useCache: true,
    cache: 'manual',
    returns: 'any',
    validate: ({ returnPath }) => pathFindings(returnPath, 'returnPath'),
    evaluate: async ({ query, variables, url, headers, returnPath }, context) => {
      // v2's magic placeholder string (`url: 'graphQLEndpoint'` meaning
      // "use the option") is dead: omission means that now
      const endpoint = url ?? context.options.graphQL?.endpoint
      if (endpoint === undefined)
        throw new OperatorFailure('no endpoint — supply url, or set the graphQL.endpoint option')
      const request: EffectiveRequest = {
        method: 'post',
        url: assembleUrl(endpoint, undefined, context.options.http?.baseEndpoint),
        headers: mergeHeaders(
          jsonHeaders(true),
          context.options.http?.headers,
          context.options.graphQL?.headers,
          headers
        ),
        body: { query, ...(isNonEmpty(variables) ? { variables } : {}) },
      }
      // The errors check sits INSIDE the unit: a 200 carrying `errors` is
      // a failure, and "failures are never cached" would be false if the
      // check ran outside and every later evaluation re-derived it
      const data = await context.cache.memo(requestKey(request), async () =>
        graphQLData(await client.request({ ...request, signal: context.signal }))
      )
      return drill(data, returnPath)
    },
  })

const sqlDefinition = (connection: SqlConnection) =>
  defineOperator({
    name: 'sql',
    description:
      'One SQL query against the registered connection. Expressions are READS — give the connection a read-only role and run mutations host-side',
    parameters: {
      query: {
        type: 'string',
        description: 'SQL text with the driver’s own placeholders — FigTree never parses SQL',
      },
      values: {
        type: ['array', 'object'],
        required: false,
        elementNullPolicy: 'value',
        description:
          'Bind values — positional as an array, named as an object; a null binds SQL NULL',
      },
      shape: {
        type: { literal: ['rows', 'firstRow', 'column', 'firstValue'] },
        default: 'rows',
        description:
          'rows: every row object; firstRow: the first; column: one column’s values; firstValue: one scalar',
      },
      noRowDefault: {
        type: 'any',
        required: false,
        default: null,
        nullPolicy: 'value',
        evaluation: 'lazy',
        description:
          'The answer when firstRow / firstValue find no row — never for rows / column, never on failure',
      },
      timeout: TIMEOUT,
    },
    positionalParams: ['query', '...values'],
    timeoutParam: 'timeout',
    useCache: true,
    cache: 'manual',
    returns: 'any',
    evaluate: async ({ query, values, shape, noRowDefault }, context) => {
      const request = { text: query, ...(isNonEmpty(values) ? { values } : {}) }
      const rows = await context.cache.memo(request, () =>
        connection.query({ ...request, signal: context.signal })
      )
      return reshape(rows as Record<string, unknown>[], shape as SqlShape, noRowDefault)
    },
  })

/** A near-miss on the one literal union an author is likely to shout. */
const methodFindings = (method: unknown) =>
  typeof method === 'string' && method !== method.toLowerCase()
    ? [
        {
          severity: 'hint' as const,
          parameter: 'method',
          message: `did you mean '${method.toLowerCase()}'? the verb is lowercase`,
        },
      ]
    : []

/**
 * The likely intent is a forgotten `method: 'post'`; the message says so.
 *
 * Only a LITERAL `'get'` is linted. A hook sees literal parameter values
 * only, so an absent `method` and a dynamic one are indistinguishable
 * here — and refusing `{ url, method: '$data.verb', body }` would refuse a
 * legal expression. The runtime check catches every case; this one is the
 * authoring-time half of it.
 */
const bodyFindings = (method: unknown, body: unknown) =>
  body !== undefined && method === 'get'
    ? [
        {
          severity: 'error' as const,
          parameter: 'body',
          message: "a GET carries no body — add method: 'post', or drop the body",
        },
      ]
    : []

/**
 * The wiring check. It catches the likely mistake, which is handing a
 * factory the DRIVER rather than a wrapper around it —
 * `httpOperators(axios)` — since the parameter is an `HttpClient`
 * instance and axios is never one.
 */
const assertWired = (
  wiring: unknown,
  factory: string,
  contract: string,
  method: 'request' | 'query'
): void => {
  if (
    typeof wiring !== 'object' ||
    wiring === null ||
    typeof (wiring as Record<string, unknown>)[method] !== 'function'
  )
    throw new FigTreeError({
      code: ErrorCodes.invalidOptions,
      message:
        `${factory}(): expected a ${contract} — an object with a ${method}() method. ` +
        'Wrap the driver first, e.g. new AxiosClient(axios) or new PostgresConnection(client)',
      path: [],
    })
}

/**
 * `http` + `graphQL`, one client serving both ("Operator registration" in
 * the Options area of docs-dev/v3-specs/v3-api.md).
 *
 * No argument defaults to `new FetchClient()` over global fetch, and the
 * throw for a runtime without one lands in that constructor — reached
 * through this default expression, which JavaScript evaluates ONLY when
 * the argument is omitted. So `httpOperators(myClient)` never probes the
 * global, which is the "only fetch gets this" clause for free. And because
 * a host writes this call inside the `operators` array literal, an absent
 * fetch fails before `new FigTree()` is even entered.
 */
export const httpOperators = (
  client: HttpClient = new FetchClient()
): ValidatedOperatorDefinition[] => {
  assertWired(client, 'httpOperators', 'HttpClient', 'request')
  return [httpDefinition(client), graphQLDefinition(client)]
}

/**
 * `sql`. No default: there is no ambient database connection to adopt,
 * which is the asymmetry with `httpOperators()` and the reason it is
 * stated rather than inferred.
 */
export const sqlOperators = (connection: SqlConnection): ValidatedOperatorDefinition[] => {
  assertWired(connection, 'sqlOperators', 'SqlConnection', 'query')
  return [sqlDefinition(connection)]
}
