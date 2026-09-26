/**
 * Phase 15.1 — fragments ("Fragments" in docs-dev/v3-specs/v3-converter.md):
 * the definitions `convertV2Fragments` writes, and the calls `convertV2`
 * writes against them.
 *
 * Every set of converted definitions registers in v3. Each call converts to
 * the output given, validates against them, and evaluates the same in the
 * published v2 package, with the v2 fragments, and in v3, with the converted
 * ones, or differs as its row says.
 */
import { FigTree } from '../src'
import type { FragmentDefinition } from '../src/fragments'
import type { V2Options } from '../src/migrationTypes'
import { convertV2, convertV2Fragments } from '../src/migrate/convert'
import type { IssueCode, Path } from '../src/migrate/issues'
import {
  RESERVED_NODE_KEYS as V3_NODE_KEYS,
  RESERVED_REGISTRATION_NAMES as V3_REGISTRATION_NAMES,
} from '../src/names'
import { checkType, isExpectedType, type ExpectedType } from '../src/typeCheck'
import { RESERVED_NAMES, RESERVED_NODE_KEYS, V3_TYPES, fitsType } from '../src/migrate/v3Values'
import {
  clone,
  deepFreeze,
  v2Outcome,
  v3Errors,
  v3Outcome,
  type Outcome,
} from './helpers/migration'

type Raised = { code: IssueCode; path: Path }

const raised = (issues: { code: IssueCode; path: Path }[]) =>
  issues.map(({ code, path }) => ({ code, path }))

const convertFragments = (options: V2Options) =>
  convertV2Fragments(deepFreeze(clone(options)) as V2Options)

const convert = (input: unknown, options: V2Options) =>
  convertV2(deepFreeze(clone(input)), deepFreeze(clone(options)) as V2Options)

const NOTE = 'v2 conversion: '

interface Call {
  input: unknown
  data?: Record<string, unknown>
  /** The converted call, where the example pins it */
  expected?: unknown
  /** Where the engines differ, each one's outcome */
  differs?: { v2: Outcome; v3: Outcome }
}

/**
 * A call converted against the v2 fragments, validated and evaluated on an
 * instance holding their conversions
 */
const checkCall = async (fig: FigTree, call: Call, options: V2Options) => {
  const { expression } = convert(call.input, options)
  if (call.expected !== undefined) expect(expression).toEqual(call.expected)
  expect(v3Errors(fig, expression, call.data)).toEqual([])
  const v2 = await v2Outcome(call.input, { ...options, data: call.data })
  const v3 = await v3Outcome(fig, expression, call.data)
  if (call.differs) expect({ v2, v3 }).toEqual(call.differs)
  else expect(v3).toEqual(v2)
}

describe('definitions', () => {
  interface Example {
    name: string
    fragments: Record<string, unknown>
    /** The rest of the v2 options: `functions`, `evaluateFullObject` */
    options?: V2Options
    expected: Record<string, FragmentDefinition>
    issues?: Raised[]
    calls?: Call[]
  }

  const EXAMPLES: Example[] = [
    {
      name: 'placeholders are inferred as optional parameters',
      fragments: { adder: { operator: '+', values: '$values' } },
      expected: {
        adder: {
          expression: { operator: 'plus', values: '$params.values' },
          parameters: { values: { type: 'any', default: '$values' } },
        },
      },
      calls: [
        { input: { fragment: 'adder', parameters: { $values: [1, 2] } } },
        { input: { $adder: { $values: [3, 4] } } },
      ],
    },
    {
      name: '`metadata` comes off the body into the wrapper',
      fragments: {
        greet: {
          operator: 'stringSubstitution',
          string: 'Hello %1!',
          substitutions: ['$name'],
          metadata: {
            description: 'Greets someone',
            textColor: 'white',
            backgroundColor: '#123456',
            parameters: [
              { name: '$name', type: 'string', required: true, description: 'Who to greet' },
            ],
          },
        },
      },
      expected: {
        greet: {
          expression: {
            operator: 'buildString',
            template: 'Hello %1!',
            substitutions: ['$params.name'],
            trim: true,
          },
          parameters: { name: { type: 'string', description: 'Who to greet' } },
          description: 'Greets someone',
          metadata: { textColor: 'white', backgroundColor: '#123456' },
        },
      },
      calls: [{ input: { $greet: { $name: 'Ann' } } }],
    },
    {
      name: 'only `required: true` without a default is required',
      fragments: {
        declared: {
          operator: '+',
          values: ['$a', '$b', '$c'],
          metadata: {
            parameters: [
              { name: '$a', type: 'number', required: true, default: 1 },
              { name: '$b', type: 'number', required: false },
              { name: '$c', type: 'number' },
            ],
          },
        },
      },
      expected: {
        declared: {
          expression: { operator: 'plus', values: ['$params.a', '$params.b', '$params.c'] },
          parameters: {
            a: { type: 'number', default: 1 },
            b: { type: 'number', required: false },
            c: { type: 'number', required: false },
          },
        },
      },
      calls: [{ input: { fragment: 'declared', parameters: { $b: 2, $c: 3 } } }],
    },
    {
      name: 'types v3 lacks, and a default outside its type, become `any`',
      fragments: {
        typed: {
          operator: '+',
          values: ['$a', '$d', '$e'],
          metadata: {
            parameters: [
              { name: '$a', type: ['number', 'undefined'] },
              { name: '$b', type: 'date' },
              { name: '$c', type: 'undefined' },
              { name: '$d', type: 'string', default: 5 },
              { name: '$e', type: 'number', required: true, label: 'E' },
            ],
          },
        },
      },
      expected: {
        typed: {
          expression: { operator: 'plus', values: ['$params.a', '$params.d', '$params.e'] },
          parameters: {
            a: { type: 'number', required: false },
            b: { type: 'any', required: false },
            c: { type: 'any', required: false },
            d: { type: 'any', default: 5 },
            e: { type: 'number', metadata: { label: 'E' } },
          },
        },
      },
      issues: [
        { code: 'unknown-parameter-type', path: ['typed', 'metadata', 'parameters', 1, 'type'] },
        { code: 'unknown-parameter-type', path: ['typed', 'metadata', 'parameters', 2, 'type'] },
        { code: 'default-outside-type', path: ['typed', 'metadata', 'parameters', 3, 'default'] },
      ],
      calls: [{ input: { fragment: 'typed', parameters: { $a: 1, $e: 0 } } }],
    },
    {
      name: "a top-level `$` key is the parameter's default",
      fragments: { withDefault: { operator: '+', values: ['$n', 1], $n: 10 } },
      expected: {
        withDefault: {
          expression: { operator: 'plus', values: ['$params.n', 1] },
          parameters: { n: { type: 'any', default: 10 } },
        },
      },
      calls: [
        { input: { fragment: 'withDefault' } },
        { input: { fragment: 'withDefault', parameters: { $n: 3 } } },
      ],
    },
    {
      name: 'a declared default beats the top-level one',
      fragments: {
        both: {
          operator: '+',
          values: ['$n', 1],
          $n: 10,
          metadata: { parameters: [{ name: '$n', type: 'number', default: 5 }] },
        },
      },
      expected: {
        both: {
          expression: { operator: 'plus', values: ['$params.n', 1] },
          parameters: { n: { type: 'number', default: 5 } },
        },
      },
      issues: [{ code: 'overridden-value', path: ['both', '$n'] }],
      calls: [{ input: { fragment: 'both' } }],
    },
    {
      name: 'with `evaluateFullObject`, the top-level default beats the declared one',
      fragments: {
        both: {
          operator: '+',
          values: ['$n', 1],
          $n: 10,
          metadata: { parameters: [{ name: '$n', type: 'number', default: 5 }] },
        },
      },
      options: { evaluateFullObject: true },
      expected: {
        both: {
          expression: { operator: 'plus', values: ['$params.n', 1] },
          parameters: { n: { type: 'number', default: 10 } },
        },
      },
      issues: [
        { code: 'overridden-value', path: ['both', 'metadata', 'parameters', 0, 'default'] },
      ],
      calls: [{ input: { fragment: 'both' } }],
    },
    {
      name: 'a computed top-level default is bound at the root, over the argument',
      fragments: {
        nodeDefault: {
          operator: '+',
          values: ['$n', 1],
          $n: { operator: 'getData', property: 'x' },
        },
      },
      expected: {
        nodeDefault: {
          expression: {
            operator: 'plus',
            values: ['$vars.n', 1],
            vars: { n: { operator: 'firstOf', values: ['$params.n', '$data.x'] } },
          },
          parameters: { n: { type: 'any', required: false } },
        },
      },
      calls: [
        { input: { fragment: 'nodeDefault' }, data: { x: 7 } },
        { input: { fragment: 'nodeDefault', parameters: { $n: 3 } }, data: { x: 7 } },
      ],
    },
    {
      name: 'a computed declared default is bound the same way',
      fragments: {
        nodeDefault: {
          operator: '+',
          values: ['$n', 1],
          metadata: {
            parameters: [
              { name: '$n', type: 'number', default: { operator: 'getData', property: 'x' } },
            ],
          },
        },
      },
      expected: {
        nodeDefault: {
          expression: {
            operator: 'plus',
            values: ['$vars.n', 1],
            vars: { n: { operator: 'firstOf', values: ['$params.n', '$data.x'] } },
          },
          parameters: { n: { type: 'number', required: false } },
        },
      },
      calls: [{ input: { fragment: 'nodeDefault' }, data: { x: 7 } }],
    },
    {
      name: 'a default holding a placeholder is bound the same way, so its note has a place',
      fragments: { quoting: { operator: '+', values: ['$b', 1], $b: { operator: 'nope' } } },
      expected: {
        quoting: {
          expression: {
            operator: 'plus',
            values: ['$vars.b', 1],
            vars: {
              b: {
                operator: 'firstOf',
                values: [
                  '$params.b',
                  {
                    '//':
                      `${NOTE}\`nope\` is not a v2 operator. If it is one of your v2 custom functions, ` +
                      "list it in the conversion's `functions` option and convert again, so the call converts to a call on a custom operator of that name. The node is quoted unconverted.",
                    operator: 'literal',
                    value: { operator: 'nope' },
                  },
                ],
              },
            },
          },
          parameters: { b: { type: 'any', required: false } },
        },
      },
      issues: [{ code: 'unknown-operator', path: ['quoting', '$b', 'operator'] }],
      calls: [{ input: { fragment: 'quoting', parameters: { $b: 2 } } }],
    },
    {
      name: 'a declared `default: undefined` is no default, as v2 read it',
      fragments: {
        typed: {
          operator: '+',
          values: ['$a', 1],
          metadata: { parameters: [{ name: '$a', type: 'number', default: undefined }] },
        },
      },
      expected: {
        typed: {
          expression: { operator: 'plus', values: ['$params.a', 1] },
          parameters: { a: { type: 'number', required: false } },
        },
      },
      calls: [{ input: { fragment: 'typed', parameters: { $a: 2 } } }],
    },
    {
      name: 'a name a called fragment reads from the body is a parameter of the body',
      fragments: {
        inner: { operator: '+', values: ['$m', 100] },
        outer: { operator: '+', values: [{ fragment: 'inner' }, 1] },
        both: { operator: '+', values: [{ fragment: 'inner' }, '$m'] },
      },
      expected: {
        inner: {
          expression: { operator: 'plus', values: ['$params.m', 100] },
          parameters: { m: { type: 'any', default: '$m' } },
        },
        outer: {
          expression: {
            operator: 'plus',
            values: [{ fragment: 'inner', parameters: { m: '$params.m' } }, 1],
          },
          parameters: { m: { type: 'any', default: '$m' } },
        },
        both: {
          expression: {
            operator: 'plus',
            values: [{ fragment: 'inner', parameters: { m: '$params.m' } }, '$params.m'],
          },
          parameters: { m: { type: 'any', default: '$m' } },
        },
      },
      calls: [
        { input: { fragment: 'outer', parameters: { $m: 5 } } },
        { input: { fragment: 'both', parameters: { $m: 1 } } },
      ],
    },
    {
      name: 'an alias inside the body shadows the parameter',
      fragments: {
        nested: {
          operator: '+',
          values: [{ operator: '+', $n: 50, values: ['$n', 1] }, '$n'],
        },
      },
      expected: {
        nested: {
          expression: {
            operator: 'plus',
            values: [{ operator: 'plus', values: ['$vars.n', 1], vars: { n: 50 } }, '$params.n'],
          },
          parameters: { n: { type: 'any', default: '$n' } },
        },
      },
      calls: [{ input: { fragment: 'nested', parameters: { $n: 3 } } }],
    },
    {
      name: "the body's own `fallback` reads its parameters, where v2's read the caller's",
      fragments: { divideBy: { operator: '/', values: [1, '$d'], fallback: '$d' } },
      expected: {
        divideBy: {
          expression: { operator: 'divide', value: 1, by: '$params.d', fallback: '$params.d' },
          parameters: { d: { type: 'any', default: '$d' } },
        },
      },
      calls: [
        {
          input: { fragment: 'divideBy', parameters: { $d: 0 } },
          differs: { v2: { value: '$d' }, v3: { value: 0 } },
        },
      ],
    },
    {
      name: 'a body that is not an operator node is data',
      fragments: {
        constant: 42,
        text: 'Hello $name',
        object: { a: { $plus: [1, 2] } },
        call: { fragment: 'constant' },
        unresolved: { $nope: 1 },
        nothing: null,
      },
      expected: {
        constant: { expression: 42 },
        text: { expression: 'Hello $name' },
        object: { expression: { operator: 'literal', value: { a: { $plus: [1, 2] } } } },
        call: { expression: { operator: 'literal', value: { fragment: 'constant' } } },
        unresolved: { expression: { operator: 'literal', value: { $nope: 1 } } },
        nothing: { expression: null },
      },
      calls: [
        { input: { fragment: 'constant' } },
        { input: { fragment: 'text' } },
        { input: { fragment: 'object' } },
        { input: { fragment: 'call' } },
        { input: { fragment: 'unresolved' } },
        { input: { fragment: 'nothing' } },
      ],
    },
    {
      name: 'a shorthand body is an operator node, with its `metadata` taken off',
      fragments: { short: { $plus: ['$n', 1], metadata: { description: 'Adds one' } } },
      expected: {
        short: {
          expression: { operator: 'plus', values: ['$params.n', 1] },
          parameters: { n: { type: 'any', default: '$n' } },
          description: 'Adds one',
        },
      },
      calls: [{ input: { $short: { $n: 1 } } }],
    },
    {
      name: 'a `metadata` that is not an object is a key v2 ignored',
      fragments: { odd: { operator: '+', values: [1, 2], metadata: 'x' } },
      expected: {
        odd: { expression: { '//': { metadata: 'x' }, operator: 'plus', values: [1, 2] } },
      },
      calls: [{ input: { fragment: 'odd' } }],
    },
    {
      name: 'a body v2 could not read is quoted, and keeps its declared parameters',
      fragments: {
        broken: {
          operator: 'nope',
          values: ['$x'],
          metadata: { parameters: [{ name: '$x' }] },
        },
      },
      expected: {
        broken: {
          expression: {
            '//':
              `${NOTE}\`nope\` is not a v2 operator. If it is one of your v2 custom functions, ` +
              "list it in the conversion's `functions` option and convert again, so the call converts to a call on a custom operator of that name. The node is quoted unconverted.",
            operator: 'literal',
            value: { operator: 'nope', values: ['$x'] },
          },
          parameters: { x: { required: false } },
        },
      },
      issues: [{ code: 'unknown-operator', path: ['broken', 'operator'] }],
      calls: [
        {
          input: { fragment: 'broken', parameters: { $x: 1 } },
          differs: {
            v2: { error: true },
            v3: { value: { operator: 'nope', values: ['$x'] } },
          },
        },
      ],
    },
    {
      name: 'names v3 cannot register are renamed, and calls follow',
      fragments: {
        round: { operator: '+', values: ['$a.b', '$fallback'] },
        round_2: 2,
        'my.frag': 3,
        $dollar: 4,
        data: 5,
        fn: 6,
      },
      options: { functions: { fn: () => 0 } },
      expected: {
        round_3: {
          expression: { operator: 'plus', values: ['$params.a_b', '$params.fallback_2'] },
          parameters: {
            a_b: { type: 'any', default: '$a.b' },
            fallback_2: { type: 'any', default: '$fallback' },
          },
        },
        round_2: { expression: 2 },
        my_frag: { expression: 3 },
        dollar: { expression: 4 },
        data_2: { expression: 5 },
        fn_2: { expression: 6 },
      },
      issues: [
        { code: 'name-renamed', path: ['round'] },
        { code: 'name-renamed', path: ['round', 'values', 0] },
        { code: 'name-renamed', path: ['round', 'values', 1] },
        { code: 'name-renamed', path: ['my.frag'] },
        { code: 'name-renamed', path: ['$dollar'] },
        { code: 'name-renamed', path: ['data'] },
        { code: 'name-renamed', path: ['fn'] },
      ],
      calls: [
        {
          input: { fragment: 'round', parameters: { '$a.b': 2, $fallback: 1 } },
          expected: { fragment: 'round_3', parameters: { a_b: 2, fallback_2: 1 } },
        },
        { input: { fragment: 'my.frag' }, expected: { fragment: 'my_frag' } },
        { input: { fragment: '$dollar' }, expected: { fragment: 'dollar' } },
        { input: { fragment: 'data' }, expected: { fragment: 'data_2' } },
        { input: { fragment: 'fn' }, expected: { fragment: 'fn_2' } },
      ],
    },
  ]

  test.each(EXAMPLES)(
    '$name',
    async ({ fragments, options = {}, expected, issues = [], calls = [] }) => {
      const all = { ...options, fragments }
      const converted = convertFragments(all)
      expect(converted.fragments).toEqual(expected)
      expect(raised(converted.issues)).toEqual(issues)
      const fig = new FigTree({ fragments: converted.fragments })
      expect(fig.getFragments().flatMap(({ warnings }) => warnings)).toEqual([])
      for (const call of calls) await checkCall(fig, call, all)
    }
  )

  test('the messages name the type and the default', () => {
    const { issues } = convertFragments({
      fragments: {
        typed: {
          operator: '+',
          values: ['$a', '$b'],
          metadata: {
            parameters: [
              { name: '$a', type: 'date' },
              { name: '$b', type: 'string', default: 5 },
            ],
          },
        },
      },
    })
    expect(issues.map(({ message }) => message)).toEqual([
      "`date` is not a v3 type, so the parameter takes `'any'`.",
      "The default `5` is not of the declared type `'string'`. v2 never checked it, and v3 would refuse to register the fragment, so the parameter takes `'any'`.",
    ])
  })

  test('the renames and their reasons', () => {
    const { issues } = convertFragments({
      fragments: { round: 1, 'my.frag': 2, $dollar: 3, data: 4, fn: 5, '': 6 },
      functions: ['fn'],
    })
    expect(issues.map(({ message }) => message)).toEqual([
      "`round` cannot be registered in v3 (it is already a v3 operator's name), so it is renamed `round_2`, and calls follow. Update anything outside expressions that uses the old name.",
      '`my.frag` cannot be registered in v3 (a v3 name cannot hold a `.`), so it is renamed `my_frag`, and calls follow. Update anything outside expressions that uses the old name.',
      '`$dollar` cannot be registered in v3 (a v3 name cannot start with `$`), so it is renamed `dollar`, and calls follow. Update anything outside expressions that uses the old name.',
      '`data` cannot be registered in v3 (it is a reserved name), so it is renamed `data_2`, and calls follow. Update anything outside expressions that uses the old name.',
      "`fn` cannot be registered in v3 (it is a custom function's name, which becomes a v3 operator), so it is renamed `fn_2`, and calls follow. " +
        'Update anything outside expressions that uses the old name.',
      '`` cannot be registered in v3 (a v3 name cannot be empty), so it is renamed `_`, and calls follow. Update anything outside expressions that uses the old name.',
    ])
  })

  test('the renames are the same whatever order the fragments come in', () => {
    const forward = convertFragments({ fragments: { 'a.b': 1, 'a[b': 2 } }).fragments
    const backward = convertFragments({ fragments: { 'a[b': 2, 'a.b': 1 } }).fragments
    expect(forward).toEqual({ a_b: { expression: 1 }, a_b_2: { expression: 2 } })
    expect(backward).toEqual(forward)
  })

  test('a cycle, which v2 never finished, still ends conversion', () => {
    const { fragments } = convertFragments({
      fragments: {
        a: { operator: '+', values: [{ fragment: 'b' }, '$x'] },
        b: { operator: '+', values: [{ fragment: 'a' }, '$y'] },
      },
    })
    expect(Object.keys(fragments.a.parameters ?? {})).toEqual(['x', 'y'])
    expect(Object.keys(fragments.b.parameters ?? {})).toEqual(['x', 'y'])
  })

  test('calls follow the renames without an issue of their own', () => {
    const { expression, issues } = convert({ fragment: 'round' }, { fragments: { round: 1 } })
    expect(expression).toEqual({ fragment: 'round_2' })
    expect(issues).toEqual([])
  })
})

describe('calls', () => {
  // A read of a missing path, which failed in v2
  const missing = { operator: 'getData', property: 'missing' }
  const FRAGMENTS = {
    adder: { operator: '+', values: '$values' },
    pair: { operator: '+', values: ['$a', '$b'] },
    withDefault: { operator: '+', values: ['$n', 1], $n: 10 },
    reader: { operator: '+', values: ['$n', 100] },
    divider: { operator: '/', values: ['$a', '$b'] },
    readsMissing: { operator: '+', values: [{ operator: 'getData', property: 'missing' }, 1] },
    plusBody: { operator: '+', values: [1, 2] },
    countBody: { operator: 'count', values: [1, 2] },
    countOutput: { operator: 'count', values: [1, 2], outputType: 'number' },
    countTyped: { operator: 'count', values: [1, 2], type: 'string' },
    plusNumber: { operator: '+', values: ['1', '2'], type: 'number' },
    constant: 42,
    counter: { operator: '+', values: ['$count', 1] },
    picker: { operator: 'getData', property: '$field' },
    twice: {
      operator: '?',
      condition: '$condition',
      valueIfTrue: '$condition',
      valueIfFalse: 'no',
    },
  }

  const converted = convertFragments({ fragments: FRAGMENTS })
  const fig = new FigTree({ fragments: converted.fragments })

  test('the fixture converts, with the issues of its own output types', () => {
    expect(raised(converted.issues)).toEqual([
      { code: 'output-type', path: ['countOutput', 'outputType'] },
      { code: 'output-type', path: ['countTyped', 'type'] },
      { code: 'output-type', path: ['plusNumber', 'type'] },
    ])
  })

  interface Example extends Call {
    name: string
    options?: V2Options
    expected: unknown
    issues?: Raised[]
  }

  const bodyOverride = (key: string) =>
    `${NOTE}In v2, \`${key}\` set the body's own \`${key}\`, through the call's spread over it. A v3 call passes only arguments. Removed. Make it a parameter of the fragment, or change the body.`

  const EXAMPLES: Example[] = [
    // Arguments
    {
      name: 'a canonical call',
      input: { fragment: 'adder', parameters: { $values: [1, 2] } },
      expected: { fragment: 'adder', parameters: { values: [1, 2] } },
    },
    {
      name: 'a placeholder in a path',
      input: { fragment: 'picker', parameters: { $field: 'n' } },
      data: { n: 7 },
      expected: { fragment: 'picker', parameters: { field: 'n' } },
    },
    {
      name: 'arguments on the call node',
      input: { fragment: 'pair', $a: 1, $b: 2 },
      expected: { fragment: 'pair', parameters: { a: 1, b: 2 } },
    },
    {
      name: 'a shorthand call',
      input: { $pair: { $a: 1, $b: 2 } },
      expected: { fragment: 'pair', parameters: { a: 1, b: 2 } },
    },
    {
      name: 'a node as an argument',
      input: { fragment: 'adder', parameters: { $values: [1, { $plus: [1, 1] }] } },
      expected: {
        fragment: 'adder',
        parameters: { values: [1, { operator: 'plus', values: [1, 1] }] },
      },
    },
    {
      name: "arguments read the caller's scope",
      input: {
        operator: '+',
        $x: 5,
        values: [{ fragment: 'adder', parameters: { $values: ['$x', 1] } }, 0],
      },
      expected: {
        operator: 'plus',
        values: [{ fragment: 'adder', parameters: { values: ['$vars.x', 1] } }, 0],
        vars: { x: 5 },
      },
    },
    {
      name: 'a call with no arguments',
      input: { fragment: 'withDefault' },
      expected: { fragment: 'withDefault' },
    },
    {
      name: "a `parameters` argument beats the body's default",
      input: { fragment: 'withDefault', parameters: { $n: 3 } },
      expected: { fragment: 'withDefault', parameters: { n: 3 } },
    },
    {
      name: "the body's default beats a call-node argument",
      input: { fragment: 'withDefault', $n: 3 },
      expected: { fragment: 'withDefault' },
      issues: [{ code: 'shadowed-argument', path: ['$n'] }],
    },
    {
      name: "with `evaluateFullObject`, the body's default beats a `parameters` argument",
      input: { fragment: 'withDefault', parameters: { $n: 3 } },
      options: { evaluateFullObject: true },
      expected: { fragment: 'withDefault' },
      issues: [{ code: 'shadowed-argument', path: ['parameters', '$n'] }],
    },
    {
      name: "a parameter the call leaves empty reads the caller's alias",
      input: { operator: '+', $n: 5, values: [{ fragment: 'reader' }, 100] },
      expected: {
        operator: 'plus',
        values: [{ fragment: 'reader', parameters: { n: '$vars.n' } }, 100],
        vars: { n: 5 },
      },
    },
    {
      name: "a parameter with a default does not read the caller's alias",
      input: { operator: '+', $n: 5, values: [{ fragment: 'withDefault' }, 100] },
      expected: {
        operator: 'plus',
        values: [{ fragment: 'withDefault' }, 100],
        vars: { n: 5 },
      },
    },
    {
      name: 'an argument the definition does not have',
      input: { fragment: 'pair', parameters: { $a: 1, $b: 2, $c: 3 } },
      expected: { fragment: 'pair', parameters: { a: 1, b: 2 } },
      issues: [{ code: 'unknown-argument', path: ['parameters', '$c'] }],
    },
    {
      name: 'an argument the definition does not have, which v2 evaluated',
      input: { fragment: 'pair', parameters: { $a: 1, $b: 2, $c: missing } },
      expected: { fragment: 'pair', parameters: { a: 1, b: 2 } },
      issues: [
        { code: 'unknown-argument', path: ['parameters', '$c'] },
        { code: 'discarded-expression', path: ['parameters', '$c'] },
      ],
      differs: { v2: { error: true }, v3: { value: 3 } },
    },
    {
      name: 'a call-node argument the body shadows, which v2 never evaluated',
      input: { fragment: 'withDefault', $n: missing },
      expected: { fragment: 'withDefault' },
      issues: [{ code: 'shadowed-argument', path: ['$n'] }],
    },
    {
      name: 'with `evaluateFullObject`, a shadowed `parameters` argument, which v2 evaluated',
      input: { fragment: 'withDefault', parameters: { $n: missing } },
      options: { evaluateFullObject: true },
      expected: { fragment: 'withDefault' },
      issues: [
        { code: 'shadowed-argument', path: ['parameters', '$n'] },
        { code: 'discarded-expression', path: ['parameters', '$n'] },
      ],
      differs: { v2: { error: true }, v3: { value: 11 } },
    },
    {
      name: 'an argument reads another argument of the call',
      input: { fragment: 'pair', $a: '$b', $b: 5 },
      expected: { fragment: 'pair', parameters: { a: '$vars.b', b: '$vars.b' }, vars: { b: 5 } },
    },
    {
      name: 'an argument another reads, which the definition does not have',
      input: { fragment: 'reader', $n: '$picked', $picked: { $plus: [2, 3] } },
      expected: {
        fragment: 'reader',
        parameters: { n: '$vars.picked' },
        vars: { picked: { operator: 'plus', values: [2, 3] } },
      },
    },
    {
      name: "the caller's alias beats an argument of the same name",
      input: {
        operator: '+',
        $picked: 1,
        values: [{ fragment: 'reader', $n: '$picked', $picked: 5 }, 0],
      },
      expected: {
        operator: 'plus',
        values: [{ fragment: 'reader', parameters: { n: '$vars.picked' } }, 0],
        vars: { picked: 1 },
      },
      issues: [{ code: 'unknown-argument', path: ['values', 0, '$picked'] }],
    },
    {
      name: 'a missing read in an argument another reads was beneath the next `fallback` out',
      input: {
        operator: '+',
        values: [{ fragment: 'reader', $n: '$picked', $picked: missing, fallback: 0 }, 1],
        fallback: -1,
      },
      expected: {
        operator: 'plus',
        values: [
          {
            fragment: 'reader',
            parameters: { n: '$vars.picked' },
            fallback: 0,
            vars: { picked: '$data.missing' },
          },
          1,
        ],
        fallback: -1,
      },
      issues: [{ code: 'missing-data-fallback', path: ['fallback'] }],
      differs: { v2: { value: -1 }, v3: { value: null } },
    },
    {
      name: 'an argument to a body that is not an operator node',
      input: { fragment: 'constant', $x: 1 },
      expected: { fragment: 'constant' },
      issues: [{ code: 'unknown-argument', path: ['$x'] }],
    },
    {
      name: "an argument named after a v2 operator converts as written, unlike v2's canonical form",
      input: { fragment: 'counter', $count: 5 },
      expected: { fragment: 'counter', parameters: { count: 5 } },
    },

    // Unprefixed keys in `parameters`
    {
      name: "an unprefixed key over the body's own key holding its placeholder",
      input: { fragment: 'adder', parameters: { values: [1, 2] } },
      expected: { fragment: 'adder', parameters: { values: [1, 2] } },
    },
    {
      name: 'an unprefixed key beats the `$` one',
      input: { fragment: 'adder', parameters: { $values: [1], values: [2] } },
      expected: { fragment: 'adder', parameters: { values: [2] } },
      issues: [{ code: 'overridden-value', path: ['parameters', '$values'] }],
    },
    {
      name: 'the `$` one, which v2 evaluated all the same',
      input: { fragment: 'adder', parameters: { $values: [missing], values: [2] } },
      expected: { fragment: 'adder', parameters: { values: [2] } },
      issues: [
        { code: 'overridden-value', path: ['parameters', '$values'] },
        { code: 'discarded-expression', path: ['parameters', '$values'] },
      ],
      differs: { v2: { error: true }, v3: { value: 2 } },
    },
    {
      name: 'an unprefixed key naming nothing on the body',
      input: { fragment: 'withDefault', parameters: { n: 5 } },
      expected: { '//': bodyOverride('n'), fragment: 'withDefault' },
      issues: [{ code: 'body-override', path: ['parameters', 'n'] }],
    },
    {
      name: 'an unprefixed key over a placeholder the body reads twice',
      input: { fragment: 'twice', parameters: { condition: true } },
      expected: { '//': bodyOverride('condition'), fragment: 'twice' },
      issues: [{ code: 'body-override', path: ['parameters', 'condition'] }],
    },

    // Computed parts
    {
      name: 'computed arguments, with the call-node arguments beside them dropped',
      input: {
        fragment: 'pair',
        parameters: {
          operator: 'buildObject',
          properties: [
            { key: '$a', value: 1 },
            { key: '$b', value: 2 },
          ],
        },
        $c: 3,
      },
      expected: {
        '//': `${NOTE}The arguments are computed. v2's had \`$\` names and v3's do not, so as written they fill nothing. Make the computing expression produce names without the \`$\`.`,
        fragment: 'pair',
        parameters: {
          operator: 'buildObject',
          entries: [
            { key: '$a', value: 1 },
            { key: '$b', value: 2 },
          ],
        },
      },
      issues: [{ code: 'computed-arguments', path: ['parameters'] }],
      differs: { v2: { value: 3 }, v3: { value: '$a$b' } },
    },
    {
      name: 'a computed name is quoted as written',
      input: { fragment: { $getData: 'which' }, parameters: { $values: [1, 2] } },
      data: { which: 'adder' },
      expected: {
        '//': `${NOTE}The fragment name is computed, and v3 fragment names are literal. The call is quoted unconverted. Rewrite it by hand, for example as a \`match\` over the fragments it can name.`,
        operator: 'literal',
        value: { fragment: { $getData: 'which' }, parameters: { $values: [1, 2] } },
      },
      issues: [{ code: 'computed-fragment-name', path: ['fragment'] }],
      differs: {
        v2: { value: 3 },
        v3: { value: { fragment: { $getData: 'which' }, parameters: { $values: [1, 2] } } },
      },
    },

    // Modifiers
    {
      name: '`fallback` stays on the call',
      input: { fragment: 'divider', parameters: { $a: 1, $b: 0 }, fallback: 'none' },
      expected: { fragment: 'divider', parameters: { a: 1, b: 0 }, fallback: 'none' },
    },
    {
      name: "a call's `fallback` caught a missing read in its body",
      input: { fragment: 'readsMissing', fallback: 0 },
      expected: { fragment: 'readsMissing', fallback: 0 },
      issues: [{ code: 'missing-data-fallback', path: ['fallback'] }],
      differs: { v2: { value: 0 }, v3: { value: null } },
    },
    {
      name: 'a missing read in an argument was beneath the next `fallback` out',
      input: {
        operator: '+',
        values: [
          {
            fragment: 'adder',
            parameters: { $values: [{ operator: 'getData', property: 'missing' }, 1] },
            fallback: 0,
          },
          1,
        ],
        fallback: -1,
      },
      expected: {
        operator: 'plus',
        values: [
          { fragment: 'adder', parameters: { values: ['$data.missing', 1] }, fallback: 0 },
          1,
        ],
        fallback: -1,
      },
      issues: [{ code: 'missing-data-fallback', path: ['fallback'] }],
      differs: { v2: { value: -1 }, v3: { value: null } },
    },
    {
      name: '`useCache` cannot sit on a call',
      input: { fragment: 'plusBody', useCache: false },
      expected: { fragment: 'plusBody' },
      issues: [{ code: 'fragment-use-cache', path: ['useCache'] }],
    },
    {
      name: "the author's `//` is the call's comment",
      input: { '//': 'the sum', fragment: 'adder', parameters: { $values: [1, 2] } },
      expected: { '//': 'the sum', fragment: 'adder', parameters: { values: [1, 2] } },
    },
    {
      name: '`operator` beside `fragment` was always replaced',
      input: { fragment: 'pair', operator: '+', $a: 1, $b: 2 },
      expected: { fragment: 'pair', parameters: { a: 1, b: 2 } },
      issues: [{ code: 'overridden-value', path: ['operator'] }],
    },
    {
      name: 'another key on the call node set a body parameter',
      input: { fragment: 'plusBody', values: [5, 5] },
      expected: { '//': bodyOverride('values'), fragment: 'plusBody' },
      issues: [{ code: 'body-override', path: ['values'] }],
    },

    // The call's output type
    {
      name: '`outputType` wraps the call',
      input: { fragment: 'countBody', outputType: 'string' },
      expected: { operator: 'convert', value: { fragment: 'countBody' }, to: 'string' },
      issues: [{ code: 'output-type', path: ['outputType'] }],
    },
    {
      name: '`type` is the output type over a body without one',
      input: { fragment: 'countBody', type: 'string' },
      expected: { operator: 'convert', value: { fragment: 'countBody' }, to: 'string' },
      issues: [{ code: 'output-type', path: ['type'] }],
    },
    {
      name: "`type` over a PLUS body was PLUS's own parameter",
      input: { fragment: 'plusBody', type: 'string' },
      expected: { '//': bodyOverride('type'), fragment: 'plusBody' },
      issues: [{ code: 'body-override', path: ['type'] }],
      differs: { v2: { value: '12' }, v3: { value: 3 } },
    },
    {
      name: '`type` beside `outputType` was never read',
      input: { fragment: 'countBody', outputType: 'array', type: 'string' },
      expected: { operator: 'convert', value: { fragment: 'countBody' }, to: 'array' },
      issues: [
        { code: 'overridden-value', path: ['type'] },
        { code: 'output-type', path: ['outputType'] },
      ],
    },
    {
      name: "the body's own `outputType` beat the call's",
      input: { fragment: 'countOutput', outputType: 'string' },
      expected: { fragment: 'countOutput' },
      issues: [{ code: 'unused-output-type', path: ['outputType'] }],
    },
    {
      name: "the body's own `type` beat the call's",
      input: { fragment: 'countTyped', type: 'array' },
      expected: { fragment: 'countTyped' },
      issues: [{ code: 'unused-output-type', path: ['type'] }],
    },
    {
      name: "the call's `outputType` beat the body's `type`, which v3 converts to first",
      input: { fragment: 'countTyped', outputType: 'array' },
      expected: {
        operator: 'convert',
        value: {
          '//':
            `${NOTE}In v2 this \`outputType\` replaced the output type that the body of \`countTyped\` sets with \`type\`. ` +
            "In v3 the body converts its result first, and this `convert` converts that, which gives v2's answer only where the first conversion loses nothing. " +
            'Check the result, or take the output type off the body.',
          fragment: 'countTyped',
        },
        to: 'array',
      },
      issues: [
        { code: 'replaced-output-type', path: ['outputType'] },
        { code: 'output-type', path: ['outputType'] },
      ],
      differs: { v2: { value: [2] }, v3: { value: ['2'] } },
    },
    {
      name: "the same over PLUS's `type: 'number'`, which converts the body's result",
      input: { fragment: 'plusNumber', outputType: 'array' },
      expected: {
        operator: 'convert',
        value: { '//': expect.stringContaining(NOTE), fragment: 'plusNumber' },
        to: 'array',
      },
      issues: [
        { code: 'replaced-output-type', path: ['outputType'] },
        { code: 'output-type', path: ['outputType'] },
      ],
      differs: { v2: { value: ['12'] }, v3: { value: [12] } },
    },
    {
      name: 'the same, where the two conversions agree',
      input: { fragment: 'countTyped', outputType: 'number' },
      expected: {
        operator: 'convert',
        value: { '//': expect.stringContaining(NOTE), fragment: 'countTyped' },
        to: 'number',
      },
      issues: [
        { code: 'replaced-output-type', path: ['outputType'] },
        { code: 'output-type', path: ['outputType'] },
      ],
    },
    {
      name: "a call's null `outputType` gives way to its `type`",
      input: { fragment: 'countBody', outputType: null, type: 'string' },
      expected: { operator: 'convert', value: { fragment: 'countBody' }, to: 'string' },
      issues: [{ code: 'output-type', path: ['type'] }],
    },
    {
      name: 'v2 returned a body that is not an operator node before converting',
      input: { fragment: 'constant', outputType: 'string' },
      expected: { fragment: 'constant' },
      issues: [{ code: 'unused-output-type', path: ['outputType'] }],
    },

    // Where calls sit
    {
      name: 'a call inside data is quoted with it',
      input: { operator: 'pass', value: { a: { fragment: 'constant' } } },
      expected: { operator: 'literal', value: { a: { fragment: 'constant' } } },
    },
  ]

  test.each(EXAMPLES)('$name', async (example) => {
    const options = { ...example.options, fragments: FRAGMENTS }
    const { expression, issues } = convert(example.input, options)
    expect(expression).toEqual(example.expected)
    expect(raised(issues)).toEqual(example.issues ?? [])
    await checkCall(fig, example, options)
  })

  // v2 put a declared default into the call's `parameters` under its name as
  // written, and spread those over the body
  describe('declared names without a `$`', () => {
    const tags = (delimiter: object) => ({
      operator: 'split',
      value: '$tags',
      delimiter: ',',
      metadata: { parameters: [{ name: '$tags', type: 'string' }, delimiter] },
    })
    const UNPREFIXED = {
      splitTags: tags({ name: 'delimiter', type: 'string', default: ';' }),
      splitOwn: tags({ name: 'delimiter', type: 'string' }),
      greeting: {
        operator: 'stringSubstitution',
        string: 'Hello, %1!',
        substitutions: ['$name'],
        metadata: { parameters: [{ name: 'name', type: 'string', default: 'friend' }] },
      },
    }
    const options = { fragments: UNPREFIXED }
    const declared = convertFragments(options)
    const withDeclared = new FigTree({ fragments: declared.fragments })

    test("a key the body's operator reads is a parameter the key reads", () => {
      expect(declared.fragments.splitTags).toEqual({
        expression: { operator: 'split', value: '$params.tags', delimiter: '$params.delimiter' },
        parameters: {
          tags: { type: 'string', required: false },
          delimiter: { type: 'string', default: ';' },
        },
      })
      // With no default declared, the key's own value is the default
      expect(declared.fragments.splitOwn.parameters).toEqual({
        tags: { type: 'string', required: false },
        delimiter: { type: 'string', default: ',' },
      })
    })

    test('any other name is the placeholder the author meant, with an issue', () => {
      expect(declared.fragments.greeting.parameters).toEqual({
        name: { type: 'string', default: 'friend' },
      })
      expect(raised(declared.issues).filter(({ code }) => code === 'unprefixed-parameter')).toEqual(
        [{ code: 'unprefixed-parameter', path: ['greeting', 'metadata', 'parameters', 0, 'name'] }]
      )
    })

    test.each<Call & { name: string }>([
      {
        name: 'the declared default replaces the body key',
        input: { fragment: 'splitTags', parameters: { $tags: 'red;green;blue' } },
      },
      {
        name: "a call's unprefixed key is the argument",
        input: { fragment: 'splitTags', parameters: { $tags: 'red|green', delimiter: '|' } },
        expected: { fragment: 'splitTags', parameters: { tags: 'red|green', delimiter: '|' } },
      },
      {
        name: "with no default declared, the body key's own value stands",
        input: { fragment: 'splitOwn', parameters: { $tags: 'a,b' } },
      },
      {
        name: 'with no default declared, a call gives the key',
        input: { fragment: 'splitOwn', parameters: { $tags: 'a;b', delimiter: ';' } },
      },
      {
        name: 'v2 never filled the placeholder from the declaration',
        input: { fragment: 'greeting' },
        differs: { v2: { value: 'Hello, $name!' }, v3: { value: 'Hello, friend!' } },
      },
    ])('$name', (call) => checkCall(withDeclared, call, options))
  })

  // v2 left a placeholder no call filled as its own text
  describe('placeholders a call leaves unfilled', () => {
    const UNFILLED = {
      price: { operator: 'stringSubstitution', string: 'Cost: %1', substitutions: ['$5.00'] },
      greet: { operator: 'stringSubstitution', string: 'Hi %1!', substitutions: ['$who'] },
      declaredGreet: {
        operator: 'stringSubstitution',
        string: 'Hi %1!',
        substitutions: ['$who'],
        metadata: { parameters: [{ name: '$who', type: 'string' }] },
      },
    }
    const unfilled = convertFragments({ fragments: UNFILLED })
    const withUnfilled = new FigTree({ fragments: unfilled.fragments })

    test('an inferred parameter defaults to its own text, and a declared one does not', () => {
      expect(unfilled.fragments.price.parameters).toEqual({
        '5_00': { type: 'any', default: '$5.00' },
      })
      expect(unfilled.fragments.greet.parameters).toEqual({ who: { type: 'any', default: '$who' } })
      expect(unfilled.fragments.declaredGreet.parameters).toEqual({
        who: { type: 'string', required: false },
      })
      expect(raised(unfilled.issues)).toEqual([
        { code: 'name-renamed', path: ['price', 'substitutions', 0] },
      ])
    })

    test.each<Call & { name: string }>([
      { name: 'text that was never a placeholder', input: { fragment: 'price' } },
      { name: 'an inferred placeholder the call leaves out', input: { fragment: 'greet' } },
      {
        name: 'an inferred placeholder the call fills',
        input: { fragment: 'greet', parameters: { $who: 'Ann' } },
      },
      {
        name: 'a declared placeholder the call leaves out, which v3 reads as null',
        input: { fragment: 'declaredGreet' },
        differs: { v2: { value: 'Hi $who!' }, v3: { value: 'Hi !' } },
      },
    ])('$name', (call) => checkCall(withUnfilled, call, { fragments: UNFILLED }))
  })

  test('messages name the fragment and the key', () => {
    const message = (input: unknown) => convert(input, { fragments: FRAGMENTS }).issues[0].message
    expect(message({ fragment: 'pair', parameters: { $c: 3 } })).toBe(
      '`pair` has no parameter `$c`. v2 ignored the argument, and v3 rejects it. Removed.'
    )
    expect(message({ fragment: 'countOutput', outputType: 'string' })).toBe(
      'v2 never applied this `outputType`: the body of `countOutput` sets its own output type. Removed.'
    )
    expect(message({ fragment: 'constant', type: 'string' })).toBe(
      'v2 never applied this `type`: the body of `constant` is not an operator node, which v2 returned as it was. Removed.'
    )
    expect(message({ fragment: 'plusBody', useCache: true })).toBe(
      'A v3 fragment call takes no `useCache`, since caching is set on the operators inside the body. ' +
        "v2 applied this one to the body's node, unless the body set its own. Removed. Set `useCache` in the definition if the body needs it."
    )
  })

  test('over SQL, `type` is a rider value or the output type', () => {
    const fragments = { query: { operator: 'SQL', query: 'SELECT 1' } }
    expect(raised(convert({ fragment: 'query', type: 'array' }, { fragments }).issues)).toEqual([
      { code: 'body-override', path: ['type'] },
    ])
    expect(convert({ fragment: 'query', type: 'boolean' }, { fragments })).toEqual({
      expression: { operator: 'convert', value: { fragment: 'query' }, to: 'boolean' },
      issues: [expect.objectContaining({ code: 'output-type', path: ['type'] })],
    })
  })

  test("a PLUS body's own `type` converts its result only as a boolean", () => {
    const fragments = {
      asText: { operator: '+', values: [1, 2], type: 'string' },
      asBoolean: { operator: '+', values: [1, 2], type: 'boolean' },
    }
    const codes = (fragment: string) =>
      convert({ fragment, outputType: 'number' }, { fragments }).issues.map(({ code }) => code)
    expect(codes('asText')).toEqual(['output-type'])
    expect(codes('asBoolean')).toEqual(['replaced-output-type', 'output-type'])
  })

  test("a call's `fallback` caught a missing read in a fragment its body calls", () => {
    const fragments = { ...FRAGMENTS, callsReader: { $plus: [{ fragment: 'readsMissing' }, 1] } }
    const { issues } = convert({ fragment: 'callsReader', fallback: 0 }, { fragments })
    expect(raised(issues)).toEqual([{ code: 'missing-data-fallback', path: ['fallback'] }])
    const beneath = convert({ fragment: 'callsReader', fallback: 0 }, { fragments: FRAGMENTS })
    expect(raised(beneath.issues)).toEqual([])
  })

  test('a call on a fragment the options do not hold', () => {
    const { expression, issues } = convert(
      { fragment: 'elsewhere', $x: 1, parameters: { y: 2 }, type: 'string' },
      { fragments: FRAGMENTS }
    )
    expect(expression).toEqual({
      operator: 'convert',
      value: { '//': bodyOverride('y'), fragment: 'elsewhere', parameters: { x: 1 } },
      to: 'string',
    })
    expect(raised(issues)).toEqual([
      { code: 'body-override', path: ['parameters', 'y'] },
      { code: 'output-type', path: ['type'] },
    ])
  })
})

describe('the v3 grammar the converter restates', () => {
  test('the reserved names are the engine’s', () => {
    expect([...RESERVED_NODE_KEYS].sort()).toEqual([...V3_NODE_KEYS].sort())
    expect([...RESERVED_NAMES].sort()).toEqual([...V3_REGISTRATION_NAMES].sort())
  })

  test('the types are the engine’s, and a value fits one as the engine checks it', () => {
    for (const type of V3_TYPES) expect(isExpectedType(type)).toBe(true)
    expect(isExpectedType('undefined')).toBe(false)
    const types: ExpectedType[] = [
      ...V3_TYPES,
      ['string', 'null'],
      ['integer', 'boolean'],
      { literal: ['a', 1, true] },
    ] as ExpectedType[]
    const values = [null, 0, 1.5, -2, 'a', '', true, false, [], [1], {}, { a: 1 }, 1]
    for (const type of types)
      for (const value of values)
        expect([type, value, fitsType(value, type)]).toEqual([
          type,
          value,
          checkType(value, type).ok,
        ])
  })
})
