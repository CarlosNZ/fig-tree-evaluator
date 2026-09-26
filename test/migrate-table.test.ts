/**
 * Phase 15.1 — the v2 converter's reference tables ("The v2 reference table"
 * and "v3's operator names" in docs-dev/v3-specs/v3-converter.md).
 *
 * Everything here is held to the published v2 package, the devDependency
 * `fig-tree-evaluator-v2`, never to /v2-src: the generated tables to a fresh
 * extraction, each `children` mapping to the package's `parseChildren`, and
 * the name rule to its `standardiseOperatorName`. A v2 release that changes
 * any of them fails here when the package is bumped.
 */
import {
  FigTreeEvaluator,
  standardiseOperatorName,
  type FigTreeConfig,
  type OperatorNode,
} from 'fig-tree-evaluator-v2'
import { extractV2Table, extractV3Names } from '../codegen/migrateTables'
import { coreDefinitions } from '../src/operators'
import { graphQLDefinition, httpDefinition, sqlDefinition } from '../src/operators/io'
import { V2_BEHAVIOUR } from '../src/migrate/v2/behaviour'
import { V2_CHILDREN, mapChildren } from '../src/migrate/v2/children'
import { standardiseV2Name, v2OperatorFor } from '../src/migrate/v2/names'
import {
  V2_NAMES,
  V2_PARAMETERS,
  V2_VERSION,
  type V2Operator,
} from '../src/migrate/v2/operators.generated'
import { V3_NAMES } from '../src/migrate/v3Names.generated'
import { MockHttpClient, MockSqlConnection } from './helpers'

const v2 = new FigTreeEvaluator()
const v2Operators = v2.getOperators()
const OPERATORS = Object.keys(V2_PARAMETERS) as V2Operator[]

describe('the generated tables', () => {
  test('the v2 table is a fresh extraction from the package, in its order', () => {
    const fresh = extractV2Table(v2Operators, v2.getVersion())
    expect({ version: V2_VERSION, names: V2_NAMES, parameters: V2_PARAMETERS }).toStrictEqual(fresh)
    // toStrictEqual ignores key order, which the tables keep as v2 has it
    expect(Object.keys(V2_NAMES)).toEqual(Object.keys(fresh.names))
    expect(Object.keys(V2_PARAMETERS)).toEqual(Object.keys(fresh.parameters))
  })

  test("the names are the alias table v2's engine looks up", () => {
    const { operatorAliases } = v2.getConfig()
    expect(V2_NAMES).toStrictEqual(operatorAliases)
    expect(Object.keys(V2_NAMES)).toEqual(Object.keys(operatorAliases))
  })

  test("MATCH's `[...branches]` pseudo-parameter is not tabled", () => {
    const declared = v2Operators.find(({ name }) => name === 'MATCH')?.parameters
    expect(declared?.map(({ name }) => name)).toContain('[...branches]')
    expect(V2_PARAMETERS.MATCH.map(({ name }) => name)).toEqual(['matchExpression', 'branches'])
  })

  test('the v3 names are a fresh extraction from the definitions, in their order', () => {
    const fresh = extractV3Names([
      ...coreDefinitions,
      httpDefinition(new MockHttpClient()),
      graphQLDefinition(new MockHttpClient()),
      sqlDefinition(new MockSqlConnection()),
    ])
    expect(V3_NAMES).toStrictEqual(fresh)
    expect(Object.keys(V3_NAMES)).toEqual(Object.keys(fresh))
  })
})

describe('the name rule', () => {
  const AWKWARD = [
    // Symbols, alone and mixed
    ...['+', '?', '!=', '&&', '||', '÷', '_', '$', '$plus', '+plus', 'plus!', '.', 'a.b'],
    // SCREAMING_CASE, snake, kebab, spaces
    ...['PLUS', 'NOT_EQUAL', 'GREATER_THAN', 'get_data', 'get-data', 'get data', 'Get-Data'],
    ...[' plus ', 'a__b', 'a--b', '--', '-_ -', 'snake_case_name', 'Title Case Name'],
    // Mixed case
    ...['notEqual', 'NotEqual', 'graphQL', 'GraphQL', 'GET', 'mIxEd_CaSe', 'ABCdef', 'abcDEF'],
    // Digits
    ...['v2plus', 'plus2', '2plus', '123', '1_2', 'a1b2', 'A1B2', 'x_1'],
    // Non-ASCII, the empty string, and inherited object keys
    ...['Ärger', 'plüs', '💥plus', '💥', '', ' ', '__proto__', 'constructor', 'toString'],
  ]

  test.each(AWKWARD)('%j standardizes as v2 standardizes it', (name) => {
    expect(standardiseV2Name(name)).toBe(standardiseOperatorName(name))
  })

  test('every name in the table, and a sample of generated strings, standardize as in v2', () => {
    // A seeded generator (mulberry32), so the sample is the same every run
    let seed = 1_234_567
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    }
    const alphabet = [...'aAbBzZ09_- $+?!.[]éÄ😀']
    const sample = Array.from({ length: 1_000 }, () =>
      Array.from(
        { length: Math.floor(random() * 12) },
        () => alphabet[Math.floor(random() * alphabet.length)]
      ).join('')
    )
    for (const name of [...Object.keys(V2_NAMES), ...OPERATORS, ...sample])
      expect([name, standardiseV2Name(name)]).toEqual([name, standardiseOperatorName(name)])
  })

  test('names resolve as v2 resolved them', () => {
    expect(v2OperatorFor('Plus')).toBe('PLUS')
    expect(v2OperatorFor('get_data')).toBe('OBJECT_PROPERTIES')
    expect(v2OperatorFor('+')).toBe('PLUS')
    expect(v2OperatorFor('graphQL')).toBe('GRAPHQL')
    expect(v2OperatorFor('nope')).toBeUndefined()
  })

  test.each(OPERATORS)('the canonical name %s resolves to itself', (operator) => {
    expect(v2OperatorFor(operator)).toBe(operator)
  })

  test('only the table itself resolves, not the keys every object inherits', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
      expect(v2OperatorFor(name)).toBeUndefined()
  })
})

describe('the `children` mappings', () => {
  // v2's parseChildren spreads the node and adds the parameters, and none of
  // them reads the config
  const parseChildren = (operator: V2Operator, children: unknown[]) => {
    const { parseChildren } = v2Operators.find(({ name }) => name === operator)!
    const node = { operator, children } as OperatorNode
    return Object.fromEntries(
      Object.entries(parseChildren(node, {} as FigTreeConfig)).filter(
        ([key]) => key !== 'operator' && key !== 'children'
      )
    )
  }

  const node = { operator: '+', values: [1, 2] }
  const GENERIC: unknown[][] = [
    [],
    [1],
    [1, 2],
    [1, 2, 3],
    [1, 2, 3, 4],
    [1, 2, 3, 4, 5],
    [null],
    [null, null],
    ['a', undefined, 'b'],
    [node, 'x'],
    [[1, 2], [3]],
    [{ key: 'a', value: 1 }],
  ]
  const SPECIFIC: Partial<Record<V2Operator, unknown[][]>> = {
    SPLIT: [['a b'], ['a,b', ','], ['a', undefined], ['a', null]],
    OBJECT_PROPERTIES: [['a.b'], ['a.b', 'none'], ['a.b', null], ['a.b', undefined], ['a.b', 1, 2]],
    MATCH: [
      ['x', 'a', 1, 'b', 2],
      ['x', 1, 'one', true, 'yes', false, 'no'],
      ['x', 'a', 1, 'a', 2],
      [node, 'a', node],
    ],
    BUILD_OBJECT: [
      [
        { key: 'a', value: 1 },
        { key: 'b', value: node },
      ],
      ['a', 1, 'b', node],
      [{ key: 'a' }, 'b'],
      [node, node],
    ],
    GET: [
      ['https://x'],
      ['https://x', 'q', 1],
      ['https://x', ['a', 'b'], 1, 2],
      ['https://x', ['a', 'b'], 1, 2, 'data.result'],
      ['https://x', ['a'], 1, 2, 3, 'data.result'],
      ['https://x', [], 'data.result'],
      ['https://x', 'q'],
      [undefined, ['a'], 1],
      [node, ['a'], node, node],
    ],
    GRAPHQL: [
      ['{ countries { name } }'],
      ['{ countries { name } }', 'https://x'],
      ['query ($a: ID) { a }', 'https://x', ['a'], 1],
      ['query ($a: ID) { a }', '', ['a'], 1, 'countries'],
      ['{ a }', undefined, [], 'a'],
    ],
    PASSTHRU: [[[1, 2]], [node]],
  }
  SPECIFIC.POST = SPECIFIC.GET

  const cases = OPERATORS.flatMap((operator) =>
    [...GENERIC, ...(SPECIFIC[operator] ?? [])].map((children) => [operator, children] as const)
  )

  test.each(cases)('%s %j', (operator, children) => {
    let expected: Record<string, unknown> | undefined
    try {
      expected = parseChildren(operator, children)
    } catch {
      // v2 rejected the shape; the mapping still gives a result
    }
    const mapped = mapChildren(operator, children)
    if (expected !== undefined) expect(mapped).toStrictEqual(expected)
  })

  test('the shapes v2 rejected are among the cases, so the fallbacks run', () => {
    const rejected = cases.filter(([operator, children]) => {
      try {
        parseChildren(operator, children)
        return false
      } catch {
        return true
      }
    })
    expect(new Set(rejected.map(([operator]) => operator))).toEqual(
      new Set(['MATCH', 'BUILD_OBJECT'])
    )
  })

  test('every parameter a mapping gives is a v2 parameter of its operator', () => {
    for (const [operator, children] of cases) {
      const declared = V2_PARAMETERS[operator].map(({ name }) => name)
      // OBJECT_PROPERTIES' second child is the node's fallback
      const allowed = operator === 'OBJECT_PROPERTIES' ? [...declared, 'fallback'] : declared
      for (const key of Object.keys(mapChildren(operator, children)))
        expect([operator, allowed]).toEqual([operator, expect.arrayContaining([key])])
    }
  })

  test('the eleven operators that take every child into one parameter', () => {
    const into = OPERATORS.filter((operator) => {
      const mapping = V2_CHILDREN[operator]
      return typeof mapping !== 'function' && 'into' in mapping
    })
    expect(into).toEqual([
      'AND',
      'OR',
      'EQUAL',
      'NOT_EQUAL',
      'PLUS',
      'SUBTRACT',
      'MULTIPLY',
      'DIVIDE',
      'GREATER_THAN',
      'LESS_THAN',
      'COUNT',
    ])
  })
})

describe('the behaviour table', () => {
  test.each(Object.entries(V2_BEHAVIOUR))('%s names its own parameters', (operator, behaviour) => {
    const declared = V2_PARAMETERS[operator as V2Operator].map(({ name }) => name)
    const named = behaviour.evaluatesContents ?? []
    expect(declared).toEqual(expect.arrayContaining(named))
  })
})
